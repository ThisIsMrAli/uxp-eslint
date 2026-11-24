import type { TSESTree, TSESLint } from "@typescript-eslint/utils";

type Node = TSESTree.Node;

/** Static string value of a literal or a template literal without expressions. */
export function staticString(node: Node | null | undefined): string | null {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null;
  return null;
}

/** Leading static text of a string/template literal (text before the first `${`), plus whether it is complete. */
export function staticPrefix(node: Node | null | undefined): { text: string; complete: boolean } | null {
  if (!node) return null;
  const s = staticString(node);
  if (s !== null) return { text: s, complete: true };
  if (node.type === "TemplateLiteral") return { text: node.quasis[0]?.value.cooked ?? "", complete: false };
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = staticPrefix(node.left as Node);
    if (left) return { text: left.text, complete: false };
  }
  return null;
}

export function propertyName(node: TSESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed) return staticString(node.property);
  if (node.property.type === "PrivateIdentifier") return null;
  return null;
}

export function keyName(node: TSESTree.Property | TSESTree.MethodDefinition | TSESTree.PropertyDefinition): string | null {
  if (node.key.type === "Identifier" && !node.computed) return node.key.name;
  return staticString(node.key as Node);
}

/** Matches `require("x")` and returns "x". */
export function requireSource(node: Node | null | undefined): string | null {
  if (!node || node.type !== "CallExpression") return null;
  if (node.callee.type !== "Identifier" || node.callee.name !== "require" || node.arguments.length !== 1) return null;
  return staticString(node.arguments[0] as Node);
}

export function unwrap(node: Node): Node {
  let n = node;
  while (
    n.type === "AwaitExpression" ||
    n.type === "TSAsExpression" ||
    n.type === "TSNonNullExpression" ||
    n.type === "TSSatisfiesExpression" ||
    n.type === "ChainExpression" ||
    n.type === "TSTypeAssertion"
  ) {
    n = (n as { expression?: Node; argument?: Node }).expression ?? (n as { argument: Node }).argument;
  }
  return n;
}

export const BROWSER_GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);

/** Tracks names bound to UXP / host modules, e.g. `const { core } = require("photoshop")` => core -> "photoshop.core". */
export class ModuleTracker {
  private bindings = new Map<string, string>();
  private pending: { pattern: Node; init: Node }[] = [];

  constructor(private readonly modules: ReadonlySet<string>) {}

  visitors(): TSESLint.RuleListener {
    return {
      ImportDeclaration: (node) => {
        const src = node.source.value;
        if (typeof src !== "string" || !this.modules.has(src)) return;
        for (const s of node.specifiers) {
          if (s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier") this.bindings.set(s.local.name, src);
          else {
            const imported = s.imported.type === "Identifier" ? s.imported.name : String(s.imported.value);
            this.bindings.set(s.local.name, `${src}.${imported}`);
          }
        }
      },
      VariableDeclarator: (node) => {
        if (node.init) this.pending.push({ pattern: node.id, init: node.init });
      },
      AssignmentExpression: (node) => {
        if (node.left.type === "Identifier" || node.left.type === "ObjectPattern") this.pending.push({ pattern: node.left, init: node.right });
      },
    };
  }

  /** Call once in Program:exit (or lazily) to resolve declarators in dependency order. */
  finalize(): void {
    for (let pass = 0; pass < 4 && this.pending.length; pass++) {
      const rest: { pattern: Node; init: Node }[] = [];
      for (const p of this.pending) {
        const base = this.resolve(p.init);
        if (base) this.bind(p.pattern, base);
        else rest.push(p);
      }
      if (rest.length === this.pending.length) break;
      this.pending = rest;
    }
  }

  private bind(pattern: Node, base: string): void {
    if (pattern.type === "Identifier") {
      if (!this.bindings.has(pattern.name)) this.bindings.set(pattern.name, base);
      return;
    }
    if (pattern.type === "ObjectPattern") {
      for (const prop of pattern.properties) {
        if (prop.type !== "Property") continue;
        const k = keyName(prop);
        if (!k) continue;
        const value = prop.value.type === "AssignmentPattern" ? prop.value.left : prop.value;
        this.bind(value as Node, `${base}.${k}`);
      }
    }
  }

  /** Canonical dotted path for an expression, e.g. "photoshop.action.batchPlay"; null when not module-derived. */
  resolve(node: Node | null | undefined): string | null {
    if (!node) return null;
    const n = unwrap(node);
    if (n.type === "Identifier") return this.bindings.get(n.name) ?? null;
    const req = requireSource(n);
    if (req !== null) return this.modules.has(req) ? req : null;
    if (n.type === "MemberExpression") {
      const name = propertyName(n);
      if (!name) return null;
      const obj = unwrap(n.object as Node);
      if (obj.type === "Identifier" && BROWSER_GLOBAL_OBJECTS.has(obj.name) && name === "require") return null;
      const base = this.resolve(n.object as Node);
      return base ? `${base}.${name}` : null;
    }
    return null;
  }

  has(name: string): boolean {
    return this.bindings.has(name);
  }
}

/** Dotted path of a member chain rooted at an identifier (e.g. window.navigator.clipboard.writeText). */
export function memberPath(node: Node): string | null {
  const n = unwrap(node);
  if (n.type === "Identifier") return n.name;
  if (n.type === "ThisExpression") return "this";
  if (n.type === "MemberExpression") {
    const name = propertyName(n);
    if (!name) return null;
    const base = memberPath(n.object as Node);
    return base ? `${base}.${name}` : null;
  }
  return null;
}

/** Strips window./globalThis./self. prefixes. */
export function stripGlobal(path: string): string {
  return path.replace(/^(?:window|globalThis|self)\./, "");
}

/** True when an identifier refers to an unresolved (global) variable in its scope. */
export function isGlobalReference(sourceCode: Readonly<TSESLint.SourceCode>, node: TSESTree.Identifier): boolean {
  let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(node);
  while (scope) {
    const v = scope.set.get(node.name);
    if (v && v.defs.length > 0) return false;
    scope = scope.upper;
  }
  return true;
}

export function getHtmlAttr(node: HtmlTag, name: string): HtmlAttribute | undefined {
  return node.attributes?.find((a) => a.key?.value?.toLowerCase() === name);
}

/** Minimal shape of @html-eslint/parser nodes we use (kept local so the parser stays an optional peer). */
export interface HtmlAttribute { type: "Attribute"; key: { value: string }; value?: { value: string }; range: [number, number]; loc: TSESTree.SourceLocation }
export interface HtmlTag { type: "Tag"; name: string; attributes: HtmlAttribute[]; range: [number, number]; loc: TSESTree.SourceLocation; openStart?: { loc: TSESTree.SourceLocation } }

/** Uniform view of an element from HTML (Tag) or JSX (JSXOpeningElement). */
export interface ElementView {
  name: string;
  attrs: { name: string; value: string | null; node: unknown; loc: TSESTree.SourceLocation }[];
  node: unknown;
  loc: TSESTree.SourceLocation;
  jsx: boolean;
}

export function viewFromHtml(tag: HtmlTag): ElementView {
  return {
    name: tag.name.toLowerCase(),
    attrs: (tag.attributes ?? []).map((a) => ({ name: a.key.value.toLowerCase(), value: a.value ? a.value.value : null, node: a, loc: a.loc })),
    node: tag,
    loc: tag.openStart?.loc ?? tag.loc,
    jsx: false,
  };
}

export function viewFromJsx(el: TSESTree.JSXOpeningElement): ElementView | null {
  let name: string | null = null;
  if (el.name.type === "JSXIdentifier") name = el.name.name;
  if (!name || /^[A-Z]/.test(name)) return null; // components, not host elements
  const attrs: ElementView["attrs"] = [];
  for (const a of el.attributes) {
    if (a.type !== "JSXAttribute") continue;
    const an = a.name.type === "JSXIdentifier" ? a.name.name : `${a.name.namespace.name}:${a.name.name.name}`;
    let value: string | null = null;
    if (a.value?.type === "Literal" && typeof a.value.value === "string") value = a.value.value;
    else if (a.value?.type === "JSXExpressionContainer") value = staticString(a.value.expression as Node) ?? (a.value.expression.type === "Literal" ? String(a.value.expression.value) : "\u0000dynamic");
    else if (!a.value) value = "";
    attrs.push({ name: an, value, node: a, loc: a.loc });
  }
  return { name, attrs, node: el, loc: el.loc, jsx: true };
}

/** Merge rule listeners; handlers for the same selector all run, in order. */
export function mergeVisitors(...listeners: Record<string, unknown>[]): TSESLint.RuleListener {
  const out: Record<string, (...a: unknown[]) => void> = {};
  for (const l of listeners) {
    for (const [k, fn] of Object.entries(l)) {
      if (typeof fn !== "function") continue;
      const prev = out[k];
      out[k] = prev ? (...a: unknown[]) => { prev(...a); (fn as (...a: unknown[]) => void)(...a); } : (fn as (...a: unknown[]) => void);
    }
  }
  return out as TSESLint.RuleListener;
}
