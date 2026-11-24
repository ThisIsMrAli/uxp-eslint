# uxp-lint/no-unsupported-css

Disallow CSS properties, values, at-rules, pseudo selectors, units and functions that the target UXP version does not support (CSS files, via @eslint/css).

Type: problem.

## What it checks

For CSS files linted with `@eslint/css` (`language: "css/css"`). Properties, single-keyword values of keyword-only properties, at-rules, pseudo-classes/elements, units, functions and media features are checked against the UXP CSS data; items absent from the data are reported as unsupported, items newer than the target UXP version as `newer`. Options: `ignore` (names, or `prop:value`), `ignoreVendorPrefixed` (default true), `checkValues` (default true), `ignoreBuildTimeAtRules` (default true: `@tailwind`, `@apply`, `@layer`, …). LESS/SCSS are not parsed.

## Messages

- `unsupported`: {{kind}} `{{name}}` is not supported by UXP{{target}}.
- `newer`: {{kind}} `{{name}}` needs UXP {{since}}+, but the target is UXP {{uxp}}.

## Sources

- jardicc/vscode-uxp-validator UXP CSS data (MIT)
- https://developer.adobe.com/uxp/uxp-api/known-issues
- AdobeDocs/uxp reference-css
