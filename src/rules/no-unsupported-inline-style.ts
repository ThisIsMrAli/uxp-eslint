import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { checkCss, checkCssValue, matchesUxpDefault } from "../util/css-data.js";
import { keyName, staticString, propertyName } from "../util/ast.js";

type Options = [{ ignore?: string[] }];
type MessageIds = "unsupported" | "newer" | "unsupportedValue";

const kebab = (s: string) => (s.startsWith("--") ? s : s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^ms-/, "-ms-"));

export default createRule<Options, MessageIds>({
  name: "no-unsupported-inline-style",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow unsupported CSS properties in JSX `style={{...}}` objects and `element.style.x = ...` assignments",
      recommended: true,
      sources: ["jardicc/vscode-uxp-validator UXP CSS data (MIT)"],
    },
    schema: [{ type: "object", properties: { ignore: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: {
      unsupported: "Style property `{{name}}` is not supported by UXP{{target}}.",
      newer: "Style property `{{name}}` needs UXP {{since}}+, but the target is UXP {{uxp}}.",
      unsupportedValue: "`{{name}}: {{value}}` is not supported by UXP{{target}}.",
    },
  },
  defaultOptions: [{ ignore: [] }],
  create(context, [opts]) {
    const uxpVersion = getUxp(context).uxpVersion;
    const target = uxpVersion ? ` ${uxpVersion}` : "";
    const ignore = new Set((opts.ignore ?? []).map((x) => x.toLowerCase()));
    const check = (node: TSESTree.Node, jsName: string, valueNode: TSESTree.Node | null) => {
      const name = kebab(jsName);
      if (name.startsWith("--") || /^-[a-z]+-/.test(name) || ignore.has(name)) return;
      const v = checkCss("properties", name, uxpVersion);
      if (!v.ok && matchesUxpDefault(name, staticString(valueNode))) return;
      if (!v.ok) {
        if (v.reason === "unsupported") context.report({ node, messageId: "unsupported", data: { name, target } });
        else context.report({ node, messageId: "newer", data: { name, since: v.since, uxp: uxpVersion ?? "?" } });
        return;
      }
      const value = staticString(valueNode);
      if (value && /^[a-z-]+$/i.test(value.trim())) {
        const vv = checkCssValue(name, value.trim(), uxpVersion);
        if (!vv.ok) context.report({ node: valueNode!, messageId: "unsupportedValue", data: { name, value, target } });
      }
    };
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") return;
        if (node.value?.type !== "JSXExpressionContainer" || node.value.expression.type !== "ObjectExpression") return;
        for (const p of node.value.expression.properties) {
          if (p.type !== "Property") continue;
          const k = keyName(p);
          if (k) check(p.key, k, p.value as TSESTree.Node);
        }
      },
      AssignmentExpression(node) {
        if (node.left.type !== "MemberExpression") return;
        const obj = node.left.object;
        if (obj.type !== "MemberExpression" || propertyName(obj) !== "style") return;
        const k = propertyName(node.left);
        if (k && k !== "cssText") check(node.left.property, k, node.right);
      },
      CallExpression(node) {
        // el.style.setProperty("gap", "4px")
        if (node.callee.type !== "MemberExpression" || propertyName(node.callee) !== "setProperty") return;
        const obj = node.callee.object;
        if (obj.type !== "MemberExpression" || propertyName(obj) !== "style") return;
        const k = staticString(node.arguments[0] as TSESTree.Node);
        if (k) check(node.arguments[0]!, k, (node.arguments[1] as TSESTree.Node) ?? null);
      },
    };
  },
});
