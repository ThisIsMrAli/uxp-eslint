# uxp-lint/entrypoints-match-manifest

Require `entrypoints.setup()` panel and command ids to match manifest.json entrypoints.

Type: problem.

## What it checks

Compares the `panels` / `commands` keys of `entrypoints.setup()` with manifest entrypoint ids: unknown ids, ids under the wrong section, and manifest entrypoints with no handler (when the section has no spread; disable with `reportMissing: false`).

## Messages

- `notInManifest`: {{kind}} `{{id}}` is set up in code but manifest.json has no {{kind}} entrypoint with that id.
- `missingHandler`: manifest.json declares {{kind}} `{{id}}` but this entrypoints.setup() call has no handler for it.
- `wrongKind`: `{{id}}` is a {{actual}} in manifest.json but is set up under `{{key}}`.

## Sources

- https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v5/#entrypointssetup-using-promises
