/** Node-only helpers: find and read manifest.json, load optional language plugins. Not for browsers. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
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

export interface NodeConfigOptions extends Omit<BuildConfigOptions, "manifest" | "manifestText" | "css" | "json" | "htmlParser" | "tsParser" | "base"> {
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
  const paths = opts.manifest ? (Array.isArray(opts.manifest) ? opts.manifest : [opts.manifest]).map((p) => resolve(cwd, p)) : findManifests(cwd);
  const [css, json, htmlParser, tseslint] = await Promise.all([
    optional<unknown>("@eslint/css"),
    optional<unknown>("@eslint/json"),
    optional<unknown>("@html-eslint/parser"),
    optional<{ parser?: unknown }>("typescript-eslint"),
  ]);
  const shared = { ...opts, css, json, htmlParser, tsParser: tseslint?.parser };
  if (paths.length === 0) return buildConfig(shared as BuildConfigOptions);
  return paths.flatMap((p) => {
    const rel = relative(cwd, dirname(p)).split("\\").join("/");
    const manifest = existsSync(p) ? readManifest(p) ?? undefined : undefined;
    return buildConfig({ ...(shared as BuildConfigOptions), manifest, base: rel ? `${rel}/` : "" });
  });
}
