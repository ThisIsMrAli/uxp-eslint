# uxp-lint/photoshop-modal-scope

Require Photoshop state changes (modifying batchPlay, DOM edits) to run inside core.executeAsModal.

Type: problem.

## What it checks

Photoshop only; off when the manifest resolves to apiVersion 1 (explicit `host.data.apiVersion: 1`, or minVersion below 23.0.0 per Adobe’s documented default). Reports batchPlay calls whose literal descriptors include an `_obj` other than `get`/`multiGet`, Photoshop DOM methods that modify documents (e.g. `createLayer`, `flatten`, `resizeImage`, `createDocument`), and Layer/Document setters (e.g. `opacity`, `name`, `visible`, `blendMode`) when they are not reachable from a function passed to `core.executeAsModal` or `Document.suspendHistory` in the same file. Functions that are only exported (never called in the file) are not judged. Receiver matching for DOM methods is heuristic (names like `app`, `activeDocument`, `doc`, `layer`). Options: `extraModifyingMethods`, `readOnlyDescriptors`, `checkDomMethods`.

## Messages

- `batchPlayOutsideModal`: batchPlay `{{obj}}` modifies Photoshop state but is not inside core.executeAsModal(). With apiVersion 2 this throws; wrap it in executeAsModal.
- `domOutsideModal`: `{{name}}()` modifies the Photoshop document but is not inside core.executeAsModal().
- `setterOutsideModal`: Setting `{{name}}` on a Photoshop layer/document modifies state but is not inside core.executeAsModal().

## Sources

- https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/executeasmodal/
- https://github.com/AdobeDocs/uxp-photoshop/blob/9bd99ffedbaf0e79d525ee2ffe200eb29a8e6aaf/src/pages/guides/uxp-guide/uxp-misc/manifest-v4/photoshop-manifest/index.md#apiversion
- https://forums.creativeclouddeveloper.com/t/how-to-know-which-batchplay-actions-require-executeasmodal-is-there-any-downside-to-executing-all-as-modal/6687
- https://forums.creativeclouddeveloper.com/t/error-host-is-in-a-modal-state/5837
