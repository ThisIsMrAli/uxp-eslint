import { it, expect } from "vitest";
import { Linter } from "eslint/universal";
import { buildConfig } from "../src/index.js";
import { manifest } from "./helpers.js";

// Regression: the modal reach graph was O(functions x calls) per pass (about 30 s on this input before the fix).
it("lints an 8,000-line Photoshop file with 4,000 handlers quickly", () => {
  let code = "const { core, action } = require('photoshop');\n";
  for (let i = 0; i < 4000; i++) {
    code += `async function f${i}(ctx) { const d = { _obj: "set", _target: [{ _ref: "layer", _id: ${i} }] }; await action.batchPlay([d], {}); if (${i} % 2) await f${Math.max(0, i - 1)}(ctx); }\n`;
    code += `btn${i}.addEventListener("click", () => core.executeAsModal(f${i}, { commandName: "x" }).catch(console.error));\n`;
  }
  const t = performance.now();
  const msgs = new Linter().verify(code, buildConfig({ manifest: manifest({ host: { app: "PS", minVersion: "24.0.0" } }) }), { filename: "src/big.js" });
  const ms = performance.now() - t;
  expect(msgs.filter((m) => m.fatal)).toEqual([]);
  expect(msgs.filter((m) => /modal/.test(m.ruleId ?? ""))).toEqual([]);
  expect(ms).toBeLessThan(15000);
}, 60000);
