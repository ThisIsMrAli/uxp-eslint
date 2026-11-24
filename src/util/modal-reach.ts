/**
 * Same-file call graph for Photoshop modal analysis (browser-safe).
 *
 * Every function gets one of three contexts:
 *  - "modal":   runs inside core.executeAsModal / suspendHistory (directly, through a wrapper such as
 *               `const modal = (fn) => core.executeAsModal(fn)`, through same-file calls, or because it uses an
 *               executionContext parameter such as `ctx.hostControl`).
 *  - "root":    certainly runs outside a modal scope: top-level code, event/timer/notification handlers, JSX on*
 *               handlers, `el.onclick =` handlers, entrypoints.setup() handlers, and functions they call.
 *  - "unknown": anything else (exported helpers, callbacks passed to unknown functions). Rules stay silent here.
 */
import type { TSESTree } from "@typescript-eslint/utils";
import { propertyName, keyName, unwrap, type ModuleTracker } from "./ast.js";

type Node = TSESTree.Node;
export type Fn = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
export type Ctx = "modal" | "root" | "unknown";

export const isFn = (n: Node | null | undefined): n is Fn => !!n && (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression");

/** Callbacks run later by the host/runtime, never inside the caller's modal scope. */
const HANDLER_APIS = new Set(["addEventListener", "setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask", "addNotificationListener", "addEventHandler", "on", "once", "useEffect", "useLayoutEffect", "subscribe"]);
/** Callbacks run in the caller's context (synchronously, or chained on the caller's promise). */
const INHERIT_APIS = new Set(["then", "catch", "finally", "map", "forEach", "filter", "reduce", "reduceRight", "some", "every", "find", "findIndex", "findLast", "flatMap", "sort", "from", "all", "allSettled", "race", "any"]);
const MEMO_APIS = new Set(["useCallback", "useMemo", "memo", "useEvent"]);
const EXEC_CONTEXT_MEMBERS = new Set(["hostControl", "reportProgress", "isCancelled", "onCancel"]);

export function calleeName(c: TSESTree.CallExpression | TSESTree.NewExpression): string | null {
  const callee = unwrap(c.callee as Node);
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression") return propertyName(callee);
  return null;
}

export interface ModalGraph {
  ctx(node: Node): Ctx;
  /** Innermost function is invoked directly by the runtime (handler) or the node is top-level code. */
  isDirectRoot(node: Node): boolean;
  enclosingFns(node: Node): Fn[];
  calls: TSESTree.CallExpression[];
  fnsByName: Map<string, Fn[]>;
  isModalEntry(c: TSESTree.CallExpression): boolean;
}

export function fnName(f: Fn): string | null {
  if (f.type === "FunctionDeclaration" && f.id) return f.id.name;
  let p: Node | undefined = f.parent;
  if (p?.type === "CallExpression" && MEMO_APIS.has(calleeName(p) ?? "")) p = p.parent; // const onClick = useCallback(() => ..., [])
  if (p?.type === "VariableDeclarator" && p.id.type === "Identifier") return p.id.name;
  if (p?.type === "AssignmentExpression" && p.left.type === "Identifier") return p.left.name;
  if (p?.type === "AssignmentExpression" && p.left.type === "MemberExpression" && !/^on[a-z]+$/.test(propertyName(p.left) ?? "")) return propertyName(p.left);
  if (p?.type === "Property" || p?.type === "MethodDefinition" || p?.type === "PropertyDefinition") return keyName(p);
  return null;
}

/** Name of a function reference used as a value: `handler`, `this.handler`, `obj.handler`. */
function refName(n: Node | null | undefined): string | null {
  if (!n) return null;
  const u = unwrap(n);
  if (u.type === "Identifier") return u.name;
  if (u.type === "MemberExpression") return propertyName(u);
  // fn.bind(this)
  if (u.type === "CallExpression" && u.callee.type === "MemberExpression" && propertyName(u.callee) === "bind") return refName(u.callee.object as Node);
  return null;
}

function paramNames(f: Fn): string[] {
  return f.params.map((p) => (p.type === "Identifier" ? p.name : p.type === "AssignmentPattern" && p.left.type === "Identifier" ? p.left.name : "")).filter(Boolean);
}

export function buildModalGraph(ast: Node, visitorKeys: Record<string, readonly string[] | undefined>, tracker: ModuleTracker): ModalGraph {
  const allFns: Fn[] = [];
  const calls: TSESTree.CallExpression[] = [];
  const members: TSESTree.MemberExpression[] = [];
  const assigns: TSESTree.AssignmentExpression[] = [];
  const jsxHandlers: Node[] = []; // expressions in JSX on* attributes
  const fnsByName = new Map<string, Fn[]>();
  const stack: Node[] = [ast];
  while (stack.length) {
    const n = stack.pop()!;
    if (isFn(n)) { allFns.push(n); const nm = fnName(n); if (nm) fnsByName.set(nm, [...(fnsByName.get(nm) ?? []), n]); }
    else if (n.type === "CallExpression") calls.push(n);
    else if (n.type === "MemberExpression") members.push(n);
    else if (n.type === "AssignmentExpression") assigns.push(n);
    else if (n.type === "JSXAttribute" && n.name.type === "JSXIdentifier" && /^on[A-Z]/.test(n.name.name) && n.value?.type === "JSXExpressionContainer" && n.value.expression.type !== "JSXEmptyExpression") jsxHandlers.push(n.value.expression as Node);
    for (const k of visitorKeys[n.type] ?? []) {
      const v = (n as unknown as Record<string, unknown>)[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c === "object" && "type" in c) stack.push(c as Node); }
      else if (v && typeof v === "object" && "type" in v) stack.push(v as Node);
    }
  }
  const fnCache = new WeakMap<Node, Fn[]>();
  const enclosingFns = (n: Node): Fn[] => {
    const hit = fnCache.get(n);
    if (hit) return hit;
    const out: Fn[] = [];
    for (let p = n.parent; p; p = p.parent) if (isFn(p)) out.push(p);
    fnCache.set(n, out);
    return out;
  };
  const innermost = (n: Node): Fn | undefined => enclosingFns(n)[0];

  const isModalEntry = (c: TSESTree.CallExpression): boolean => {
    const name = calleeName(c);
    return tracker.resolve(c.callee) === "photoshop.core.executeAsModal" || name === "executeAsModal" || name === "suspendHistory";
  };

  // 1. wrappers: functions that pass their own parameter on to executeAsModal (fixpoint: wrappers of wrappers)
  const wrappers = new Map<string, Set<number>>();
  const modalArgIndexes = (c: TSESTree.CallExpression): number[] => {
    if (isModalEntry(c)) return [0];
    const w = wrappers.get(calleeName(c) ?? "");
    return w ? [...w] : [];
  };
  for (let changed = true, pass = 0; changed && pass < 5; pass++) {
    changed = false;
    for (const c of calls) {
      for (const i of modalArgIndexes(c)) {
        const a = c.arguments[i] ? unwrap(c.arguments[i] as Node) : null;
        if (a?.type !== "Identifier") continue;
        const f = innermost(c);
        if (!f) continue;
        const idx = paramNames(f).indexOf(a.name);
        const nm = fnName(f);
        if (idx < 0 || !nm) continue;
        const set = wrappers.get(nm) ?? new Set<number>();
        if (!set.has(idx)) { set.add(idx); wrappers.set(nm, set); changed = true; }
      }
    }
  }

  // 2. modal roots
  const modal = new Set<Fn>();
  const modalNames = new Set<string>();
  for (const c of calls) {
    for (const i of modalArgIndexes(c)) {
      const a = c.arguments[i] ? unwrap(c.arguments[i] as Node) : null;
      if (isFn(a)) modal.add(a);
      else { const nm = refName(a); if (nm) modalNames.add(nm); }
    }
  }
  for (const nm of modalNames) for (const f of fnsByName.get(nm) ?? []) modal.add(f);
  // executionContext parameter in use: `ctx.hostControl`, `executionContext.reportProgress(...)`
  for (const m of members) {
    if (m.object.type !== "Identifier" || !EXEC_CONTEXT_MEMBERS.has(propertyName(m) ?? "")) continue;
    const name = m.object.name;
    const f = enclosingFns(m).find((g) => paramNames(g).includes(name));
    if (f) modal.add(f);
  }
  // propagate through same-file calls by name
  const calledBy = new Map<Fn, Set<string>>();
  for (const c of calls) {
    const nm = calleeName(c);
    const f = innermost(c);
    if (nm && f) { const s = calledBy.get(f) ?? new Set<string>(); s.add(nm); calledBy.set(f, s); }
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of [...modal]) for (const nm of calledBy.get(f) ?? []) for (const g of fnsByName.get(nm) ?? []) if (!modal.has(g)) { modal.add(g); changed = true; }
  }

  // 3. roots
  const direct = new Set<Fn>();
  const root = new Set<Fn>();
  const rootNames = new Set<string>();
  const inSetupObject = (n: Node): boolean => {
    let p: Node | undefined = n.parent;
    while (p && (p.type === "Property" || p.type === "ObjectExpression" || p.type === "ArrayExpression")) {
      const parent: Node | undefined = p.parent;
      if (parent?.type === "CallExpression" && parent.arguments.includes(p as TSESTree.CallExpressionArgument)) return calleeName(parent) === "setup";
      p = parent;
    }
    return false;
  };
  const isHandlerPosition = (expr: Node): boolean => {
    const p = expr.parent;
    if (!p) return false;
    if (p.type === "CallExpression" && p.arguments.includes(expr as TSESTree.CallExpressionArgument) && HANDLER_APIS.has(calleeName(p) ?? "")) return true;
    if (p.type === "AssignmentExpression" && p.right === expr && p.left.type === "MemberExpression" && /^on[a-z]+$/.test(propertyName(p.left) ?? "")) return true;
    if (p.type === "Property" && p.value === expr && inSetupObject(p)) return true;
    return false;
  };
  for (const f of allFns) if (isHandlerPosition(f) || (f.parent?.type === "MethodDefinition" ? false : f.parent?.type === "Property" && (f.parent as TSESTree.Property).method && inSetupObject(f.parent))) direct.add(f);
  for (const e of jsxHandlers) { const u = unwrap(e); if (isFn(u)) direct.add(u); else { const nm = refName(u); if (nm) rootNames.add(nm); } }
  for (const c of calls) {
    if (!HANDLER_APIS.has(calleeName(c) ?? "")) continue;
    for (const a of c.arguments) { const u = unwrap(a as Node); if (!isFn(u)) { const nm = refName(u); if (nm) rootNames.add(nm); } }
  }
  for (const a of assigns) {
    if (a.left.type === "MemberExpression" && /^on[a-z]+$/.test(propertyName(a.left) ?? "")) { const u = unwrap(a.right as Node); if (!isFn(u)) { const nm = refName(u); if (nm) rootNames.add(nm); } }
  }
  for (const nm of rootNames) for (const f of fnsByName.get(nm) ?? []) direct.add(f);
  for (const f of direct) root.add(f);
  const ctxIsRoot = (n: Node): boolean => { const f = innermost(n); return !f || root.has(f); };
  // name -> calls of that name, and name -> INHERIT_APIS calls that pass it as a callback (avoids O(fns x calls) per pass)
  const callsByName = new Map<string, TSESTree.CallExpression[]>();
  const passedByName = new Map<string, TSESTree.CallExpression[]>();
  for (const c of calls) {
    const nm = calleeName(c);
    if (nm) { const l = callsByName.get(nm); if (l) l.push(c); else callsByName.set(nm, [c]); }
    if (nm && INHERIT_APIS.has(nm)) for (const a of c.arguments) { const r = refName(a as Node); if (r) { const l = passedByName.get(r); if (l) l.push(c); else passedByName.set(r, [c]); } }
  }
  for (let changed = true, pass = 0; changed && pass < 20; pass++) {
    changed = false;
    for (const f of allFns) {
      if (root.has(f)) continue;
      let isRoot = false;
      const p = f.parent;
      // inline callbacks that run in their caller's context
      if (p?.type === "CallExpression" && p.arguments.includes(f as TSESTree.CallExpressionArgument) && INHERIT_APIS.has(calleeName(p) ?? "") && ctxIsRoot(p)) isRoot = true;
      if (p?.type === "CallExpression" && p.callee === f && ctxIsRoot(p)) isRoot = true; // IIFE
      if (p?.type === "NewExpression" && p.callee.type === "Identifier" && p.callee.name === "Promise" && ctxIsRoot(p)) isRoot = true;
      if (!isRoot) {
        const nm = fnName(f);
        if (nm) isRoot = (callsByName.get(nm) ?? []).some(ctxIsRoot) || (passedByName.get(nm) ?? []).some(ctxIsRoot);
      }
      if (isRoot) { root.add(f); changed = true; }
    }
  }

  return {
    calls,
    fnsByName,
    enclosingFns,
    isModalEntry,
    ctx(node) {
      const fns = enclosingFns(node);
      if (fns.some((f) => modal.has(f))) return "modal";
      const f = fns[0];
      if (!f || root.has(f)) return "root";
      return "unknown";
    },
    isDirectRoot(node) {
      const f = innermost(node);
      return !f || direct.has(f);
    },
  };
}
