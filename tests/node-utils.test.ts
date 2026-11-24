import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifySource } from "../src/util/file-kind.js";
import { parseManifest, classifyFolders, cssTypeSelectors, findProjects } from "../src/node.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "uxp-lint-u-"));
const write = (root: string, rel: string, text: string) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

describe("classifySource", () => {
  it("source by default, manifest always source", () => {
    expect(classifySource("export const a = 1;\n", "src/a.js")).toBe("source");
    expect(classifySource("x".repeat(5000), "manifest.json")).toBe("source");
  });
  it("generated: banners, .min. files, minified lines", () => {
    expect(classifySource("// @generated\nx()", "a.js")).toBe("generated");
    expect(classifySource("a()", "lib/x.min.js")).toBe("generated");
    expect(classifySource("var a=" + "1+".repeat(2000) + "1;", "bundle.js")).toBe("generated");
  });
  it("node: shebang, node: imports, process.argv, require.main", () => {
    expect(classifySource("#!/usr/bin/env node\nconsole.log(1)", "bin/x.js")).toBe("node");
    expect(classifySource("import fs from 'node:fs';", "tools/build.mjs")).toBe("node");
    expect(classifySource("const args = process.argv.slice(2);", "scripts/x.js")).toBe("node");
    expect(classifySource("if (require.main === module) run();", "x.js")).toBe("node");
    // a UXP file merely mentioning process is not Node
    expect(classifySource("const p = { process: 1 }; p.process;", "src/a.js")).toBe("source");
  });
});

describe("parseManifest", () => {
  it("tolerates a BOM; rejects non-objects with a message", () => {
    expect(parseManifest("\uFEFF{\"id\":\"a\"}").manifest).toEqual({ id: "a" });
    expect(parseManifest("[1]").manifest).toBeNull();
    expect(parseManifest("[1]").error).toMatch(/object/);
    expect(parseManifest("{ nope").error).toBeTruthy();
  });
});

describe("cssTypeSelectors", () => {
  it("collects element names from selectors, not classes, ids or properties", () => {
    const s = cssTypeSelectors("ul li > a:hover, .menu strong { color: red } #li { } .li { } @media (x) { em { } }");
    for (const e of ["ul", "li", "a", "strong", "em"]) expect(s.has(e)).toBe(true);
    expect(s.has("color")).toBe(false);
    expect(s.has("menu")).toBe(false);
  });
});

describe("project discovery", () => {
  it("skips CEP, ExtendScript, nested Node packages and WebView pages", () => {
    const d = tmp();
    write(d, "manifest.json", JSON.stringify({ manifestVersion: 5, id: "a", name: "abc", version: "1.0.0", main: "index.html", host: { app: "PS", minVersion: "24.0.0" }, entrypoints: [] }));
    write(d, "index.html", "<webview src=\"web/index.html\"></webview>");
    write(d, "web/index.html", "<p>hi</p>");
    write(d, "cep/CSXS/manifest.xml", "<ExtensionManifest/>");
    write(d, "jsx/host.jsx", "#target photoshop\napp.activeDocument;");
    write(d, "server/package.json", JSON.stringify({ name: "s", bin: { s: "x.js" } }));
    // hyperbrew/bolt-uxp ships its Vite plugin (Node code using fs.mkdirSync, http) inside the template
    write(d, "vite-uxp-plugin/package.json", JSON.stringify({ name: "vite-uxp-plugin", dependencies: { ws: "^8", archiver: "5" }, devDependencies: { "@types/node": "^20" } }));
    const reasons = classifyFolders(d, d).map((x) => x.reason).join(" ");
    expect(reasons).toMatch(/CEP/i);
    expect(reasons).toMatch(/ExtendScript/i);
    expect(reasons).toMatch(/Node/i);
    expect(reasons).toMatch(/WebView/i);
    expect(classifyFolders(d, d).some((x) => x.path.endsWith("vite-uxp-plugin"))).toBe(true);
    // ...but bolt-uxp-utils (UXP runtime helpers that also ship a setup bin) is linted
    write(d, "bolt-uxp-utils/package.json", JSON.stringify({ name: "bolt-uxp-utils", bin: { x: "scripts/setup.js" }, peerDependencies: { "@types/photoshop": "*" } }));
    expect(classifyFolders(d, d).some((x) => x.path.endsWith("bolt-uxp-utils"))).toBe(false);
    const [p] = findProjects(d);
    expect(p!.manifest).toMatch(/manifest\.json$/);
  });
  it("finds a plugin in a conventional subfolder and reports a broken manifest", () => {
    const d = tmp();
    write(d, "plugin/manifest.json", "{ \"manifestVersion\": 5, ");
    const ps = findProjects(d);
    expect(ps.some((p) => p.manifestError)).toBe(true);
  });
});
