// Regenerates data/*.json from upstream sources. Never hand-edit the generated files.
// Usage: node scripts/build-data.mjs <sourcesDir>
//   <sourcesDir>/jarda          git clone https://github.com/jardicc/vscode-uxp-validator (MIT)
//   <sourcesDir>/adobedocs-uxp  git clone https://github.com/AdobeDocs/uxp (docs, Adobe)
//   <sourcesDir>/types-photoshop-<v>/photoshop  npm pack @types/photoshop (MIT, DefinitelyTyped)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const src = path.resolve(process.argv[2] ?? "../../uxp-tools/eslint/raw");
const outputRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(outputRoot, "data");
fs.mkdirSync(out, { recursive: true });
const gitSha = (dir) => execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();
const write = (name, obj) => fs.writeFileSync(path.join(out, name), JSON.stringify(obj, null, 1) + "\n");
const tmp = fs.mkdtempSync("/tmp/uxp-data-");
const require = createRequire(import.meta.url);

function loadTs(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const f = path.join(tmp, path.basename(file) + ".cjs");
  fs.writeFileSync(f, code);
  const Module = require("node:module");
  const orig = Module._load;
  Module._load = function (req, ...rest) { if (req in stubs) return stubs[req]; if (req.startsWith(".")) return {}; return orig.call(this, req, ...rest); };
  try { return require(f); } finally { Module._load = orig; }
}

// 1. Host version -> UXP version (Jarda's validator, MIT)
const jarda = path.join(src, "jarda");
const jardaSha = gitSha(jarda);
const vt = loadTs(path.join(jarda, "common/versionTable.ts")).versionTable;
const hostUxp = { $source: { repo: "https://github.com/jardicc/vscode-uxp-validator", file: "common/versionTable.ts", commit: jardaSha, license: "MIT (c) Jaroslav Bereza" }, hosts: {} };
for (const [app, rows] of Object.entries(vt)) {
  if (!["PS", "ID", "premierepro"].includes(app)) continue;
  hostUxp.hosts[app] = Object.entries(rows).map(([host, v]) => ({ host, uxp: v.uxp })).sort((a, b) => cmp(a.host, b.host));
}
write("host-uxp-versions.json", hostUxp);

// 2. CSS support (Jarda's UXP custom data, MIT; derived from @vscode/web-custom-data, MIT)
const builtin = loadTs(path.join(jarda, "server/src/CssService/languageFacts/uxpBuiltinData.ts"));
const css = loadTs(path.join(jarda, "server/src/CssService/data/uxpCustomData.ts"), { "../languageFacts/uxpBuiltinData": builtin });
const v = (b) => (b && b.length ? b.map((x) => x.replace("UXP", "")).sort(cmp)[0] : null);
const cssOut = { $source: { repo: "https://github.com/jardicc/vscode-uxp-validator", file: "server/src/CssService/data/uxpCustomData.ts", commit: jardaSha, license: "MIT (c) Jaroslav Bereza; based on @vscode/web-custom-data (MIT, Microsoft)", semantics: "value = minimum UXP version; an item absent from a category is not supported by UXP" } };
for (const [cat, items] of Object.entries(css.cssData)) {
  if (!Array.isArray(items)) continue;
  cssOut[cat] = {};
  for (const it of items) {
    if (it.status === "obsolete") continue;
    const entry = { since: v(it.browsers) };
    if (Array.isArray(it.restrictions)) entry.restrictions = it.restrictions;
    if (cat === "properties" && Array.isArray(it.values) && it.values.length) {
      entry.values = Object.fromEntries(it.values.filter((x) => !x.name.includes("(")).map((x) => [x.name, v(x.browsers) ?? entry.since]));
    }
    cssOut[cat][it.name] = entry;
  }
}
cssOut.knownFunctionNames = css.allKnownFunctionNames;
// Merge Adobe's own CSS reference (AdobeDocs/uxp reference-css) where Jarda's data lacks an item. since=null => documented, version unknown.
{
  const docsRoot = path.join(src, "adobedocs-uxp", "src/pages/uxp-api/reference-css");
  const docsCommit = gitSha(path.join(src, "adobedocs-uxp"));
  cssOut.$source.adobeDocs = { repo: "https://github.com/AdobeDocs/uxp", dir: "src/pages/uxp-api/reference-css", commit: docsCommit, note: "items added from Adobe docs carry from:'adobe-docs'" };
  const sinceOf = (f) => (fs.readFileSync(f, "utf8").match(/\*\*Since\*\*:?\s*(?:UXP\s*)?v?([0-9][0-9.]*)/) ?? [])[1]?.replace(/\.$/, "") ?? null;
  const add = (cat, name, since, doc) => { cssOut[cat] ??= {}; if (!cssOut[cat][name]) cssOut[cat][name] = { since, from: "adobe-docs", doc }; };
  for (const f of fs.readdirSync(path.join(docsRoot, "Styles"))) if (f !== "index.md") add("properties", f.replace(/\.md$/, ""), sinceOf(path.join(docsRoot, "Styles", f)), `reference-css/Styles/${f}`);
  for (const f of fs.readdirSync(path.join(docsRoot, "Pseudo-classes"))) if (f !== "index.md") add("pseudoClasses", f.replace(/\.md$/, ""), sinceOf(path.join(docsRoot, "Pseudo-classes", f)), `reference-css/Pseudo-classes/${f}`);
  for (const f of fs.readdirSync(path.join(docsRoot, "Pseudo-elements"))) if (f !== "index.md") add("pseudoElements", f.replace(/\.md$/, ""), sinceOf(path.join(docsRoot, "Pseudo-elements", f)), `reference-css/Pseudo-elements/${f}`);
  const unitsMd = fs.readFileSync(path.join(docsRoot, "General/units.md"), "utf8");
  const unitsSince = sinceOf(path.join(docsRoot, "General/units.md"));
  for (const u of (unitsMd.match(/Units supported are (.+)\./)?.[1] ?? "").matchAll(/`([a-z%]+)`/g)) add("units", u[1], unitsSince, "reference-css/General/units.md");
}
write("css.json", cssOut);

// 3. UXP global/module "Since" versions (AdobeDocs/uxp reference-js)
const docs = path.join(src, "adobedocs-uxp");
const docsSha = gitSha(docs);
const refJs = path.join(docs, "src/pages/uxp-api/reference-js");
const globals = {}, sinceMembers = {};
for (const f of walk(refJs)) {
  if (!f.endsWith(".md") || f.endsWith("index.md")) continue;
  const lines = fs.readFileSync(f, "utf8").split("\n");
  let h1 = null, heading = null, level = 0;
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (h) { level = h[1].length; const raw = h[2].replace(/\\/g, "").replace(/`/g, ""); const rq = raw.match(/^require\(['"]([a-z]+)['"]\)\.?([A-Za-z.]*)/); heading = (rq ? [rq[1], rq[2]].filter(Boolean).join(".") : raw.replace(/\(.*$/, "")).replace(/\s*:.*$/, "").trim(); if (level === 1) h1 = heading; }
    const s = line.match(/^\*\*Since\*\*:\s*(?:UXP\s*)?v?([0-9][0-9.]*)/);
    if (!s || !h1) continue;
    const ver = s[1].replace(/\.$/, ""), doc = path.relative(docs, f);
    const g = h1.replace(/^windows?\./, "").replace(/^navigator\./, "");
    if (level === 1) globals[g] ??= { since: ver, doc };
    else sinceMembers[`${g}.${heading}`] ??= { since: ver, doc };
  }
}
write("uxp-since.json", { $source: { repo: "https://github.com/AdobeDocs/uxp", dir: "src/pages/uxp-api/reference-js", commit: docsSha, note: "globals: H1 title of each doc page with a '**Since**' line directly under it; members: '<page title>.<H2/H3 heading>'. Versions are UXP versions." }, globals, members: sinceMembers });
const since = { ...globals, ...sinceMembers };

// 4. fs module documented methods (AdobeDocs/uxp fs.md)
const fsMd = fs.readFileSync(path.join(refJs, "Modules/fs/fs.md"), "utf8");
const fsMethods = [...fsMd.matchAll(/^## ([a-zA-Z]+)\(/gm)].map((m) => m[1]);
write("fs-methods.json", { $source: { repo: "https://github.com/AdobeDocs/uxp", file: "src/pages/uxp-api/reference-js/Modules/fs/fs.md", commit: docsSha }, methods: [...new Set(fsMethods)] });

// 5. Photoshop @minVersion tags (@types/photoshop, MIT)
const psDir = fs.readdirSync(src).find((d) => d.startsWith("types-photoshop-"));
const psRoot = path.join(src, psDir, "photoshop");
const psVersion = JSON.parse(fs.readFileSync(path.join(psRoot, "package.json"), "utf8")).version;
const members = {};
for (const f of walk(psRoot)) {
  if (!f.endsWith(".d.ts")) continue;
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node, owner) => {
    let name = node.name && ts.isIdentifier(node.name) ? node.name.text : null;
    const tag = ts.getJSDocTags(node).find((t) => t.tagName.text === "minVersion");
    const mv = tag && typeof tag.comment === "string" ? tag.comment.trim() : null;
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isModuleDeclaration(node)) {
      if (name && mv) members[name] ??= mv;
      node.forEachChild((c) => visit(c, name ?? owner));
      return;
    }
    if (ts.isModuleBlock(node)) { node.forEachChild((c) => visit(c, owner)); return; }
    if (ts.isVariableStatement(node)) { for (const d of node.declarationList.declarations) { const t = ts.getJSDocTags(node).find((x) => x.tagName.text === "minVersion"); if (t && typeof t.comment === "string" && ts.isIdentifier(d.name) && owner) members[`${owner}.${d.name.text}`] ??= t.comment.trim(); } return; }
    if (name && mv && owner && (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isFunctionDeclaration(node))) {
      members[`${owner}.${name}`] ??= mv;
    }
    node.forEachChild((c) => visit(c, owner));
  };
  sf.forEachChild((c) => visit(c, null));
}
write("photoshop-min-versions.json", { $source: { package: "@types/photoshop", version: psVersion, repo: "https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/photoshop", license: "MIT", note: "Owner.member -> @minVersion JSDoc tag (Photoshop version). photoshopCore = require('photoshop').core, photoshopAction = .action, imaging = .imaging, Photoshop = app" }, members });

console.log("css properties:", Object.keys(cssOut.properties).length, "since entries:", Object.keys(since).length, "fs:", fsMethods.length, "ps members:", Object.keys(members).length);

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])); }
function cmp(a, b) { const pa = a.split(".").map(Number), pb = b.split(".").map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; } return 0; }

// Emit browser-safe TS modules (no JSON imports, no fs at runtime)
const genDir = path.resolve(out, "../src/data/generated");
fs.mkdirSync(genDir, { recursive: true });
for (const f of fs.readdirSync(out).filter((x) => x.endsWith(".json"))) {
  const id = f.replace(/\.json$/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  fs.writeFileSync(path.join(genDir, f.replace(/\.json$/, ".ts")), `// GENERATED by scripts/build-data.mjs from data/${f}. Do not edit.\n/* eslint-disable */\nconst ${id} = ${fs.readFileSync(path.join(out, f), "utf8").trim()};\nexport default ${id};\n`);
}
