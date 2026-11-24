import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { getUxp } from "../util/settings.js";
import { ModuleTracker, keyName, mergeVisitors } from "../util/ast.js";

type Options = [{ reportMissing?: boolean }];
type MessageIds = "notInManifest" | "missingHandler" | "wrongKind";

export default createRule<Options, MessageIds>({
  name: "entrypoints-match-manifest",
  meta: {
    type: "problem",
    docs: {
      description: "Require `entrypoints.setup()` panel and command ids to match manifest.json entrypoints",
      recommended: true,
      sources: ["https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v5/#entrypointssetup-using-promises"],
    },
    schema: [{ type: "object", properties: { reportMissing: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      notInManifest: "{{kind}} `{{id}}` is set up in code but manifest.json has no {{kind}} entrypoint with that id.",
      missingHandler: "manifest.json declares {{kind}} `{{id}}` but this entrypoints.setup() call has no handler for it.",
      wrongKind: "`{{id}}` is a {{actual}} in manifest.json but is set up under `{{key}}`.",
    },
  },
  defaultOptions: [{ reportMissing: true }],
  create(context, [opts]) {
    const m = getUxp(context).manifest;
    const eps = m ? (Array.isArray(m.entrypoints) ? m.entrypoints : Array.isArray(m.entryPoints) ? m.entryPoints : null) : null;
    if (!eps) return {};
    const byType: Record<string, Set<string>> = { panel: new Set(), command: new Set() };
    for (const e of eps) if (e && typeof e.id === "string" && typeof e.type === "string" && byType[e.type]) byType[e.type]!.add(e.id);
    const tracker = new ModuleTracker(new Set(["uxp"]));
    const calls: TSESTree.CallExpression[] = [];
    return mergeVisitors(tracker.visitors(), {
      CallExpression(node) { calls.push(node); },
      "Program:exit"() {
        tracker.finalize();
        for (const call of calls) {
          if (tracker.resolve(call.callee) !== "uxp.entrypoints.setup") continue;
          const arg = call.arguments[0];
          if (!arg || arg.type !== "ObjectExpression") continue;
          for (const section of arg.properties) {
            if (section.type !== "Property") continue;
            const key = keyName(section);
            const kind = key === "panels" ? "panel" : key === "commands" ? "command" : null;
            if (!kind || section.value.type !== "ObjectExpression") continue;
            const seen = new Set<string>();
            let dynamic = false;
            for (const p of section.value.properties) {
              if (p.type !== "Property") { dynamic = true; continue; }
              const id = keyName(p);
              if (!id) { dynamic = true; continue; }
              seen.add(id);
              if (byType[kind]!.has(id)) continue;
              const other = kind === "panel" ? "command" : "panel";
              if (byType[other]!.has(id)) context.report({ node: p.key, messageId: "wrongKind", data: { id, actual: other, key: key! } });
              else context.report({ node: p.key, messageId: "notInManifest", data: { id, kind } });
            }
            if (opts.reportMissing !== false && !dynamic) for (const id of byType[kind]!) if (!seen.has(id)) context.report({ node: section.key, messageId: "missingHandler", data: { id, kind } });
          }
        }
      },
    });
  },
});
