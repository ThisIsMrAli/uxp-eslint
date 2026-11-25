// Source of truth for docs/rules/*.md (run `npm run docs`). Every example is linted by tests/docs.test.ts:
// "incorrect" examples must report this rule, "correct" examples must not.
const PS = (minVersion = "24.0.0", over = {}) => ({ manifestVersion: 5, id: "com.example.plugin", name: "Example plugin", version: "1.0.0", main: "index.html", host: { app: "PS", minVersion }, entrypoints: [{ type: "panel", id: "mainPanel" }], ...over });

export const MANIFEST = PS;

export const RULES = {
  "api-min-version": {
    details: "Maps `host.minVersion` to a UXP version with Adobe's host→UXP table, then reports (a) UXP globals and members newer than that version (AdobeDocs `**Since**` lines, e.g. `ResizeObserver` 8.1, `Request` 7.3.0, `uxp.userInfo` 7.3.0, `navigator.clipboard.*` 6.0, plus changelog-only entries such as `localFileSystem.getEntryWithUrl` 6.5 and `navigator.language` 8.0), and (b) for Photoshop, `require(\"photoshop\")` members newer than `host.minVersion` (`@types/photoshop` `@minVersion`). Photoshop tags at or below 23.0 are ignored except `executeAsModal` (22.5) and `suspendHistory` (23.0), because DOM v2 docs tag APIs that already existed in 22.x as 22.5 or 23.0; the Photoshop changelog confirms only those two. With typed linting (`parserOptions.projectService`), any member whose `@types/photoshop` declaration carries `@minVersion` is checked, including through variables. Uses inside `if (x.api)`, ternaries, `try`, `typeof` or optional calls (`x.api?.()`) count as feature-detected.",
    whenNot: "When the plugin does its own runtime version checks through a helper the rule cannot see, set the option or disable the line.",
    incorrect: [
      { code: "const { localFileSystem } = require(\"uxp\").storage;\nconst entry = await localFileSystem.getEntryWithUrl(\"plugin-temp:/out.png\"); // UXP 6.5+, PS 24.2+", manifest: PS("23.3.0") },
      { code: "const ro = new ResizeObserver(onResize); // UXP 8.1+", manifest: PS("24.0.0") },
    ],
    correct: [
      { code: "const { localFileSystem } = require(\"uxp\").storage;\nconst entry = await localFileSystem.getEntryWithUrl(\"plugin-temp:/out.png\");", manifest: PS("24.2.0") },
      { code: "if (window.ResizeObserver) new ResizeObserver(onResize);", manifest: PS("24.0.0") },
    ],
  },
  "entrypoints-match-manifest": {
    details: "Compares the `panels` and `commands` keys of `entrypoints.setup()` with manifest entrypoint ids (`entrypoints` or the `entryPoints` spelling): unknown ids, ids under the wrong section, and manifest entrypoints with no handler. \"No handler\" is skipped when a section uses spreads or computed keys, when `reportMissing: false`, and when `uxpConfig()` finds `entrypoints.setup()` in more than one file (`settings.uxp.splitSetup`).",
    whenNot: "If your setup object is generated at runtime from data, set `reportMissing: false`.",
    incorrect: [
      { code: "const { entrypoints } = require(\"uxp\");\nentrypoints.setup({ panels: { mainPanle: { show() {} } } });", manifest: PS() },
    ],
    correct: [
      { code: "const { entrypoints } = require(\"uxp\");\nentrypoints.setup({ panels: { mainPanel: { show() {} } } });", manifest: PS() },
    ],
  },
  "manifest-permissions": {
    details: "Reads the manifest. Off for manifest v4 (no `requiredPermissions`). Checks: `fetch`/`XMLHttpRequest.open`/`WebSocket`/`Request` hosts vs `network.domains` (host match, `*.` wildcards, `\"all\"`); `shell.openExternal` scheme and `shell.openPath` extension vs `launchProcess` (a folder needs `\"\"`); file pickers need `localFileSystem: \"request\"|\"fullAccess\"`; `fs.*` / `getEntryWithUrl` with paths outside `plugin:`, `plugin-data:`, `plugin-temp:` need `fullAccess`; `navigator.clipboard.*` vs `clipboard`; `pluginManager` vs `ipc.enablePluginCommunication`; `<webview>` vs `webview.allow`/`domains`; `userInfo` vs `enableUserInfo`; `alert/confirm/prompt` vs `featureFlags.enableAlerts` (optional calls such as `window.alert?.()` are treated as feature-detected). Dynamic URLs and paths are only checked for a missing permission block, never guessed.",
    whenNot: "Never needed off for manifest v5+ plugins; the rule is silent without a manifest.",
    incorrect: [
      { code: "const res = await fetch(\"https://api.example.com/v1/items\");", manifest: PS("24.0.0", { requiredPermissions: { network: { domains: ["https://cdn.example.org"] } } }) },
      { code: "require(\"uxp\").shell.openExternal(\"https://example.com\");", manifest: PS() },
    ],
    correct: [
      { code: "const res = await fetch(\"https://api.example.com/v1/items\");", manifest: PS("24.0.0", { requiredPermissions: { network: { domains: ["https://*.example.com"] } } }) },
    ],
  },
  "no-deprecated-api": {
    details: "Reports APIs Adobe documents as deprecated, each with the documented replacement as an editor suggestion: `clipboard.setContent` → `write`, `clipboard.getContent` → `read`, `clipboard.clearContent` → `writeText(\"\")`, `clipboard.writeText(object)` → `write(object)` (UXP 8.0.1 changelog); the `uxpvideoload`/`uxpvideoplay`/`uxpvideocomplete`/`uxpvideopause` video events → `loadeddata`/`play`/`ended`/`pause` (HTMLVideoElement reference); Photoshop `document.compositeChannels` → `componentChannels` (Photoshop changelog; `@types/photoshop` `@deprecated`). Skipped when the replacement is newer than the plugin's minimum host (clipboard below UXP 6.0, componentChannels below PS 24.5). Suggestions, not autofixes, because the replacements are not byte-for-byte identical in every case.",
    whenNot: "If you must support hosts older than the replacement and the rule cannot see your minimum version, disable it.",
    incorrect: [
      { code: "await navigator.clipboard.setContent({ \"text/plain\": text });", manifest: PS() },
      { code: "video.addEventListener(\"uxpvideocomplete\", onDone);", manifest: PS() },
    ],
    correct: [
      { code: "await navigator.clipboard.write({ \"text/plain\": text });", manifest: PS() },
      { code: "video.addEventListener(\"ended\", onDone);", manifest: PS() },
    ],
  },
  "no-node-builtin-modules": {
    details: "Reports `import`/`require`/`import()` of Node-only modules: child_process, cluster, dgram, dns, dns/promises, http, http2, https, inspector, net, readline, readline/promises, repl, tls, tty, v8, vm, worker_threads, fs/promises (also with `node:`). `fs`, `os`, `path`, `process` are not reported (UXP or bundlers provide them). Build scripts and tests (files with a shebang, `node:` imports or `process.argv`) are skipped automatically. Option `allow`.",
    whenNot: "In files that never ship to UXP (build tooling); the CLI and `uxpConfig()` already ignore the usual folders.",
    incorrect: [{ code: "const { exec } = require(\"child_process\");\nexec(\"open .\");" }],
    correct: [{ code: "const { shell } = require(\"uxp\");\nawait shell.openPath(folderPath);" }],
  },
  "no-unsupported-css": {
    details: "For CSS files linted with `@eslint/css` (`language: \"css/css\"`). Properties, single-keyword values, at-rules, pseudo-classes and pseudo-elements, units, functions and media features are checked against the UXP CSS data (jardicc/vscode-uxp-validator, Adobe reference-css, Known Issues). Items absent from the data are `unsupported`; items newer than the target UXP are `newer`; `transform-origin`, `translate`, `scaleX()` and `scaleY()` without `featureFlags.CSSNextSupport` are `needsCssNext` (UXP 8.0.1 changelog). Values UXP already behaves as (`box-sizing: border-box`) are not reported. Options: `ignore` (names, or `prop:value`), `ignoreVendorPrefixed` (default true, also covers `::-webkit-*`), `checkValues` (default true), `ignoreBuildTimeAtRules` (default true: `@tailwind`, `@apply`, `@layer`, …). LESS/SCSS are not parsed.",
    whenNot: "For stylesheets that only run in a WebView (a real browser); the CLI skips `<webview src>` folders automatically.",
    incorrect: [
      { code: ".toolbar { display: flex; gap: 8px; }", filename: "styles.css", manifest: PS() },
      { code: ".fade { transition: opacity 0.2s; }", filename: "styles.css", manifest: PS() },
    ],
    correct: [
      { code: ".toolbar { display: flex; }\n.toolbar > * + * { margin-left: 8px; }", filename: "styles.css", manifest: PS() },
    ],
  },
  "no-unsupported-fs-method": {
    details: "UXP `require(\"fs\")` documents 17 methods: readFile, readFileSync, writeFile, writeFileSync, open, close, read, write, lstat, lstatSync, rename, copyFile, unlink, mkdir, rmdir, readdir, readdirSync. Anything else on the `fs` module (and `fs.promises`, `fs/promises`) is reported, with a replacement hint.",
    whenNot: "If a bundler replaces `fs` with another implementation.",
    incorrect: [{ code: "const fs = require(\"fs\");\nif (fs.existsSync(path)) run();" }],
    correct: [{ code: "const fs = require(\"fs\");\nconst stat = await fs.lstat(path).catch(() => null);" }],
  },
  "no-unsupported-html": {
    details: "Works on HTML parsed by `@html-eslint/parser` and on JSX. Reports elements Adobe lists as unsupported (`ul`, `ol`, `li`, `i`, `em`, `strong`, `q`, `blockquote`, `pre`, `code`, `title`) unless they are styled (a class/style attribute, or a type selector in the project's CSS: Adobe's documented workaround, detected by `uxpConfig()` as `settings.uxp.styledElements`); unsupported global attributes (`hidden`, `contenteditable`, `dir`, `spellcheck`, …; `aria-*` only with `aria: true`; custom elements such as `sp-*` are skipped); `<input type=file|color>`; `<label for>`/`htmlFor`; forms that are not `method=\"dialog\"`; `<textarea rows/cols>`; `<option>` without `value` or with `disabled`; `<select value>`; inline `on*` handlers in HTML; JSX `defaultValue`; and React `onChange` on `sp-*` (React before 19 does not forward it to web components; detected from package.json as `settings.uxp.reactVersion`). Options: `elements`, `attributes`, `aria`, `inlineHandlers`, `ignore` (message ids or names).",
    whenNot: "For HTML that only runs inside a WebView.",
    incorrect: [
      { code: "<label for=\"name\">Name</label><input id=\"name\">", filename: "index.html", manifest: PS() },
      { code: "<select><option>One</option></select>", filename: "index.html", manifest: PS() },
    ],
    correct: [
      { code: "<label>Name <input id=\"name\"></label>", filename: "index.html", manifest: PS() },
      { code: "<select><option value=\"one\">One</option></select>", filename: "index.html", manifest: PS() },
    ],
  },
  "no-unsupported-inline-style": {
    details: "Same data as `no-unsupported-css`, for JSX `style={{ … }}` keys, `el.style.prop = …` and `el.style.setProperty(\"prop\", …)`.",
    whenNot: "For code that renders into a WebView.",
    incorrect: [{ code: "const row = <div style={{ display: \"flex\", gap: 8 }} />;", manifest: PS() }],
    correct: [{ code: "const row = <div style={{ display: \"flex\" }} />;", manifest: PS() }],
  },
  "no-unsupported-web-api": {
    details: "Reports `MutationObserver`, `matchMedia`, `performance.measure` (community-reported as unavailable; turn off with `community: false`), `keypress` listeners and handlers (docs), scripts or inline handlers in `innerHTML` strings (docs), and `localStorage`/`sessionStorage` in `.psjs`/`.idjs` scripts (docs: scripts have no persistent storage). Feature-detected uses (`typeof X`, `if (window.X)`, `window.X?.()`, `try`) are allowed.",
    whenNot: "If you ship a polyfill for the reported API.",
    incorrect: [{ code: "const mq = window.matchMedia(\"(prefers-color-scheme: dark)\");" }],
    correct: [{ code: "const mq = window.matchMedia?.(\"(prefers-color-scheme: dark)\");" }],
  },
  "photoshop-await-in-modal": {
    details: "Inside a function passed to `core.executeAsModal`, reports `batchPlay()` and `hostControl.suspendHistory()/resumeHistory()` whose promise is dropped when nothing later in the function is awaited, and `list.forEach(async …)` (forEach never waits). Adobe: the target function \"can be asynchronous, but care should be given to ensure it does not return early\": once it settles, Photoshop leaves the modal state. Offers an \"Add await\" suggestion. Warning by default.",
    whenNot: "Never for Photoshop plugins; it is silent for other hosts.",
    incorrect: [
      { code: "const { core, action } = require(\"photoshop\");\nawait core.executeAsModal(async () => {\n  action.batchPlay([{ _obj: \"make\", _target: [{ _ref: \"layer\" }] }], {});\n}, { commandName: \"New layer\" });", manifest: PS() },
      { code: "const { core, action } = require(\"photoshop\");\nawait core.executeAsModal(async () => {\n  layers.forEach(async (l) => { await action.batchPlay([hide(l)], {}); });\n}, { commandName: \"Hide\" });", manifest: PS() },
    ],
    correct: [
      { code: "const { core, action } = require(\"photoshop\");\nawait core.executeAsModal(async () => {\n  await action.batchPlay([{ _obj: \"make\", _target: [{ _ref: \"layer\" }] }], {});\n}, { commandName: \"New layer\" });", manifest: PS() },
      { code: "const { core, action } = require(\"photoshop\");\nawait core.executeAsModal(async () => {\n  for (const l of layers) await action.batchPlay([hide(l)], {});\n}, { commandName: \"Hide\" });", manifest: PS() },
    ],
  },
  "photoshop-handle-modal-errors": {
    details: "Reports `core.executeAsModal()` whose rejection is lost: a floating call (statement or `void`) with no `.catch()`/two-argument `.then()`, outside `try`; and an `await` without `try/catch` directly inside an event handler, `entrypoints.setup` handler or top-level code, where no caller can catch it. Awaits inside other functions, `return await`, and promises that are stored or passed on are left to the caller. It rejects when another plugin already holds the modal state (\"host is in a modal state\").",
    whenNot: "If a global `unhandledrejection` strategy reports these errors to the user.",
    incorrect: [
      { code: "const { core } = require(\"photoshop\");\nbutton.addEventListener(\"click\", () => {\n  core.executeAsModal(run, { commandName: \"Run\" });\n});", manifest: PS() },
    ],
    correct: [
      { code: "const { core } = require(\"photoshop\");\nbutton.addEventListener(\"click\", async () => {\n  try { await core.executeAsModal(run, { commandName: \"Run\" }); }\n  catch (e) { showError(e); }\n});", manifest: PS() },
    ],
  },
  "photoshop-modal-scope": {
    details: "Photoshop only; off for apiVersion 1 (explicit `host.data.apiVersion: 1`, or minVersion below 23.0.0 per Adobe's documented default) and in `.psjs` scripts (they already run modally). Reports state changes that run outside `core.executeAsModal`/`suspendHistory`: batchPlay descriptors whose `_obj` is not `get`/`multiGet` (inline, in `const` variables, spread arrays, or passed to a same-file helper that forwards them to batchPlay), Photoshop DOM methods that modify documents (`createLayer`, `flatten`, `resizeImage`, …) and Layer/Document setters (`opacity`, `name`, `visible`, …). It builds a same-file call graph: code reachable from an executeAsModal target, from a wrapper that forwards its argument to executeAsModal, or from a function that uses an `executionContext` (`ctx.hostControl`, `reportProgress`) is modal; only code reachable from event handlers, `.onX =` assignments, `entrypoints.setup` handlers or top-level code is reported. Exported helpers and callbacks passed to unknown functions are never judged. Options: `extraModifyingMethods`, `readOnlyDescriptors`, `checkDomMethods`.",
    whenNot: "For apiVersion 1 plugins (the rule turns itself off).",
    incorrect: [
      { code: "const { action } = require(\"photoshop\");\nconst MAKE_LAYER = { _obj: \"make\", _target: [{ _ref: \"layer\" }] };\nbutton.addEventListener(\"click\", () => action.batchPlay([MAKE_LAYER], {}));", manifest: PS() },
      { code: "const { app } = require(\"photoshop\");\nbutton.onclick = () => { app.activeDocument.activeLayers[0].opacity = 50; };", manifest: PS() },
    ],
    correct: [
      { code: "const { core, action } = require(\"photoshop\");\nconst MAKE_LAYER = { _obj: \"make\", _target: [{ _ref: \"layer\" }] };\nbutton.addEventListener(\"click\", () =>\n  core.executeAsModal(() => action.batchPlay([MAKE_LAYER], {}), { commandName: \"New layer\" }).catch(console.error));", manifest: PS() },
    ],
  },
  "valid-manifest": {
    details: "Runs on `manifest.json` with `@eslint/json`. From Adobe's manifest v4/v5 reference: required keys (`manifestVersion`, `id`, `name`, `version`, `host`; `entrypoints` may be omitted, as in Adobe's invisible-plugin sample), `version` format (v4: three segments 0-99; v5+: semver), `name` 3-45 characters, entrypoint `type` `panel`/`command`, duplicate entrypoint ids, panel-only size keys on commands and `shortcut` on panels, `minimumSize` larger than `maximumSize`, `clipboard`/`localFileSystem`/`webview.allow` values, boolean `enableUserInfo`/`ipc.enablePluginCommunication`, `requiredPermissions`/`webview` before manifest v5, a missing `host.minVersion`, unknown `host.app`. From the UXP 7.4 changelog: wildcards at the top-level domain (`https://*.com`). From the forum: `main` inside an entrypoint. Autofix: whitespace `launchProcess.extensions` entries become `\"\"`. Option `reportUnknownHostVersion` (default false). XD manifest v3 files (`uiEntrypoints`) are not held to v4+ requirements.",
    whenNot: "Never; it only runs on files named manifest.json.",
    incorrect: [
      { code: JSON.stringify(PS("24.0.0", { requiredPermissions: { clipboard: "write" } }), null, 2), filename: "manifest.json" },
      { code: JSON.stringify(PS("24.0.0", { requiredPermissions: { network: { domains: ["https://*.com"] } } }), null, 2), filename: "manifest.json" },
    ],
    correct: [
      { code: JSON.stringify(PS("24.0.0", { requiredPermissions: { clipboard: "readAndWrite", network: { domains: ["https://*.example.com"] } } }), null, 2), filename: "manifest.json" },
    ],
  },
};
