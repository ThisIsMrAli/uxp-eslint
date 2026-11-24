import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { memberPath, stripGlobal, isGlobalReference, staticString, propertyName, isFeatureDetected } from "../util/ast.js";
import { UNAVAILABLE_GLOBALS, UNSUPPORTED_EVENTS } from "../data/web-api.js";
import { SOURCES } from "../data/sources.js";

type Options = [{ community?: boolean; scriptFilePattern?: string }];
type MessageIds = "unavailable" | "event" | "innerHtmlScript" | "storageInScript";

export default createRule<Options, MessageIds>({
  name: "no-unsupported-web-api",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow browser APIs that UXP does not provide or documents as unreliable",
      recommended: true,
      sources: [SOURCES.knownIssues, SOURCES.bubblydooPolyfills, SOURCES.forum4605],
    },
    schema: [{ type: "object", properties: { community: { type: "boolean" }, scriptFilePattern: { type: "string" } }, additionalProperties: false }],
    messages: {
      unavailable: "{{message}} ({{confidence}} source: {{source}})",
      event: "{{message}}",
      innerHtmlScript: "Do not rely on scripts or inline event handlers inside `innerHTML` in UXP; Adobe says this behaviour \"will likely go away\". Use addEventListener.",
      storageInScript: "UXP scripts (.psjs) have no persistent storage; `{{name}}` is unavailable there.",
    },
  },
  defaultOptions: [{ community: true, scriptFilePattern: "\\.psjs$" }],
  create(context, [opts]) {
    const sourceCode = context.sourceCode;
    const isScript = new RegExp(opts.scriptFilePattern ?? "\\.psjs$").test(context.filename);
    const facts = Object.entries(UNAVAILABLE_GLOBALS).filter(([, f]) => opts.community !== false || f.confidence === "docs");
    const byName = new Map(facts);
    const reportFact = (node: TSESTree.Node, key: string) => {
      const f = byName.get(key);
      if (f && isFeatureDetected(sourceCode, node, key.split(".").pop()!)) return;
      if (f) context.report({ node, messageId: "unavailable", data: { message: f.message, confidence: f.confidence, source: f.source } });
    };
    return {
      Identifier(node) {
        if (!byName.has(node.name) && !(isScript && (node.name === "localStorage" || node.name === "sessionStorage"))) return;
        const p = node.parent;
        if (p?.type === "MemberExpression" && p.property === node && !p.computed) return;
        if (p?.type === "Property" && p.key === node) return;
        if (p?.type === "VariableDeclarator" && p.id === node) return;
        if (!isGlobalReference(sourceCode, node)) return;
        if (p?.type === "UnaryExpression" && p.operator === "typeof") return; // feature detection
        if (isScript && (node.name === "localStorage" || node.name === "sessionStorage")) { context.report({ node, messageId: "storageInScript", data: { name: node.name } }); return; }
        reportFact(node, node.name);
      },
      MemberExpression(node) {
        const raw = memberPath(node);
        if (!raw) return;
        const path = stripGlobal(raw);
        const root = raw.split(".")[0]!;
        if (raw !== path || root === "performance") {
          if (node.parent?.type === "UnaryExpression" && node.parent.operator === "typeof") return;
          if (byName.has(path)) reportFact(node, path);
          if (isScript && (path === "localStorage" || path === "sessionStorage") && raw !== path) context.report({ node, messageId: "storageInScript", data: { name: path } });
        }
      },
      CallExpression(node) {
        if (node.callee.type === "MemberExpression" && propertyName(node.callee) === "addEventListener") {
          const ev = staticString(node.arguments[0] as TSESTree.Node);
          if (ev && UNSUPPORTED_EVENTS[ev]) context.report({ node: node.arguments[0]!, messageId: "event", data: { message: UNSUPPORTED_EVENTS[ev]!.message } });
        }
      },
      AssignmentExpression(node) {
        if (node.left.type !== "MemberExpression") return;
        const prop = propertyName(node.left);
        if (prop === "onkeypress") context.report({ node: node.left, messageId: "event", data: { message: UNSUPPORTED_EVENTS.keypress!.message } });
        if (prop === "innerHTML" || prop === "outerHTML") {
          const s = staticString(node.right) ?? (node.right.type === "TemplateLiteral" ? node.right.quasis.map((q) => q.value.raw).join("") : null);
          if (s && (/<script\b/i.test(s) || /\son[a-z]+\s*=/i.test(s))) context.report({ node: node.right, messageId: "innerHtmlScript" });
        }
      },
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "onKeyPress") context.report({ node, messageId: "event", data: { message: UNSUPPORTED_EVENTS.keypress!.message } });
      },
    };
  },
});
