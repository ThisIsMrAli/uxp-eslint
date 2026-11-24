import type { UxpManifest, UxpSettings } from "./util/settings.js";

export const PREFIX = "uxp-lint";
export const JS_FILES = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,psjs,idjs}"];
export const CSS_FILES = ["**/*.css"];
export const HTML_FILES = ["**/*.{html,htm}"];
export const MANIFEST_FILES = ["**/manifest.json"];

type Sev = "error" | "warn" | "off";
type RuleMap = Record<string, Sev | [Sev, ...unknown[]]>;
const r = (m: Record<string, Sev | [Sev, ...unknown[]]>): RuleMap => Object.fromEntries(Object.entries(m).map(([k, v]) => [`${PREFIX}/${k}`, v]));

export const JS_RECOMMENDED = r({
  "manifest-permissions": "error",
  "api-min-version": "error",
  "no-unsupported-inline-style": "warn",
  "no-unsupported-html": "warn",
  "no-unsupported-web-api": "warn",
  "no-unsupported-fs-method": "error",
  "no-node-builtin-modules": "error",
  "entrypoints-match-manifest": "error",
});
export const JS_PHOTOSHOP = r({ "photoshop-modal-scope": "error", "photoshop-handle-modal-errors": "warn" });
export const JS_STRICT = r({
  "manifest-permissions": "error",
  "api-min-version": "error",
  "no-unsupported-inline-style": "error",
  "no-unsupported-html": ["error", { aria: true }],
  "no-unsupported-web-api": "error",
  "no-unsupported-fs-method": "error",
  "no-node-builtin-modules": "error",
  "entrypoints-match-manifest": "error",
});
export const CSS_RULES = r({ "no-unsupported-css": "warn" });
export const CSS_STRICT = r({ "no-unsupported-css": ["error", { ignoreVendorPrefixed: false }] });
export const HTML_RULES = r({ "no-unsupported-html": "warn", "manifest-permissions": "error" });
export const MANIFEST_RULES = r({ "valid-manifest": "error" });

export type Host = "PS" | "ID" | "premierepro";

export interface BuildConfigOptions {
  /** Parsed manifest.json (recommended). */
  manifest?: UxpManifest;
  /** Raw manifest.json text, used when `manifest` is absent. */
  manifestText?: string;
  /** Force a host instead of reading manifest host.app. */
  host?: Host;
  /** Extra settings.uxp fields (hostMinVersion, uxpVersion). */
  settings?: Omit<UxpSettings, "manifest" | "manifestText">;
  /** "recommended" (default) or "strict". */
  level?: "recommended" | "strict";
  /** @eslint/css plugin object; enables CSS linting. */
  css?: unknown;
  /** @eslint/json plugin object; enables manifest.json linting. */
  json?: unknown;
  /** @html-eslint/parser module; enables HTML linting. */
  htmlParser?: unknown;
  /** typescript-eslint parser for .ts/.tsx (optional). */
  tsParser?: unknown;
  /** typescript-eslint plugin object, registered (no rules enabled) so `eslint-disable @typescript-eslint/...` comments resolve. */
  tsPlugin?: unknown;
  /** Glob prefix, e.g. "plugin/" when the UXP plugin lives in a subfolder. */
  base?: string;
  /** Globs excluded from every uxp-lint config object (not global ignores, so other configs are unaffected). */
  ignores?: string[];
}
