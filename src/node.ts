/** Node-only helpers: find and read manifest.json, classify project folders, load optional language plugins. Not for browsers. */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname, basename, sep } from "node:path";
import { buildConfig } from "./index.js";
import type { BuildConfigOptions } from "./configs.js";
import type { UxpManifest } from "./util/settings.js";

export * from "./index.js";
export { default } from "./index.js";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".turbo", ".cache", "vendor", "target"]);

/**
 * Paths that are not UXP runtime code in typical plugin repos: tests, build tooling, servers, docs, WebView UIs.
 * Applied by uxpConfig() to the uxp-lint config objects only (never as global ignores) and by the CLI.
 */
export const DEFAULT_IGNORES = [
  "**/node_modules/**", "**/dist/**", "**/build/**", "**/out/**", "**/coverage/**", "**/vendor/**",
  "**/*.min.js", "**/*.min.css", "**/*.bundle.js", "**/*.map",
  "**/*.config.{js,cjs,mjs,ts,mts,cts}", "**/{gulpfile,Gruntfile,Jakefile,build,webpack.*,rollup.*,vite.*,esbuild.*}.{js,cjs,mjs,ts}",
  "**/{test,tests,__tests__,__mocks__,spec,e2e,fixtures,test-utils}/**", "**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
  "**/{scripts,tools,bin,server,docs,.github}/**",
  "**/{webview-ui,webview}/**",
  // repo-root tooling scripts
  "{docs,release,publish,generate,gen,prepare,postinstall,deploy,bump,changelog,pack,package,zip,watch,serve,dev}.{js,mjs,cjs,ts,mts,cts}",
  // UXP scripts are runtime code even inside a scripts/ folder
  "!**/*.{psjs,idjs}",
];

export interface ManifestInfo {
  path: string;
  manifest: UxpManifest | null;
  /** JSON parse error when the file looks like a UXP manifest but is not valid JSON. */
  error?: string;
}

/** Parse manifest.json text (tolerates a UTF-8 BOM). */
export function parseManifest(text: string): { manifest: UxpManifest | null; error?: string } {
  try {
    const m = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
    if (!m || typeof m !== "object" || Array.isArray(m)) return { manifest: null, error: "manifest.json must contain a JSON object" };
    return { manifest: m as UxpManifest };
  } catch (e) {
    return { manifest: null, error: (e as Error).message };
  }
}

export function readManifest(path: string): UxpManifest | null {
  try { return parseManifest(readFileSync(path, "utf8")).manifest; } catch { return null; }
}

const looksLikeUxp = (m: UxpManifest) => !!(m.host || m.manifestVersion) && !!(m.entrypoints || m.entryPoints || m.main);

/** Every UXP manifest.json under `cwd` (depth-limited), including ones that fail to parse. */
export function scanManifests(cwd = process.cwd(), depth = 5): ManifestInfo[] {
  const found: ManifestInfo[] = [];
  const walk = (dir: string, d: number) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (d < depth && !SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), d + 1); continue; }
      if (e.name !== "manifest.json") continue;
      const p = join(dir, e.name);
      let text = "";
      try { text = readFileSync(p, "utf8"); } catch { continue; }
      const { manifest, error } = parseManifest(text);
      if (manifest && looksLikeUxp(manifest)) found.push({ path: p, manifest });
      else if (!manifest && /"(manifestVersion|entrypoints|entryPoints)"\s*:/.test(text)) found.push({ path: p, manifest: null, error });
    }
  };
  walk(resolve(cwd), 0);
  return found;
}

/** Locate UXP manifest.json files (with manifestVersion and host) under `cwd`. */
export function findManifests(cwd = process.cwd(), depth = 5): string[] {
  return scanManifests(cwd, depth).filter((m) => m.manifest).map((m) => m.path);
}

const PLUGIN_SUBDIRS = new Set(["plugin", "public", "static", "assets", "uxp", "src"]);

export interface UxpProject {
  manifest: string;
  /** Folder whose sources are linted with this manifest. */
  root: string;
  /** Absolute folders/files inside root that are not UXP runtime code, with the reason. */
  skipped: { path: string; reason: string }[];
  /** React major version from the nearest package.json, if any. */
  reactVersion?: number;
  /** Parse error if manifest.json is not valid JSON. */
  manifestError?: string;
  /** Unsupported HTML elements the project's CSS already styles (Adobe's documented workaround). */
  styledElements?: string[];
}

/** UXP projects under cwd: the manifest plus the folder whose sources should be linted. A manifest kept in plugin/ or public/ next to a package.json lints the parent project (src/ etc.). */
export function findProjects(cwd = process.cwd(), depth = 5): UxpProject[] {
  const top = resolve(cwd);
  const manifests = scanManifests(top, depth);
  const manifestDirs = manifests.map((m) => dirname(m.path));
  return manifests.map((m) => {
    let root = dirname(m.path);
    const parent = dirname(root);
    if (PLUGIN_SUBDIRS.has(basename(root)) && (parent + sep).startsWith(top + sep) && existsSync(join(parent, "package.json"))) root = parent;
    const pkgDir = [root, dirname(m.path)].find((d) => existsSync(join(d, "package.json")));
    return {
      manifest: m.path,
      root,
      skipped: classifyFolders(root, dirname(m.path), manifestDirs),
      reactVersion: pkgDir ? reactMajor(join(pkgDir, "package.json")) : undefined,
      styledElements: styledElements(root),
      ...(m.error ? { manifestError: m.error } : {}),
    };
  });
}

function readJson(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>; } catch { return null; }
}

function reactMajor(pkgPath: string): number | undefined {
  const pkg = readJson(pkgPath);
  if (!pkg) return undefined;
  const deps = { ...(pkg.devDependencies as object), ...(pkg.peerDependencies as object), ...(pkg.dependencies as object) } as Record<string, string>;
  const v = deps["react"] ?? deps["react-dom"];
  const m = typeof v === "string" ? v.match(/(\d+)/) : null;
  return m ? Number(m[1]) : undefined;
}

const NODE_TOOL_DEPS = /^(vite|rollup|webpack|esbuild|express|koa|fastify|electron|commander|yargs|@vitejs\/|@rollup\/|puppeteer|playwright)/;
const EXTENDSCRIPT = /^\s*(#target|#targetengine|#include|#script|\/\/\s*@(target|include))\b/m;
const WEBVIEW_SRC = /<webview\b[^>]*?\ssrc\s*=\s*\{?\s*["'`]([^"'`]+)["'`]/gi;

/**
 * Folders and files inside a UXP project that do not run in UXP:
 * WebView pages (`<webview src="plugin:/web/index.html">`), CEP extensions (CSXS/manifest.xml),
 * nested Node packages (bin, engines.node or build-tool dependencies) and ExtendScript .jsx files.
 */
export function classifyFolders(root: string, manifestDir: string, manifestDirs: string[] = []): { path: string; reason: string }[] {
  const out: { path: string; reason: string }[] = [];
  const seen = new Set<string>();
  const add = (path: string, reason: string) => { if (!seen.has(path) && path !== root && path !== manifestDir) { seen.add(path); out.push({ path, reason }); } };
  let budget = 4000; // files examined
  const walk = (dir: string, d: number) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const names = new Set(entries.map((e) => e.name));
    if (dir !== root) {
      if (names.has("CSXS") && existsSync(join(dir, "CSXS", "manifest.xml"))) { add(dir, "CEP extension (CSXS/manifest.xml)"); return; }
      if (names.has("package.json") && !manifestDirs.some((m) => m === dir || m.startsWith(dir + sep))) {
        const pkg = readJson(join(dir, "package.json"));
        const deps = Object.keys({ ...(pkg?.dependencies as object), ...(pkg?.peerDependencies as object), ...(pkg?.devDependencies as object) });
        if (pkg && (pkg.bin || (pkg.engines as Record<string, unknown> | undefined)?.node || deps.some((x) => NODE_TOOL_DEPS.test(x)))) { add(dir, "Node package (build tool / CLI / server)"); return; }
      }
    }
    for (const e of entries) {
      if (budget <= 0) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (d < 6 && !SKIP.has(e.name) && !e.name.startsWith(".")) walk(p, d + 1); continue; }
      if (!/\.(html?|jsx|tsx|jsxinc)$/i.test(e.name)) continue;
      budget--;
      let text = "";
      try { if (statSync(p).size > 2_000_000) continue; text = readFileSync(p, "utf8"); } catch { continue; }
      if (/\.(jsx|jsxinc)$/i.test(e.name) && EXTENDSCRIPT.test(text.slice(0, 2000))) { add(p, "ExtendScript (#target/#include)"); continue; }
      for (const m of text.matchAll(WEBVIEW_SRC)) {
        const src = m[1]!;
        if (/^(https?|data|blob):/i.test(src) || src.includes("${")) continue;
        const rel = src.replace(/^plugin:\/*/i, "").replace(/[?#].*$/, "");
        const target = resolve(/^plugin:/i.test(src) ? manifestDir : dirname(p), rel);
        const webDir = dirname(target);
        if ((webDir + sep).startsWith(root + sep) && webDir !== manifestDir && webDir !== root) add(webDir, `WebView content (${src})`);
      }
    }
  };
  walk(root, 0);
  return out;
}

const WORKAROUND_ELEMENTS = ["ul", "ol", "li", "i", "em", "strong", "q", "blockquote", "pre", "code", "title"];

/**
 * Elements from Adobe's "Unsupported Elements" page that the project's stylesheets target with a type selector.
 * Adobe documents styling them (they render as <div>) as the workaround, so no-unsupported-html skips them.
 */
export function styledElements(root: string): string[] {
  const found = new Set<string>();
  let budget = 300;
  const walk = (dir: string, d: number) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (budget <= 0) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (d < 6 && !SKIP.has(e.name) && !e.name.startsWith(".")) walk(p, d + 1); continue; }
      if (!/\.(css|scss|less|html?)$/i.test(e.name)) continue;
      budget--;
      let text = "";
      try { if (statSync(p).size > 1_000_000) continue; text = readFileSync(p, "utf8"); } catch { continue; }
      for (const el of cssTypeSelectors(text)) found.add(el);
    }
  };
  walk(root, 0);
  return WORKAROUND_ELEMENTS.filter((e) => found.has(e));
}

/** Type selectors used in a stylesheet (or the <style> blocks of an HTML file). Declaration blocks are stripped first. */
export function cssTypeSelectors(text: string): Set<string> {
  let css = text;
  if (/<style\b/i.test(css) || /<html\b/i.test(css)) css = [...css.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const selectors: string[] = [];
  let prev = "";
  while (prev !== css) {
    prev = css;
    css = css.replace(/([^{};]*)\{[^{}]*\}/g, (_m, sel: string) => { selectors.push(sel); return " ; "; });
  }
  const out = new Set<string>();
  for (const sel of selectors.join(",").split(",")) {
    for (const m of sel.matchAll(/(?:^|[\s>+~(])([a-z][a-z0-9-]*)(?=$|[\s.:#[>+~)])/gi)) out.add(m[1]!.toLowerCase());
  }
  return out;
}

async function optional<T>(name: string): Promise<T | undefined> {
  try {
    const mod = (await import(name)) as { default?: T };
    return (mod.default ?? mod) as T;
  } catch {
    return undefined;
  }
}

export interface NodeConfigOptions extends Omit<BuildConfigOptions, "manifest" | "manifestText" | "css" | "json" | "htmlParser" | "tsParser" | "tsPlugin" | "base"> {
  /** Project root to search for manifest.json (default: process.cwd()). */
  cwd?: string;
  /** Explicit manifest path(s). Default: every UXP manifest.json found under cwd. */
  manifest?: string | string[];
  /** Skip tests, build tooling, WebView and CEP folders (DEFAULT_IGNORES + detected folders). Default true. */
  defaultIgnores?: boolean;
}

/** Glob for an absolute path relative to cwd. */
const globFor = (cwd: string, abs: string, isDir: boolean) => {
  const rel = relative(cwd, abs).split(sep).join("/");
  return isDir ? `${rel}/**` : rel;
};

/**
 * Flat config for every UXP plugin under `cwd`. Each plugin folder gets its own manifest-aware block.
 * Optional peers (@eslint/css, @eslint/json, @html-eslint/parser, typescript-eslint) are used when installed.
 */
export async function uxpConfig(opts: NodeConfigOptions = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const projects: UxpProject[] = opts.manifest
    ? (Array.isArray(opts.manifest) ? opts.manifest : [opts.manifest]).map((p) => { const m = resolve(cwd, p); return { manifest: m, root: dirname(m), skipped: classifyFolders(dirname(m), dirname(m)) }; })
    : findProjects(cwd);
  const [css, json, htmlParser, tseslint] = await Promise.all([
    optional<unknown>("@eslint/css"),
    optional<unknown>("@eslint/json"),
    optional<unknown>("@html-eslint/parser"),
    optional<{ parser?: unknown; plugin?: unknown }>("typescript-eslint"),
  ]);
  const useDefaults = opts.defaultIgnores !== false;
  const { defaultIgnores: _d, cwd: _c, manifest: _m, ...rest } = opts;
  const shared = { ...rest, css, json, htmlParser, tsParser: tseslint?.parser, tsPlugin: tseslint?.plugin } as BuildConfigOptions;
  if (projects.length === 0) return buildConfig({ ...shared, ignores: [...(useDefaults ? DEFAULT_IGNORES : []), ...(opts.ignores ?? [])] });
  return projects.flatMap((p) => {
    const rel = relative(cwd, p.root).split(sep).join("/");
    const { manifest } = existsSync(p.manifest) ? parseManifest(readFileSync(p.manifest, "utf8")) : { manifest: null };
    const detected = useDefaults ? p.skipped.map((s) => globFor(cwd, s.path, !/\.[a-z]+$/i.test(s.path))) : [];
    return buildConfig({
      ...shared,
      manifest: manifest ?? undefined,
      ...(manifest ? {} : { manifestText: existsSync(p.manifest) ? readFileSync(p.manifest, "utf8") : undefined }),
      settings: { ...(p.reactVersion ? { reactVersion: p.reactVersion } : {}), ...(p.styledElements?.length ? { styledElements: p.styledElements } : {}), ...(opts.settings ?? {}) },
      base: rel ? `${rel}/` : "",
      ignores: [...(useDefaults ? DEFAULT_IGNORES : []), ...detected, ...(opts.ignores ?? [])],
    });
  });
}
