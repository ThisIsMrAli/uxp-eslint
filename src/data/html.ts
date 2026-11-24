import { SOURCES, type Confidence } from "./sources.js";

export interface HtmlFact { message: string; source: string; confidence: Confidence }

/** Elements Adobe documents as unsupported (rendered as plain <div>/text). */
export const UNSUPPORTED_ELEMENTS: Record<string, HtmlFact> = Object.fromEntries(
  [
    ["ul", "Lists are not supported; <ul> renders like a <div>. Simulate bullets with CSS."],
    ["ol", "Ordered lists are not supported; number items manually."],
    ["li", "List items are not supported; <li> renders like a <div>."],
    ["i", "<i> is not supported; use a styled element (font-style: italic)."],
    ["em", "<em> is not supported; use a styled element (font-style: italic)."],
    ["strong", "<strong> is not supported; use a styled element (font-weight: bold)."],
    ["q", "<q> is not supported; add quotes with CSS ::before/::after."],
    ["blockquote", "<blockquote> is not supported; style a <div> instead."],
    ["pre", "<pre> is not supported; use white-space: pre on a <div>."],
    ["code", "<code> is not supported; set font-family on a <span>."],
    ["title", "<title> is not used by UXP and may render visibly; add `title { display: none; }` or remove it."],
  ].map(([el, message]) => [el, { message: message!, source: SOURCES.unsupportedElements, confidence: "docs" as const }]),
);

/** Global attributes Adobe lists as unsupported. `aria-*` and `item*` are prefix matches. */
export const UNSUPPORTED_ATTRIBUTES = ["accesskey", "autocapitalize", "contenteditable", "contextmenu", "dir", "dropzone", "hidden", "inputmode", "is", "part", "spellcheck", "translate"];
export const UNSUPPORTED_ATTRIBUTE_PREFIXES = ["aria-", "item"];

export const INPUT_TYPES_UNSUPPORTED: Record<string, HtmlFact> = {
  file: { message: '<input type="file"> is not supported. Use require("uxp").storage.localFileSystem.getFileForOpening().', source: SOURCES.knownIssues, confidence: "docs" },
  color: { message: '<input type="color"> is not supported.', source: SOURCES.knownIssues, confidence: "docs" },
};
