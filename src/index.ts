import { rules } from "./rules/index.js";
import {
  PREFIX, JS_FILES, CSS_FILES, HTML_FILES, MANIFEST_FILES, JS_RECOMMENDED, JS_PHOTOSHOP, JS_STRICT, CSS_RULES, CSS_STRICT, HTML_RULES, MANIFEST_RULES,
  type BuildConfigOptions, type Host,
} from "./configs.js";
import type { UxpSettings } from "./util/settings.js";

export type { UxpManifest, UxpSettings } from "./util/settings.js";
export type { BuildConfigOptions, Host } from "./configs.js";
export { uxpForHost, compareVersions } from "./util/version.js";

const VERSION = "0.1.0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlatConfig = Record<string, any>;

const plugin = {
  meta: { name: "eslint-plugin-uxp-lint", version: VERSION, namespace: PREFIX },
  rules,
  configs: {} as Record<string, FlatConfig | FlatConfig[]>,
};

const hostRules = (host: Host | undefined, strict: boolean) => ({
  ...(strict ? JS_STRICT : JS_RECOMMENDED),
  ...(host === "PS" || host === undefined ? JS_PHOTOSHOP : {}),
});

/**
 * Build a complete flat config array. Browser-safe: pass the manifest and any language plugins yourself.
 * In Node, `eslint-plugin-uxp-lint/node` reads manifest.json and loads optional plugins for you.
 */
export function buildConfig(opts: BuildConfigOptions = {}): FlatConfig[] {
  const strict = opts.level === "strict";
  const settings: { uxp: UxpSettings } = { uxp: { ...(opts.settings ?? {}), ...(opts.manifest ? { manifest: opts.manifest } : {}), ...(opts.manifestText ? { manifestText: opts.manifestText } : {}), ...(opts.host ? { host: opts.host } : {}) } };
  const manifestHost = (() => {
    const h = opts.manifest?.host;
    const app = Array.isArray(h) ? h[0]?.app : h?.app;
    return (opts.host ?? app) as Host | undefined;
  })();
  const b = (globs: string[]) => globs.map((g) => `${opts.base ?? ""}${g}`);
  const out: FlatConfig[] = [
    {
      name: "uxp-lint/js",
      files: b(JS_FILES),
      plugins: { [PREFIX]: plugin, ...(opts.tsPlugin ? { "@typescript-eslint": opts.tsPlugin } : {}) },
      settings,
      languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, ...(opts.tsParser ? { parser: opts.tsParser } : {}) },
      rules: hostRules(manifestHost, strict),
    },
  ];
  if (opts.css) out.push({ name: "uxp-lint/css", files: b(CSS_FILES), plugins: { [PREFIX]: plugin, css: opts.css }, language: "css/css", settings, rules: strict ? CSS_STRICT : CSS_RULES });
  if (opts.htmlParser) out.push({ name: "uxp-lint/html", files: b(HTML_FILES), plugins: { [PREFIX]: plugin }, languageOptions: { parser: opts.htmlParser }, settings, rules: HTML_RULES });
  if (opts.json) out.push({ name: "uxp-lint/manifest", files: b(MANIFEST_FILES), plugins: { [PREFIX]: plugin, json: opts.json }, language: "json/json", rules: MANIFEST_RULES });
  return out;
}

// Static presets (no manifest; set settings.uxp yourself or use buildConfig / the /node helper).
const preset = (name: string, host: Host | undefined, strict: boolean): FlatConfig => ({
  name: `uxp-lint/${name}`,
  files: JS_FILES,
  plugins: { [PREFIX]: plugin },
  rules: hostRules(host, strict),
});
plugin.configs = {
  recommended: preset("recommended", undefined, false),
  strict: preset("strict", undefined, true),
  photoshop: preset("photoshop", "PS", false),
  indesign: preset("indesign", "ID", false),
  premierepro: preset("premierepro", "premierepro", false),
  "photoshop-strict": preset("photoshop-strict", "PS", true),
  "indesign-strict": preset("indesign-strict", "ID", true),
  "premierepro-strict": preset("premierepro-strict", "premierepro", true),
  css: { name: "uxp-lint/css", files: CSS_FILES, plugins: { [PREFIX]: plugin }, language: "css/css", rules: CSS_RULES },
  html: { name: "uxp-lint/html", files: HTML_FILES, plugins: { [PREFIX]: plugin }, rules: HTML_RULES },
  manifest: { name: "uxp-lint/manifest", files: MANIFEST_FILES, plugins: { [PREFIX]: plugin }, language: "json/json", rules: MANIFEST_RULES },
};

export { rules };
export default plugin;
