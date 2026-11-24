#!/usr/bin/env node
/** uxp-lint: zero-config ESLint run with eslint-plugin-uxp-lint. `uxp-lint --help` for usage. */
import { ESLint } from "eslint";
import { resolve, join, relative, sep } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { uxpConfig, findProjects, classifyFolders, DEFAULT_IGNORES, parseManifest } from "./node.js";
import { uxpForHost } from "./util/version.js";
import { stylish, github, sarif, json, type RunInfo } from "./report.js";
import { rules } from "./rules/index.js";
import { PREFIX } from "./configs.js";
import { VERSION } from "./version.js";

const HELP = `uxp-lint ${VERSION}: lint Adobe UXP plugins (Photoshop, InDesign, Premiere Pro)

Usage: uxp-lint [dir] [options]

  --format <name>       stylish (default) | github | sarif | json
  -o, --output <file>   write the report to a file instead of stdout
  --strict              strict preset (warnings become errors, aria/vendor checks on)
  --fix                 apply safe autofixes and report how many were fixed
  --quiet               errors only
  --max-warnings <n>    exit 1 when warnings exceed n
  --ignore <globs>      extra comma-separated ignore globs
  --no-default-ignores  also lint tests, tooling, WebView/CEP folders and generated files
  --init                write an eslint.config.mjs that uses eslint-plugin-uxp-lint
  --rules               list the rules with docs links
  --no-color            plain output (also NO_COLOR=1)
  -v, --version         print the version
  -h, --help            this help

Exit codes: 0 no errors · 1 lint errors (or --max-warnings exceeded) · 2 usage or configuration error.
Docs: https://github.com/ThisIsMrAli/uxp-eslint#readme
`;

const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--format", "-f", "--output", "-o", "--ignore", "--max-warnings"]);
const flag = (...n: string[]) => n.some((x) => args.includes(x));
const val = (...n: string[]) => { for (const x of n) { const i = args.indexOf(x); if (i >= 0) return args[i + 1]; } return undefined; };
const positional = args.filter((a, i) => !a.startsWith("-") && !VALUE_FLAGS.has(args[i - 1] ?? ""));
const KNOWN = new Set([...VALUE_FLAGS, "--strict", "--fix", "--quiet", "--no-default-ignores", "--init", "--rules", "--no-color", "--color", "-v", "--version", "-h", "--help"]);

function fail(msg: string): never {
  process.stderr.write(`uxp-lint: ${msg}\n`);
  process.exit(2);
}

async function main() {
  if (flag("-h", "--help")) { process.stdout.write(HELP); return 0; }
  if (flag("-v", "--version")) { process.stdout.write(VERSION + "\n"); return 0; }
  const unknown = args.filter((a, i) => a.startsWith("-") && !KNOWN.has(a) && !VALUE_FLAGS.has(args[i - 1] ?? ""));
  if (unknown.length) fail(`unknown option ${unknown[0]} (see --help)`);
  for (const f of VALUE_FLAGS) if (args.includes(f) && (val(f) === undefined || val(f)!.startsWith("-"))) fail(`${f} needs a value`);
  if (positional.length > 1) fail("pass one directory");
  const dir = resolve(positional[0] ?? ".");
  if (!existsSync(dir)) fail(`no such directory: ${dir}`);
  const color = !flag("--no-color") && !process.env.NO_COLOR && (flag("--color") || (!!process.stdout.isTTY && !val("-o", "--output")));

  if (flag("--rules")) {
    for (const [name, r] of Object.entries(rules as Record<string, { meta: { docs?: { description?: string; url?: string }; fixable?: string } }>)) {
      process.stdout.write(`${PREFIX}/${name}${r.meta.fixable ? " (fixable)" : ""}\n  ${r.meta.docs?.description ?? ""}\n  ${r.meta.docs?.url ?? ""}\n`);
    }
    return 0;
  }
  if (flag("--init")) return init(dir);

  const format = val("--format", "-f") ?? "stylish";
  if (!["stylish", "github", "sarif", "json"].includes(format)) fail(`unknown format "${format}" (stylish, github, sarif, json)`);
  const maxWarnings = val("--max-warnings") !== undefined ? Number(val("--max-warnings")) : Infinity;
  if (Number.isNaN(maxWarnings)) fail("--max-warnings needs a number");
  const defaults = !flag("--no-default-ignores");
  const extraIgnores = val("--ignore")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const started = Date.now();
  const projects = findProjects(dir);
  const skipped = defaults ? dedupe(projects.length ? projects.flatMap((p) => p.skipped) : classifyFolders(dir, dir)) : [];
  const config = await uxpConfig({ cwd: dir, level: flag("--strict") ? "strict" : "recommended", defaultIgnores: defaults, ignores: extraIgnores, ...(defaults ? {} : { settings: { lintGenerated: true, lintNodeScripts: true } }) });
  const globalIgnores = [...(defaults ? DEFAULT_IGNORES.filter((g) => !g.startsWith("!")) : ["**/node_modules/**"]), ...extraIgnores, ...skipped.map((s) => { const r = relative(dir, s.path).split(sep).join("/"); return /\.[a-z]+$/i.test(r) ? r : `${r}/**`; })];
  const make = (fix: boolean) => new ESLint({
    cwd: dir,
    overrideConfigFile: true,
    overrideConfig: [{ linterOptions: { reportUnusedDisableDirectives: "off" } }, { ignores: globalIgnores }, ...config],
    fix,
    errorOnUnmatchedPattern: false,
  });
  const roots = [...new Set(projects.map((p) => p.root))].map((r) => relative(dir, r) || ".");
  const targets = roots.length ? roots : ["."];
  let eslint = make(false);
  let results = await eslint.lintFiles(targets);
  let fixed = 0;
  if (flag("--fix")) {
    const before = results.reduce((n, r) => n + r.fixableErrorCount + r.fixableWarningCount, 0);
    eslint = make(true);
    results = await eslint.lintFiles(targets);
    await ESLint.outputFixes(results);
    const after = results.reduce((n, r) => n + r.fixableErrorCount + r.fixableWarningCount, 0);
    fixed = Math.max(0, before - after);
  }
  results = results.map(onlyUxp);
  if (flag("--quiet")) results = ESLint.getErrorResults(results);

  const info: RunInfo = {
    cwd: dir,
    version: VERSION,
    projects: projects.map((p) => {
      const m = existsSync(p.manifest) ? parseManifest(readFileSync(p.manifest, "utf8")).manifest : null;
      const h = m?.host ? (Array.isArray(m.host) ? m.host[0] : m.host) : undefined;
      const host = h?.app ?? null;
      const minVersion = typeof h?.minVersion === "string" ? h.minVersion : null;
      return { manifest: p.manifest, root: p.root, host, minVersion, uxp: host && minVersion ? uxpForHost(host, minVersion) : null, ...(p.manifestError ? { manifestError: p.manifestError } : {}) };
    }),
    skipped,
    ms: Date.now() - started,
    fixed,
  };
  const report = format === "sarif" ? sarif(results, info) : format === "github" ? github(results, info) : format === "json" ? json(results) : stylish(results, info, color);
  const out = val("-o", "--output");
  if (out) writeFileSync(resolve(out), report);
  else process.stdout.write(report);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  const badManifest = info.projects.some((p) => p.manifestError);
  return errors > 0 || warnings > maxWarnings || badManifest ? 1 : 0;
}

/**
 * The CLI runs only uxp-lint rules, so `eslint-disable` comments that name rules from the project's own config
 * (e.g. a rule removed from typescript-eslint) would surface as "Definition for rule ... was not found". Drop those;
 * keep uxp-lint messages and parse errors.
 */
function onlyUxp(r: ESLint.LintResult): ESLint.LintResult {
  const messages = r.messages.filter((m) => m.ruleId === null || m.ruleId.startsWith(`${PREFIX}/`));
  if (messages.length === r.messages.length) return r;
  const count = (sev: number, fix?: boolean) => messages.filter((m) => m.severity === sev && (!fix || m.fix)).length;
  return { ...r, messages, errorCount: count(2), warningCount: count(1), fixableErrorCount: count(2, true), fixableWarningCount: count(1, true), fatalErrorCount: messages.filter((m) => m.fatal).length };
}

function dedupe<T extends { path: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.path) ? false : (seen.add(x.path), true)));
}

function init(dir: string): number {
  const target = join(dir, "eslint.config.mjs");
  const existing = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"].find((f) => existsSync(join(dir, f)));
  const projects = findProjects(dir);
  const pkgPath = join(dir, "package.json");
  const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, Record<string, string> | undefined>) : {};
  const has = (n: string) => !!(pkg.dependencies?.[n] || pkg.devDependencies?.[n]);
  const usesTs = existsSync(join(dir, "tsconfig.json"));
  const want = ["eslint", "eslint-plugin-uxp-lint", "@eslint/css", "@eslint/json", "@html-eslint/parser", ...(usesTs ? ["typescript-eslint"] : [])];
  const missing = want.filter((n) => !has(n));
  const body = `// ESLint flat config generated by \`uxp-lint --init\`.
// uxpConfig() finds every UXP manifest.json, reads host/minVersion/permissions from it,
// and lints JS/TS/JSX, CSS, HTML and manifest.json with the matching rules.
import { uxpConfig } from "eslint-plugin-uxp-lint/node";

export default [
  ...(await uxpConfig({
    // level: "strict",
    // manifest: "${projects[0] ? relative(dir, projects[0].manifest).split(sep).join("/") : "plugin/manifest.json"}",
  })),
];
`;
  if (existing) {
    process.stdout.write(`${existing} already exists. Add this to it:\n\n  import { uxpConfig } from "eslint-plugin-uxp-lint/node";\n  export default [ /* your configs */, ...(await uxpConfig()) ];\n\n`);
  } else {
    writeFileSync(target, body);
    process.stdout.write(`Wrote ${relative(process.cwd(), target) || target}\n`);
  }
  process.stdout.write(projects.length ? `Found ${projects.length} UXP manifest${projects.length === 1 ? "" : "s"}: ${projects.map((p) => relative(dir, p.manifest)).join(", ")}\n` : "No UXP manifest.json found yet: version and permission rules stay off until one exists.\n");
  if (missing.length) process.stdout.write(`Install: npm i -D ${missing.join(" ")}\n`);
  process.stdout.write(`Then run: npx eslint .\n`);
  return 0;
}

main().then((code) => { process.exitCode = code; }, (e: unknown) => {
  const err = e as Error;
  process.stderr.write(`uxp-lint: ${err?.message ?? String(e)}\n${process.env.DEBUG ? `${err?.stack ?? ""}\n` : "(set DEBUG=1 for a stack trace)\n"}`);
  process.exitCode = 2;
});
