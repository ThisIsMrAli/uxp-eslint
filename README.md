# eslint-plugin-uxp-lint

[Project site](https://thisismrali.github.io/uxp-eslint/) · [npm package](https://www.npmjs.com/package/eslint-plugin-uxp-lint) · [Rule reference](docs/rules/README.md)

ESLint rules for Adobe UXP plugins (Photoshop, InDesign, Premiere Pro). They catch problems that UXP only shows at runtime, or never shows at all:

- **APIs newer than your manifest.** For example `core.getLayerTree()` with `host.minVersion: "23.0.0"`, `localFileSystem.getEntryWithUrl()` before Photoshop 24.2, or `ResizeObserver` on a host that ships UXP 6.
- **Code that doesn't match manifest permissions.** `fetch()` to a domain missing from `network.domains`, `shell.openExternal()` without `launchProcess`, file pickers without `localFileSystem: "request"`, plus clipboard, IPC, WebView and user info. Also `alert()` without `featureFlags.enableAlerts`.
- **Photoshop modal mistakes.**
  - Modifying `batchPlay` calls, DOM edits and setters that run outside `core.executeAsModal`. The check follows variables, helper functions and wrapper functions within the same file.
  - Unawaited work inside the modal target.
  - Lost `executeAsModal` rejections.
- **CSS and HTML that UXP ignores**, checked against the UXP version your manifest targets. Examples: `gap`, `display: grid`, the `font` shorthand, `transition`, `@keyframes`, `transform-origin` without `CSSNextSupport`, `<label for>`, `<input type="file">`, and `<option>` without `value`.
- **Manifest mistakes**:
  - required keys
  - version format
  - entrypoint types and duplicate ids
  - permission values
  - top-level wildcard domains (rejected since UXP 7.4)
  - `main` inside an entrypoint
- **Deprecated and unavailable APIs**:
  - `clipboard.setContent` and the `uxpvideo*` events
  - Node-only modules
  - `fs` methods that UXP doesn't have
  - `keypress`
  - `localStorage` in `.psjs` scripts

**Precision first.** Every check cites an Adobe doc, `@types/photoshop`, Jaroslav Bereza's MIT UXP data, or a named forum thread. When a fact is unknown, the check is skipped instead of guessed.

The same applies to code the linter can't see. Exported helpers, callbacks passed to unknown functions, and feature-detected calls (`if (window.X)`, `x?.()`, `typeof`, `try`) are never reported.

The rules were tuned against 65 UXP plugins in 47 public repositories; see [real-sample-results/HARDENING.md](real-sample-results/HARDENING.md).

It works with ESLint 9.15+ and 10 (flat config). It handles JavaScript, TypeScript, JSX, CSS, HTML and `manifest.json`, and runs in Node and in the browser (`Linter` from `eslint/universal`).

## Quick start (no config)

```sh
npm exec --package=eslint-plugin-uxp-lint -- uxp-lint .
```

```text
main.js
  12:9   error    batchPlay `make` modifies Photoshop state but runs outside core.executeAsModal(). With apiVersion 2 this throws; wrap it in executeAsModal.  uxp-lint/photoshop-modal-scope
  14:15  error    `cdn.other.com` is not in `requiredPermissions.network.domains`; the request will be denied ("Manifest entry not found").  uxp-lint/manifest-permissions
  16:16  error    `core.getLayerTree` needs PS 23.1+ (@types/photoshop @minVersion), but manifest host.minVersion is 23.0.0. Raise minVersion or feature-detect it.  uxp-lint/api-min-version

styles.css
  1:23  warning  Property `gap` is not supported by UXP 5.5.1.  uxp-lint/no-unsupported-css

✖ 34 problems (18 errors, 16 warnings) in 4 files
  1 fixable with --fix
  1 plugin (PS 23.0.0 → UXP 5.5.1) · 0.4s · uxp-lint 0.2.0

Rule docs:
     7 × uxp-lint/no-unsupported-html  https://github.com/ThisIsMrAli/uxp-eslint/blob/main/docs/rules/no-unsupported-html.md
```

The CLI finds every UXP `manifest.json`, including ones kept in `plugin/` or `public/` in bolt-uxp and Vite projects. It reads host, minVersion and permissions from that file.

It lints only code that runs in UXP. Skipped automatically:

- `node_modules` and build output
- tests and build tooling (`*.config.*`, `scripts/`, files with a shebang, `node:` imports or `process.argv`)
- minified bundles
- CEP panels (`CSXS/manifest.xml`)
- ExtendScript (`.jsx` with `#target`)
- nested Node packages
- WebView pages (`<webview src>`)

The "Not linted" summary line lists what was skipped. Use `--no-default-ignores` to lint everything.

| Option | |
|---|---|
| `--format stylish\|github\|sarif\|json` | Output format; `github` writes workflow annotations, `sarif` is SARIF 2.1.0 for code scanning |
| `-o, --output <file>` | Write the report to a file |
| `--manifest <file>` | Use this manifest instead of discovering one (e.g. a bolt-uxp build's `dist/manifest.json`) |
| `--fix` | Apply safe autofixes and print how many were fixed |
| `--strict` | Strict preset |
| `--quiet`, `--max-warnings <n>` | As in ESLint |
| `--ignore <globs>` | Extra comma-separated ignores |
| `--init` | Write an `eslint.config.mjs` and print the packages to install |
| `--rules` | List the rules with docs links |

Exit codes: `0` means no errors, `1` means lint errors or `--max-warnings` was exceeded, `2` means a usage or configuration error.

## Install as an ESLint plugin

```sh
npm i -D eslint eslint-plugin-uxp-lint
npm i -D @eslint/css @eslint/json @html-eslint/parser   # optional: CSS, manifest.json, HTML
npm i -D typescript-eslint @types/photoshop             # optional: .ts/.tsx and typed min-version checks
npx uxp-lint --init                                     # writes eslint.config.mjs
```

`eslint.config.mjs`:

```js
import { uxpConfig } from "eslint-plugin-uxp-lint/node";

export default [
  // ...your other configs
  ...(await uxpConfig()), // finds each manifest.json and loads the optional language plugins you installed
];
```

`uxpConfig(options)` accepts these options:

- `cwd`
- `manifest` (a path or paths)
- `level: "recommended" | "strict"`
- `settings`
- `ignores` (scoped to the uxp-lint blocks)
- `defaultIgnores: false`

### Editor (Cursor, VS Code, WebStorm, Neovim)

Install **ESLint** (`dbaeumer.vscode-eslint`) from the Extensions panel in Cursor or VS Code. Open the UXP project folder with the local npm dependencies and `eslint.config.mjs`. Open a JavaScript file and check **Problems** for diagnostics with a `uxp-lint/` rule ID. If `npx eslint .` reports findings but the editor doesn't, run **ESLint: Show Output Channel** from the Command Palette.

To also lint CSS, HTML and the manifest in VS Code, add this to `.vscode/settings.json`:

```json
{
  "eslint.useFlatConfig": true,
  "eslint.validate": ["javascript", "javascriptreact", "typescript", "typescriptreact", "css", "html", "json"]
}
```

Quick fixes such as "Add `await`" or "Replace with `write`" appear in the lightbulb menu. Autofixable problems are fixed by "ESLint: Fix all auto-fixable problems" or by `"editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" }`.

WebStorm and Neovim (`eslint-lsp`) use the same flat config.

### CI (GitHub Actions)

```yaml
# .github/workflows/uxp-lint.yml
name: uxp-lint
on: [push, pull_request]
permissions:
  contents: read
  security-events: write   # for the SARIF upload
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      # Inline annotations on the PR diff:
      - run: npx uxp-lint . --format github
      # Or GitHub code scanning (Security tab, PR checks); keep the job green and let code scanning gate:
      - run: npx uxp-lint . --format sarif -o uxp-lint.sarif || true
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: uxp-lint.sarif, category: uxp-lint }
```

The SARIF file includes rule metadata with help text and docs links, repo-relative paths (`%SRCROOT%`), and end positions, so code scanning shows each alert with its rule page.

## Manual config

```js
import uxpLint, { buildConfig } from "eslint-plugin-uxp-lint";
import css from "@eslint/css";
import json from "@eslint/json";
import * as htmlParser from "@html-eslint/parser";
import manifest from "./manifest.json" with { type: "json" };

export default buildConfig({ manifest, css, json, htmlParser, level: "recommended" });
```

If you prefer to wire up settings yourself, static presets are available as `uxpLint.configs.photoshop`, `indesign`, `premierepro`, `recommended`, `strict`, `*-strict`, `css` and `manifest`.

### Settings (`settings.uxp`)

| Key | Meaning |
|---|---|
| `manifest` / `manifestText` | Parsed or raw manifest.json. Drives every manifest-aware rule. |
| `host` | Force `"PS"`, `"ID"` or `"premierepro"`. Default: `host.app`. |
| `hostMinVersion`, `uxpVersion` | Override the minimum host or UXP version. |
| `reactVersion` | React major version (set by `uxpConfig()` from package.json). React 19 forwards `onChange` to `sp-*` elements. |
| `styledElements` | Unsupported elements your CSS styles, such as `li` (set by `uxpConfig()`). Adobe documents styling them as the workaround. |
| `splitSetup` | `entrypoints.setup()` is spread over several files (set by `uxpConfig()`). |
| `lintGenerated`, `lintNodeScripts` | Also lint minified/generated files or Node scripts. Both are skipped by default. |

Without a manifest, the permission, entrypoint and version rules stay silent; the other rules still run.

## Rules

See [docs/rules](docs/rules/README.md). Each page has incorrect and correct examples (tested in CI), options, messages, when not to use the rule, and sources.

| Rule | What it reports | Recommended | |
|---|---|:-:|:-:|
| [manifest-permissions](docs/rules/manifest-permissions.md) | APIs used without the matching `requiredPermissions` or feature flag | error | |
| [api-min-version](docs/rules/api-min-version.md) | UXP and Photoshop APIs newer than `host.minVersion` | error | |
| [valid-manifest](docs/rules/valid-manifest.md) | manifest.json mistakes UXP accepts silently or rejects late | error | 🔧 |
| [entrypoints-match-manifest](docs/rules/entrypoints-match-manifest.md) | `entrypoints.setup()` ids vs manifest entrypoints | error | |
| [photoshop-modal-scope](docs/rules/photoshop-modal-scope.md) | State changes outside `executeAsModal` (Photoshop, apiVersion 2) | error | |
| [photoshop-await-in-modal](docs/rules/photoshop-await-in-modal.md) | Unawaited batchPlay/history calls and `forEach(async)` inside the modal target | warn | 💡 |
| [photoshop-handle-modal-errors](docs/rules/photoshop-handle-modal-errors.md) | Lost `executeAsModal` rejections | warn | |
| [no-unsupported-css](docs/rules/no-unsupported-css.md) | CSS the target UXP doesn't support | warn | |
| [no-unsupported-inline-style](docs/rules/no-unsupported-inline-style.md) | The same check for JSX `style` objects and `el.style` | warn | |
| [no-unsupported-html](docs/rules/no-unsupported-html.md) | Unsupported elements, attributes and patterns in HTML and JSX | warn | |
| [no-unsupported-web-api](docs/rules/no-unsupported-web-api.md) | Browser APIs UXP lacks or documents as unreliable | warn | |
| [no-deprecated-api](docs/rules/no-deprecated-api.md) | Deprecated UXP and Photoshop APIs, with the documented replacement | warn | 💡 |
| [no-unsupported-fs-method](docs/rules/no-unsupported-fs-method.md) | `fs` methods UXP doesn't document | error | |
| [no-node-builtin-modules](docs/rules/no-node-builtin-modules.md) | `http`, `child_process`, `net`, … | error | |

🔧 autofix with `--fix` · 💡 editor suggestion. `strict` raises warnings to errors and enables `aria-*` and vendor-prefixed CSS checks.

## In the browser

`eslint-plugin-uxp-lint/browser` (also built as the single file `dist/uxp-lint.browser.mjs`) exports `buildConfig`, `rules`, `configs` and the default plugin with no Node APIs. Pass the manifest in:

```js
import { Linter } from "eslint/universal"; // or eslint-linter-browserify
import { buildConfig } from "eslint-plugin-uxp-lint/browser";
const messages = new Linter().verify(code, buildConfig({ manifest }), { filename: "main.js" });
```

See [INTEGRATION.md](INTEGRATION.md) for the embedding contract (UXP Playground).

## Works alongside

- **Premiere Pro.** Keep Adobe's [`@adobe/eslint-plugin-premierepro`](https://github.com/adobe/eslint-plugin-premierepro) for its Action, lock and transaction rules. This plugin adds the cross-host rules and doesn't copy Adobe's: `export default [premierepro.configs.recommended, ...(await uxpConfig())]`.
- **bubblydoo** [`@bubblydoo/eslint-plugin-uxp`](https://github.com/bubblydoo/uxp-toolkit) can run next to it.
- **Jarda's Validator for UXP** (VS Code) gives in-editor manifest IntelliSense and LESS/SCSS checks. This plugin reuses its MIT-licensed version and CSS tables for CI and other editors.

## Data and how to refresh it

`npm run data:refresh` downloads the latest Adobe UXP documentation, community compatibility data and Photoshop type definitions, then regenerates the tables. This is a maintainer command and requires Git, npm and network access. It stages the output and rejects unexpectedly small tables before replacing local data. Review the resulting diff and run `npm test` before publishing. Linting itself uses the bundled tables and does not access the network. Documentation changes do not automatically create new rules.

The GitHub Actions refresh workflow checks weekly and on manual dispatch. It tests regenerated data and proposes a pull request when there are changes. The repository must allow GitHub Actions to create pull requests. A maintainer reviews and releases the update, and users update their installed npm package to receive it.

`data/*.json` can also be generated from prepared source checkouts with `npm run data -- <sourcesDir>` and should not be hand-edited. Each file has a `$source` block with the repo, file, commit and licence:

| File | Source |
|---|---|
| `host-uxp-versions.json` | jardicc/vscode-uxp-validator `common/versionTable.ts` (MIT) |
| `css.json` | jardicc/vscode-uxp-validator UXP CSS data (MIT) + AdobeDocs/uxp reference-css |
| `uxp-since.json` | AdobeDocs/uxp reference-js `**Since**` lines |
| `fs-methods.json` | AdobeDocs/uxp `Modules/fs/fs.md` |
| `photoshop-min-versions.json` | `@types/photoshop` 27.11.0 `@minVersion` tags (MIT) |

The hand-written facts in `src/data/` (`html.ts`, `web-api.ts`, `curated-since.ts`) each cite a URL. The UXP changelog, the Photoshop changelog, the manifest v4/v5 reference, or a forum thread are labelled `docs` or `community`.

Rule docs are generated by `npm run docs` from rule metadata and `docs/src/rule-docs.mjs`.

## Limits

- Static analysis only. Runtime host bugs (silent batchPlay no-ops, modal races) are out of reach. No rule claims to have been run against a live Photoshop, InDesign or Premiere Pro.
- Modal-scope analysis works within a single file. Code reachable only through imports is "unknown", so it is not reported.
- The CSS data and the host→UXP table come from one community source and Adobe docs. A few entries can lag behind host releases.
- Photoshop min-version data covers Photoshop only. InDesign and Premiere API versions aren't mined yet; UXP-level checks still run for them.
- Multi-host manifests: a file whose path names a host (`ppro.ts`, `src/photoshop/`, `indesign-utils.js`) is checked against that host. Other shared files are held to the newest UXP any listed host ships, so only APIs that no host has are reported. Photoshop-only rules use the first host.
- Projects whose manifest is generated at build time (bolt-uxp) get no version or permission checks until you pass `--manifest`.
- Network domains are matched by host name; the scheme (`http` vs `https`, `ws`/`wss`) isn't checked.
- LESS/SCSS, Vue and Svelte templates aren't parsed. `<script>` in `.vue`/`.svelte` isn't linted unless you add a parser.

## License

MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for data sources.
