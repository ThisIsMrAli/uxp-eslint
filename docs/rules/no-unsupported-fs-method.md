# uxp-lint/no-unsupported-fs-method

Disallow Node `fs` methods that UXP's `require("fs")` does not document.

Type: problem.

## What it checks

UXP `require("fs")` documents 17 methods: readFile, readFileSync, writeFile, writeFileSync, open, close, read, write, lstat, lstatSync, rename, copyFile, unlink, mkdir, rmdir, readdir, readdirSync. Anything else on the `fs` module (and `fs.promises`, `fs/promises`) is reported, with a replacement hint where one exists.

## Messages

- `unsupported`: `fs.{{name}}` is not part of UXP's fs module (documented: {{list}}).{{hint}}
- `promises`: `fs.promises` is not part of UXP's fs module; UXP's fs methods already return promises when no callback is passed.

## Sources

- https://github.com/AdobeDocs/uxp/blob/main/src/pages/uxp-api/reference-js/Modules/fs/fs.md
