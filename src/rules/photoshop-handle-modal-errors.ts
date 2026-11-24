import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { ModuleTracker, propertyName, mergeVisitors } from "../util/ast.js";
import { buildModalGraph } from "../util/modal-reach.js";
import { SOURCES } from "../data/sources.js";

type MessageIds = "unhandled" | "unhandledInHandler";
type Node = TSESTree.Node;

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
    messages: {
      unhandled: "This executeAsModal() promise is neither awaited, returned nor caught. It rejects when Photoshop is already modal (\"host is in a modal state\"), and the error is lost. Await it in try/catch or add .catch().",
      unhandledInHandler: "executeAsModal() is awaited in an event handler without try/catch. It rejects when Photoshop is already modal (\"host is in a modal state\"), and nothing above this handler catches it. Wrap it in try/catch.",
    },
  },
  defaultOptions: [],
  create(context) {
    const uxp = getUxp(context);
    if (uxp.host && uxp.host !== "PS") return {};
    const tracker = new ModuleTracker(new Set(["photoshop"]));
    const sourceCode = context.sourceCode;

    const inTry = (node: Node): boolean => {
      for (let a: Node | undefined = node.parent; a; a = a.parent) {
        if (a.type === "TryStatement" && a.handler && node.range[0] >= a.block.range[0] && node.range[1] <= a.block.range[1]) return true;
        if (a.type === "FunctionDeclaration" || a.type === "FunctionExpression" || a.type === "ArrowFunctionExpression") return false;
      }
      return false;
    };
    /** "floating" = result dropped; "awaited" = awaited outside try; null = handled or handed on. */
    const classify = (call: TSESTree.CallExpression): "floating" | "awaited" | null => {
      let n: Node = call;
      // walk .then/.finally chains; .catch or .then(_, onRejected) handles it
      for (;;) {
        const p: Node | undefined = n.parent;
        if (p?.type === "MemberExpression" && p.object === n && p.parent?.type === "CallExpression" && p.parent.callee === p) {
          const name = propertyName(p);
          if (name === "catch") return null;
          if (name === "then" && p.parent.arguments.length >= 2) return null;
          if (name === "then" || name === "finally") { n = p.parent; continue; }
        }
        break;
      }
      let p: Node | undefined = n.parent;
      if (p?.type === "ChainExpression") { n = p; p = n.parent; }
      if (p?.type === "AwaitExpression") {
        if (inTry(p)) return null;
        const pp = p.parent;
        if (pp?.type === "ReturnStatement" || (pp?.type === "ArrowFunctionExpression" && pp.body === p)) return null; // return await: the caller gets the rejection
        return "awaited";
      }
      if (p?.type === "ExpressionStatement") return inTry(p) ? null : "floating";
      if (p?.type === "UnaryExpression" && p.operator === "void") return "floating";
      return null; // returned, stored, passed on, part of Promise.all: the code that receives it is responsible
    };

    return mergeVisitors(tracker.visitors(), {
      "Program:exit"() {
        tracker.finalize();
        const g = buildModalGraph(sourceCode.ast as Node, sourceCode.visitorKeys as Record<string, readonly string[]>, tracker);
        for (const c of g.calls) {
          if (tracker.resolve(c.callee) !== "photoshop.core.executeAsModal") continue;
          const kind = classify(c);
          if (kind === "floating") context.report({ node: c, messageId: "unhandled" });
          // Awaited without try: the rejection propagates to the caller. Only a runtime-invoked handler (or top-level await) has no caller to catch it.
          else if (kind === "awaited" && g.isDirectRoot(c)) context.report({ node: c, messageId: "unhandledInHandler" });
        }
      },
    });
  },
});
