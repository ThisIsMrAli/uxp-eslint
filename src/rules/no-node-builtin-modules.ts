import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { requireSource, staticString } from "../util/ast.js";
import { NODE_ONLY_MODULES } from "../data/web-api.js";
import { SOURCES } from "../data/sources.js";

type Options = [{ allow?: string[] }];
type MessageIds = "nodeOnly";

export default createRule<Options, MessageIds>({
  name: "no-node-builtin-modules",
  meta: {
    type: "problem",
    docs: { description: "Disallow Node core modules that UXP does not provide (UXP modules: uxp, fs, os, plus host modules)", recommended: true, sources: [SOURCES.modulesIndex] },
    schema: [{ type: "object", properties: { allow: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: { nodeOnly: "`{{name}}` is a Node.js module with no UXP equivalent; it fails at runtime in UXP.{{hint}}" },
  },
  defaultOptions: [{ allow: [] }],
  create(context, [opts]) {
    const allow = new Set(opts.allow ?? []);
    const hints: Record<string, string> = { http: " Use fetch() with requiredPermissions.network.", https: " Use fetch() with requiredPermissions.network.", child_process: " Use require(\"uxp\").shell.openPath/openExternal or a hybrid plugin.", net: " Use WebSocket.", "fs/promises": " UXP fs methods return promises already." };
    const check = (node: TSESTree.Node, src: string | null) => {
      if (!src) return;
      const name = src.replace(/^node:/, "");
      if (allow.has(name)) return;
      if (NODE_ONLY_MODULES.includes(name)) context.report({ node, messageId: "nodeOnly", data: { name: src, hint: hints[name] ?? "" } });
    };
    return {
      ImportDeclaration(node) { if (node.importKind !== "type") check(node.source, node.source.value); },
      ImportExpression(node) { check(node.source, staticString(node.source)); },
      CallExpression(node) { const s = requireSource(node); if (s) check(node.arguments[0]!, s); },
    };
  },
});
