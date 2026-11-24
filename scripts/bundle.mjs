// Single-file ESM bundle of the browser entry (no Node built-ins), for web workers / playgrounds.
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/browser.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/uxp-lint.browser.mjs",
  metafile: true,
  legalComments: "eof",
  logLevel: "warning",
});
const inputs = Object.keys(result.metafile.inputs);
const bad = inputs.filter((i) => /node:|^(fs|path|os|module|url)$/.test(i));
if (bad.length) throw new Error("Node inputs in browser bundle: " + bad.join(", "));
const out = result.metafile.outputs["dist/uxp-lint.browser.mjs"];
console.log(`dist/uxp-lint.browser.mjs ${(out.bytes / 1024).toFixed(0)} KB, ${inputs.filter((i) => i.includes("node_modules")).length} node_modules inputs`);
