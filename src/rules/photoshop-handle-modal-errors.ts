import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { ModuleTracker, propertyName, mergeVisitors } from "../util/ast.js";
import { SOURCES } from "../data/sources.js";

type MessageIds = "unhandled";

export default createRule<[], MessageIds>({
  name: "photoshop-handle-modal-errors",
  meta: {
    type: "suggestion",
    docs: {
      description: "Require handling rejections from core.executeAsModal (only one plugin can be modal at a time)",
      recommended: true,
      sources: [SOURCES.executeAsModal, SOURCES.forum5837],
    },
    schema: [],
    messages: { unhandled: "executeAsModal() rejects when Photoshop is already modal (\"host is in a modal state\"). Await it inside try/catch, add .catch(), or return it to a caller that handles it." },
  },
  defaultOptions: [],
  create(context) {
    const uxp = getUxp(context);
    if (uxp.host && uxp.host !== "PS") return {};
    const tracker = new ModuleTracker(new Set(["photoshop"]));
    const calls: TSESTree.CallExpression[] = [];
    const handled = (node: TSESTree.Node): boolean => {
      let n: TSESTree.Node = node;
      let p = n.parent;
      if (p?.type === "MemberExpression" && p.object === n && ["catch", "then", "finally"].includes(propertyName(p) ?? "")) {
        const name = propertyName(p);
        const call = p.parent;
        if (name === "catch") return true;
        if (name === "then" && call?.type === "CallExpression" && call.arguments.length >= 2) return true;
        if (call) { n = call; p = n.parent; }
      }
      if (p?.type === "ReturnStatement" || (p?.type === "ArrowFunctionExpression" && p.body === n)) return true;
      if (p?.type === "AwaitExpression" || p?.type === "VariableDeclarator" || p?.type === "AssignmentExpression" || p?.type === "ArrayExpression" || p?.type === "CallExpression") {
        if (p.type !== "AwaitExpression") return true; // stored/passed on: caller's responsibility
        for (let a: TSESTree.Node | undefined = p.parent; a; a = a.parent) {
          if (a.type === "TryStatement" && a.handler && node.range[0] >= a.block.range[0] && node.range[1] <= a.block.range[1]) return true;
          if (a.type === "FunctionDeclaration" || a.type === "FunctionExpression" || a.type === "ArrowFunctionExpression") {
            // awaited inside a function whose own promise is returned/awaited elsewhere: treat as handled when the function is passed or returned
            return a.parent?.type === "ReturnStatement";
          }
        }
        return false;
      }
      return false;
    };
    return mergeVisitors(tracker.visitors(), {
      CallExpression(node) { calls.push(node); },
      "Program:exit"() {
        tracker.finalize();
        for (const c of calls) {
          const r = tracker.resolve(c.callee);
          if (r !== "photoshop.core.executeAsModal") continue;
          if (!handled(c)) context.report({ node: c, messageId: "unhandled" });
        }
      },
    });
  },
});
