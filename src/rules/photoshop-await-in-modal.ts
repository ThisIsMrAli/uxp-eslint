import type { TSESTree, TSESLint } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { ModuleTracker, propertyName, mergeVisitors, unwrap } from "../util/ast.js";
import { isFn, type Fn } from "../util/modal-reach.js";
import { SOURCES } from "../data/sources.js";

type MessageIds = "floating" | "asyncForEach" | "addAwait";
type Node = TSESTree.Node;

/**
 * Photoshop leaves the modal state as soon as the executeAsModal target function settles. Adobe: "It can be asynchronous,
 * but care should be given to ensure it does not return early." Reports Photoshop async calls whose promise the target
 * function drops, so the modal scope can end before they run.
 */
export default createRule<[], MessageIds>({
  name: "photoshop-await-in-modal",
  meta: {
    type: "problem",
    hasSuggestions: true,
    docs: {
      description: "Require awaiting batchPlay and history calls inside an executeAsModal target function so the modal scope does not end early",
      recommended: true,
      sources: [SOURCES.executeAsModal],
    },
    schema: [],
    messages: {
      floating: "`{{name}}()` returns a promise that this executeAsModal target function does not await. The function can finish first, Photoshop then leaves the modal state, and the call fails or runs outside it. Await it.",
      asyncForEach: "`forEach` does not wait for async callbacks, so this executeAsModal target function returns before they finish and Photoshop leaves the modal state early. Use `for (const x of list) await ...` or `await Promise.all(list.map(...))`.",
      addAwait: "Add `await`.",
    },
  },
  defaultOptions: [],
  create(context) {
    const uxp = getUxp(context);
    if (uxp.host && uxp.host !== "PS") return {};
    const tracker = new ModuleTracker(new Set(["photoshop"]));
    const sourceCode = context.sourceCode;
    const calls: TSESTree.CallExpression[] = [];

    const resolveFn = (arg: Node | undefined): Fn | null => {
      if (!arg) return null;
      const a = unwrap(arg);
      if (isFn(a)) return a;
      if (a.type !== "Identifier") return null;
      let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(a) as TSESLint.Scope.Scope;
      while (scope) {
        const v = scope.set.get(a.name);
        if (v) {
          if (v.defs.length !== 1) return null;
          const d = v.defs[0]!;
          if (d.type === "FunctionName") return d.node as Fn;
          if (d.type === "Variable") {
            const decl = d.node as TSESTree.VariableDeclarator;
            if (v.references.some((r) => r.isWrite() && r.identifier !== decl.id)) return null;
            return decl.init && isFn(unwrap(decl.init as Node)) ? (unwrap(decl.init as Node) as Fn) : null;
          }
          return null;
        }
        scope = scope.upper;
      }
      return null;
    };
    const ownerFn = (n: Node): Fn | null => {
      for (let a = n.parent; a; a = a.parent) if (isFn(a)) return a;
      return null;
    };
    /** Name of a Photoshop call whose promise must settle inside the modal scope, or null. */
    const asyncPsCall = (c: TSESTree.CallExpression): string | null => {
      const r = tracker.resolve(c.callee);
      if (r === "photoshop.action.batchPlay") return "batchPlay";
      if (c.callee.type === "MemberExpression") {
        const name = propertyName(c.callee);
        if ((name === "suspendHistory" || name === "resumeHistory") && /hostControl$/.test(sourceCode.getText(c.callee.object))) return name;
      }
      return null;
    };
    const isDropped = (c: TSESTree.CallExpression): boolean => {
      let p: Node | undefined = c.parent;
      if (p?.type === "ChainExpression") p = p.parent;
      return p?.type === "ExpressionStatement" || (p?.type === "UnaryExpression" && p.operator === "void");
    };
    /** Start offsets of `await`s (and for-await) directly in f, not in nested functions. */
    const awaitsIn = (f: Fn): number[] => {
      const out: number[] = [];
      const walk = (n: Node) => {
        if (n.type === "AwaitExpression" || (n.type === "ForOfStatement" && n.await)) out.push(n.range[0]);
        if (n !== f && isFn(n)) return;
        for (const k of sourceCode.visitorKeys[n.type] ?? []) {
          const v = (n as unknown as Record<string, unknown>)[k];
          if (Array.isArray(v)) v.forEach((x) => x && typeof x === "object" && walk(x as Node));
          else if (v && typeof v === "object") walk(v as Node);
        }
      };
      walk(f.body as Node);
      return out;
    };
    const awaitCache = new Map<Fn, number[]>();
    const hasAwait = (f: Fn): boolean => {
      let found = false;
      const walk = (n: Node) => {
        if (found) return;
        if (n.type === "AwaitExpression") { found = true; return; }
        if (n !== f && isFn(n)) return;
        for (const k of sourceCode.visitorKeys[n.type] ?? []) {
          const v = (n as unknown as Record<string, unknown>)[k];
          if (Array.isArray(v)) v.forEach((x) => x && typeof x === "object" && walk(x as Node));
          else if (v && typeof v === "object") walk(v as Node);
        }
      };
      walk(f.body as Node);
      return found;
    };

    return mergeVisitors(tracker.visitors(), {
      CallExpression(node) { calls.push(node); },
      "Program:exit"() {
        tracker.finalize();
        const targets = new Set<Fn>();
        for (const c of calls) {
          if (tracker.resolve(c.callee) !== "photoshop.core.executeAsModal") continue;
          const f = resolveFn(c.arguments[0] as Node | undefined);
          if (f) targets.add(f);
        }
        if (!targets.size) return;
        for (const c of calls) {
          const owner = ownerFn(c);
          if (!owner || !targets.has(owner)) continue;
          const name = asyncPsCall(c);
          // A later await in the same target keeps the modal scope open while Photoshop works through queued calls; stay silent then.
          if (!awaitCache.has(owner)) awaitCache.set(owner, awaitsIn(owner));
          const laterAwait = awaitCache.get(owner)!.some((pos) => pos > c.range[1]);
          if (name && isDropped(c) && !laterAwait && !(owner.body.type !== "BlockStatement")) {
            context.report({
              node: c,
              messageId: "floating",
              data: { name },
              suggest: owner.async ? [{ messageId: "addAwait", fix: (fx) => fx.insertTextBefore(c, "await ") }] : [],
            });
            continue;
          }
          if (!name && c.callee.type === "MemberExpression" && propertyName(c.callee) === "forEach" && isDropped(c)) {
            const cb = c.arguments[0] ? unwrap(c.arguments[0] as Node) : null;
            if (cb && isFn(cb) && cb.async && hasAwait(cb)) context.report({ node: c.callee.property, messageId: "asyncForEach" });
          }
        }
      },
    });
  },
});
