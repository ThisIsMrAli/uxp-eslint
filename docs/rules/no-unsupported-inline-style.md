# uxp-lint/no-unsupported-inline-style

Disallow unsupported CSS properties in JSX `style={{...}}` objects and `element.style.x = ...` assignments.

Type: problem.

## What it checks

Same data as `no-unsupported-css`, for JSX `style={{ … }}` keys, `el.style.prop = …` and `el.style.setProperty("prop", …)`.

## Messages

- `unsupported`: Style property `{{name}}` is not supported by UXP{{target}}.
- `newer`: Style property `{{name}}` needs UXP {{since}}+, but the target is UXP {{uxp}}.
- `unsupportedValue`: `{{name}}: {{value}}` is not supported by UXP{{target}}.

## Sources

- jardicc/vscode-uxp-validator UXP CSS data (MIT)
