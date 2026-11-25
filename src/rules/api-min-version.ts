import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { ModuleTracker, memberPath, stripGlobal, isGlobalReference, propertyName, mergeVisitors, isOptionalUse } from "../util/ast.js";
import { isOlder, compareVersions } from "../util/version.js";
import uxpSince from "../data/generated/uxp-since.js";
import psMin from "../data/generated/photoshop-min-versions.js";
import { BROWSER_GLOBAL_OBJECTS } from "../util/ast.js";
import { SOURCES } from "../data/sources.js";
import { CURATED_SINCE } from "../data/curated-since.js";

type Options = [{ typeAware?: boolean; checkDomMembers?: boolean }];
type MessageIds = "hostTooOld" | "uxpTooOld";

const GLOBALS = uxpSince.globals as Record<string, { since: string; doc: string }>;
const MEMBERS = uxpSince.members as Record<string, { since: string; doc: string }>;
const PS = psMin.members as Record<string, string>;
const PS_ROOTS: Record<string, string> = { core: "photoshopCore", action: "photoshopAction", imaging: "imaging", app: "Photoshop" };
/** DOM element members documented with a Since version and distinctive enough to match by name. */
const DOM_MEMBERS = new Set(["replaceChildren", "setPointerCapture", "releasePointerCapture", "hasPointerCapture"]);
const DOCS_BASE = "https://github.com/AdobeDocs/uxp/blob/main/";
/**
 * Photoshop's DOM v2 docs (and so the @types tags) start at 22.5/23.0: APIs that already existed in the 22.0 DOM
 * carry 22.x/23.0 tags too (e.g. `app.activeDocument` is tagged 23.0). Tags at or below this floor are not reported,
 * except APIs the Photoshop API changelog says were introduced then.
 * https://developer.adobe.com/photoshop/uxp/2022/ps-reference/changelog/
 */
const PS_DOC_FLOOR = "23.0";
const PS_CONFIRMED_EARLY = new Set(["executeAsModal", "suspendHistory"]); // changelog: Prerelease Build 60 (22.5), Beta Build 64 (23.0)

export default createRule<Options, MessageIds>({
  name: "api-min-version",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow UXP and Photoshop APIs that are newer than the manifest's host.minVersion",
      recommended: true,
      sources: ["@types/photoshop @minVersion tags", "AdobeDocs/uxp reference-js **Since** lines", "jardicc/vscode-uxp-validator host→UXP table", SOURCES.psChangelog, SOURCES.uxpChangelog, SOURCES.forum8224],
    },
    schema: [{ type: "object", properties: { typeAware: { type: "boolean" }, checkDomMembers: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      hostTooOld: "`{{api}}` needs {{host}} {{required}}+ ({{source}}), but manifest host.minVersion is {{min}}. Raise minVersion or feature-detect it.",
      uxpTooOld: "`{{api}}` needs UXP {{required}}+ ({{source}}), but host.minVersion {{min}} ships UXP {{uxp}}. Raise minVersion or feature-detect it.",
    },
  },
  defaultOptions: [{ typeAware: true, checkDomMembers: true }],
  create(context, [opts]) {
    const uxp = getUxp(context);
    if (!uxp.hostMinVersion && !uxp.uxpVersion) return {};
    const sourceCode = context.sourceCode;
    const tracker = new ModuleTracker(new Set(["uxp", "photoshop", "fs"]));
    const members: TSESTree.MemberExpression[] = [];
    const idents: TSESTree.Identifier[] = [];
    const done = new Set<TSESTree.Node>();
    const services = (sourceCode.parserServices ?? {}) as { program?: { getTypeChecker(): TypeChecker }; esTreeNodeToTSNodeMap?: { get(n: TSESTree.Node): unknown } };
    const checker = opts.typeAware !== false && services.program && services.esTreeNodeToTSNodeMap ? services.program.getTypeChecker() : null;

    const guarded = (node: TSESTree.Node, text: string): boolean => {
      if (isOptionalUse(node)) return true;
      // `window.X` read without calling, constructing or dereferencing it is a feature probe (undefined when missing)
      const par = node.parent;
      if (node.type === "MemberExpression" && node.object.type === "Identifier" && BROWSER_GLOBAL_OBJECTS.has(node.object.name)
        && !(par?.type === "CallExpression" && par.callee === node) && !(par?.type === "NewExpression" && par.callee === node) && !(par?.type === "MemberExpression" && par.object === node)) return true;
      for (let p: TSESTree.Node | undefined = node.parent; p; p = p.parent) {
        const test = p.type === "IfStatement" || p.type === "ConditionalExpression" ? p.test : p.type === "LogicalExpression" ? p.left : null;
        if (test && node.range[0] >= test.range[0] && node.range[1] <= test.range[1]) return true; // the probe itself
        if (test && test !== node && sourceCode.getText(test).includes(text)) return true;
        if (p.type === "TryStatement" && p.block && node.range[0] >= p.block.range[0] && node.range[1] <= p.block.range[1]) return true;
      }
      return false;
    };

    const reportHost = (node: TSESTree.Node, api: string, required: string, source: string) => {
      const last = api.split(".").pop()!;
      if (!uxp.hostMinVersion || !isOlder(uxp.hostMinVersion, required) || guarded(node, last)) return;
      if (compareVersions(required, PS_DOC_FLOOR) <= 0 && !PS_CONFIRMED_EARLY.has(last)) return;
      done.add(node);
      context.report({ node, messageId: "hostTooOld", data: { api, required, host: uxp.host ?? "host", min: uxp.hostMinVersion, source } });
    };
    const reportUxp = (node: TSESTree.Node, api: string, required: string, doc: string) => {
      if (!uxp.uxpVersion || !isOlder(uxp.uxpVersion, required) || guarded(node, api.split(".").pop()!) || done.has(node)) return;
      done.add(node);
      context.report({ node, messageId: "uxpTooOld", data: { api, required, uxp: uxp.uxpVersion, min: uxp.hostMinVersion ?? "(settings.uxp.uxpVersion)", source: /^https?:/.test(doc) ? doc : DOCS_BASE + doc.replace(/ /g, "%20") } });
    };

    const checkPhotoshopPath = (node: TSESTree.Node, resolved: string) => {
      if (uxp.host !== "PS") return;
      const parts = resolved.split(".");
      if (parts[0] !== "photoshop" || parts.length < 2) return;
      const owner = PS_ROOTS[parts[1]!];
      if (!owner) return;
      if (parts.length === 2 && node.parent?.type === "MemberExpression" && node.parent.object === node) return; // report the member instead
      const key = parts.length === 2 ? (owner === "imaging" ? "imaging" : null) : `${owner}.${parts[2]}`;
      if (key && PS[key]) reportHost(node, parts.slice(1, 3).join("."), PS[key]!, "@types/photoshop @minVersion");
    };

    const checkTypeAware = (node: TSESTree.MemberExpression) => {
      if (!checker || uxp.host !== "PS" || done.has(node)) return;
      const tsNode = services.esTreeNodeToTSNodeMap!.get(node.property);
      if (!tsNode) return;
      const sym = checker.getSymbolAtLocation(tsNode);
      const decl = sym?.declarations?.[0];
      if (!sym || !decl || !/[\\/](@types[\\/]photoshop|photoshop)[\\/]/.test(decl.getSourceFile().fileName)) return;
      const tag = sym.getJsDocTags(checker).find((t) => t.name === "minVersion");
      const text = tag?.text?.map((t) => t.text).join("").trim();
      if (text && /^\d/.test(text)) reportHost(node, sourceCode.getText(node).replace(/\s+/g, ""), text, "typed @minVersion");
    };

    return mergeVisitors(tracker.visitors(), {
      MemberExpression(node) { members.push(node); },
      Identifier(node) {
        const p = node.parent;
        if (!p) return;
        if (p.type === "MemberExpression" && p.property === node && !p.computed) return;
        if (p.type === "Property" && p.parent?.type === "ObjectPattern") return;
        if (p.type === "ArrayPattern" || p.type === "RestElement" || (p.type === "AssignmentPattern" && p.left === node)) return;
        if ((p.type === "Property" && p.key === node && !p.computed) || p.type === "ImportSpecifier" || p.type === "ImportDefaultSpecifier" || p.type === "ImportNamespaceSpecifier") return;
        if (p.type === "VariableDeclarator" && p.id === node) return;
        if (p.type.startsWith("TS") && p.type !== "TSAsExpression" && p.type !== "TSNonNullExpression") return;
        idents.push(node);
      },
      "Program:exit"() {
        tracker.finalize();
        for (const n of idents) {
          const bound = tracker.resolve(n);
          if (bound) {
            if (GLOBALS[bound]) reportUxp(n, bound, GLOBALS[bound]!.since, GLOBALS[bound]!.doc);
            continue;
          }
          if (!GLOBALS[n.name] || !isGlobalReference(sourceCode, n)) continue;
          if (n.parent?.type === "Property" && (n.parent.parent as TSESTree.Node).type === "ObjectPattern") continue;
          const g = GLOBALS[n.name]!;
          reportUxp(n, n.name, g.since, g.doc);
        }
        for (const n of members) {
          const resolved = tracker.resolve(n);
          if (resolved) {
            if (resolved.startsWith("photoshop.")) checkPhotoshopPath(n, resolved);
            else if (GLOBALS[resolved]) reportUxp(n, resolved, GLOBALS[resolved]!.since, GLOBALS[resolved]!.doc);
            else if (CURATED_SINCE[resolved]) reportUxp(n, resolved.replace(/^uxp\.storage\./, ""), CURATED_SINCE[resolved]!.since, CURATED_SINCE[resolved]!.source);
          } else {
            const raw = memberPath(n);
            const path = raw ? stripGlobal(raw) : null;
            if (path && raw !== path && GLOBALS[path]) reportUxp(n, path, GLOBALS[path]!.since, GLOBALS[path]!.doc);
            let root: TSESTree.Node = n;
            while (root.type === "MemberExpression") root = root.object;
            if (path && CURATED_SINCE[path] && root.type === "Identifier" && isGlobalReference(sourceCode, root)) reportUxp(n, path, CURATED_SINCE[path]!.since, CURATED_SINCE[path]!.source);
            const m = path?.match(/^navigator\.clipboard\.(\w+)$/);
            if (m && MEMBERS[`clipboard.${m[1]}`]) reportUxp(n, path!, MEMBERS[`clipboard.${m[1]}`]!.since, MEMBERS[`clipboard.${m[1]}`]!.doc);
            const prop = propertyName(n);
            if (opts.checkDomMembers !== false && prop && DOM_MEMBERS.has(prop) && n.parent?.type === "CallExpression" && n.parent.callee === n) {
              const e = MEMBERS[`Element.${prop}`];
              if (e) reportUxp(n.property, `Element.${prop}`, e.since, e.doc);
            }
          }
          checkTypeAware(n);
        }
      },
    });
  },
});

interface TypeChecker {
  getSymbolAtLocation(node: unknown): { declarations?: { getSourceFile(): { fileName: string } }[]; getJsDocTags(checker: TypeChecker): { name: string; text?: { text: string }[] }[] } | undefined;
}
