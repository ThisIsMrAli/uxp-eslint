# uxp-lint/api-min-version

Disallow UXP and Photoshop APIs that are newer than the manifest's host.minVersion.

Type: problem.

## What it checks

Maps `host.minVersion` to a UXP version with the host→UXP table, then reports (a) UXP globals and modules newer than that UXP version (AdobeDocs `**Since**` lines, e.g. `ResizeObserver` 8.1, `Request` 7.3.0, `uxp.userInfo` 7.3.0, `navigator.clipboard.*` 6.0), and (b) for Photoshop, `require("photoshop").core/.action/.imaging/.app` members newer than `host.minVersion` (`@types/photoshop` `@minVersion`). With typed linting (`parserOptions.projectService`), any member whose declaration in `@types/photoshop` carries `@minVersion` is checked, including through variables. Calls inside `if (x.api)` / ternary tests mentioning the API, or inside `try`, are treated as feature-detected. Options: `typeAware` (default true), `checkDomMembers` (default true).

## Messages

- `hostTooOld`: `{{api}}` needs {{host}} {{required}}+ ({{source}}), but manifest host.minVersion is {{min}}. Raise minVersion or feature-detect it.
- `uxpTooOld`: `{{api}}` needs UXP {{required}}+ ({{source}}), but host.minVersion {{min}} ships UXP {{uxp}}. Raise minVersion or feature-detect it.

## Sources

- @types/photoshop @minVersion tags
- AdobeDocs/uxp reference-js **Since** lines
- jardicc/vscode-uxp-validator host→UXP table
