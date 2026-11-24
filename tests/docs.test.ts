import { describe, it, expect } from "vitest";
import { Linter } from "eslint/universal";
import css from "@eslint/css";
import json from "@eslint/json";
import * as htmlParser from "@html-eslint/parser";
import fs from "node:fs";
import path from "node:path";
import plugin, { buildConfig } from "../src/index.js";
// @ts-expect-error plain ESM data file
import { RULES } from "../docs/src/rule-docs.mjs";

type Ex = { code: string; filename?: string; manifest?: Record<string, unknown> };
const lint = (ex: Ex) => {
  const cfg = buildConfig({ manifest: ex.manifest as never, css, json, htmlParser, level: "strict" } as never);
  return new Linter().verify(ex.code, cfg, { filename: ex.filename ?? (/<\w/.test(ex.code) && !/\.html$/.test(ex.filename ?? "") ? "panel.jsx" : "main.js") });
};

describe("rule docs examples", () => {
  it("every rule has docs source and a generated page", () => {
    for (const name of Object.keys(plugin.rules)) {
      expect(RULES[name], name).toBeTruthy();
      expect(fs.existsSync(path.resolve(__dirname, `../docs/rules/${name}.md`)), name).toBe(true);
    }
  });
  for (const [name, doc] of Object.entries(RULES as Record<string, { incorrect: Ex[]; correct: Ex[] }>)) {
    it(`${name}: incorrect examples report it`, () => {
      for (const ex of doc.incorrect) {
        const msgs = lint(ex);
        expect(msgs.filter((m) => m.fatal), ex.code).toEqual([]);
        expect(msgs.some((m) => m.ruleId === `uxp-lint/${name}`), `${ex.code}\n${JSON.stringify(msgs)}`).toBe(true);
      }
    });
    it(`${name}: correct examples are clean`, () => {
      for (const ex of doc.correct) {
        const msgs = lint(ex);
        expect(msgs.filter((m) => m.fatal || m.ruleId === `uxp-lint/${name}`), ex.code).toEqual([]);
      }
    });
  }
});
