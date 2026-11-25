import { createRule } from "../util/create-rule.js";
import { SOURCES } from "../data/sources.js";
import { uxpForHost } from "../util/version.js";

type MessageIds =
  | "entrypointMain" | "blankExtension" | "permissionsNeedV5" | "missingMinVersion" | "unknownHost" | "webviewNeedsV5" | "unknownHostVersion"
  | "missingRequired" | "invalidVersion" | "nameLength" | "entrypointType" | "duplicateEntrypoint" | "keyOnlyFor" | "sizeOrder"
  | "invalidPermissionValue" | "wildcardTopLevel" | "manifestVersionTooOld" | "wrongType";

// Minimal @eslint/json (momoa) node shapes
interface JNode { type: string; loc: { start: { line: number; column: number }; end: { line: number; column: number } }; range?: [number, number] }
interface JMember extends JNode { name: JString; value: JValue }
interface JString extends JNode { type: "String"; value: string }
interface JObject extends JNode { type: "Object"; members: JMember[] }
interface JArray extends JNode { type: "Array"; elements: { value: JValue }[] }
type JValue = JObject | JArray | JString | (JNode & { value?: unknown });

const get = (o: JValue | undefined, k: string): JValue | undefined => (o?.type === "Object" ? (o as JObject).members.find((m) => m.name.value === k)?.value : undefined);
const KNOWN_HOSTS = new Set(["PS", "ID", "premierepro", "XD", "ame"]);
// Manifest v4 reference, "Required: Develop / Publish" rows (main is optional and defaults to main.js).
const REQUIRED = ["manifestVersion", "id", "name", "version", "host"]; // entrypoints may be omitted (Adobe invisible-plugin-sample)
// Manifest v4 reference: these sizes are "Valid only for panel entry points"; shortcut is "Only valid for command entry points".
const PANEL_ONLY = ["minimumSize", "maximumSize", "preferredDockedSize", "preferredFloatingSize"];
// UXP 7.4 changelog: "Wildcards (*) at the top-level domain name are not allowed" (e.g. https://*.com, *.org, https://*)
const TOP_WILDCARD = /^(?:[a-z]+:\/\/)?\*(?:\.[a-z0-9-]+)?(?::\d+)?\/?$/i;

export default createRule<[{ reportUnknownHostVersion?: boolean }], MessageIds>({
  name: "valid-manifest",
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description: "Catch manifest.json mistakes that UXP accepts silently (lint manifest.json with @eslint/json)",
      recommended: true,
      sources: [SOURCES.manifestV4, SOURCES.manifestV5Md, SOURCES.uxpChangelog, SOURCES.forum10557, SOURCES.forum12117],
    },
    schema: [{ type: "object", properties: { reportUnknownHostVersion: { type: "boolean" } }, additionalProperties: false }],
    messages: {
      entrypointMain: "Remove `main` from entrypoint `{{id}}`; `main` belongs at the top level of manifest.json, not inside entrypoints (community report, forum thread 10557).",
      blankExtension: "`launchProcess.extensions` entry {{raw}} is whitespace. Use an empty string \"\" to allow opening folders.",
      permissionsNeedV5: "`requiredPermissions` is ignored before manifestVersion 5.",
      webviewNeedsV5: "WebViews need manifestVersion 5 or later.",
      missingMinVersion: "Set `host.minVersion`; version-aware rules (api-min-version, no-unsupported-css) cannot check this plugin without it.",
      unknownHost: "Unknown host app `{{app}}`; manifest docs list PS, ID, premierepro and XD.",
      missingRequired: "manifest.json is missing `{{key}}`, which Adobe's manifest reference marks as required for development and publishing.",
      invalidVersion: "Plugin `version` {{value}} is not valid for manifestVersion {{mv}}: {{why}}.",
      nameLength: "Plugin `name` should be 3 to 45 characters (Adobe manifest reference); {{value}} has {{n}}.",
      entrypointType: "Entrypoint type {{value}} is not valid; use \"panel\" or \"command\".",
      duplicateEntrypoint: "Entrypoint id `{{id}}` is declared more than once; ids must be unique and map to entrypoints.setup().",
      keyOnlyFor: "`{{key}}` is only valid for `{{type}}` entrypoints; entrypoint `{{id}}` is a {{actual}}.",
      sizeOrder: "Entrypoint `{{id}}`: minimumSize.{{dim}} ({{min}}) is larger than maximumSize.{{dim}} ({{max}}).",
      invalidPermissionValue: "`requiredPermissions.{{key}}` is {{value}}; allowed values: {{allowed}}.",
      wildcardTopLevel: "Domain {{value}} uses a wildcard at the top-level domain, which UXP 7.4+ rejects. List the registrable domain, e.g. \"https://*.example.com\".",
      manifestVersionTooOld: "manifestVersion {{value}} is below 4; Photoshop and current UXP hosts need manifestVersion 4 or higher (5 recommended).",
      wrongType: "`{{key}}` must be {{expected}}.",
      unknownHostVersion: "No documented UXP version is known for {{app}} {{version}} (older than every row in the host→UXP table); version checks will be skipped.",
    },
  },
  defaultOptions: [{ reportUnknownHostVersion: false }],
  create(context, [opts]) {
    if (!/(^|[\\/])manifest\.json$/.test(context.filename)) return {};
    return {
      Document(node: { body: JValue }) {
        const root = node.body;
        if (root?.type !== "Object") return;
        const rootLoc = { start: root.loc.start, end: { line: root.loc.start.line, column: root.loc.start.column + 1 } };
        const legacyXd = !!get(root, "uiEntrypoints"); // XD manifest v3 shape
        if (!legacyXd) for (const key of REQUIRED) if (!get(root, key)) context.report({ loc: rootLoc, messageId: "missingRequired", data: { key } });
        const mv = get(root, "manifestVersion") as { value?: unknown } | undefined;
        const version = typeof mv?.value === "number" ? mv.value : null;
        const isXd = /"app"\s*:\s*"XD"/.test(context.sourceCode.text);
        if (version !== null && version < 4 && !isXd) context.report({ loc: (mv as unknown as JNode).loc, messageId: "manifestVersionTooOld", data: { value: String(version) } });
        const ver = get(root, "version");
        if (ver && ver.type !== "String") context.report({ loc: ver.loc, messageId: "wrongType", data: { key: "version", expected: "a string such as \"1.0.0\"" } });
        else if (ver) {
          const v = (ver as JString).value;
          const why = version !== null && version < 5
            ? (/^\d{1,2}\.\d{1,2}\.\d{1,2}$/.test(v) ? null : "manifest v4 needs exactly three numeric segments, each 0-99")
            : (/^\d+(\.\d+){0,2}([-+][0-9A-Za-z.+-]+)?$/.test(v) ? null : "use semver, e.g. \"1.0.0\"");
          if (why) context.report({ loc: ver.loc, messageId: "invalidVersion", data: { value: JSON.stringify(v), mv: String(version ?? 5), why } });
        }
        const nm = get(root, "name");
        if (nm?.type === "String") {
          const n = [...(nm as JString).value].length;
          if (n < 3 || n > 45) context.report({ loc: nm.loc, messageId: "nameLength", data: { value: JSON.stringify((nm as JString).value), n: String(n) } });
        }
        const perms = get(root, "requiredPermissions");
        const enumCheck = (key: string, val: JValue | undefined, allowed: string[]) => {
          if (!val) return;
          if (val.type === "String" && allowed.includes((val as JString).value)) return;
          context.report({ loc: val.loc, messageId: "invalidPermissionValue", data: { key, value: val.type === "String" ? JSON.stringify((val as JString).value) : `a ${val.type.toLowerCase()}`, allowed: allowed.map((a) => JSON.stringify(a)).join(", ") } });
        };
        enumCheck("clipboard", get(perms, "clipboard"), ["read", "readAndWrite"]);
        enumCheck("localFileSystem", get(perms, "localFileSystem"), ["plugin", "request", "fullAccess"]);
        enumCheck("webview.allow", get(get(perms, "webview"), "allow"), ["yes"]);
        for (const [key, val] of [["enableUserInfo", get(perms, "enableUserInfo")], ["enableAddon", get(perms, "enableAddon")], ["ipc.enablePluginCommunication", get(get(perms, "ipc"), "enablePluginCommunication")]] as const) {
          if (val && val.type !== "Boolean") context.report({ loc: val.loc, messageId: "wrongType", data: { key: `requiredPermissions.${key}`, expected: "true or false" } });
        }
        for (const owner of ["network", "webview"]) {
          const doms = get(get(perms, owner), "domains");
          if (doms?.type !== "Array") continue;
          for (const el of (doms as JArray).elements) {
            const d = el.value as JString;
            if (d.type === "String" && TOP_WILDCARD.test(d.value.trim())) context.report({ loc: d.loc, messageId: "wildcardTopLevel", data: { value: JSON.stringify(d.value) } });
          }
        }
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
          else if (opts.reportUnknownHostVersion && app && !["XD", "ame"].includes(app) && KNOWN_HOSTS.has(app) && typeof min.value === "string" && uxpForHost(app, min.value) === null) context.report({ loc: min.loc, messageId: "unknownHostVersion", data: { app, version: min.value } });
        }
        const eps = get(root, "entrypoints") ?? get(root, "entryPoints"); // both spellings appear in shipping plugins (e.g. Alchemist)
        if (eps?.type === "Array") {
          const seen = new Set<string>();
          for (const el of (eps as JArray).elements) {
            const e = el.value;
            if (e.type !== "Object") continue;
            const typeNode = get(e, "type") as JString | undefined;
            const type = typeNode?.type === "String" ? typeNode.value : undefined;
            const idNode = get(e, "id") as JString | undefined;
            const id = idNode?.type === "String" ? idNode.value : "?";
            if (typeNode && (type === undefined || !["panel", "command"].includes(type))) context.report({ loc: typeNode.loc, messageId: "entrypointType", data: { value: JSON.stringify(type ?? typeNode.value) } });
            if (idNode?.type === "String") {
              if (seen.has(id)) context.report({ loc: idNode.loc, messageId: "duplicateEntrypoint", data: { id } });
              seen.add(id);
            }
            if (type === "command") for (const key of PANEL_ONLY) { const k = (e as JObject).members.find((m) => m.name.value === key); if (k) context.report({ loc: k.name.loc, messageId: "keyOnlyFor", data: { key, type: "panel", id, actual: "command" } }); }
            if (type === "panel") { const k = (e as JObject).members.find((m) => m.name.value === "shortcut"); if (k) context.report({ loc: k.name.loc, messageId: "keyOnlyFor", data: { key: "shortcut", type: "command", id, actual: "panel" } }); }
            for (const dim of ["width", "height"]) {
              const mn = (get(get(e, "minimumSize"), dim) as { value?: unknown } | undefined)?.value;
              const mxNode = get(get(e, "maximumSize"), dim);
              const mx = (mxNode as { value?: unknown } | undefined)?.value;
              if (typeof mn === "number" && typeof mx === "number" && mn > mx) context.report({ loc: mxNode!.loc, messageId: "sizeOrder", data: { id, dim, min: String(mn), max: String(mx) } });
            }
          }
          for (const el of (eps as JArray).elements) {
            const main = el.value.type === "Object" ? (el.value as JObject).members.find((x) => x.name.value === "main") : undefined;
            if (main) context.report({ loc: main.loc, messageId: "entrypointMain", data: { id: String((get(el.value, "id") as JString | undefined)?.value ?? "?") } });
          }
        }
      },
    } as never;
  },
});
