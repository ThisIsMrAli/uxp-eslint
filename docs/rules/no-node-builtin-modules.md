# uxp-lint/no-node-builtin-modules

Disallow Node core modules that UXP does not provide (UXP modules: uxp, fs, os, plus host modules).

Type: problem.

## What it checks

Reports `import`/`require`/`import()` of Node-only modules: child_process, cluster, dgram, dns, http, http2, https, inspector, net, readline, repl, tls, tty, v8, vm, worker_threads, fs/promises (also with `node:`). `fs`, `os`, `path`, `process` are not reported (UXP or bundlers provide them). Option `allow`.

## Messages

- `nodeOnly`: `{{name}}` is a Node.js module with no UXP equivalent; it fails at runtime in UXP.{{hint}}

## Sources

- https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Modules/index.md
