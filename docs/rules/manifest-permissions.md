# uxp-lint/manifest-permissions

Require manifest v5+ `requiredPermissions` for the network, file system, launchProcess, clipboard, IPC, WebView, user info and alert APIs the code uses.

Type: problem.

## What it checks

Reads `settings.uxp.manifest`. Off for manifest v4 (no `requiredPermissions`). Checks: `fetch`/`XMLHttpRequest.open`/`WebSocket`/`Request` hosts vs `network.domains` (host match, `*.` wildcards, `"all"`); `shell.openExternal` scheme and `shell.openPath` extension vs `launchProcess` (a folder needs `""`); file pickers need `localFileSystem: "request"|"fullAccess"`; `fs.*` / `getEntryWithUrl` with paths outside `plugin:`, `plugin-data:`, `plugin-temp:` need `fullAccess`; `navigator.clipboard.*` vs `clipboard`; `pluginManager` vs `ipc.enablePluginCommunication`; `<webview>` vs `webview.allow`/`domains`; `userInfo` vs `enableUserInfo`; `alert/confirm/prompt` vs `featureFlags.enableAlerts`. Dynamic URLs/paths are only checked for a missing permission block, never guessed.

## Messages

- `missingNetwork`: `{{api}}` needs `requiredPermissions.network.domains` in manifest.json (manifest v5 grants no network access by default).
- `domainNotAllowed`: `{{host}}` is not in `requiredPermissions.network.domains`; the request will be denied ("Manifest entry not found").
- `missingLaunchProcess`: `{{api}}` needs `requiredPermissions.launchProcess` in manifest.json.
- `schemeNotAllowed`: Scheme `{{scheme}}` is not in `requiredPermissions.launchProcess.schemes`.
- `extensionNotAllowed`: Extension `{{ext}}` is not in `requiredPermissions.launchProcess.extensions`.
- `folderNeedsEmptyExtension`: Opening a folder with `openPath` needs an empty string `""` in `requiredPermissions.launchProcess.extensions`.
- `needsRequestFs`: `{{api}}` needs `requiredPermissions.localFileSystem` set to "request" or "fullAccess" (default is "plugin").
- `needsFullAccess`: Accessing `{{path}}` outside plugin storage needs `requiredPermissions.localFileSystem: "fullAccess"`.
- `missingClipboard`: `{{api}}` needs `requiredPermissions.clipboard` ("read" or "readAndWrite").
- `clipboardReadOnly`: `{{api}}` writes to the clipboard but `requiredPermissions.clipboard` is "read"; use "readAndWrite".
- `missingIpc`: `{{api}}` needs `requiredPermissions.ipc.enablePluginCommunication: true`.
- `missingWebview`: WebView needs `requiredPermissions.webview.allow: "yes"` (manifest v5).
- `webviewDomainNotAllowed`: WebView source host `{{host}}` is not in `requiredPermissions.webview.domains`.
- `missingUserInfo`: `{{api}}` needs `requiredPermissions.enableUserInfo: true`.
- `missingEnableAlerts`: `{{api}}()` only works with `"featureFlags": { "enableAlerts": true }` in manifest.json (UXP 7.4+).

## Sources

- https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v5/
- https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Global%20Members/HTML%20DOM/alert.md
- https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Modules/fs/fs.md
- https://forums.creativeclouddeveloper.com/t/released-a-portrait-retouching-plugin-some-uxp-lessons-from-the-build/12117
