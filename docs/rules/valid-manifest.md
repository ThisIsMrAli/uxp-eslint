# uxp-lint/valid-manifest

Catch manifest.json mistakes that UXP accepts silently (lint manifest.json with @eslint/json).

Type: problem.

Autofix: yes (safe cases only).

## What it checks

Runs on `manifest.json` with `@eslint/json`. Reports `main` inside an entrypoint, whitespace `launchProcess.extensions` entries (autofix to `""`), `requiredPermissions`/`webview` before manifest v5, a missing `host.minVersion`, unknown `host.app`. Option `reportUnknownHostVersion` (default false) flags minVersions older than every row of the host→UXP table.

## Messages

- `entrypointMain`: Remove `main` from entrypoint `{{id}}`; `main` belongs at the top level of manifest.json, not inside entrypoints (community report, forum thread 10557).
- `blankExtension`: `launchProcess.extensions` entry {{raw}} is whitespace. Use an empty string "" to allow opening folders.
- `permissionsNeedV5`: `requiredPermissions` is ignored before manifestVersion 5.
- `webviewNeedsV5`: WebViews need manifestVersion 5 or later.
- `missingMinVersion`: Set `host.minVersion`; version-aware rules (api-min-version, no-unsupported-css) cannot check this plugin without it.
- `unknownHost`: Unknown host app `{{app}}`; manifest docs list PS, ID, premierepro and XD.
- `unknownHostVersion`: No documented UXP version is known for {{app}} {{version}} (older than every row in the host→UXP table); version checks will be skipped.

## Sources

- https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v5/
- https://forums.creativeclouddeveloper.com/t/uxp-manifest-network-permission-denied-for-fetch-despite-domains-all/10557
- https://forums.creativeclouddeveloper.com/t/released-a-portrait-retouching-plugin-some-uxp-lessons-from-the-build/12117
