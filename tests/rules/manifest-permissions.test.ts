import { jsTester, htmlTester, rule, manifest, settings } from "../helpers.js";

const R = rule("manifest-permissions");
const net = (domains: unknown) => settings(manifest({ requiredPermissions: { network: { domains } } }));

jsTester().run("manifest-permissions (network)", R, {
  valid: [
    { code: "fetch('https://api.example.com/x')", settings: net(["https://api.example.com"]) },
    { code: "fetch('https://cdn.example.com/x')", settings: net(["*.example.com"]) },
    { code: "fetch('https://anything.io')", settings: net("all") },
    { code: "fetch('./local.json')", settings: settings() },
    { code: "fetch(url)", settings: net(["https://a.com"]) },
    { code: "fetch(`https://${host}/x`)", settings: net(["https://a.com"]) },
    { code: "const fetch = myFetch; fetch('https://x.com')", settings: settings() },
    { code: "fetch('https://x.com')", settings: settings(manifest({ manifestVersion: 4 })) },
    { code: "fetch('https://x.com')" },
    { code: "new WebSocket('wss://socket.example.com')", settings: net(["wss://socket.example.com"]) },
    { code: "xhr.open('GET', 'https://api.example.com/a')", settings: net(["https://api.example.com"]) },
  ],
  invalid: [
    { code: "fetch('https://api.example.com/x')", settings: settings(), errors: [{ messageId: "missingNetwork" }] },
    { code: "await fetch(url)", settings: settings(), errors: [{ messageId: "missingNetwork" }] },
    { code: "fetch('https://cdn.other.com/x')", settings: net(["https://api.example.com"]), errors: [{ messageId: "domainNotAllowed", data: { host: "cdn.other.com" } }] },
    { code: "fetch(`https://cdn.other.com/${id}`)", settings: net(["https://api.example.com"]), errors: [{ messageId: "domainNotAllowed" }] },
    { code: "new WebSocket('wss://evil.io')", settings: net(["https://a.com"]), errors: [{ messageId: "domainNotAllowed" }] },
    { code: "x.open('POST', 'https://b.com/p')", settings: net(["https://a.com"]), errors: [{ messageId: "domainNotAllowed" }] },
    { code: "window.fetch('https://b.com')", settings: settings(), errors: [{ messageId: "missingNetwork" }] },
  ],
});

const lp = (launchProcess: unknown) => settings(manifest({ requiredPermissions: { launchProcess } }));
jsTester().run("manifest-permissions (launchProcess)", R, {
  valid: [
    { code: "const { shell } = require('uxp'); shell.openExternal('https://adobe.com')", settings: lp({ schemes: ["https"] }) },
    { code: "require('uxp').shell.openPath('/tmp/a.psd')", settings: lp({ extensions: [".psd"] }) },
    { code: "import { shell } from 'uxp'; shell.openPath('/Users/me/folder')", settings: lp({ extensions: [""] }) },
    { code: "import { shell } from 'uxp'; shell.openPath(p)", settings: lp({ extensions: [".pdf"] }) },
  ],
  invalid: [
    { code: "const { shell } = require('uxp'); shell.openExternal('https://adobe.com')", settings: settings(), errors: [{ messageId: "missingLaunchProcess" }] },
    { code: "const uxp = require('uxp'); uxp.shell.openExternal('slack://open')", settings: lp({ schemes: ["https"] }), errors: [{ messageId: "schemeNotAllowed", data: { scheme: "slack" } }] },
    { code: "import { shell } from 'uxp'; shell.openPath('/tmp/a.pdf')", settings: lp({ extensions: [".psd"] }), errors: [{ messageId: "extensionNotAllowed", data: { ext: ".pdf" } }] },
    { code: "import { shell } from 'uxp'; shell.openPath('/Users/me/folder')", settings: lp({ extensions: [" "] }), errors: [{ messageId: "folderNeedsEmptyExtension" }] },
  ],
});

const fsPerm = (localFileSystem?: string) => settings(manifest({ requiredPermissions: localFileSystem ? { localFileSystem } : {} }));
jsTester().run("manifest-permissions (localFileSystem)", R, {
  valid: [
    { code: "const fs = require('uxp').storage.localFileSystem; await fs.getFileForSaving('a.txt')", settings: fsPerm("request") },
    { code: "const { localFileSystem: lfs } = require('uxp').storage; await lfs.getFolder()", settings: fsPerm("fullAccess") },
    { code: "const fs = require('fs'); fs.readFileSync('plugin-data:/a.txt')", settings: fsPerm() },
    { code: "const fs = require('fs'); fs.readFile(path)", settings: fsPerm() },
    { code: "const fs = require('fs'); fs.writeFileSync('/Users/a/b.txt', 'x')", settings: fsPerm("fullAccess") },
    { code: "const lfs = require('uxp').storage.localFileSystem; lfs.getEntryWithUrl('plugin-temp:/x')", settings: fsPerm() },
    { code: "const lfs = require('uxp').storage.localFileSystem; lfs.getDataFolder()", settings: fsPerm() },
  ],
  invalid: [
    { code: "const fs = require('uxp').storage.localFileSystem; await fs.getFileForOpening()", settings: fsPerm(), errors: [{ messageId: "needsRequestFs" }] },
    { code: "import { storage } from 'uxp'; storage.localFileSystem.getFolder()", settings: fsPerm("plugin"), errors: [{ messageId: "needsRequestFs" }] },
    { code: "const fs = require('fs'); fs.readFileSync('/Users/a/b.txt')", settings: fsPerm("request"), errors: [{ messageId: "needsFullAccess" }] },
    { code: "const lfs = require('uxp').storage.localFileSystem; lfs.createEntryWithUrl('file:/tmp/x')", settings: fsPerm(), errors: [{ messageId: "needsFullAccess" }] },
  ],
});

jsTester().run("manifest-permissions (clipboard, ipc, userInfo, webview, alerts)", R, {
  valid: [
    { code: "navigator.clipboard.writeText('x')", settings: settings(manifest({ requiredPermissions: { clipboard: "readAndWrite" } })) },
    { code: "navigator.clipboard.readText()", settings: settings(manifest({ requiredPermissions: { clipboard: "read" } })) },
    { code: "const { pluginManager } = require('uxp'); pluginManager.plugins", settings: settings(manifest({ requiredPermissions: { ipc: { enablePluginCommunication: true } } })) },
    { code: "require('uxp').userInfo.userId()", settings: settings(manifest({ requiredPermissions: { enableUserInfo: true } })) },
    { code: "const el = <webview src='https://www.adobe.com' />", settings: settings(manifest({ requiredPermissions: { webview: { allow: "yes", domains: ["https://*.adobe.com"] } } })) },
    { code: "alert('hi')", settings: settings(manifest({ featureFlags: { enableAlerts: true } })) },
    { code: "function alert(){}; alert('x')", settings: settings() },
  ],
  invalid: [
    { code: "navigator.clipboard.writeText('x')", settings: settings(), errors: [{ messageId: "missingClipboard" }] },
    { code: "navigator.clipboard.setContent({})", settings: settings(manifest({ requiredPermissions: { clipboard: "read" } })), errors: [{ messageId: "clipboardReadOnly" }] },
    { code: "const { pluginManager } = require('uxp'); pluginManager.plugins.forEach(p => p)", settings: settings(), errors: [{ messageId: "missingIpc" }] },
    { code: "import { userInfo } from 'uxp'; userInfo.userId()", settings: settings(), errors: [{ messageId: "missingUserInfo" }, { messageId: "missingUserInfo" }] },
    { code: "const el = <webview src='https://www.adobe.com' />", settings: settings(), errors: [{ messageId: "missingWebview" }] },
    { code: "const el = <webview src='https://evil.io' />", settings: settings(manifest({ requiredPermissions: { webview: { allow: "yes", domains: ["https://*.adobe.com"] } } })), errors: [{ messageId: "webviewDomainNotAllowed" }] },
    { code: "document.createElement('webview')", settings: settings(), errors: [{ messageId: "missingWebview" }] },
    { code: "alert('hi')", settings: settings(), errors: [{ messageId: "missingEnableAlerts" }] },
    { code: "window.confirm('ok?')", settings: settings(), errors: [{ messageId: "missingEnableAlerts" }] },
  ],
});

htmlTester().run("manifest-permissions (html webview)", R, {
  valid: [{ code: '<dialog><webview src="https://www.adobe.com"></webview></dialog>', settings: settings(manifest({ requiredPermissions: { webview: { allow: "yes", domains: "all" } } })) }],
  invalid: [{ code: '<dialog><webview src="https://www.adobe.com"></webview></dialog>', settings: settings(), errors: [{ messageId: "missingWebview" }] }],
});
