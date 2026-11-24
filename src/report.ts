/** Output formats for the uxp-lint CLI: stylish (human), github (Actions annotations), sarif (code scanning), json. No Node APIs. */
import type { ESLint, Linter } from "eslint";
import { rules } from "./rules/index.js";
import { PREFIX } from "./configs.js";

export interface RunInfo {
  cwd: string;
  version: string;
  projects: { manifest: string; root: string; host: string | null; minVersion: string | null; uxp: string | null; manifestError?: string }[];
  skipped: { path: string; reason: string }[];
  ms: number;
  fixed?: number;
}

type Result = ESLint.LintResult;
type Msg = Linter.LintMessage;

const ruleMeta = (id: string | null) => {
  if (!id?.startsWith(`${PREFIX}/`)) return null;
  const r = (rules as Record<string, { meta: { docs?: { description?: string; url?: string }; type?: string } }>)[id.slice(PREFIX.length + 1)];
  return r ? r.meta : null;
};
export const docsUrl = (id: string | null) => ruleMeta(id)?.docs?.url ?? null;
const rel = (cwd: string, p: string) => (p.startsWith(cwd + "/") ? p.slice(cwd.length + 1) : p.startsWith(cwd + "\\") ? p.slice(cwd.length + 1).split("\\").join("/") : p);

export function colors(enabled: boolean) {
  const c = (code: string) => (s: string) => (enabled ? `\u001b[${code}m${s}\u001b[0m` : s);
  return { red: c("31"), yellow: c("33"), green: c("32"), dim: c("2"), bold: c("1"), underline: c("4"), cyan: c("36") };
}

export function stylish(results: Result[], info: RunInfo, color: boolean): string {
  const k = colors(color);
  const out: string[] = [];
  let errors = 0, warnings = 0, fixable = 0, files = 0;
  const byRule = new Map<string, number>();
  for (const r of results) {
    const msgs = r.messages;
    if (!msgs.length) continue;
    files++;
    out.push("", k.underline(rel(info.cwd, r.filePath)));
    const pos = msgs.map((m) => `${m.line ?? 0}:${m.column ?? 0}`);
    const w = Math.max(...pos.map((p) => p.length));
    msgs.forEach((m, i) => {
      const sev = m.severity === 2 ? k.red("error  ") : k.yellow("warning");
      if (m.severity === 2) errors++; else warnings++;
      if (m.fix) fixable++;
      const id = m.ruleId ?? "parse-error";
      byRule.set(id, (byRule.get(id) ?? 0) + 1);
      out.push(`  ${k.dim(pos[i]!.padEnd(w))}  ${sev}  ${m.message}  ${k.dim(id)}`);
    });
  }
  const total = errors + warnings;
  out.push("");
  for (const p of info.projects) {
    if (p.manifestError) out.push(k.red(`✖ ${rel(info.cwd, p.manifest)} is not valid JSON (${p.manifestError}); manifest-aware rules were skipped for this plugin.`));
  }
  if (total === 0) out.push(k.green(`✔ No UXP problems found`) + k.dim(` (${summaryLine(info)})`));
  else {
    out.push(k.bold((errors ? k.red("✖ ") : k.yellow("⚠ ")) + `${total} problem${total === 1 ? "" : "s"} (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}) in ${files} file${files === 1 ? "" : "s"}`));
    if (fixable) out.push(k.dim(`  ${fixable} fixable with --fix`));
    out.push(k.dim(`  ${summaryLine(info)}`));
    out.push("", "Rule docs:");
    for (const [id, n] of [...byRule].sort((a, b) => b[1] - a[1])) out.push(`  ${String(n).padStart(4)} × ${id}${docsUrl(id) ? "  " + k.cyan(docsUrl(id)!) : ""}`);
  }
  if (info.fixed) out.push(k.green(`  Fixed ${info.fixed} problem${info.fixed === 1 ? "" : "s"}.`));
  if (info.skipped.length) {
    out.push("", k.dim(`Not linted (not UXP runtime code; --no-default-ignores to include):`));
    for (const s of info.skipped.slice(0, 12)) out.push(k.dim(`  ${rel(info.cwd, s.path)}  ${s.reason}`));
    if (info.skipped.length > 12) out.push(k.dim(`  … ${info.skipped.length - 12} more`));
  }
  return out.join("\n") + "\n";
}

function summaryLine(info: RunInfo): string {
  const ps = info.projects.map((p) => `${p.host ?? "?"} ${p.minVersion ?? "?"}${p.uxp ? ` → UXP ${p.uxp}` : ""}`);
  const uniq = [...new Set(ps)];
  const head = info.projects.length ? `${info.projects.length} plugin${info.projects.length === 1 ? "" : "s"} (${uniq.slice(0, 3).join(", ")}${uniq.length > 3 ? ", …" : ""})` : "no manifest.json found: version and permission checks off";
  return `${head} · ${(info.ms / 1000).toFixed(1)}s · uxp-lint ${info.version}`;
}

const escapeGh = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeGhProp = (s: string) => escapeGh(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

/** GitHub Actions workflow commands: inline annotations on the pull request diff. */
export function github(results: Result[], info: RunInfo): string {
  const out: string[] = [];
  for (const r of results) for (const m of r.messages) {
    const props = [`file=${escapeGhProp(rel(info.cwd, r.filePath))}`, `line=${m.line ?? 1}`, `col=${m.column ?? 1}`];
    if (m.endLine) props.push(`endLine=${m.endLine}`);
    if (m.endColumn && m.endLine === m.line) props.push(`endColumn=${m.endColumn}`);
    props.push(`title=${escapeGhProp(m.ruleId ?? "parse-error")}`);
    const url = docsUrl(m.ruleId);
    out.push(`::${m.severity === 2 ? "error" : "warning"} ${props.join(",")}::${escapeGh(m.message + (url ? ` (${url})` : ""))}`);
  }
  return out.join("\n") + (out.length ? "\n" : "");
}

/** SARIF 2.1.0 tuned for GitHub code scanning: rule metadata with help links, relative URIs, region end positions. */
export function sarif(results: Result[], info: RunInfo): string {
  const ids = new Set<string>();
  for (const r of results) for (const m of r.messages) ids.add(m.ruleId ?? "parse-error");
  const ruleList = [...ids].sort();
  const index = new Map(ruleList.map((id, i) => [id, i]));
  const sarifRules = ruleList.map((id) => {
    const meta = ruleMeta(id);
    const url = meta?.docs?.url;
    return {
      id,
      name: id.replace(`${PREFIX}/`, "").replace(/(^|-)(\w)/g, (_, _d, c: string) => c.toUpperCase()),
      shortDescription: { text: meta?.docs?.description ?? (id === "parse-error" ? "File could not be parsed" : id) },
      fullDescription: { text: meta?.docs?.description ?? id },
      ...(url ? { helpUri: url, help: { text: `See ${url}`, markdown: `[${id} documentation](${url})` } } : {}),
      defaultConfiguration: { level: "warning" },
      properties: { tags: ["uxp", "adobe", meta?.type ?? "problem"], precision: "high", "problem.severity": meta?.type === "problem" ? "error" : "warning" },
    };
  });
  const runResults = results.flatMap((r) =>
    r.messages.map((m: Msg) => ({
      ruleId: m.ruleId ?? "parse-error",
      ruleIndex: index.get(m.ruleId ?? "parse-error"),
      level: m.severity === 2 ? "error" : "warning",
      message: { text: m.message },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: encodeURI(rel(info.cwd, r.filePath)), uriBaseId: "%SRCROOT%" },
          region: { startLine: m.line ?? 1, startColumn: m.column ?? 1, ...(m.endLine ? { endLine: m.endLine } : {}), ...(m.endColumn ? { endColumn: m.endColumn } : {}) },
        },
      }],
    })),
  );
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "uxp-lint", semanticVersion: info.version, version: info.version, informationUri: "https://github.com/ThisIsMrAli/uxp-eslint", rules: sarifRules } },
      originalUriBaseIds: { "%SRCROOT%": { uri: "file://" + encodeURI(info.cwd.split("\\").join("/").replace(/\/?$/, "/")) } },
      invocations: [{ executionSuccessful: true }],
      results: runResults,
    }],
  }, null, 2) + "\n";
}

/** ESLint's JSON shape (array of LintResult) without the `source` text. */
export function json(results: Result[]): string {
  return JSON.stringify(results.map(({ source: _s, ...r }) => r)) + "\n";
}
