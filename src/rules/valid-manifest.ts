import { createRule } from "../util/create-rule.js";
import { SOURCES } from "../data/sources.js";
import { uxpForHost } from "../util/version.js";

type MessageIds = "entrypointMain" | "blankExtension" | "permissionsNeedV5" | "missingMinVersion" | "unknownHost" | "webviewNeedsV5" | "unknownHostVersion";

// Minimal @eslint/json (momoa) node shapes
interface JNode { type: string; loc: { start: { line: number; column: number }; end: { line: number; column: number } }; range?: [number, number] }
interface JMember extends JNode { name: JString; value: JValue }
interface JString extends JNode { type: "String"; value: string }
interface JObject extends JNode { type: "Object"; members: JMember[] }
interface JArray extends JNode { type: "Array"; elements: { value: JValue }[] }
type JValue = JObject | JArray | JString | (JNode & { value?: unknown });

const get = (o: JValue | undefined, k: string): JValue | undefined => (o?.type === "Object" ? (o as JObject).members.find((m) => m.name.value === k)?.value : undefined);
const KNOWN_HOSTS = new Set(["PS", "ID", "premierepro", "XD"]);

export default createRule<[], MessageIds>({
  name: "valid-manifest",
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description: "Catch manifest.json mistakes that UXP accepts silently (lint manifest.json with @eslint/json)",
      recommended: true,
      sources: [SOURCES.manifestV5, SOURCES.forum10557, SOURCES.forum12117],
    },
    schema: [],
    messages: {
      entrypointMain: "Remove `main` from entrypoint `{{id}}`; `main` belongs at the top level of manifest.json, not inside entrypoints (community report, forum thread 10557).",
      blankExtension: "`launchProcess.extensions` entry {{raw}} is whitespace. Use an empty string \"\" to allow opening folders.",
      permissionsNeedV5: "`requiredPermissions` is ignored before manifestVersion 5.",
      webviewNeedsV5: "WebViews need manifestVersion 5 or later.",
      missingMinVersion: "Set `host.minVersion`; version-aware rules (api-min-version, no-unsupported-css) cannot check this plugin without it.",
      unknownHost: "Unknown host app `{{app}}`; manifest docs list PS, ID, premierepro and XD.",
      unknownHostVersion: "No documented UXP version is known for {{app}} {{version}} (older than every row in the host→UXP table); version checks will be skipped.",
    },
  },
  defaultOptions: [],
  create(context) {
    if (!/(^|[\\/])manifest\.json$/.test(context.filename)) return {};
    return {
      Document(node: { body: JValue }) {
        const root = node.body;
        if (root?.type !== "Object") return;
        const mv = get(root, "manifestVersion") as { value?: unknown } | undefined;
        const version = typeof mv?.value === "number" ? mv.value : null;
        const perms = get(root, "requiredPermissions");
        if (perms && version !== null && version < 5) context.report({ loc: perms.loc, messageId: "permissionsNeedV5" });
        if (get(perms, "webview") && version !== null && version < 5) context.report({ loc: get(perms, "webview")!.loc, messageId: "webviewNeedsV5" });
        const exts = get(get(perms, "launchProcess"), "extensions");
        if (exts?.type === "Array") {
          for (const el of (exts as JArray).elements) {
            const v = el.value as JString;
            if (v.type === "String" && v.value.length > 0 && v.value.trim() === "") {
              context.report({ loc: v.loc, messageId: "blankExtension", data: { raw: JSON.stringify(v.value) }, fix: v.range ? (f) => f.replaceTextRange(v.range!, "\"\"") : null });
            }
          }
        }
        const hostNode = get(root, "host");
        const hosts = hostNode?.type === "Array" ? (hostNode as JArray).elements.map((e) => e.value) : hostNode ? [hostNode] : [];
        for (const h of hosts) {
          const app = (get(h, "app") as JString | undefined)?.value;
          const min = get(h, "minVersion") as JString | undefined;
          if (app && !KNOWN_HOSTS.has(app)) context.report({ loc: get(h, "app")!.loc, messageId: "unknownHost", data: { app } });
          if (!min) context.report({ loc: h.loc, messageId: "missingMinVersion" });
          else if (app && app !== "XD" && KNOWN_HOSTS.has(app) && typeof min.value === "string" && uxpForHost(app, min.value) === null) context.report({ loc: min.loc, messageId: "unknownHostVersion", data: { app, version: min.value } });
        }
        const eps = get(root, "entrypoints");
        if (eps?.type === "Array") {
          for (const el of (eps as JArray).elements) {
            const main = el.value.type === "Object" ? (el.value as JObject).members.find((x) => x.name.value === "main") : undefined;
            if (main) context.report({ loc: main.loc, messageId: "entrypointMain", data: { id: String((get(el.value, "id") as JString | undefined)?.value ?? "?") } });
          }
        }
      },
    } as never;
  },
});
