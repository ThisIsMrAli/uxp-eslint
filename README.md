# eslint-plugin-uxp-lint

ESLint rules for Adobe UXP plugins (Photoshop, InDesign, Premiere Pro). They catch the mistakes UXP only reports at runtime, or never reports:

- **API newer than your manifest**: `core.getLayerTree()` with `host.minVersion: "23.0.0"`, `ResizeObserver` on a host that ships UXP 6.
- **Code vs manifest permissions**: `fetch()` to a domain missing from `requiredPermissions.network.domains`, `shell.openPath()` on a folder without `""` in `launchProcess.extensions`, file pickers without `localFileSystem: "request"`, clipboard, IPC, WebView, user info, `alert()` without `featureFlags.enableAlerts`.
- **CSS / HTML that UXP ignores**: `gap`, `display: grid`, `font` shorthand, `transition`, `@keyframes`, `<ul>`, `<label for>`, `<input type="file">`, … checked against the UXP version your manifest targets.
- **Photoshop modal scope**: modifying `batchPlay`, DOM edits and setters outside `core.executeAsModal`, and unhandled `executeAsModal` rejections.
- **UXP gotchas**: Node-only modules, `fs` methods UXP does not have, `keypress`, `MutationObserver`, `matchMedia`, scripts in `innerHTML`, storage in `.psjs` scripts.

Every fact comes from a cited source (Adobe docs, `@types/photoshop`, Jaroslav Bereza's UXP validator data, or a named community report). Nothing is guessed: unknown versions skip the check.

Works with ESLint 9.15+ and 10 (flat config), JavaScript, TypeScript and JSX, in Node and in the browser (`Linter` from `eslint/universal`).

## Install

```sh
npm i -D eslint eslint-plugin-uxp-lint
# optional, to lint stylesheets, HTML and manifest.json:
npm i -D @eslint/css @html-eslint/parser @eslint/json
# optional, for .ts/.tsx and typed (more precise) min-version checks:
npm i -D typescript typescript-eslint @types/photoshop
```

## Zero-config (recommended)

`eslint.config.js`:

```js
import { uxpConfig } from "eslint-plugin-uxp-lint/node";

export default [
  ...(await uxpConfig()), // finds every UXP manifest.json, reads it, loads the optional plugins you installed
];
```

`uxpConfig({ cwd, manifest: "plugin/manifest.json", level: "strict" })` lets you pin the manifest or switch to the strict preset. A manifest kept in `plugin/` or `public/` next to a `package.json` lints the whole project (so `src/` is included).

Or run the CLI without any config:

```sh
npx uxp-lint .                 # stylish output, exit 1 on errors
npx uxp-lint . --format sarif  # SARIF 2.1.0 for code scanning
npx uxp-lint . --format json --strict --fix --ignore "tools/**"
```

The CLI skips `node_modules`, `dist`, `build`, `*.config.*`, `scripts/`, `server/` and `webview-ui/` (Node and WebView code is not UXP code).

## Manual config

```js
import uxpLint, { buildConfig } from "eslint-plugin-uxp-lint";
import css from "@eslint/css";
import json from "@eslint/json";
import * as htmlParser from "@html-eslint/parser";
import manifest from "./manifest.json" with { type: "json" };

export default buildConfig({ manifest, css, json, htmlParser, level: "recommended" });
```

Static presets, if you prefer to wire settings yourself:

```js
export default [
  { ...uxpLint.configs.photoshop, settings: { uxp: { manifest } } }, // or indesign / premierepro / recommended / strict / *-strict
  { ...uxpLint.configs.css, plugins: { ...uxpLint.configs.css.plugins, css } },
  { ...uxpLint.configs.manifest, plugins: { ...uxpLint.configs.manifest.plugins, json } },
];
```

### Settings (`settings.uxp`)

| Key | Meaning |
|---|---|
| `manifest` | Parsed manifest.json. Drives every manifest-aware rule. |
| `manifestText` | Raw manifest text (parsed if `manifest` is absent). |
| `host` | Force `"PS"`, `"ID"` or `"premierepro"`. Default: `host.app`. |
| `hostMinVersion` | Override `host.minVersion`. |
| `uxpVersion` | Override the UXP version (default: mapped from `host.minVersion`). |

Without a manifest, permission, entrypoint and version rules stay silent; the other rules still run.

## Rules

| Rule | What it reports | Recommended | Fix |
|---|---|:-:|:-:|
| [manifest-permissions](docs/rules/manifest-permissions.md) | APIs used without the matching `requiredPermissions` (network, launchProcess, localFileSystem, clipboard, ipc, webview, enableUserInfo, enableAlerts) | error | |
| [api-min-version](docs/rules/api-min-version.md) | UXP / Photoshop APIs newer than `host.minVersion` (typed mode when type info exists) | error | |
| [no-unsupported-css](docs/rules/no-unsupported-css.md) | CSS properties, values, at-rules, selectors, units, functions not in the target UXP | warn | |
| [no-unsupported-inline-style](docs/rules/no-unsupported-inline-style.md) | Same, for JSX `style` objects and `el.style` | warn | |
| [no-unsupported-html](docs/rules/no-unsupported-html.md) | Unsupported elements/attributes/patterns in HTML and JSX | warn | |
| [no-unsupported-web-api](docs/rules/no-unsupported-web-api.md) | Browser APIs UXP lacks or documents as unreliable | warn | |
| [no-unsupported-fs-method](docs/rules/no-unsupported-fs-method.md) | `fs` methods UXP does not document | error | |
| [no-node-builtin-modules](docs/rules/no-node-builtin-modules.md) | `http`, `child_process`, `net`, … | error | |
| [entrypoints-match-manifest](docs/rules/entrypoints-match-manifest.md) | `entrypoints.setup()` ids vs manifest entrypoints | error | |
| [valid-manifest](docs/rules/valid-manifest.md) | Silent manifest.json mistakes | error | yes |
| [photoshop-modal-scope](docs/rules/photoshop-modal-scope.md) | State changes outside `executeAsModal` (Photoshop, apiVersion 2) | error (PS) | |
| [photoshop-handle-modal-errors](docs/rules/photoshop-handle-modal-errors.md) | Unhandled `executeAsModal` rejections | warn (PS) | |

`strict` raises the warnings to errors, enables `aria-*` checks and checks vendor-prefixed CSS.

## Works alongside

- **Premiere Pro**: keep Adobe's [`@adobe/eslint-plugin-premierepro`](https://github.com/adobe/eslint-plugin-premierepro) for Action/lock/transaction rules. This plugin adds the cross-host rules; it does not copy Adobe's.
  ```js
  import premierepro from "@adobe/eslint-plugin-premierepro";
  export default [premierepro.configs.recommended, ...(await uxpConfig())];
  ```
- **bubblydoo** [`@bubblydoo/eslint-plugin-uxp`](https://github.com/bubblydoo/uxp-toolkit) (`no-tailwind-gap-utility`, `prefer-adobe-protocol`) can run next to it.
- **Jarda's Validator for UXP** (VS Code) gives in-editor manifest IntelliSense and LESS/SCSS checks; this plugin reuses its MIT-licensed version and CSS tables for CI and other editors.

## Data and how to refresh it

`data/*.json` are generated by `node scripts/build-data.mjs <sourcesDir>` and are never hand-edited. Each file has a `$source` block (repo, file, commit, licence):

| File | Source |
|---|---|
| `host-uxp-versions.json` | jardicc/vscode-uxp-validator `common/versionTable.ts` (MIT) |
| `css.json` | jardicc/vscode-uxp-validator UXP CSS data (MIT; based on Microsoft `@vscode/web-custom-data`, MIT) + AdobeDocs/uxp reference-css |
| `uxp-since.json` | AdobeDocs/uxp reference-js `**Since**` lines |
| `fs-methods.json` | AdobeDocs/uxp `Modules/fs/fs.md` |
| `photoshop-min-versions.json` | `@types/photoshop` 27.11.0 `@minVersion` tags (MIT) |

Hand-written facts (`src/data/html.ts`, `src/data/web-api.ts`) cite a URL each and are labelled `docs` or `community`.

## Limits

- Static analysis only. Runtime host bugs (silent batchPlay no-ops, modal races) are out of reach.
- The CSS data and the host→UXP table come from one community source; Adobe's samples sometimes use CSS the data marks as unsupported (for example `gap` in a Premiere sample). Such reports need a host check before you trust them.
- Modal-scope analysis is per file. Helpers that are only exported are not judged; DOM-method detection uses receiver names.
- Photoshop min-version data covers Photoshop only. InDesign and Premiere API versions are not mined yet (UXP-level checks still run for them).
- LESS/SCSS, Vue and Svelte templates are not parsed.

## License

MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for data sources.
