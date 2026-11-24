# Embedding eslint-plugin-uxp-lint (UXP Playground and other browser hosts)

## Entry points (stable)

| Import | File | Use |
|---|---|---|
| `eslint-plugin-uxp-lint/browser` | `dist/browser.js` (ESM, bare imports of `@typescript-eslint/utils` etc.) | Bundlers (Vite, webpack) |
| `eslint-plugin-uxp-lint/browser-bundle` | `dist/uxp-lint.browser.mjs` (single file, no imports) | Direct `<script type="module">` / workers |

Both export the same API, unchanged since 0.1.0. Everything listed here is additive:

- `default`: the plugin, with `meta` `{ name: "eslint-plugin-uxp-lint", version, namespace: "uxp-lint" }`, `rules`, `configs`.
- `buildConfig(opts)` returns flat config objects named `uxp-lint/js`, `uxp-lint/css`, `uxp-lint/html` and `uxp-lint/manifest`. They get a ` (<base>)` suffix only when `opts.base` is set.
- `rules`: a map of rule name to rule. `rules[name].meta.docs.url` is the docs page.
- `uxpForHost(app, version)`, `compareVersions(a, b)`, `checkCss`, `checkCssValue`.

No module reachable from these entries imports a `node:` builtin; `tests/integration.test.ts` enforces this and runs the single-file bundle through `Linter` from `eslint/universal`. Both entries were also checked by hand against `eslint-linter-browserify` 10.15.0 (the playground's linter) for JS, CSS, HTML and manifest.json, and the playground's `tests/unit/lint.test.ts` passes against the 0.2.0 build.

## `buildConfig` options

| Option | Notes |
|---|---|
| `manifest` / `manifestText` | The plugin's manifest. Without it, permission, entrypoint and version rules are silent. |
| `host` | `"PS"`, `"ID"` or `"premierepro"`. Overrides `host.app`. |
| `settings` | Merged into `settings.uxp` (see below). The playground passes `{ uxpVersion }` from its UXP selector. |
| `css`, `json`, `htmlParser`, `tsParser`, `tsPlugin` | Optional language plugins. Each block is added only when one is passed. |
| `level` | `"recommended"` (default) or `"strict"`. |
| `base` | Glob prefix for a plugin in a subfolder. |
| `ignores` (new in 0.2.0) | Globs added to every uxp-lint block (not global ignores). |

## `settings.uxp` keys added in 0.2.0

All of these are optional and default to the 0.1 behaviour:

- `reactVersion` (number). With 19 or later, React `onChange` on `sp-*` elements is not reported.
- `styledElements` (string[]). Unsupported elements (`li`, `ul`, `strong`, …) that the project styles. These are not reported, because Adobe documents styling them as the workaround.
- Multi-host manifests: when `settings.uxp.host` is unset and the manifest lists several hosts, `getUxp` picks the host named in the file path (`ppro`/`premiere`, `ps`/`photoshop`, `indesign`) if it is listed. Otherwise it keeps the first host and takes the highest UXP version across hosts. Pass `settings.uxp.host` to pin one host (the playground can keep doing this).
- CLI `--manifest <file>` (Node only).
- `splitSetup` (boolean). Set when `entrypoints.setup()` is spread over several files. Suppresses `entrypoints-match-manifest` "missing handler".
- `lintGenerated` and `lintNodeScripts` (boolean). By default, every rule skips:
  - minified or generated files (a banner, `.min.` names, very long lines)
  - Node scripts (a shebang, `node:` imports, `process.argv/exit/std*`, `require.main`)

  These two keys turn that skip off. A playground editor buffer is normal source, so nothing changes there.

## Behaviour changes that affect what an embedder sees

- **New rules**:
  - `photoshop-await-in-modal` (warn, Photoshop)
  - `no-deprecated-api` (warn)

  Both provide `suggest` fixes (`hasSuggestions: true`). Surface `message.suggestions` as quick fixes if the UI supports them.
- **New messageIds**:
  - `valid-manifest`: `missingRequired`, `invalidVersion`, `nameLength`, `entrypointType`, `duplicateEntrypoint`, `keyOnlyFor`, `sizeOrder`, `invalidPermissionValue`, `wildcardTopLevel`, `manifestVersionTooOld`, `wrongType`
  - `photoshop-modal-scope`: `batchPlayHelperOutsideModal`
  - `photoshop-handle-modal-errors`: `unhandledInHandler`
  - `no-unsupported-css`: `needsCssNext`
- **Fewer reports, for precision**:
  - `photoshop-modal-scope` and `photoshop-handle-modal-errors` now report only code reachable from handlers or top-level code. Exported helpers and unknown callbacks are no longer reported.
  - `api-min-version` ignores Photoshop `@minVersion` tags ≤ 23.0, except `executeAsModal` and `suspendHistory`. It also treats `window.X` probes and `x?.()` as feature detection.
  - `box-sizing: border-box` and `::-webkit-*` are no longer reported by default.
  - `.psjs` scripts skip `photoshop-modal-scope`.
- `valid-manifest` accepts the `entryPoints` spelling and manifests without `entrypoints`.
