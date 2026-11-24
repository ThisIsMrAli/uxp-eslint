import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { viewFromHtml, viewFromJsx, type ElementView, type HtmlTag } from "../util/ast.js";
import { UNSUPPORTED_ELEMENTS, UNSUPPORTED_ATTRIBUTES, UNSUPPORTED_ATTRIBUTE_PREFIXES, INPUT_TYPES_UNSUPPORTED } from "../data/html.js";
import { SOURCES } from "../data/sources.js";

type Options = [{ elements?: boolean; attributes?: boolean; aria?: boolean; inlineHandlers?: boolean; ignore?: string[] }];
type MessageIds = "element" | "attribute" | "inputType" | "labelFor" | "formMethod" | "textareaSize" | "optionValue" | "optionDisabled" | "selectValue" | "inlineHandler" | "defaultValue" | "spEvent";

const SPECTRUM_PREFIX = /^sp-/;

export default createRule<Options, MessageIds>({
  name: "no-unsupported-html",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow HTML elements, attributes and patterns that UXP documents as unsupported (HTML via @html-eslint/parser, and JSX)",
      recommended: true,
      sources: [SOURCES.knownIssues, SOURCES.unsupportedAttributes, SOURCES.unsupportedElements, SOURCES.uiPlaygroundReadme],
    },
    schema: [{ type: "object", properties: { elements: { type: "boolean" }, attributes: { type: "boolean" }, aria: { type: "boolean" }, inlineHandlers: { type: "boolean" }, ignore: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
    messages: {
      element: "{{message}}",
      attribute: "Global attribute `{{name}}` is not supported by UXP.",
      inputType: "{{message}}",
      labelFor: "`<label {{attr}}>` is not supported in UXP; wrap the control inside the <label> instead.",
      formMethod: "UXP forms only support `method=\"dialog\"`; they do not submit to a URL.",
      textareaSize: "`<textarea {{attr}}>` is ignored in UXP; size it with CSS width/height.",
      optionValue: "`<option>` needs a `value` attribute in UXP, otherwise `select.value` returns undefined.",
      optionDisabled: "`<option disabled>` is not supported in UXP.",
      selectValue: "`<select value=...>` does not select the option in UXP; set `selected` on the <option> or call setAttribute(\"value\", ...).",
      inlineHandler: "Inline `{{name}}` handlers are not reliable in UXP; attach listeners with addEventListener.",
      defaultValue: "UXP input elements do not accept `defaultValue`; set `value` instead.",
      spEvent: "React does not forward `{{name}}` to the `<{{el}}>` web component; attach the listener with a ref and addEventListener (React 19+ excepted).",
    },
  },
  defaultOptions: [{ elements: true, attributes: true, aria: false, inlineHandlers: true, ignore: [] }],
  create(context, [opts]) {
    const ignore = new Set(opts.ignore ?? []);
    const at = (loc: TSESTree.SourceLocation, messageId: MessageIds, data: Record<string, string> = {}) => {
      if (!ignore.has(messageId) && !ignore.has(data.name ?? "\u0000")) context.report({ loc, messageId, data });
    };
    const check = (el: ElementView) => {
      const attr = (n: string) => el.attrs.find((a) => a.name.toLowerCase() === n);
      if (opts.elements !== false && UNSUPPORTED_ELEMENTS[el.name]) at(el.loc, "element", { message: UNSUPPORTED_ELEMENTS[el.name]!.message, name: el.name });
      if (el.name === "input") {
        const t = attr("type")?.value?.toLowerCase();
        if (t && INPUT_TYPES_UNSUPPORTED[t]) at(attr("type")!.loc, "inputType", { message: INPUT_TYPES_UNSUPPORTED[t]!.message });
      }
      if ((el.name === "input" || el.name === "textarea") && attr(el.jsx ? "defaultvalue" : "\u0000")) at(attr("defaultvalue")!.loc, "defaultValue");
      if (el.name === "label") {
        const f = el.jsx ? el.attrs.find((a) => a.name === "htmlFor") : attr("for");
        if (f) at(f.loc, "labelFor", { attr: el.jsx ? "htmlFor" : "for" });
      }
      if (el.name === "form") {
        const m = attr("method");
        if ((m && m.value !== "\u0000dynamic" && m.value?.toLowerCase() !== "dialog") || attr("action")) at((m ?? attr("action"))!.loc, "formMethod");
      }
      if (el.name === "textarea") for (const n of ["rows", "cols"]) if (attr(n)) at(attr(n)!.loc, "textareaSize", { attr: n });
      if (el.name === "option") {
        if (!attr("value")) at(el.loc, "optionValue");
        if (attr("disabled")) at(attr("disabled")!.loc, "optionDisabled");
      }
      if (el.name === "select" && !el.jsx && attr("value")) at(attr("value")!.loc, "selectValue");
      for (const a of el.attrs) {
        const n = a.name.toLowerCase();
        if (opts.attributes !== false) {
          const prefixHit = UNSUPPORTED_ATTRIBUTE_PREFIXES.find((p) => n.startsWith(p) && (p !== "item" || /^item(scope|type|prop|id|ref)$/.test(n)));
          if (UNSUPPORTED_ATTRIBUTES.includes(n) || (prefixHit && (prefixHit !== "aria-" || opts.aria === true))) {
            if (!(n === "dir" && el.jsx === false && el.name === "html")) at(a.loc, "attribute", { name: a.name });
          }
        }
        if (!el.jsx && opts.inlineHandlers !== false && /^on[a-z]+$/.test(n)) at(a.loc, "inlineHandler", { name: a.name });
        if (el.jsx && SPECTRUM_PREFIX.test(el.name) && /^on(Change|Input)$/.test(a.name)) at(a.loc, "spEvent", { name: a.name, el: el.name });
      }
    };
    return {
      JSXOpeningElement(node) {
        const v = viewFromJsx(node);
        if (v) check(v);
      },
      ...({ Tag(node: HtmlTag) { check(viewFromHtml(node)); } } as Record<string, unknown>),
    };
  },
});
