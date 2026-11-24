import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { checkCss, checkCssValue, isKnownWebFunction, matchesUxpDefault, type CssVerdict } from "../util/css-data.js";
import { SOURCES } from "../data/sources.js";

type Options = [{ ignore?: string[]; ignoreVendorPrefixed?: boolean; checkValues?: boolean; ignoreBuildTimeAtRules?: boolean }];
/** At-rules consumed by Tailwind/PostCSS at build time; they never reach UXP. */
const BUILD_TIME_AT_RULES = new Set(["tailwind", "apply", "layer", "config", "screen", "variants", "responsive", "theme", "source", "plugin", "utility", "custom-variant", "reference"]);
type MessageIds = "unsupported" | "newer" | "needsCssNext";
/** UXP 8.0.1 changelog: new CSS capabilities gated by `featureFlags.CSSNextSupport` (true, or a list of group names). */
const CSS_NEXT: Record<string, { group: string; kind: "properties" | "functionNames" }> = {
  "transform-origin": { group: "transformProperties", kind: "properties" },
  translate: { group: "transformProperties", kind: "properties" },
  scaleX: { group: "transformFunctions", kind: "functionNames" },
  scaleY: { group: "transformFunctions", kind: "functionNames" },
};

// Minimal css-tree node shapes (from @eslint/css); kept local so @eslint/css stays an optional peer.
interface Loc { loc: { start: { line: number; column: number }; end: { line: number; column: number } } }
interface CssNode extends Loc { type: string; name?: string; unit?: string; property?: string; value?: { type: string; children?: CssNode[] } }

export default createRule<Options, MessageIds>({
  name: "no-unsupported-css",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow CSS properties, values, at-rules, pseudo selectors, units and functions that the target UXP version does not support (CSS files, via @eslint/css)",
      recommended: true,
      sources: ["jardicc/vscode-uxp-validator UXP CSS data (MIT)", SOURCES.knownIssues, "AdobeDocs/uxp reference-css", SOURCES.uxpChangelog, SOURCES.forum11310],
    },
    schema: [{ type: "object", properties: { ignore: { type: "array", items: { type: "string" } }, ignoreVendorPrefixed: { type: "boolean" }, checkValues: { type: "boolean" }, ignoreBuildTimeAtRules: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      unsupported: "{{kind}} `{{name}}` is not supported by UXP{{target}}.",
      newer: "{{kind}} `{{name}}` needs UXP {{since}}+, but the target is UXP {{uxp}}.",
      needsCssNext: "{{kind}} `{{name}}` only takes effect with `\"featureFlags\": { \"CSSNextSupport\": true }` (or [\"{{group}}\"]) in manifest.json (UXP 8.0 changelog).",
    },
  },
  defaultOptions: [{ ignore: [], ignoreVendorPrefixed: true, checkValues: true, ignoreBuildTimeAtRules: true }],
  create(context, [opts]) {
    const uxp = getUxp(context);
    const uxpVersion = uxp.uxpVersion;
    const flags = (uxp.manifest?.featureFlags ?? null) as Record<string, unknown> | null;
    const cssNextOn = (group: string) => {
      const v = flags?.CSSNextSupport;
      return v === true || (Array.isArray(v) && v.includes(group)) || flags?.enableSWCSupport === true;
    };
    const checkCssNext = (node: Loc, kind: string, name: string) => {
      const n = CSS_NEXT[name];
      if (!n || !uxp.manifest || cssNextOn(n.group) || ignore.has(name.toLowerCase())) return;
      if (!checkCss(n.kind, name, uxpVersion).ok) return; // already reported as needing a newer UXP
      context.report({ loc: node.loc, messageId: "needsCssNext", data: { kind, name, group: n.group } });
    };
    const ignore = new Set((opts.ignore ?? []).map((x) => x.toLowerCase()));
    const target = uxpVersion ? ` ${uxpVersion}` : "";
    const report = (node: Loc, kind: string, name: string, v: CssVerdict) => {
      if (v.ok || ignore.has(name.toLowerCase())) return;
      if (opts.ignoreVendorPrefixed !== false && /^[:@]*-[a-z]+-/.test(name)) return;
      if (v.reason === "unsupported") context.report({ loc: node.loc, messageId: "unsupported", data: { kind, name, target } });
      else context.report({ loc: node.loc, messageId: "newer", data: { kind, name, since: v.since, uxp: uxpVersion ?? "?" } });
    };
    let skipValues = 0; // inside a declaration that is already reported (or a custom property)
    const visitors = {
      "Declaration:exit"() { if (skipValues > 0) skipValues--; },
      Declaration(node: CssNode) {
        const prop = node.property ?? "";
        if (prop.startsWith("--")) { skipValues++; return; }
        const v = checkCss("properties", prop, uxpVersion);
        if (!v.ok && matchesUxpDefault(prop, context.sourceCode.getText(node.value as never))) { skipValues++; return; }
        report(node, "Property", prop, v);
        if (!v.ok) { skipValues++; return; }
        checkCssNext(node, "Property", prop);
        if (opts.checkValues === false) return;
        const kids = node.value?.children?.filter((c) => c.type !== "WhiteSpace") ?? [];
        if (kids.length === 1 && kids[0]!.type === "Identifier" && kids[0]!.name) {
          const val = kids[0]!.name;
          const vv = checkCssValue(prop, val, uxpVersion);
          if (!vv.ok && !ignore.has(`${prop}:${val}`.toLowerCase())) report(kids[0]!, `Value of ${prop}`, val, vv);
        }
      },
      Atrule(node: CssNode) { if (opts.ignoreBuildTimeAtRules !== false && BUILD_TIME_AT_RULES.has(node.name ?? "")) return; report(node, "At-rule", `@${node.name}`, checkCss("atDirectives", `@${node.name}`, uxpVersion)); },
      PseudoClassSelector(node: CssNode) {
        const n = node.name ?? "";
        // CSS2 single-colon pseudo-elements (:before, :after, :first-line, :first-letter)
        if (["before", "after", "first-line", "first-letter"].includes(n)) { report(node, "Pseudo-element", `:${n}`, checkCss("pseudoElements", n, uxpVersion)); return; }
        report(node, "Pseudo-class", `:${n}`, checkCss("pseudoClasses", n, uxpVersion));
      },
      PseudoElementSelector(node: CssNode) { report(node, "Pseudo-element", `::${node.name}`, checkCss("pseudoElements", node.name ?? "", uxpVersion)); },
      Dimension(node: CssNode) { if (skipValues) return; report(node, "Unit", node.unit ?? "", checkCss("units", node.unit ?? "", uxpVersion)); },
      Function(node: CssNode) {
        if (skipValues) return;
        if (!node.name || !isKnownWebFunction(node.name)) return;
        report(node, "Function", `${node.name}()`, checkCss("functionNames", node.name, uxpVersion));
        checkCssNext(node, "Function", node.name);
      },
      // Media features: css-tree Feature nodes
      Feature(node: CssNode) { if (node.name) report(node, "Media feature", node.name, checkCss("mediaFeatures", node.name, uxpVersion)); },
    };
    return visitors as never;
  },
});
