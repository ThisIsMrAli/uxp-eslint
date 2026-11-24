# uxp-lint/no-unsupported-web-api

Disallow browser APIs that UXP does not provide or documents as unreliable.

Type: problem.

## What it checks

Reports `MutationObserver`, `matchMedia`, `performance.measure` (community-reported as unavailable; turn off with `community: false`), `keypress` listeners/handlers (docs), scripts or inline handlers in `innerHTML` strings (docs), and `localStorage`/`sessionStorage` in `.psjs` scripts (docs: scripts have no persistent storage). `typeof X` feature detection is allowed.

## Messages

- `unavailable`: {{message}} ({{confidence}} source: {{source}})
- `event`: {{message}}
- `innerHtmlScript`: Do not rely on scripts or inline event handlers inside `innerHTML` in UXP; Adobe says this behaviour "will likely go away". Use addEventListener.
- `storageInScript`: UXP scripts (.psjs) have no persistent storage; `{{name}}` is unavailable there.

## Sources

- https://developer.adobe.com/uxp/uxp-api/known-issues
- https://github.com/bubblydoo/uxp-toolkit/blob/13a179c36b599e48c33395ffd5935dfbe2062378/packages/uxp-polyfills/README.md
- https://forums.creativeclouddeveloper.com/t/4605
