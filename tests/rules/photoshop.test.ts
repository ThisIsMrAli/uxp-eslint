import { jsTester, rule, manifest, settings } from "../helpers.js";

const R = rule("photoshop-modal-scope");
jsTester().run("photoshop-modal-scope", R, {
  valid: [
    "const { core, action } = require('photoshop'); await core.executeAsModal(async () => { await action.batchPlay([{ _obj: 'make', _target: [{ _ref: 'layer' }] }], {}); }, { commandName: 'x' });",
    "const { action } = require('photoshop'); await action.batchPlay([{ _obj: 'get', _target: [{ _ref: 'layer', _enum: 'ordinal' }] }], {});",
    "const { core, action } = require('photoshop'); async function work() { await action.batchPlay([{ _obj: 'set' }], {}); } core.executeAsModal(work, { commandName: 'x' });",
    "const { core, action } = require('photoshop'); async function inner() { await action.batchPlay([{ _obj: 'set' }], {}); } async function outer() { await inner(); } core.executeAsModal(outer, { commandName: 'x' });",
    "const { action } = require('photoshop'); export async function helper() { await action.batchPlay([{ _obj: 'set' }], {}); }",
    "const { action } = require('photoshop'); await action.batchPlay(descriptors, {});",
    "const { app, core } = require('photoshop'); core.executeAsModal(async () => { await app.activeDocument.createLayer(); app.activeDocument.activeLayers[0].name = 'x'; }, {commandName:'n'});",
    "const list = []; list.duplicate = 1; button.delete(); doc.flatten();",
    "const { app } = require('photoshop'); app.activeDocument.suspendHistory(async (ctx) => { ctx.document.activeLayers[0].name = 'a'; }, 'rename');",
    { code: "const { action } = require('photoshop'); await action.batchPlay([{ _obj: 'set' }], {});", settings: settings(manifest({ host: { app: "ID", minVersion: "18.5.0" } })) },
    { code: "const { action } = require('photoshop'); await action.batchPlay([{ _obj: 'select' }], {});", options: [{ readOnlyDescriptors: ["select"] }] },
  ],
  invalid: [
    { code: "const { action } = require('photoshop'); await action.batchPlay([{ _obj: 'make', _target: [{ _ref: 'layer' }] }], {});", errors: [{ messageId: "batchPlayOutsideModal", data: { obj: "make" } }] },
    { code: "import { action } from 'photoshop'; btn.addEventListener('click', async () => { await action.batchPlay([{ _obj: 'get' }, { _obj: 'set' }], {}); });", errors: [{ messageId: "batchPlayOutsideModal", data: { obj: "set" } }] },
    { code: "const ps = require('photoshop'); async function run() { await ps.action.batchPlay([{ _obj: 'delete' }], {}); } run();", errors: [{ messageId: "batchPlayOutsideModal" }] },
    { code: "const { app } = require('photoshop'); btn.onclick = async () => { await app.activeDocument.createLayer(); };", errors: [{ messageId: "domOutsideModal", data: { name: "createLayer" } }] },
    { code: "const { app } = require('photoshop'); btn.onclick = () => { app.activeDocument.activeLayers[0].opacity = 50; };", errors: [{ messageId: "setterOutsideModal", data: { name: "opacity" } }] },
    { code: "import { app } from 'photoshop'; const doc = app.activeDocument; document.getElementById('b').addEventListener('click', () => doc.flatten());", errors: [{ messageId: "domOutsideModal" }] },
  ],
});

jsTester().run("photoshop-handle-modal-errors", rule("photoshop-handle-modal-errors"), {
  valid: [
    "const { core } = require('photoshop'); try { await core.executeAsModal(f, {commandName:'x'}); } catch (e) { console.error(e); }",
    "const { core } = require('photoshop'); core.executeAsModal(f, {commandName:'x'}).catch(console.error);",
    "const { core } = require('photoshop'); function run() { return core.executeAsModal(f, {commandName:'x'}); }",
    "const { core } = require('photoshop'); const run = () => core.executeAsModal(f, {commandName:'x'});",
    "const { core } = require('photoshop'); core.executeAsModal(f, {commandName:'x'}).then(ok, fail);",
  ],
  invalid: [
    { code: "const { core } = require('photoshop'); await core.executeAsModal(f, {commandName:'x'});", errors: [{ messageId: "unhandled" }] },
    { code: "const { core } = require('photoshop'); btn.onclick = async () => { await core.executeAsModal(f, {commandName:'x'}); };", errors: [{ messageId: "unhandled" }] },
    { code: "const { core } = require('photoshop'); core.executeAsModal(f, {commandName:'x'});", errors: [{ messageId: "unhandled" }] },
  ],
});
