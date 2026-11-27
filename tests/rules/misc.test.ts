import { jsTester, jsonTester, rule, manifest, settings } from "../helpers.js";

jsTester().run("no-unsupported-web-api", rule("no-unsupported-web-api"), {
  valid: [
    "const o = new ResizeObserver(cb)",
    "if (typeof MutationObserver !== 'undefined') {}",
    "class MutationObserver {}; new MutationObserver()",
    "el.addEventListener('keydown', f)",
    "el.innerHTML = '<b>hi</b>'",
    "localStorage.setItem('a', '1')",
    { code: "const o = new MutationObserver(cb)", options: [{ community: false }] },
  ],
  invalid: [
    { code: "const o = new MutationObserver(cb)", errors: [{ messageId: "unavailable" }] },
    { code: "window.matchMedia('(prefers-color-scheme: dark)')", errors: [{ messageId: "unavailable" }] },
    { code: "performance.measure('x')", errors: [{ messageId: "unavailable" }] },
    { code: "el.addEventListener('keypress', f)", errors: [{ messageId: "event" }] },
    { code: "el.onkeypress = f", errors: [{ messageId: "event" }] },
    { code: "const a = <input onKeyPress={f} />", errors: [{ messageId: "event" }] },
    { code: "el.innerHTML = '<button onclick=\"go()\">x</button>'", errors: [{ messageId: "innerHtmlScript" }] },
    { code: "el.innerHTML = `<script>alert(1)</script>`", errors: [{ messageId: "innerHtmlScript" }] },
    { code: "localStorage.setItem('a', '1')", filename: "tool.psjs", errors: [{ messageId: "storageInScript" }] },
  ],
});

jsTester().run("no-unsupported-fs-method", rule("no-unsupported-fs-method"), {
  valid: [
    "const fs = require('fs'); fs.readFileSync('plugin:/a'); await fs.readdir('plugin-data:/')",
    "import fs from 'fs'; await fs.writeFile('plugin-data:/x', 'y')",
    "const fs = require('uxp').storage.localFileSystem; fs.getDataFolder()",
    "const fs = something(); fs.existsSync('x')",
    "const fs = require('fs'); fs.createReadStream('plugin:/a')",
  ],
  invalid: [
    { code: "const fs = require('fs'); fs.existsSync('plugin:/a')", errors: [{ messageId: "unsupported", data: { name: "existsSync", list: "readFile, readFileSync, writeFile, writeFileSync, open, close, read, write, lstat, lstatSync, rename, copyFile, unlink, mkdir, rmdir, readdir, readdirSync", hint: " Use lstatSync (wrapped in try/catch)." } }] },
    { code: "import { statSync } from 'fs'; statSync('x')".replace("import { statSync } from 'fs'; statSync('x')", "import * as fs from 'fs'; fs.statSync('x')"), errors: [{ messageId: "unsupported" }] },
    { code: "const fs = require('fs'); fs.promises.readFile('x')", errors: [{ messageId: "promises" }] },
    { code: "import fsp from 'fs/promises'", errors: [{ messageId: "promises" }] },
    { code: "const { fs } = require('uxp').storage; fs.appendFile('x', 'y')", errors: [{ messageId: "unsupported" }] },
  ],
});

jsTester().run("no-node-builtin-modules", rule("no-node-builtin-modules"), {
  valid: ["import fs from 'fs'", "const os = require('os')", "import path from 'path'", "import x from 'lodash'", { code: "import http from 'http'", options: [{ allow: ["http"] }] }],
  invalid: [
    { code: "import http from 'http'", errors: [{ messageId: "nodeOnly" }] },
    { code: "const cp = require('child_process')", errors: [{ messageId: "nodeOnly" }] },
    { code: "import net from 'node:net'", errors: [{ messageId: "nodeOnly" }] },
    { code: "await import('worker_threads')", errors: [{ messageId: "nodeOnly" }] },
    { code: "import dns from 'dns/promises'", errors: [{ messageId: "nodeOnly" }] },
    { code: "const readline = require('readline/promises')", errors: [{ messageId: "nodeOnly" }] },
  ],
});

jsTester().run("entrypoints-match-manifest", rule("entrypoints-match-manifest"), {
  valid: [
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { mainPanel: { show() {} } }, commands: { doIt: () => {} } })", settings: settings() },
    { code: "require('uxp').entrypoints.setup({ panels: { mainPanel: {} }, commands: { ...cmds } })", settings: settings() },
    { code: "entrypoints.setup({ panels: { nope: {} } })", settings: settings() },
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { nope: {} } })" },
    // jardicc/alchemist sets up each panel from its own bundle (uxpConfig detects this as splitSetup)
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { mainPanel: {} } })", settings: { uxp: { manifest: manifest(), splitSetup: true } } },
  ],
  invalid: [
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { mainPanle: {} }, commands: { doIt() {} } })", settings: settings(), errors: [{ messageId: "missingHandler", data: { id: "mainPanel", kind: "panel" } }, { messageId: "notInManifest", data: { id: "mainPanle", kind: "panel" } }] },
    { code: "import { entrypoints } from 'uxp'; entrypoints.setup({ panels: { mainPanel: {} }, commands: { mainPanel: f, doIt: f } })", settings: settings(), errors: [{ messageId: "wrongKind" }] },
    // "entryPoints" spelling (jardicc/alchemist) must be read too
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { inspectr: {} } })", settings: { uxp: { manifest: { ...manifest(), entrypoints: undefined, entryPoints: [{ type: "panel", id: "inspector" }] } } }, errors: [{ messageId: "missingHandler" }, { messageId: "notInManifest" }] },
  ],
});

const M = (o: Record<string, unknown>) => JSON.stringify(manifest(o), null, 2);
jsonTester().run("valid-manifest", rule("valid-manifest"), {
  valid: [
    { code: M({ host: { app: "ame", minVersion: "27.0.0" } }), filename: "manifest.json", options: [{ reportUnknownHostVersion: true }] },
    { code: M({ requiredPermissions: { enableAddon: true } }), filename: "manifest.json" },
    { code: M({}), filename: "manifest.json" },
    { code: M({ requiredPermissions: { launchProcess: { extensions: [""] } } }), filename: "manifest.json" },
    { code: '{"entrypoints":[{"main":"x"}]}', filename: "other.json" },
    { code: M({ host: [{ app: "PS", minVersion: "24.0.0" }, { app: "ID", minVersion: "18.5.0" }] }), filename: "plugin/manifest.json" },
    { code: M({ version: "1.2.3-beta.1", requiredPermissions: { clipboard: "readAndWrite", localFileSystem: "fullAccess", network: { domains: "all" }, webview: { allow: "yes", domains: ["https://*.adobe.com"] }, enableUserInfo: true } }), filename: "manifest.json" },
    { code: M({ manifestVersion: 4, version: "1.0.0", entrypoints: [{ type: "command", id: "c", shortcut: { mac: "Cmd+K" } }, { type: "panel", id: "p", minimumSize: { width: 200, height: 100 }, maximumSize: { width: 2000, height: 2000 } }] }), filename: "manifest.json" },
    // Adobe invisible-plugin-sample has no entrypoints at all; XD v3 manifests use uiEntrypoints
    { code: JSON.stringify({ ...manifest(), entrypoints: undefined }), filename: "manifest.json" },
    { code: '{"name":"Webpack Plugin","id":"webpack.plugin","version":"0.0.1","main":"index.html","uiEntrypoints":[{"type":"homescreen","panelId":"mainPanel"}]}', filename: "manifest.json" },
    { code: '{"manifestVersion":3,"id":"a","name":"abc","version":"1.0.0","host":{"app":"XD","minVersion":"21.0"},"entrypoints":[]}', filename: "manifest.json" },
  ],
  invalid: [
    { code: M({ requiredPermissions: { enableAddon: "true" } }), filename: "manifest.json", errors: [{ messageId: "wrongType", data: { key: "requiredPermissions.enableAddon", expected: "true or false" } }] },
    { code: M({ entrypoints: [{ type: "panel", id: "panel", main: "index.html" }] }), filename: "manifest.json", errors: [{ messageId: "entrypointMain" }] },
    { code: '{"id":"a","name":"abc","version":"1.0.0","entrypoints":[],"manifestVersion":5,"host":{"app":"PS","minVersion":"24.0.0"},"requiredPermissions":{"launchProcess":{"extensions":[" "]}}}', output: '{"id":"a","name":"abc","version":"1.0.0","entrypoints":[],"manifestVersion":5,"host":{"app":"PS","minVersion":"24.0.0"},"requiredPermissions":{"launchProcess":{"extensions":[""]}}}', filename: "manifest.json", errors: [{ messageId: "blankExtension" }] },
    { code: '{"id":"a","name":"abc","version":"1.0.0","entrypoints":[],"manifestVersion":4,"host":{"app":"PS","minVersion":"22.0.0"},"requiredPermissions":{"network":{"domains":"all"}}}', filename: "manifest.json", errors: [{ messageId: "permissionsNeedV5" }] },
    { code: '{"id":"a","name":"abc","version":"1.0.0","entrypoints":[],"manifestVersion":5,"host":{"app":"PS","minVersion":"20.0.0"}}', filename: "manifest.json", options: [{ reportUnknownHostVersion: true }], errors: [{ messageId: "unknownHostVersion" }] },
    { code: '{"id":"a","name":"abc","version":"1.0.0","entrypoints":[],"manifestVersion":5,"host":{"app":"AI"}}', filename: "manifest.json", errors: [{ messageId: "missingMinVersion" }, { messageId: "unknownHost" }] },
    // Completeness checks, each from Adobe's manifest v4/v5 reference or the UXP changelog
    { code: '{"manifestVersion":5,"host":{"app":"PS","minVersion":"24.0.0"}}', filename: "manifest.json", errors: [{ messageId: "missingRequired", data: { key: "id" } }, { messageId: "missingRequired", data: { key: "name" } }, { messageId: "missingRequired", data: { key: "version" } }] },
    // Real shape: Alchemist (jardicc/alchemist uxp/manifest.json) spells it "entryPoints"
    { code: JSON.stringify({ ...manifest(), entrypoints: undefined, entryPoints: [{ type: "panel", id: "inspector" }, { type: "panel", id: "inspector" }] }), filename: "manifest.json", errors: [{ messageId: "duplicateEntrypoint" }] },
    { code: M({ manifestVersion: 4, version: "1.0" }), filename: "manifest.json", errors: [{ messageId: "invalidVersion" }] },
    { code: M({ version: "v1" }), filename: "manifest.json", errors: [{ messageId: "invalidVersion" }] },
    { code: M({ version: 1 }), filename: "manifest.json", errors: [{ messageId: "wrongType" }] },
    { code: M({ name: "AB" }), filename: "manifest.json", errors: [{ messageId: "nameLength" }] },
    { code: M({ entrypoints: [{ type: "dialog", id: "d" }] }), filename: "manifest.json", errors: [{ messageId: "entrypointType" }] },
    { code: M({ entrypoints: [{ type: "panel", id: "p" }, { type: "command", id: "p" }] }), filename: "manifest.json", errors: [{ messageId: "duplicateEntrypoint" }] },
    { code: M({ entrypoints: [{ type: "command", id: "c", minimumSize: { width: 10, height: 10 } }] }), filename: "manifest.json", errors: [{ messageId: "keyOnlyFor" }] },
    { code: M({ entrypoints: [{ type: "panel", id: "p", shortcut: { mac: "Cmd+K" } }] }), filename: "manifest.json", errors: [{ messageId: "keyOnlyFor" }] },
    { code: M({ entrypoints: [{ type: "panel", id: "p", minimumSize: { width: 400, height: 100 }, maximumSize: { width: 300, height: 900 } }] }), filename: "manifest.json", errors: [{ messageId: "sizeOrder" }] },
    { code: M({ requiredPermissions: { clipboard: "write", localFileSystem: "full" } }), filename: "manifest.json", errors: [{ messageId: "invalidPermissionValue" }, { messageId: "invalidPermissionValue" }] },
    { code: M({ requiredPermissions: { webview: { allow: true, domains: ["https://*.com"] } } }), filename: "manifest.json", errors: [{ messageId: "invalidPermissionValue" }, { messageId: "wildcardTopLevel" }] },
    { code: M({ requiredPermissions: { network: { domains: ["https://*", "*.org", "https://*.adobe.com"] }, ipc: { enablePluginCommunication: "yes" } } }), filename: "manifest.json", errors: [{ messageId: "wildcardTopLevel" }, { messageId: "wildcardTopLevel" }, { messageId: "wrongType" }] },
    { code: M({ manifestVersion: 3 }), filename: "manifest.json", errors: [{ messageId: "manifestVersionTooOld" }] },
  ],
});

import { tsTester } from "../helpers.js";
tsTester().run("no-node-builtin-modules (ts)", rule("no-node-builtin-modules"), {
  valid: ["import type { Agent } from 'http'"],
  invalid: [{ code: "import { request } from 'https'", errors: [{ messageId: "nodeOnly" }] }],
});
