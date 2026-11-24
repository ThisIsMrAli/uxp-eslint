import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { propertyName, staticString, ModuleTracker, mergeVisitors, unwrap } from "../util/ast.js";
import { SOURCES } from "../data/sources.js";
import { isOlder } from "../util/version.js";

type MessageIds = "clipboard" | "clipboardObject" | "videoEvent" | "compositeChannels" | "replace";
type Node = TSESTree.Node;

/** UXP 8.0.1 changelog, "Deprecations" (Clipboard). */
const CLIPBOARD: Record<string, { use: string; rename?: string }> = {
  setContent: { use: "clipboard.write(data)", rename: "write" },
  getContent: { use: "clipboard.read()", rename: "read" },
  clearContent: { use: "clipboard.writeText(\"\")" },
};
/** HTMLVideoElement reference ("Deprecated: Use … instead") and UXP 8.0.1 changelog. */
const VIDEO_EVENTS: Record<string, string> = { uxpvideoload: "loadeddata", uxpvideoplay: "play", uxpvideocomplete: "ended", uxpvideopause: "pause" };

export default createRule<[], MessageIds>({
  name: "no-deprecated-api",
  meta: {
    type: "suggestion",
    hasSuggestions: true,
    docs: {
      description: "Flag UXP and Photoshop APIs that Adobe documents as deprecated, with the documented replacement",
      recommended: true,
      sources: [SOURCES.uxpChangelog, SOURCES.psChangelog],
    },
    schema: [],
    messages: {
      clipboard: "`clipboard.{{name}}()` is deprecated since UXP 8.0. Use `{{use}}` instead.",
      clipboardObject: "Passing an object to `clipboard.writeText()` is deprecated since UXP 8.0. Use `clipboard.write(object)` instead.",
      videoEvent: "The `{{name}}` video event is deprecated since UXP 8.0. Listen for `{{use}}` instead.",
      compositeChannels: "`document.compositeChannels` is deprecated (they are component channels). Use `document.componentChannels`.",
      replace: "Replace with `{{text}}`.",
    },
  },
  defaultOptions: [],
  create(context) {
    const uxp = getUxp(context);
    const sourceCode = context.sourceCode;
    // Replacements must exist on the oldest supported host: clipboard.write/read since UXP 6.0; componentChannels since PS 24.5.
    const clipboardOk = !uxp.uxpVersion || !isOlder(uxp.uxpVersion, "6.0");
    const channelsOk = uxp.host !== "PS" || !uxp.hostMinVersion || !isOlder(uxp.hostMinVersion, "24.5");
    const tracker = new ModuleTracker(new Set(["uxp", "photoshop"]));
    const isClipboard = (obj: Node) => {
      const t = sourceCode.getText(obj);
      return /(^|\.)clipboard$/i.test(t) || tracker.resolve(obj) === "uxp.clipboard";
    };
    const pending: TSESTree.CallExpression[] = [];
    return mergeVisitors(tracker.visitors(), {
      CallExpression(node) { pending.push(node); },
      MemberExpression(node) {
        if (propertyName(node) !== "compositeChannels" || node.computed) return;
        if ((uxp.host && uxp.host !== "PS") || !channelsOk) return;
        // `compositeChannels` exists only on the Photoshop Document class (@types/photoshop marks it @deprecated)
        context.report({
          node: node.property,
          messageId: "compositeChannels",
          suggest: [{ messageId: "replace", data: { text: "componentChannels" }, fix: (f) => f.replaceText(node.property, "componentChannels") }],
        });
      },
      "Program:exit"() {
        tracker.finalize();
        for (const node of pending) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression") continue;
          const name = propertyName(callee);
          if (!name) continue;
          if (CLIPBOARD[name] && clipboardOk && isClipboard(callee.object as Node)) {
            const d = CLIPBOARD[name]!;
            context.report({
              node: callee.property,
              messageId: "clipboard",
              data: { name, use: d.use },
              suggest: d.rename
                ? [{ messageId: "replace", data: { text: d.rename }, fix: (f) => f.replaceText(callee.property, d.rename!) }]
                : [{ messageId: "replace", data: { text: "writeText(\"\")" }, fix: (f) => f.replaceTextRange([callee.property.range[0], node.range[1]], "writeText(\"\")") }],
            });
            continue;
          }
          if (name === "writeText" && clipboardOk && isClipboard(callee.object as Node) && node.arguments[0] && unwrap(node.arguments[0] as Node).type === "ObjectExpression") {
            context.report({ node: callee.property, messageId: "clipboardObject", suggest: [{ messageId: "replace", data: { text: "write" }, fix: (f) => f.replaceText(callee.property, "write") }] });
            continue;
          }
          if ((name === "addEventListener" || name === "removeEventListener") && node.arguments[0]) {
            const ev = staticString(node.arguments[0] as Node);
            const use = ev ? VIDEO_EVENTS[ev] : undefined;
            if (use) {
              const arg = node.arguments[0]!;
              const q = sourceCode.getText(arg)[0];
              context.report({ node: arg, messageId: "videoEvent", data: { name: ev!, use }, suggest: [{ messageId: "replace", data: { text: use }, fix: (f) => f.replaceText(arg, `${q}${use}${q}`) }] });
            }
          }
        }
      },
    });
  },
});
