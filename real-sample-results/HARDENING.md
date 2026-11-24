# Hardening pass (0.2.0)

Done 2026-11-24 (Asia/Tehran). Everything here is static analysis of public source code. Nothing was run inside Photoshop, InDesign or Premiere Pro.

## Corpus

- **47 public repositories, 65 UXP plugins, 871 linted files.** The repo URL and commit for each are in [PROJECTS.md](PROJECTS.md); the GitHub search hits are in [corpus-list.txt](corpus-list.txt); the runner is [run-corpus.sh](run-corpus.sh).
- Coverage:
  - AdobeDocs samples (Photoshop, InDesign, Premiere Pro) and adobe/uxp-optimized.
  - hyperbrew/bolt-uxp plus a bolt heatmap plugin.
  - React, Vue 3, Svelte, webpack, esbuild and TypeScript starters.
  - Production plugins: jardicc/alchemist, tokyosheep/documentBoard, wamsoft psdexport, OK-Record, ComfyPanel, Premiere folder watcher and others.
  - InDesign script snippet collections.
  - A CEP→UXP port.
- Forum cases from forums.creativeclouddeveloper.com, used as false-negative and false-positive probes:
  - [8224](https://forums.creativeclouddeveloper.com/t/localfilesystem-getentrywithurl-is-not-a-function/8224)
  - [11310](https://forums.creativeclouddeveloper.com/t/does-css-gap-work-in-uxp-panels-for-prpro/11310)
  - [11898](https://forums.creativeclouddeveloper.com/t/trying-to-fix-require-is-not-a-function/11898)
- Command: `node dist/cli.js <repo> --format json`, with the recommended preset and zero config.

## Results

| | First run (0.1.0) | Final (0.2.0) |
|---|--:|--:|
| Messages across corpus | 1201 | 341 |
| Crashes | 0 | 0 |
| Parse errors | 3 | 2 (both real: JavaScript inside `index.css`) |
| Time per repo | — | 0.5–2.9 s |

### Triage by category

**False positives removed: about 860 messages.** All were fixed in code, and each has a regression test in `tests/rules/hardening.test.ts`, `tests/node-utils.test.ts` or `tests/rules/misc.test.ts`.

| Cause | Rules hit | Fix |
|---|---|---|
| Generated, minified, vendored and build output linted as source | css, html, all JS | File-kind detection: banners (including `//` banners), `.min.*`, dist/build/out, and lockstep with the manifest's `main` |
| CEP panels, ExtendScript, Node tooling (vite-uxp-plugin, build scripts), WebView content linted as UXP | node-builtin 23→0, fs-method 34→0, web-api 1→0 | Folder classification by manifest, deps (`ws`, `archiver`, `chokidar`, `fs-extra`, `@types/node`) and file content. UXP type packages (`@types/photoshop`, `@adobe/*`) are exempt so bolt-uxp-utils is still linted |
| Modal-scope: helpers reached only from executeAsModal were reported | modal-scope 11→1 | Same-file call graph (`modal`/`root`/`unknown`); unknown means silent. Covers variables, helper functions and functions passed by reference |
| `.psjs` scripts reported for modal scope | modal-scope | `.psjs` already runs modal (forum 11898) |
| Feature probes (`if (window.ResizeObserver)`, `const RO = window.X`) | api-min-version | Probe and guard detection |
| Errors already handled by the caller or wrapper | handle-modal-errors 23→7 | Reach through try/catch, `.catch`, and awaited wrappers |
| `entrypoints.setup()` split across files (Alchemist) | entrypoints missingHandler | `splitSetup` auto-detected from the project |
| `entryPoints` spelling, Adobe's invisible sample with no entrypoints, legacy XD v3 manifests | valid-manifest | Accepted or exempt |
| CSS: `box-sizing`, `::-webkit-*` scrollbars, styled `<li>`, React 19 attributes, BOM manifests | css, html | Data corrections and BOM-safe parsing |
| Multi-host manifests: Premiere-only code checked against Photoshop minimums (bolt-uxp-utils `ppro.ts`) | api-min-version, Photoshop rules | Host hint from the file path. Otherwise the most lenient UXP version across hosts |

**True positives kept: 341 messages.** Each is backed by Adobe docs or by the cited data.

| Category | Count |
|---|--:|
| CSS unsupported (gap 44 + 5 inline, transition 32, user-select 14, `:not` 8, box-shadow 7, …) | 161 + 13 inline |
| CSS newer than manifest minimum | 29 |
| HTML unsupported element (`<li>` 31, `<title>` 22, …) | 64 |
| HTML label-for / option value / default value / attribute / input type / inline handler / textarea size | 10 / 10 / 5 / 6 / 4 / 4 / 2 |
| API newer than host minimum (Photoshop imaging, etc.) | 10 + 1 UXP |
| Unhandled modal errors | 7 |
| Entrypoints vs manifest | 5 |
| Deprecated clipboard API (RolandDreger snippets, wamsoft) | 2 |
| Missing `enableAlerts` feature flag | 2 |
| Floating batchPlay in an executeAsModal target (Adobe's cross-compatible sample) | 1 |
| DOM / createDocument outside modal (web-service sample, min 23.0 → apiVersion 2) | 1 |
| Manifest problems (main path, v4 permissions) | 2 |

Items marked *data-backed, not runtime-verified*: CSS that is absent from both Adobe's reference-css list and the community data, such as `user-select` and `overflow-wrap`. `gap` is kept as a true positive because of forum 11310.

**False negatives found and fixed:**
- `localFileSystem.getEntryWithUrl` needs UXP 6.5.0 (forum 8224; UXP changelog).
- `navigator.language` needs UXP 8.0.1.
- Floating `batchPlay`, `suspendHistory` and `async forEach` inside executeAsModal targets. Adobe's docs warn the target must not return early. Handled by the new rule `photoshop-await-in-modal`.
- Deprecated `Clipboard.setContent/getContent/clearContent`, `writeText(object)`, `uxpvideo*` events and `compositeChannels`. Handled by the new rule `no-deprecated-api`.
- `scaleX`/`scaleY`, `translate` and `transform-origin` used without the `CSSNextSupport` feature flag.
- Manifest completeness:
  - required keys
  - v4 version format
  - name length
  - entrypoint type, duplicates, and panel-only or command-only keys
  - min ≤ max sizes
  - permission values
  - top-level wildcard domains (disallowed since UXP 7.4)
  - manifestVersion < 4

**Edge cases checked:**
- Malformed and BOM manifests: reported with no stack trace, CLI exit 2 when the manifest is unreadable.
- TS, TSX, JSX, mixed ESM/CJS.
- Minified bundles: skipped.
- An 8000-line file: the modal graph went from 30 s to 2.8 s, and a perf test guards it.
- CSS files containing JS: parse error, no crash.

## New and changed rules

- **New:** `photoshop-await-in-modal` (warn, suggestions), `no-deprecated-api` (warn; error in strict; suggestions).
- **Changed:**
  - `valid-manifest`: 11 new checks.
  - `no-unsupported-css`: `needsCssNext`.
  - `api-min-version`: curated, cited "since" data and probe detection.
  - `photoshop-modal-scope`: reach graph and `.psjs`.
  - `entrypoints-match-manifest`: `entryPoints`, `splitSetup`.
- Every rule cites its sources: AdobeDocs commits, the UXP/Photoshop changelogs and forum threads. See `src/data/sources.ts`.

## Developer experience

- CLI:
  - Stylish output with a summary and docs links.
  - `github` and `json` formats; `sarif` with rules, helpUri, ruleIndex and relative URIs for code scanning.
  - `--fix` count, `--quiet`, `--max-warnings`, `--manifest`, `--rules`.
  - `--init`, which never overwrites a config.
  - Exit codes 0/1/2; crash output is short unless `DEBUG=1`.
- Docs:
  - Generated rule pages (`npm run docs`) with incorrect and correct examples. A test checks that every example behaves as documented.
  - README covers VS Code setup and a GitHub Actions recipe (annotations plus SARIF upload).
  - INTEGRATION.md documents the playground-facing changes.
- Browser bundle: `dist/browser.js` and `dist/uxp-lint.browser.mjs` keep the same exports. Both are checked with the playground's `eslint-linter-browserify` (JS, CSS, HTML, manifest); the playground's `tests/unit/lint.test.ts` passes (14/14).

## Tests

375 tests in 13 files (vitest), all passing.

## Known limits

- Per-file analysis. Code reachable only through imports is "unknown" and is not reported.
- Version and permission checks for bolt-uxp projects need `--manifest dist/manifest.json` (the manifest is generated at build time).
- Network permission matching ignores the scheme (`http` vs `https`, `ws`/`wss`).
- Photoshop API version data is mined; InDesign and Premiere API versions are not (UXP-level checks still run).
- CSS and HTML data come from Adobe docs plus one community dataset. Items absent from both are reported as data-backed, not runtime-verified.
- Rule docs URLs point to github.com/ThisIsMrAli/uxp-eslint, which doesn't exist yet.
