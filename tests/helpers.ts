import { RuleTester } from "eslint";
import css from "@eslint/css";
import json from "@eslint/json";
import * as htmlParser from "@html-eslint/parser";
import tsParser from "@typescript-eslint/parser";
import plugin from "../src/index.js";

export const manifest = (over: Record<string, unknown> = {}) => ({
  manifestVersion: 5,
  id: "com.test",
  name: "Test",
  version: "1.0.0",
  main: "index.html",
  host: { app: "PS", minVersion: "23.3.0" },
  entrypoints: [{ type: "panel", id: "mainPanel", label: { default: "Main" } }, { type: "command", id: "doIt", label: { default: "Do it" } }],
  ...over,
});
export const settings = (m: Record<string, unknown> = manifest(), extra: Record<string, unknown> = {}) => ({ uxp: { manifest: m, ...extra } });

export const jsTester = () => new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } } });
export const tsTester = () => new RuleTester({ languageOptions: { parser: tsParser as never, ecmaVersion: "latest", sourceType: "module" } });
export const cssTester = () => new RuleTester({ plugins: { css: css as never }, language: "css/css" });
export const jsonTester = () => new RuleTester({ plugins: { json: json as never }, language: "json/json" });
export const htmlTester = () => new RuleTester({ languageOptions: { parser: htmlParser as never } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rule = (name: keyof typeof plugin.rules) => plugin.rules[name] as any;
