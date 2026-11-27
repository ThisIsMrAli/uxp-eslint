import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { Linter } from "eslint/universal";
import css from "@eslint/css";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { uxpConfig, findManifests } from "../src/node.js";
import plugin, { buildConfig, uxpForHost } from "../src/index.js";

const fx = (p: string) => path.resolve(__dirname, "fixtures", p);
async function lint(dir: string) {
  const eslint = new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: await uxpConfig({ cwd: dir }) });
  const results = await eslint.lintFiles(["."]);
  const byFile: Record<string, string[]> = {};
  for (const r of results) byFile[path.basename(r.filePath)] = r.messages.map((m) => (m.ruleId ?? "fatal") + ":" + (m.messageId ?? m.message));
  return byFile;
}

describe("fixture plugins (Node API, uxpConfig)", () => {
  it("finds manifests", () => {
    expect(findManifests(fx("."))).toHaveLength(3);
  });

  it("ps-bad reports every seeded problem", async () => {
    const r = await lint(fx("ps-bad"));
    const all = Object.values(r).flat();
    expect(all.filter((m) => m.startsWith("fatal"))).toEqual([]);
    const ids = new Set(all.map((m) => m.replace("uxp-lint/", "")));
    for (const want of [
      "manifest-permissions:domainNotAllowed", "manifest-permissions:folderNeedsEmptyExtension", "manifest-permissions:needsRequestFs", "manifest-permissions:missingClipboard",
      "manifest-permissions:missingEnableAlerts", "manifest-permissions:missingWebview",
      "api-min-version:hostTooOld", "api-min-version:uxpTooOld",
      "photoshop-modal-scope:batchPlayOutsideModal", "photoshop-modal-scope:setterOutsideModal", "photoshop-handle-modal-errors:unhandled",
      "no-unsupported-fs-method:unsupported", "no-node-builtin-modules:nodeOnly", "no-unsupported-web-api:event",
      "entrypoints-match-manifest:notInManifest", "entrypoints-match-manifest:missingHandler",
      "no-unsupported-css:unsupported", "no-unsupported-css:newer",
      "no-unsupported-html:element", "no-unsupported-html:labelFor", "no-unsupported-html:inputType", "no-unsupported-html:formMethod", "no-unsupported-html:inlineHandler",
      "valid-manifest:entrypointMain", "valid-manifest:blankExtension",
    ]) expect(ids, want).toContain(want);
  });

  it("ps-good is clean", async () => {
    const r = await lint(fx("ps-good"));
    expect(r).toEqual({ "index.html": [], "main.js": [], "manifest.json": [], "styles.css": [] });
  });

  it("InDesign plugin: Photoshop rules stay silent, UXP version still checked", async () => {
    const r = await lint(fx("id-plugin"));
    expect(r["index.js"]).toEqual(["uxp-lint/api-min-version:uxpTooOld"]);
  });

  it("autofixes the blank launchProcess extension", async () => {
    const dir = fs.mkdtempSync("/tmp/uxp-fix-");
    fs.copyFileSync(fx("ps-bad/manifest.json"), path.join(dir, "manifest.json"));
    const eslint = new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: await uxpConfig({ cwd: dir }), fix: true });
    await ESLint.outputFixes(await eslint.lintFiles(["manifest.json"]));
    expect(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).requiredPermissions.launchProcess.extensions).toEqual([""]);
  });
});

describe("browser Linter (eslint/universal), manifest passed in", () => {
  const manifest = JSON.parse(fs.readFileSync(fx("ps-bad/manifest.json"), "utf8"));
  it("lints JS and CSS with no Node APIs in rule code", () => {
    const linter = new Linter();
    const config = buildConfig({ manifest, css });
    const js = linter.verify(fs.readFileSync(fx("ps-bad/main.js"), "utf8"), config, "main.js");
    expect(js.length).toBeGreaterThan(10);
    expect(js.every((m) => m.ruleId?.startsWith("uxp-lint/"))).toBe(true);
    const c = linter.verify(".a { gap: 4px; }", config, "styles.css");
    expect(c.map((m) => m.messageId)).toEqual(["unsupported"]);
  });
  it.each([
    ["PS", "27.11.0", "9.4.1"],
    ["ID", "22.0.0", "9.4.0"],
    ["premierepro", "27.0.0", "9.4.0"],
    ["ame", "27.0.0", "9.4.0"],
    ["aftereffects", "27.1.0", "9.4.0"],
  ])("checks core UXP permissions on %s with its documented runtime", (app, minVersion, runtime) => {
    expect(uxpForHost(app, minVersion)).toBe(runtime);
    const config = buildConfig({ manifest: { manifestVersion: 5, host: { app, minVersion } } });
    const messages = new Linter().verify("fetch('https://example.com/data')", config, "index.js");
    expect(messages.map((m) => m.ruleId)).toEqual(["uxp-lint/manifest-permissions"]);
  });

  it("enables Photoshop modal checks on Photoshop files when Premiere is listed first", () => {
    const config = buildConfig({ manifest: { manifestVersion: 5, host: [{ app: "premierepro", minVersion: "26.3.0" }, { app: "PS", minVersion: "27.11.0" }] } });
    const code = 'const { action } = require("photoshop"); action.batchPlay([{ _obj: "make" }], {});';
    expect(new Linter().verify(code, config, "photoshop/main.js").map((m) => m.ruleId)).toContain("uxp-lint/photoshop-modal-scope");
    expect(new Linter().verify(code, config, "premiere/main.js").map((m) => m.ruleId)).not.toContain("uxp-lint/photoshop-modal-scope");
  });

  it("static presets work with settings", () => {
    const linter = new Linter();
    const msgs = linter.verify("fetch('https://x.com')", [{ ...(plugin.configs.photoshop as object), settings: { uxp: { manifest } } }], "a.js");
    expect(msgs.map((m) => m.messageId)).toEqual(["domainNotAllowed"]);
  });
  it("rule and data modules import no node: builtins", () => {
    const files = [...fs.readdirSync(path.resolve(__dirname, "../src/rules")).map((f) => `rules/${f}`), ...fs.readdirSync(path.resolve(__dirname, "../src/util")).map((f) => `util/${f}`), "index.ts", "configs.ts", "browser.ts"];
    for (const f of files) {
      const src = fs.readFileSync(path.resolve(__dirname, "../src", f), "utf8");
      expect(src, f).not.toMatch(/^import [^;]* from "(node:[a-z_]+|fs|path|url|module|child_process|typescript)";|\bprocess\.(env|cwd|argv)/m);
    }
  });
  it("single-file browser bundle (dist/uxp-lint.browser.mjs) works with Linter", async () => {
    const bundle = path.resolve(__dirname, "../dist/uxp-lint.browser.mjs");
    if (!fs.existsSync(bundle)) return; // built before tests by `npm test`
    const mod = await import(bundle);
    const config = mod.buildConfig({ manifest, css });
    const msgs = new Linter().verify("fetch('https://x.com'); document.body.style.gap = '1px';", config, "main.js");
    expect(msgs.map((m) => m.messageId).sort()).toEqual(["domainNotAllowed", "unsupported"]);
  });
});

describe("CLI", () => {
  it("prints SARIF and exits 1 on errors", () => {
    const cli = path.resolve(__dirname, "../dist/cli.js");
    if (!fs.existsSync(cli)) return; // built in CI before tests
    let out = "";
    let code = 0;
    try { out = execFileSync("node", [cli, fx("ps-bad"), "--format", "sarif"], { encoding: "utf8" }); } catch (e) { const err = e as { stdout: string; status: number }; out = err.stdout; code = err.status; }
    expect(code).toBe(1);
    const sarif = JSON.parse(out);
    expect(sarif.runs[0].results.length).toBeGreaterThan(20);
  });
});
