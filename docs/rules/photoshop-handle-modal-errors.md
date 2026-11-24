# uxp-lint/photoshop-handle-modal-errors

Require handling rejections from core.executeAsModal (only one plugin can be modal at a time).

Type: suggestion.

## What it checks

Reports `core.executeAsModal()` whose promise is not caught: not awaited inside `try/catch`, no `.catch()` / two-argument `.then()`, not returned (including `return await`) or stored.

## Messages

- `unhandled`: executeAsModal() rejects when Photoshop is already modal ("host is in a modal state"). Await it inside try/catch, add .catch(), or return it to a caller that handles it.

## Sources

- https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/executeasmodal/
- https://forums.creativeclouddeveloper.com/t/error-host-is-in-a-modal-state/5837
