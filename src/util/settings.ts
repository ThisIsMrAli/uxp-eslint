import type { TSESLint } from "@typescript-eslint/utils";
import { uxpForHost, compareVersions } from "./version.js";

export interface UxpManifest {
  manifestVersion?: number;
  id?: string;
  main?: string;
  host?: { app?: string; minVersion?: string; data?: Record<string, unknown> } | { app?: string; minVersion?: string }[];
  entrypoints?: { type?: string; id?: string; main?: string }[];
  /** Alternate spelling accepted by UXP and used by shipping plugins (e.g. Alchemist). */
  entryPoints?: { type?: string; id?: string; main?: string }[];
  requiredPermissions?: {
    network?: { domains?: string[] | "all" | string };
    clipboard?: "read" | "readAndWrite" | string;
    localFileSystem?: "plugin" | "request" | "fullAccess" | string;
    launchProcess?: { schemes?: string[]; extensions?: string[] };
    ipc?: { enablePluginCommunication?: boolean };
    webview?: { allow?: string; domains?: string[] | "all" | string; enableMessageBridge?: string };
    allowCodeGenerationFromStrings?: boolean;
    enableUserInfo?: boolean;
  };
  featureFlags?: { enableAlerts?: boolean; [k: string]: unknown };
  [k: string]: unknown;
}

/** Shape of `settings.uxp` that every rule reads. All fields optional. */
export interface UxpSettings {
  /** Parsed manifest.json object. */
  manifest?: UxpManifest;
  /** Raw manifest.json text (parsed lazily if `manifest` is absent). */
  manifestText?: string;
  /** Override the host app ("PS", "ID", "premierepro", "ame", "aftereffects"). Defaults to manifest host.app. */
  host?: string;
  /** Override host minimum version. Defaults to manifest host.minVersion. */
  hostMinVersion?: string;
  /** Override the minimum UXP version. Defaults to the version mapped from host.minVersion. */
  uxpVersion?: string;
  /** React major version used by the plugin (uxpConfig reads it from package.json). React 19+ forwards custom-element events. */
  reactVersion?: number;
  /** Unsupported elements (ul, li, strong, title, ...) the project's CSS already styles, Adobe's documented workaround; not reported. */
  styledElements?: string[];
  /** Also lint generated/minified bundles (default false: skipped). */
  lintGenerated?: boolean;
  /** Also lint Node-only scripts (shebang or `node:` imports; default false: skipped). */
  lintNodeScripts?: boolean;
  /** entrypoints.setup() is spread over several files/bundles: entrypoints-match-manifest then skips "missing handler" reports. uxpConfig() detects this. */
  splitSetup?: boolean;
}

/**
 * Photoshop apiVersion: host.data.apiVersion, else the documented default
 * (minVersion < 23.0.0 => 1, otherwise 2). Null when there is no manifest.
 */
export function photoshopApiVersion(r: ResolvedUxp): number | null {
  if (!r.manifest) return null;
  const hosts = r.manifest.host ? (Array.isArray(r.manifest.host) ? r.manifest.host : [r.manifest.host]) : [];
  const ps = hosts.find((h) => h.app === "PS") as { minVersion?: string; data?: { apiVersion?: unknown } } | undefined;
  if (!ps) return null;
  if (typeof ps.data?.apiVersion === "number") return ps.data.apiVersion;
  if (!ps.minVersion) return null;
  return compareVersions(ps.minVersion, "23.0.0") < 0 ? 1 : 2;
}

export interface ResolvedUxp {
  manifest: UxpManifest | null;
  manifestVersion: number | null;
  host: string | null;
  hosts: string[];
  hostMinVersion: string | null;
  uxpVersion: string | null;
}

const cache = new WeakMap<object, Map<string, ResolvedUxp>>();

/** Host named by a file or folder (`ppro.ts`, `src/photoshop/…`, `indesign-utils.js`), used for multi-host manifests. */
const HOST_HINTS: [RegExp, string][] = [
  [/(^|[\/._-])(ppro|premiere|premierepro)([\/._-]|$)/i, "premierepro"],
  [/(^|[\/._-])(ps|photoshop)([\/._-]|$)/i, "PS"],
  [/(^|[\/._-])(ame|media-encoder)([\/._-]|$)/i, "ame"],
  [/(^|[\/._-])(ae|after-effects|aftereffects)([\/._-]|$)/i, "aftereffects"],
  [/(^|[\/._-])(indesign|idsn)([\/._-]|$)/i, "ID"],
];

export function getUxp(context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>): ResolvedUxp {
  const s = ((context.settings as Record<string, unknown> | undefined)?.uxp ?? {}) as UxpSettings;
  let byHint = cache.get(s);
  if (!byHint) { byHint = new Map(); cache.set(s, byHint); }
  let manifest: UxpManifest | null = s.manifest ?? null;
  if (!manifest && typeof s.manifestText === "string") {
    try { manifest = JSON.parse(s.manifestText) as UxpManifest; } catch { manifest = null; }
  }
  const hostEntries = manifest?.host ? (Array.isArray(manifest.host) ? manifest.host : [manifest.host]) : [];
  const hosts = hostEntries.map((h) => h.app).filter((x): x is string => typeof x === "string");
  const filename = (context.filename ?? "").split("\\").join("/");
  const hint = !s.host && hosts.length > 1 ? HOST_HINTS.find(([re, h]) => hosts.includes(h) && re.test(filename))?.[1] ?? "" : "";
  const cached = byHint.get(hint);
  if (cached) return cached;
  const host = s.host ?? (hint || hosts[0]) ?? null;
  const entry = hostEntries.find((h) => h.app === host) ?? hostEntries[0];
  const hostMinVersion = s.hostMinVersion ?? (typeof entry?.minVersion === "string" ? entry.minVersion : null);
  let uxpVersion = s.uxpVersion ?? (host && hostMinVersion ? uxpForHost(host, hostMinVersion) : null);
  // Shared code in a multi-host plugin: hold it to the newest UXP any host ships, so only APIs no host has are reported.
  if (!s.uxpVersion && !s.host && !hint && hostEntries.length > 1) {
    for (const h of hostEntries) {
      const v = typeof h.app === "string" && typeof h.minVersion === "string" ? uxpForHost(h.app, h.minVersion) : null;
      if (v && (!uxpVersion || compareVersions(v, uxpVersion) > 0)) uxpVersion = v;
    }
  }
  const r: ResolvedUxp = {
    manifest,
    manifestVersion: typeof manifest?.manifestVersion === "number" ? manifest.manifestVersion : null,
    host,
    hosts: s.host ? [s.host] : hosts,
    hostMinVersion,
    uxpVersion,
  };
  byHint.set(hint, r);
  return r;
}
