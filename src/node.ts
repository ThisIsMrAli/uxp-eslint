/** Node-only helpers: find and read manifest.json, load optional language plugins. Not for browsers. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, relative, dirname, basename } from "node:path";
import { buildConfig } from "./index.js";
import type { BuildConfigOptions } from "./configs.js";
import type { UxpManifest } from "./util/settings.js";

export * from "./index.js";
export { default } from "./index.js";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

/** Locate UXP manifest.json files (with manifestVersion and host) under `cwd`, at most `depth` levels deep. */
export function findManifests(cwd = process.cwd(), depth = 4): string[] {
  const found: string[] = [];
  const walk = (dir: string, d: number) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (d < depth && !SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), d + 1); }
      else if (e.name === "manifest.json") {
        const p = join(dir, e.name);
        const m = readManifest(p);
        if (m && (m.host || m.manifestVersion) && (m.entrypoints || m.main)) found.push(p);
      }
    }
  };
  walk(resolve(cwd), 0);
  return found;
}

const PLUGIN_SUBDIRS = new Set(["plugin", "public", "static", "assets"]);

/** UXP projects under cwd: the manifest plus the folder whose sources should be linted. A manifest kept in plugin/ or public/ next to a package.json lints the parent project (src/ etc.). */
export function findProjects(cwd = process.cwd(), depth = 4): { manifest: string; root: string }[] {
  const top = resolve(cwd);
  return findManifests(top, depth).map((m) => {
    let root = dirname(m);
    const parent = dirname(root);
    if (PLUGIN_SUBDIRS.has(basename(root)) && parent.startsWith(top) && existsSync(join(parent, "package.json"))) root = parent;
    return { manifest: m, root };
  });
}

export function readManifest(path: string): UxpManifest | null {
  try { return JSON.parse(readFileSync(path, "utf8")) as UxpManifest; } catch { return null; }
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
}

/**
 * Flat config for every UXP plugin under `cwd`. Each plugin folder gets its own manifest-aware block.
 * Optional peers (@eslint/css, @eslint/json, @html-eslint/parser, typescript-eslint) are used when installed.
 */
export async function uxpConfig(opts: NodeConfigOptions = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const projects = opts.manifest
    ? (Array.isArray(opts.manifest) ? opts.manifest : [opts.manifest]).map((p) => ({ manifest: resolve(cwd, p), root: dirname(resolve(cwd, p)) }))
    : findProjects(cwd);
  const [css, json, htmlParser, tseslint] = await Promise.all([
    optional<unknown>("@eslint/css"),
    optional<unknown>("@eslint/json"),
    optional<unknown>("@html-eslint/parser"),
    optional<{ parser?: unknown; plugin?: unknown }>("typescript-eslint"),
  ]);
  const shared = { ...opts, css, json, htmlParser, tsParser: tseslint?.parser, tsPlugin: tseslint?.plugin };
  if (projects.length === 0) return buildConfig(shared as BuildConfigOptions);
  return projects.flatMap((p) => {
    const rel = relative(cwd, p.root).split("\\").join("/");
    const manifest = existsSync(p.manifest) ? readManifest(p.manifest) ?? undefined : undefined;
    return buildConfig({ ...(shared as BuildConfigOptions), manifest, base: rel ? `${rel}/` : "" });
  });
}
