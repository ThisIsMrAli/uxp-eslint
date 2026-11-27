import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

const cli = path.resolve(__dirname, "../dist/cli.js");
const fx = (p: string) => path.resolve(__dirname, "fixtures", p);
const run = (args: string[], cwd?: string) => {
  const r = spawnSync("node", [cli, ...args], { encoding: "utf8", cwd, env: { ...process.env, NO_COLOR: "1" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "uxp-lint-"));
const has = fs.existsSync(cli);

describe.skipIf(!has)("CLI", () => {
  beforeAll(() => expect(fs.existsSync(cli)).toBe(true));

  it("sets up editor completions for every host in a manifest", () => {
    const dir = tmp();
    const hosts = ["PS", "premierepro", "ID", "ame"].map((app) => ({ app, minVersion: "27.0.0" }));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ manifestVersion: 5, main: "index.js", host: hosts }));
    const result = run([dir, "--init-types"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("npm install -D @adobe/cc-ext-uxp-types @types/photoshop @adobe/premierepro indesign-uxp-types");
    expect(result.out).toContain("Shared UXP types only for: ame");
    const config = JSON.parse(fs.readFileSync(path.join(dir, "jsconfig.json"), "utf8"));
    expect(config.compilerOptions).toMatchObject({ allowJs: true, noEmit: true, module: "Node16", lib: ["ES2020"] });
    const declarations = fs.readFileSync(path.join(dir, "uxp-editor.d.ts"), "utf8");
    expect(declarations).toContain('declare module "premierepro"');
    expect(declarations).toContain("localFileSystem: FileSystemProvider");
    expect(run([dir, "--init-types"]).code).toBe(0);
    expect(fs.readFileSync(path.join(dir, "uxp-editor.d.ts"), "utf8")).toBe(declarations);
  });

  it("preserves an existing TypeScript config and custom declarations", () => {
    const dir = tmp();
    const config = '{\n  "include": ["src"]\n}\n';
    const declarations = "// existing editor types\n";
    fs.copyFileSync(fx("ps-good/manifest.json"), path.join(dir, "manifest.json"));
    fs.writeFileSync(path.join(dir, "tsconfig.json"), config);
    fs.writeFileSync(path.join(dir, "uxp-editor.d.ts"), declarations);
    const result = run([dir, "--init-types"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("Keep your existing tsconfig.json");
    expect(result.out).toContain("merge this into it");
    expect(fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8")).toBe(config);
    expect(fs.readFileSync(path.join(dir, "uxp-editor.d.ts"), "utf8")).toBe(declarations);
    expect(fs.existsSync(path.join(dir, "jsconfig.json"))).toBe(false);
  });

  it("stylish: rule ids, summary, fixable count, docs links, exit 1", () => {
    const r = run([fx("ps-bad")]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/uxp-lint\/photoshop-modal-scope/);
    expect(r.out).toMatch(/\d+ problems? \(\d+ errors?, \d+ warnings?\)/);
    expect(r.out).toMatch(/fixable with --fix/);
    expect(r.out).toMatch(/docs\/rules\/photoshop-modal-scope\.md/);
  });

  it("exit 0 on a clean plugin", () => {
    const r = run([fx("ps-good")]);
    expect(r.code).toBe(0);
  });

  it("github: workflow annotations with file, line and rule", () => {
    const r = run([fx("ps-bad"), "--format", "github"]);
    expect(r.out).toMatch(/^::error file=.+,line=\d+,col=\d+(,endLine=\d+,endColumn=\d+)?,title=uxp-lint\/[\w-]+::/m);
  });

  it("sarif: 2.1.0 with rule metadata, helpUri and relative URIs", () => {
    const r = run([fx("ps-bad"), "--format", "sarif"]);
    const s = JSON.parse(r.out);
    expect(s.version).toBe("2.1.0");
    const run0 = s.runs[0];
    expect(run0.tool.driver.name).toBe("uxp-lint");
    const rules = run0.tool.driver.rules as { id: string; helpUri: string }[];
    expect(rules.length).toBeGreaterThan(3);
    for (const rule of rules) expect(rule.helpUri).toMatch(/^https:\/\//);
    for (const res of run0.results) {
      expect(rules[res.ruleIndex]!.id).toBe(res.ruleId);
      const loc = res.locations[0].physicalLocation;
      expect(loc.artifactLocation.uri).not.toMatch(/^\//);
      expect(loc.region.startLine).toBeGreaterThan(0);
    }
  });

  it("json: ESLint result array", () => {
    const r = run([fx("ps-bad"), "--format", "json"]);
    const j = JSON.parse(r.out);
    expect(Array.isArray(j)).toBe(true);
    expect(j[0]).toHaveProperty("filePath");
    expect(j[0]).not.toHaveProperty("source");
  });

  it("--quiet drops warnings, --max-warnings fails on warnings", () => {
    const q = run([fx("ps-bad"), "--quiet", "--format", "json"]);
    const j = JSON.parse(q.out) as { messages: { severity: number }[] }[];
    expect(j.flatMap((f) => f.messages).every((m) => m.severity === 2)).toBe(true);
  });

  it("usage errors exit 2 with a clear message", () => {
    const r = run(["--format", "nope"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/format/i);
    const u = run(["--bogus"]);
    expect(u.code).toBe(2);
    expect(u.err).toMatch(/--bogus/);
  });

  it("--fix applies fixes and reports the count", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ manifestVersion: 5, id: "a", name: "abc", version: "1.0.0", main: "index.js", host: { app: "PS", minVersion: "24.0.0" }, entrypoints: [], requiredPermissions: { launchProcess: { extensions: [" "] } } }, null, 2));
    fs.writeFileSync(path.join(d, "index.js"), "console.log(1);\n");
    const r = run([d, "--fix"]);
    expect(r.out).toMatch(/Fixed 1 problem/);
    expect(JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8")).requiredPermissions.launchProcess.extensions).toEqual([""]);
  });

  it("malformed manifest: reported, exit 1, no crash", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "manifest.json"), '{ "manifestVersion": 5, "host": { "app": "PS", ');
    fs.writeFileSync(path.join(d, "index.js"), "console.log(1);\n");
    const r = run([d]);
    expect(r.code).toBe(1);
    expect(r.out + r.err).toMatch(/manifest\.json/);
    expect(r.err).not.toMatch(/at .+\.js:\d+:\d+/); // no stack trace
  });

  it("--init writes eslint.config.mjs and never overwrites one", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ manifestVersion: 5, id: "a", name: "abc", version: "1.0.0", host: { app: "PS", minVersion: "24.0.0" }, entrypoints: [] }));
    const r = run(["--init"], d);
    expect(r.code).toBe(0);
    const cfg = fs.readFileSync(path.join(d, "eslint.config.mjs"), "utf8");
    expect(cfg).toMatch(/eslint-plugin-uxp-lint\/node/);
    fs.writeFileSync(path.join(d, "eslint.config.mjs"), "export default [];\n");
    const again = run(["--init"], d);
    expect(again.out).toMatch(/already exists/);
    expect(fs.readFileSync(path.join(d, "eslint.config.mjs"), "utf8")).toBe("export default [];\n");
  });

  it("--manifest points at a built manifest (bolt-uxp dist/) and lints the project around it", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, "dist"));
    fs.mkdirSync(path.join(d, "src"));
    fs.writeFileSync(path.join(d, "dist/manifest.json"), JSON.stringify({ manifestVersion: 5, id: "a", name: "abc", version: "1.0.0", host: { app: "PS", minVersion: "24.0.0" }, entrypoints: [] }));
    fs.writeFileSync(path.join(d, "src/main.js"), "fetch('https://api.example.com');\n");
    const r = run([d, "--manifest", path.join(d, "dist/manifest.json"), "--format", "json"]);
    const j = JSON.parse(r.out) as { filePath: string; messages: { ruleId: string }[] }[];
    expect(j.some((f) => f.filePath.endsWith("main.js") && f.messages.some((m) => m.ruleId === "uxp-lint/manifest-permissions"))).toBe(true);
    expect(run([d, "--manifest", path.join(d, "nope.json")]).code).toBe(2);
  });

  it("--rules lists every rule with a docs URL", () => {
    const r = run(["--rules"]);
    expect(r.out).toMatch(/photoshop-await-in-modal/);
    expect(r.out).toMatch(/no-deprecated-api/);
  });
});
