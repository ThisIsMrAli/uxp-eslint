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
  ],
});

jsTester().run("entrypoints-match-manifest", rule("entrypoints-match-manifest"), {
  valid: [
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { mainPanel: { show() {} } }, commands: { doIt: () => {} } })", settings: settings() },
    { code: "require('uxp').entrypoints.setup({ panels: { mainPanel: {} }, commands: { ...cmds } })", settings: settings() },
    { code: "entrypoints.setup({ panels: { nope: {} } })", settings: settings() },
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { nope: {} } })" },
  ],
  invalid: [
    { code: "const { entrypoints } = require('uxp'); entrypoints.setup({ panels: { mainPanle: {} }, commands: { doIt() {} } })", settings: settings(), errors: [{ messageId: "missingHandler", data: { id: "mainPanel", kind: "panel" } }, { messageId: "notInManifest", data: { id: "mainPanle", kind: "panel" } }] },
    { code: "import { entrypoints } from 'uxp'; entrypoints.setup({ panels: { mainPanel: {} }, commands: { mainPanel: f, doIt: f } })", settings: settings(), errors: [{ messageId: "wrongKind" }] },
  ],
});

const M = (o: Record<string, unknown>) => JSON.stringify(manifest(o), null, 2);
jsonTester().run("valid-manifest", rule("valid-manifest"), {
  valid: [
    { code: M({}), filename: "manifest.json" },
    { code: M({ requiredPermissions: { launchProcess: { extensions: [""] } } }), filename: "manifest.json" },
    { code: '{"entrypoints":[{"main":"x"}]}', filename: "other.json" },
    { code: M({ host: [{ app: "PS", minVersion: "24.0.0" }, { app: "ID", minVersion: "18.5.0" }] }), filename: "plugin/manifest.json" },
  ],
  invalid: [
    { code: M({ entrypoints: [{ type: "panel", id: "panel", main: "index.html" }] }), filename: "manifest.json", errors: [{ messageId: "entrypointMain" }] },
    { code: '{"manifestVersion":5,"host":{"app":"PS","minVersion":"24.0.0"},"requiredPermissions":{"launchProcess":{"extensions":[" "]}}}', output: '{"manifestVersion":5,"host":{"app":"PS","minVersion":"24.0.0"},"requiredPermissions":{"launchProcess":{"extensions":[""]}}}', filename: "manifest.json", errors: [{ messageId: "blankExtension" }] },
    { code: '{"manifestVersion":4,"host":{"app":"PS","minVersion":"22.0.0"},"requiredPermissions":{"network":{"domains":"all"}}}', filename: "manifest.json", errors: [{ messageId: "permissionsNeedV5" }] },
    { code: '{"manifestVersion":5,"host":{"app":"PS","minVersion":"20.0.0"}}', filename: "manifest.json", errors: [{ messageId: "unknownHostVersion" }] },
    { code: '{"manifestVersion":5,"host":{"app":"AI"}}', filename: "manifest.json", errors: [{ messageId: "missingMinVersion" }, { messageId: "unknownHost" }] },
  ],
});

import { tsTester } from "../helpers.js";
tsTester().run("no-node-builtin-modules (ts)", rule("no-node-builtin-modules"), {
  valid: ["import type { Agent } from 'http'"],
  invalid: [{ code: "import { request } from 'https'", errors: [{ messageId: "nodeOnly" }] }],
});
