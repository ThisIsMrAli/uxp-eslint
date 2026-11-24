/**
 * Regression tests distilled from real UXP projects and forum threads (see real-sample-results/HARDENING.md).
 * Snippets are minimal re-typings of the pattern, not copies of the projects' code.
 */
import { cssTester, jsTester, jsonTester, htmlTester, rule, manifest, settings } from "../helpers.js";

const ps = (minVersion: string, over: Record<string, unknown> = {}) => settings(manifest({ host: { app: "PS", minVersion }, ...over }));

// ---------------------------------------------------------------- photoshop-await-in-modal (new)
jsTester().run("photoshop-await-in-modal", rule("photoshop-await-in-modal"), {
  valid: [
    "const { core, action } = require('photoshop'); await core.executeAsModal(async () => { await action.batchPlay([{ _obj: 'set' }], {}); }, { commandName: 'x' });",
    "const { core, action } = require('photoshop'); core.executeAsModal(() => action.batchPlay([{ _obj: 'set' }], {}), { commandName: 'x' });",
    "const { core, action } = require('photoshop'); core.executeAsModal(async () => { return action.batchPlay([{ _obj: 'set' }], {}); }, { commandName: 'x' });",
    // a later await keeps the modal scope open while queued calls run
    "const { core, action } = require('photoshop'); core.executeAsModal(async () => { action.batchPlay([a], {}); await action.batchPlay([b], {}); }, { commandName: 'x' });",
    "const { core, action } = require('photoshop'); core.executeAsModal(async () => { const p = action.batchPlay([a], {}); await p; }, { commandName: 'x' });",
    // batchPlay outside the target function is another rule's business
    "const { action } = require('photoshop'); action.batchPlay([a], {});",
    "const { core } = require('photoshop'); core.executeAsModal(async () => { [1, 2].forEach((x) => console.log(x)); }, { commandName: 'x' });",
    "const { core } = require('photoshop'); core.executeAsModal(async (ctx) => { await ctx.hostControl.suspendHistory({ documentID: 1, name: 'n' }); }, { commandName: 'x' });",
    { code: "const { core, action } = require('photoshop'); core.executeAsModal(async () => { action.batchPlay([a], {}); }, { commandName: 'x' });", settings: settings(manifest({ host: { app: "ID", minVersion: "18.5.0" } })) },
  ],
  invalid: [
    {
      code: "const { core, action } = require('photoshop'); core.executeAsModal(async () => { action.batchPlay([{ _obj: 'set' }], {}); }, { commandName: 'x' });",
      errors: [{ messageId: "floating", data: { name: "batchPlay" }, suggestions: [{ messageId: "addAwait", output: "const { core, action } = require('photoshop'); core.executeAsModal(async () => { await action.batchPlay([{ _obj: 'set' }], {}); }, { commandName: 'x' });" }] }],
    },
    {
      code: "const { core } = require('photoshop'); const { batchPlay } = require('photoshop').action; async function run(ctx) { await doStuff(); batchPlay([d], {}); } core.executeAsModal(run, { commandName: 'x' });",
      errors: [{ messageId: "floating", suggestions: [{ messageId: "addAwait", output: "const { core } = require('photoshop'); const { batchPlay } = require('photoshop').action; async function run(ctx) { await doStuff(); await batchPlay([d], {}); } core.executeAsModal(run, { commandName: 'x' });" }] }],
    },
    {
      code: "const { core } = require('photoshop'); core.executeAsModal(async (ctx) => { const id = await ctx.hostControl.suspendHistory({ documentID: 1, name: 'n' }); await work(); ctx.hostControl.resumeHistory(id); }, { commandName: 'x' });",
      errors: [{ messageId: "floating", data: { name: "resumeHistory" }, suggestions: [{ messageId: "addAwait", output: "const { core } = require('photoshop'); core.executeAsModal(async (ctx) => { const id = await ctx.hostControl.suspendHistory({ documentID: 1, name: 'n' }); await work(); await ctx.hostControl.resumeHistory(id); }, { commandName: 'x' });" }] }],
    },
    {
      code: "const { core, action } = require('photoshop'); core.executeAsModal(async () => { layers.forEach(async (l) => { await action.batchPlay([{ _obj: 'set', layer: l }], {}); }); }, { commandName: 'x' });",
      errors: [{ messageId: "asyncForEach" }],
    },
  ],
});

// ---------------------------------------------------------------- no-deprecated-api (new)
jsTester().run("no-deprecated-api", rule("no-deprecated-api"), {
  valid: [
    "navigator.clipboard.write({ 'text/plain': 'x' }); navigator.clipboard.writeText('x'); navigator.clipboard.read();",
    "video.addEventListener('loadeddata', f); video.addEventListener('ended', f);",
    "store.getContent(); editor.setContent('x');",
    { code: "navigator.clipboard.setContent({ 'text/plain': 'x' })", settings: settings(manifest({ host: { app: "PS", minVersion: "22.0.0" } })) },
    { code: "const c = doc.compositeChannels", settings: settings(manifest({ host: { app: "PS", minVersion: "23.0.0" } })) },
    { code: "const c = doc.compositeChannels", settings: settings(manifest({ host: { app: "ID", minVersion: "18.5.0" } })) },
  ],
  invalid: [
    { code: "navigator.clipboard.setContent({ 'text/plain': 'x' })", errors: [{ messageId: "clipboard", suggestions: [{ messageId: "replace", output: "navigator.clipboard.write({ 'text/plain': 'x' })" }] }] },
    { code: "const clipboard = navigator.clipboard; clipboard.getContent()", errors: [{ messageId: "clipboard", suggestions: [{ messageId: "replace", output: "const clipboard = navigator.clipboard; clipboard.read()" }] }] },
    { code: "navigator.clipboard.clearContent()", errors: [{ messageId: "clipboard", suggestions: [{ messageId: "replace", output: "navigator.clipboard.writeText(\"\")" }] }] },
    // Adobe's own manifest v5 guide still shows this form
    { code: "navigator.clipboard.writeText({ 'text/plain': 'Sample text' })", errors: [{ messageId: "clipboardObject", suggestions: [{ messageId: "replace", output: "navigator.clipboard.write({ 'text/plain': 'Sample text' })" }] }] },
    { code: "video.addEventListener('uxpvideocomplete', done)", errors: [{ messageId: "videoEvent", data: { name: "uxpvideocomplete", use: "ended" }, suggestions: [{ messageId: "replace", output: "video.addEventListener('ended', done)" }] }] },
    { code: "const ch = app.activeDocument.compositeChannels", settings: settings(manifest({ host: { app: "PS", minVersion: "25.0.0" } })), errors: [{ messageId: "compositeChannels", suggestions: [{ messageId: "replace", output: "const ch = app.activeDocument.componentChannels" }] }] },
  ],
});

// ---------------------------------------------------------------- photoshop-modal-scope: real-world shapes
jsTester().run("photoshop-modal-scope (real-world)", rule("photoshop-modal-scope"), {
  valid: [
    // .psjs scripts already run modally (forum 11898)
    { code: "const { app } = require('photoshop'); app.activeDocument.activeLayers[0].visible = false;", filename: "script.psjs" },
    // ComfyClean shape: helper takes an executionContext and uses hostControl => it runs modally
    "const { action } = require('photoshop'); export async function apply(ctx) { const id = await ctx.hostControl.suspendHistory({ documentID: 1, name: 'x' }); await action.batchPlay([{ _obj: 'set' }], {}); }",
    // ComfyClean shape: a `modal(fn)` wrapper that forwards its parameter to executeAsModal
    "const { core, action } = require('photoshop'); const modal = (fn) => core.executeAsModal(fn, { commandName: 'x' }); btn.addEventListener('click', () => modal(async () => { await action.batchPlay([{ _obj: 'set' }], {}); }));",
    // zgmrclick shape: exported helpers are called from somewhere we cannot see
    "const { action } = require('photoshop'); export async function fill(color) { await action.batchPlay([{ _obj: 'fill', using: color }], {}); }",
    // descriptor held in a const whose _obj is read-only
    "const { action } = require('photoshop'); const GET = { _obj: 'get', _target: [{ _ref: 'document', _enum: 'ordinal' }] }; btn.onclick = () => action.batchPlay([GET], {});",
  ],
  invalid: [
    // descriptor in a variable (beyond inline literals)
    { code: "const { action } = require('photoshop'); const MAKE = { _obj: 'make', _target: [{ _ref: 'layer' }] }; btn.addEventListener('click', () => action.batchPlay([MAKE], {}));", errors: [{ messageId: "batchPlayOutsideModal" }] },
    // descriptor list spread from a const array
    { code: "const { action } = require('photoshop'); const STEPS = [{ _obj: 'set' }]; btn.onclick = async () => { await action.batchPlay([...STEPS], {}); };", errors: [{ messageId: "batchPlayOutsideModal" }] },
    // a same-file batchPlay helper called from a click handler
    { code: "const { action } = require('photoshop'); async function play(desc) { return action.batchPlay([desc], {}); } btn.addEventListener('click', () => play({ _obj: 'delete' }));", errors: [{ messageId: "batchPlayHelperOutsideModal" }] },
    // named handler function with a setter
    { code: "const { app } = require('photoshop'); async function hide() { app.activeDocument.activeLayers[0].visible = false; } document.querySelector('#b').addEventListener('click', hide);", errors: [{ messageId: "setterOutsideModal" }] },
  ],
});

// ---------------------------------------------------------------- photoshop-handle-modal-errors: real-world shapes
jsTester().run("photoshop-handle-modal-errors (real-world)", rule("photoshop-handle-modal-errors"), {
  valid: [
    // awaited inside an exported helper: the caller gets the rejection
    "const { core } = require('photoshop'); export async function run(fn) { await core.executeAsModal(fn, { commandName: 'x' }); }",
    "const { core } = require('photoshop'); export const run = (fn) => core.executeAsModal(fn, { commandName: 'x' }).catch(console.error);",
  ],
  invalid: [
    // documentBoard shape: a floating executeAsModal inside new Promise
    { code: "const { core } = require('photoshop'); export const open = (p) => new Promise((resolve) => { core.executeAsModal(async () => { await work(p); resolve(); }, { commandName: 'x' }); });", errors: [{ messageId: "unhandled" }] },
  ],
});

// ---------------------------------------------------------------- api-min-version: forum-reported gaps
jsTester().run("api-min-version (forum)", rule("api-min-version"), {
  valid: [
    { code: "const { localFileSystem } = require('uxp').storage; localFileSystem.getEntryWithUrl('plugin-temp:/x');", settings: ps("24.2.0") },
    { code: "navigator.language", settings: ps("26.0.0") },
    { code: "const navigator = {}; navigator.language", settings: ps("24.0.0") },
    // DOM v2 @minVersion tags of 23.0 on APIs that existed in 22.x are not reported (floor policy)
    { code: "const { app } = require('photoshop'); app.activeDocument.name", settings: ps("22.0.0") },
    { code: "window.matchMedia?.('(prefers-color-scheme: dark)')", settings: ps("23.0.0") },
    // the feature probe itself is not a use
    { code: "if (window.ResizeObserver) new ResizeObserver(f);", settings: ps("24.0.0") },
    { code: "const RO = window.ResizeObserver; if (RO) new RO(f);", settings: ps("24.0.0") },
  ],
  invalid: [
    // forum 8224: "getEntryWithUrl method has been supported from Photoshop 24.2, UXP version 6.5"
    { code: "const { localFileSystem } = require('uxp').storage; localFileSystem.getEntryWithUrl('plugin-temp:/x');", settings: ps("23.3.0"), errors: [{ message: /`localFileSystem\.getEntryWithUrl` needs UXP 6\.5\.0\+/ }] },
    { code: "const fs = require('uxp').storage.localFileSystem; fs.getEntryWithUrl('plugin-temp:/x');", settings: ps("23.3.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "console.log(navigator.language)", settings: ps("25.0.0"), errors: [{ messageId: "uxpTooOld" }] },
    { code: "new window.ResizeObserver(f);", settings: ps("24.0.0"), errors: [{ messageId: "uxpTooOld" }] },
  ],
});

// ---------------------------------------------------------------- manifest-permissions / web api
jsTester().run("manifest-permissions (real-world)", rule("manifest-permissions"), {
  valid: [
    // feature-detected optional calls are not used unconditionally
    { code: "window.prompt?.('Name?')", settings: settings() },
  ],
  invalid: [
    // kerf / alchemist shape: alert without featureFlags.enableAlerts
    { code: "alert('done')", settings: ps("25.0.0"), errors: [{ messageId: "missingEnableAlerts" }] },
  ],
});

// ---------------------------------------------------------------- CSS: real-world noise and CSSNextSupport
cssTester().run("no-unsupported-css (real-world)", rule("no-unsupported-css"), {
  valid: [
    // UXP is always border-box (reference-css quirks)
    { code: "*, *::before { box-sizing: border-box; }", settings: ps("24.0.0") },
    // vendor pseudo-elements follow ignoreVendorPrefixed
    { code: "::-webkit-scrollbar { width: 6px; }", settings: ps("24.0.0") },
    { code: ".a { transform-origin: center; }", settings: ps("26.0.0", { featureFlags: { CSSNextSupport: true } }) },
    { code: ".a { translate: 4px 0; }", settings: ps("26.0.0", { featureFlags: { CSSNextSupport: ["transformProperties"] } }) },
    { code: ".a { transform: scaleX(2); }", settings: ps("26.0.0", { featureFlags: { enableSWCSupport: true } }) },
  ],
  invalid: [
    // forum 11310: gap does not work in UXP panels
    { code: ".row { display: flex; gap: 8px; }", settings: ps("25.0.0"), errors: [{ messageId: "unsupported" }] },
    { code: ".a { transform-origin: center; }", settings: ps("26.0.0"), errors: [{ messageId: "needsCssNext" }] },
    { code: ".a { transform: scaleX(2); }", settings: ps("26.0.0", { featureFlags: { CSSNextSupport: ["transformProperties"] } }), errors: [{ messageId: "needsCssNext" }] },
  ],
});

// ---------------------------------------------------------------- HTML: styled elements, React 19
jsTester().run("no-unsupported-html (real-world)", rule("no-unsupported-html"), {
  valid: [
    // Adobe's workaround for unsupported elements is to style them; a class or style attribute counts
    "const a = <ul className='list'><li className='item'>x</li></ul>;",
    { code: "const a = <li>x</li>;", settings: { uxp: { styledElements: ["li"] } } },
    { code: "const a = <sp-textfield onChange={f} />;", settings: { uxp: { reactVersion: 19 } } },
    "const a = <sp-slider onInput={f} />;",
  ],
  invalid: [
    { code: "const a = <sp-textfield onChange={f} />;", errors: [{ messageId: "spEvent" }] },
  ],
});

htmlTester().run("no-unsupported-html (html, real-world)", rule("no-unsupported-html"), {
  valid: ["<ul class=\"menu\"><li class=\"menu-item\">One</li></ul>"],
  invalid: [],
});

// ---------------------------------------------------------------- valid-manifest: real-world shapes
jsonTester().run("valid-manifest (real-world)", rule("valid-manifest"), {
  valid: [
    // jardicc/alchemist: "entryPoints" spelling, minVersion "24.2", loadEvent data
    { code: JSON.stringify({ manifestVersion: 5, name: "Alchemist", id: "2bcdb900", version: "2.7.0", host: { app: "PS", minVersion: "24.2", data: { loadEvent: "use" } }, main: "index.html", requiredPermissions: { clipboard: "readAndWrite", localFileSystem: "fullAccess", ipc: { enablePluginCommunication: true }, network: { domains: "all" } }, entryPoints: [{ type: "panel", id: "inspector", minimumSize: { width: 600, height: 360 }, maximumSize: { width: 2000, height: 2000 } }] }), filename: "uxp/manifest.json" },
    // BOM-prefixed manifest text
    { code: "\uFEFF" + JSON.stringify(manifest()), filename: "manifest.json" },
  ],
  invalid: [
    // ComfyPanel shape: `main` inside an entrypoint (forum 10557)
    { code: JSON.stringify(manifest({ entrypoints: [{ type: "panel", id: "p", main: "index.html" }] })), filename: "manifest.json", errors: [{ messageId: "entrypointMain" }] },
  ],
});

// ---------------------------------------------------------------- multi-host manifests (hyperbrew/bolt-uxp, tokyosheep/PhotoshopUXPMulti-window)
const multi = settings(manifest({ host: [{ app: "PS", minVersion: "24.2.0" }, { app: "premierepro", minVersion: "25.6.0" }] }));
jsTester().run("multi-host manifests", rule("api-min-version"), {
  valid: [
    // shared code is held to the newest UXP any host ships
    { code: "const { xmp } = require('uxp'); new xmp.XMPMeta();", settings: multi, filename: "src/shared.js" },
    // a Premiere-only file is judged against the Premiere host
    { code: "const { xmp } = require('uxp'); new xmp.XMPMeta();", settings: multi, filename: "bolt-uxp-utils/src/ppro.ts" },
  ],
  invalid: [
    // a Photoshop-only file is judged against the Photoshop host
    { code: "const { xmp } = require('uxp'); new xmp.XMPMeta();", settings: multi, filename: "src/api/photoshop.js", errors: [{ messageId: "uxpTooOld" }, { messageId: "uxpTooOld" }] },
  ],
});
jsTester().run("multi-host manifests (Photoshop rules)", rule("photoshop-modal-scope"), {
  valid: [{ code: "const { action } = require('photoshop'); btn.onclick = () => action.batchPlay([{ _obj: 'set' }], {});", settings: multi, filename: "src/ppro/panel.js" }],
  invalid: [{ code: "const { action } = require('photoshop'); btn.onclick = () => action.batchPlay([{ _obj: 'set' }], {});", settings: multi, filename: "src/ps/panel.js", errors: [{ messageId: "batchPlayOutsideModal" }] }],
});
