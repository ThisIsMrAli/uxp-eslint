# Real-sample run

How it was run: `npm run build && scripts/real-samples.sh <clones>`, using the CLI defaults (recommended preset, one config per manifest found). The ESLint version was 10.15.0. The JSON files in this folder list only the files that got messages, and paths are relative to each repo.

| Repo | Commit | Files linted | Messages |
|---|---|---:|---:|
| [AdobeDocs/uxp-photoshop-plugin-samples](https://github.com/AdobeDocs/uxp-photoshop-plugin-samples) (26 manifests) | d937f1a36f3a | 124 | 16 |
| [AdobeDocs/uxp-premiere-pro-samples](https://github.com/AdobeDocs/uxp-premiere-pro-samples) | a6172f151f84 | 42 | 2 |
| [AdobeDocs/uxp-indesign-samples](https://github.com/AdobeDocs/uxp-indesign-samples) | 0536fb87cc74 | 29 | 5 |
| [hyperbrew/bolt-uxp](https://github.com/hyperbrew/bolt-uxp) (template, manifest generated at build) | aca28034b617 | 29 | 11 |

Each finding below is judged against the documentation or data. **None of them has been confirmed inside Photoshop, InDesign or Premiere Pro.**

## Photoshop samples (16)

| Finding | Verdict |
|---|---|
| `photoshop-handle-modal-errors` ×4 (cross-compatible:117, neural-filter:39, vanilla-js:81, :94). `executeAsModal` is called without await, try/catch or .catch. | True positive: an unhandled rejection happens when PS is already modal. |
| `api-min-version` ×3 in neural-filter-sample. The manifest has minVersion 22.0.0 but the code uses `action.addNotificationListener` (23.0), `core.executeAsModal` (22.5) and `app.batchPlay` (23.0). | True per `@types/photoshop` @minVersion. Needs a check on PS 22.0, because the typings may be conservative. |
| `photoshop-modal-scope` ×1: `createDocument()` outside `executeAsModal` in web-service-call-js-sample (apiVersion 2 by default because minVersion ≥ 23). | True positive per Adobe's apiVersion 2 docs. |
| `outline-radius` ×2 (ui-react-starter) | True. It is a non-standard property. |
| `background-position` (unsplash sample, UXP 3.4.2) | True per the data. Needs a host check. |
| `font-weight: italic` (wasm-rust-sample) | True. This is an authoring bug. |
| `<title>` ×3, `<code>` in JSX | Backed by the docs. These are low-severity warnings. |

## Premiere Pro samples (2)

- `gap` in metadata-handler/styles.css is flagged because Jarda's data marks it unsupported in UXP 8.1.0. *Update (hardening pass):* a forum thread ([does-css-gap-work-in-uxp-panels-for-prpro/11310](https://forums.creativeclouddeveloper.com/t/does-css-gap-work-in-uxp-panels-for-prpro/11310)) reports `gap` not taking effect in Premiere panels, so this report is kept as a true positive and the thread is cited in the rule's sources.
- `<em>` in premiere-api/public/index.html is backed by the docs.

## InDesign samples (5)

- `<title>` ×3 are true.
- Inline `onclick` ×2 in webview-sample/Receiver/index.html is a **false positive in context**. That page is loaded inside a WebView, which is a real browser, so it is not UXP DOM. Workaround: `--ignore "**/Receiver/**"` or an `ignores` entry.

## bolt-uxp (11)

- src/app.css: `transition`, `place-items`, `color-scheme`, `font-synthesis`, `text-rendering`, `:focus-visible` (6) are true per the data. Vite's default CSS was never trimmed.
- index.html `<title>` is true.
- vite-uxp-plugin/src (fs-method ×2, node-builtin ×2) are **false positives in context**. This is Node build tooling in a nested package. Workaround: `--ignore "vite-uxp-plugin/**"`.

## Noise fixed during this run

The first pass produced these false positives, which were fixed in the rules or the CLI and are covered by tests:

- `fill: currentColor`: values are now checked only for enum-only properties.
- Legacy `:after`: now treated as a pseudo-element.
- `@tailwind` / `@apply`: build-time at-rules are ignored.
- `dir` on `<sp-theme>`: the global-attribute check is skipped on custom elements.
- `return await executeAsModal(...)`: now counted as handled.
- Unknown host-version warnings: now opt-in.
- Manifests in `plugin/`: the parent project is now linted.
- Node `scripts/`, `server/`, `webview-ui/`: ignored by the CLI.
- `@typescript-eslint/*` disable comments: the plugin is registered and unused-directive reports are turned off.

`manifest-permissions` reported nothing here, because most Adobe samples use manifest v4, which has no permission model. The fixture plugin in `tests/fixtures/ps-bad` covers that rule.
