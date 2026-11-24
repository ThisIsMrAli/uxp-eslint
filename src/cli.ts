#!/usr/bin/env node
/** uxp-lint [dir] [--format json|stylish|sarif] [--strict] [--fix] — zero-config ESLint run with eslint-plugin-uxp-lint. */
import { ESLint } from "eslint";
import { resolve } from "node:path";
import { uxpConfig, findProjects } from "./node.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dir = resolve(args.find((a, i) => !a.startsWith("--") && !["--format"].includes(args[i - 1] ?? "")) ?? ".");
const format = val("--format") ?? "stylish";

const config = await uxpConfig({ cwd: dir, level: flag("--strict") ? "strict" : "recommended" });
const eslint = new ESLint({
  cwd: dir,
  overrideConfigFile: true,
  // Build tooling and servers run in Node, not UXP; WebView content runs in a browser engine, not UXP.
  overrideConfig: [{ linterOptions: { reportUnusedDisableDirectives: "off" } }, { ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.min.js", "**/vendor/**", "**/*.config.{js,cjs,mjs,ts,mts,cts}", "**/scripts/**", "**/server/**", "**/webview-ui/**", ...(val("--ignore")?.split(",") ?? [])] }, ...config],
  fix: flag("--fix"),
  errorOnUnmatchedPattern: false,
});
const roots = [...new Set(findProjects(dir).map((p) => p.root))];
const results = await eslint.lintFiles(roots.length ? roots : ["."]);
if (flag("--fix")) await ESLint.outputFixes(results);
if (format === "sarif") {
  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "uxp-lint", informationUri: "https://github.com/ThisIsMrAli/uxp-eslint" } },
      results: results.flatMap((r) => r.messages.map((m) => ({
        ruleId: m.ruleId ?? "parse",
        level: m.severity === 2 ? "error" : "warning",
        message: { text: m.message },
        locations: [{ physicalLocation: { artifactLocation: { uri: r.filePath.replace(dir + "/", "") }, region: { startLine: m.line, startColumn: m.column } } }],
      }))),
    }],
  };
  process.stdout.write(JSON.stringify(sarif, null, 2) + "\n");
} else {
  const f = await eslint.loadFormatter(format);
  const out = await f.format(results);
  if (out) process.stdout.write(out + "\n");
}
process.exitCode = results.some((r) => r.errorCount > 0) ? 1 : 0;
