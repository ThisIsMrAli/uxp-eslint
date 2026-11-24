import type { TSESTree, TSESLint } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp, photoshopApiVersion } from "../util/settings.js";
import { ModuleTracker, propertyName, keyName, staticString, unwrap, mergeVisitors } from "../util/ast.js";
import { buildModalGraph, calleeName, fnName, type Fn } from "../util/modal-reach.js";
import { SOURCES } from "../data/sources.js";

type Options = [{ extraModifyingMethods?: string[]; readOnlyDescriptors?: string[]; checkDomMethods?: boolean }];
type MessageIds = "batchPlayOutsideModal" | "batchPlayHelperOutsideModal" | "domOutsideModal" | "setterOutsideModal";
type Node = TSESTree.Node;

/** batchPlay `_obj` values that only read state. */
const READ_ONLY = new Set(["get", "multiGet"]);
/** Photoshop DOM methods that modify documents (from @types/photoshop Document/Layer/Documents/Layers/Selection classes). Distinctive names only, to avoid matching non-Photoshop objects. */
const MODIFYING = new Set([
  "createLayer", "createLayerGroup", "createPixelLayer", "createTextLayer", "groupLayers", "resizeImage", "resizeCanvas", "rotate", "crop", "trim", "flatten", "mergeVisibleLayers",
  "duplicateLayers", "splitChannels", "convertMode", "changeMode", "revealAll", "applyGaussianBlur", "applyMotionBlur", "applyAddNoise", "applySharpen", "applyUnSharpMask",
  "applyHighPass", "applyMedianNoise", "applyAverage", "applyBlur", "applyBlurMore", "applyClouds", "applyDespeckle", "applyDustAndScratches", "applyLensBlur", "applyMaximum", "applyMinimum",
  "applyOffset", "applyPinch", "applyPolarCoordinates", "applyRipple", "applyShear", "applySpherize", "applyTwirl", "applyWave", "applyZigZag", "applyBrightnessContrast", "applyInvert",
  "sendToBack", "rasterize", "selectAll", "deselect", "inverse", "createDocument", "closeWithoutSaving", "unlink", "link",
  "translate", "scale", "skew", "flip", "merge", "duplicate", "delete",
]);
/** Settable Layer/Document properties in @types/photoshop 27.11 (setters). */
const SETTERS = new Set(["activeChannels", "activeHistoryBrushSource", "activeHistoryState", "activeLayers", "allLocked", "bitsPerChannel", "blendMode", "colorProfileName", "colorProfileType", "fillOpacity", "filterMaskDensity", "filterMaskFeather", "isClippingMask", "layerMaskDensity", "layerMaskFeather", "name", "opacity", "pixelAspectRatio", "pixelsLocked", "positionLocked", "quickMaskMode", "selected", "transparentPixelsLocked", "vectorMaskDensity", "vectorMaskFeather", "visible"]);

export default createRule<Options, MessageIds>({
  name: "photoshop-modal-scope",
  meta: {
    type: "problem",
    docs: {
      description: "Require Photoshop state changes (modifying batchPlay, DOM edits) to run inside core.executeAsModal",
      recommended: true,
      sources: [SOURCES.executeAsModal, SOURCES.psManifestApiVersion, SOURCES.forum6687, SOURCES.forum5837, SOURCES.forum11898],
    },
    schema: [{ type: "object", properties: { extraModifyingMethods: { type: "array", items: { type: "string" } }, readOnlyDescriptors: { type: "array", items: { type: "string" } }, checkDomMethods: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      batchPlayOutsideModal: "batchPlay `{{obj}}` modifies Photoshop state but runs outside core.executeAsModal(). With apiVersion 2 this throws; wrap it in executeAsModal.",
      batchPlayHelperOutsideModal: "`{{helper}}()` runs batchPlay `{{obj}}`, which modifies Photoshop state, outside core.executeAsModal(). With apiVersion 2 this throws; call it inside executeAsModal.",
      domOutsideModal: "`{{name}}()` modifies the Photoshop document but runs outside core.executeAsModal().",
      setterOutsideModal: "Setting `{{name}}` on a Photoshop layer/document modifies state but runs outside core.executeAsModal().",
    },
  },
  defaultOptions: [{ extraModifyingMethods: [], readOnlyDescriptors: [], checkDomMethods: true }],
  create(context, [opts]) {
    const uxp = getUxp(context);
    if (uxp.host && uxp.host !== "PS") return {};
    if (photoshopApiVersion(uxp) === 1) return {}; // apiVersion 1 allows mutations outside a modal scope (deprecated)
    if (/\.psjs$/i.test(context.filename)) return {}; // Photoshop scripts already run in a modal scope (forum 11898, Adobe scripting docs)
    const sourceCode = context.sourceCode;
    const tracker = new ModuleTracker(new Set(["photoshop"]));
    const readOnly = new Set([...READ_ONLY, ...(opts.readOnlyDescriptors ?? [])]);
    const modifying = new Set([...MODIFYING, ...(opts.extraModifyingMethods ?? [])]);
    let usesPhotoshop = false;

    /** Resolve an identifier to the initializer of a `const` (or never-reassigned let/var) in scope. */
    const resolveConst = (id: TSESTree.Identifier): Node | null => {
      let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(id) as TSESLint.Scope.Scope;
      while (scope) {
        const v = scope.set.get(id.name);
        if (v) {
          const def = v.defs[0];
          if (!def || def.type !== "Variable" || v.defs.length !== 1) return null;
          const decl = def.node as TSESTree.VariableDeclarator;
          if (decl.id.type !== "Identifier" || !decl.init) return null;
          if (v.references.some((r) => r.isWrite() && r.identifier !== decl.id)) return null;
          return unwrap(decl.init as Node);
        }
        scope = scope.upper;
      }
      return null;
    };
    /** `_obj` names a batchPlay argument statically shows (literals, consts, spreads of consts). Unknown elements are ignored. */
    const descriptorObjs = (arg: Node | undefined, depth = 0): string[] => {
      if (!arg || depth > 3) return [];
      let a = unwrap(arg);
      if (a.type === "Identifier") a = resolveConst(a) ?? a;
      if (a.type === "ObjectExpression") {
        const p = a.properties.find((x) => x.type === "Property" && keyName(x) === "_obj") as TSESTree.Property | undefined;
        const v = p ? staticString(p.value as Node) : null;
        return v ? [v] : [];
      }
      if (a.type !== "ArrayExpression") return [];
      const out: string[] = [];
      for (const el of a.elements) {
        if (!el) continue;
        if (el.type === "SpreadElement") out.push(...descriptorObjs(el.argument as Node, depth + 1));
        else out.push(...descriptorObjs(el as Node, depth + 1));
      }
      return out;
    };

    return mergeVisitors(tracker.visitors(), {
      ImportDeclaration(node) { if (node.source.value === "photoshop") usesPhotoshop = true; },
      "Program:exit"() {
        tracker.finalize();
        const g = buildModalGraph(sourceCode.ast as Node, sourceCode.visitorKeys as Record<string, readonly string[]>, tracker);
        if (!usesPhotoshop) usesPhotoshop = g.calls.some((c) => c.callee.type === "Identifier" && c.callee.name === "require" && staticString(c.arguments[0] as Node) === "photoshop");
        if (!usesPhotoshop) return;
        const isBatchPlay = (c: TSESTree.CallExpression) => { const r = tracker.resolve(c.callee); return r === "photoshop.action.batchPlay" || r === "photoshop.app.batchPlay"; };

        // batchPlay helpers: `function play(cmds) { return batchPlay(cmds, {}) }`, `const run = (d) => action.batchPlay([d], {})`
        const helpers = new Map<string, { index: number; wrapInArray: boolean }>();
        for (const c of g.calls) {
          if (!isBatchPlay(c) || g.ctx(c) === "modal") continue;
          const f = g.enclosingFns(c)[0];
          const nm = f ? fnName(f) : null;
          if (!f || !nm) continue;
          const params = f.params.map((p) => (p.type === "Identifier" ? p.name : p.type === "AssignmentPattern" && p.left.type === "Identifier" ? p.left.name : ""));
          const a0 = c.arguments[0] ? unwrap(c.arguments[0] as Node) : null;
          if (a0?.type === "Identifier" && params.includes(a0.name)) helpers.set(nm, { index: params.indexOf(a0.name), wrapInArray: false });
          else if (a0?.type === "ArrayExpression" && a0.elements.length === 1 && a0.elements[0]?.type === "Identifier" && params.includes(a0.elements[0].name)) helpers.set(nm, { index: params.indexOf(a0.elements[0].name), wrapInArray: true });
        }

        for (const c of g.calls) {
          if (g.ctx(c) !== "root") continue;
          const prop = c.callee.type === "MemberExpression" ? propertyName(c.callee) : null;
          if (isBatchPlay(c)) {
            const objs = descriptorObjs(c.arguments[0] as Node | undefined).filter((o) => !readOnly.has(o));
            if (objs.length) context.report({ node: c, messageId: "batchPlayOutsideModal", data: { obj: [...new Set(objs)].join(", ") } });
            continue;
          }
          const helper = helpers.get(calleeName(c) ?? "");
          if (helper && !g.isModalEntry(c)) {
            const objs = descriptorObjs(c.arguments[helper.index] as Node | undefined).filter((o) => !readOnly.has(o));
            if (objs.length) context.report({ node: c, messageId: "batchPlayHelperOutsideModal", data: { helper: calleeName(c)!, obj: [...new Set(objs)].join(", ") } });
            continue;
          }
          if (opts.checkDomMethods !== false && prop && modifying.has(prop) && (tracker.resolve(c.callee)?.startsWith("photoshop.") || looksLikePsReceiver(sourceCode, c.callee as TSESTree.MemberExpression))) {
            context.report({ node: (c.callee as TSESTree.MemberExpression).property, messageId: "domOutsideModal", data: { name: prop } });
          }
        }
        if (opts.checkDomMethods === false) return;
        const visit = (n: Node) => {
          if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression") {
            const left = n.left;
            const prop = propertyName(left);
            if (prop && SETTERS.has(prop) && g.ctx(n) === "root") {
              const r = tracker.resolve(left.object);
              if (r?.startsWith("photoshop.") || looksLikePsReceiver(sourceCode, left)) context.report({ node: left.property, messageId: "setterOutsideModal", data: { name: prop } });
            }
          }
          for (const k of sourceCode.visitorKeys[n.type] ?? []) {
            const v = (n as unknown as Record<string, unknown>)[k];
            if (Array.isArray(v)) v.forEach((x) => x && typeof x === "object" && "type" in x && visit(x as Node));
            else if (v && typeof v === "object" && "type" in v) visit(v as Node);
          }
        };
        visit(sourceCode.ast as Node);
      },
    });
  },
});

/** Receiver text names a Photoshop DOM object (app, activeDocument, layers, doc, layer, selection). */
function looksLikePsReceiver(sourceCode: Readonly<TSESLint.SourceCode>, callee: TSESTree.MemberExpression): boolean {
  const t = sourceCode.getText(callee.object);
  return /(^|\.)(app|activeDocument|documents|activeLayers|layers|selection)\b|^(doc|document|layer|psDoc|activeDoc)\w*$/i.test(t) && !/^document\.(body|head|getElementById|querySelector)/.test(t) && t !== "document";
}

export type { Fn };
