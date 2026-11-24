#!/usr/bin/env bash
# Lint public UXP sample repos with the CLI. Usage: scripts/real-samples.sh <dir-with-clones>
set -u
SRC=${1:?clones dir}
OUT=$(dirname "$0")/../real-sample-results
for repo in ps-samples uxp-premiere-pro-samples uxp-indesign-samples bolt-uxp; do
  node "$(dirname "$0")/../dist/cli.js" "$SRC/$repo" --format json > "$OUT/$repo.json"
  node -e 'const r=require(process.argv[1]);const m=r.flatMap(f=>f.messages.map(x=>x.ruleId||"fatal"));const c={};m.forEach(x=>c[x]=(c[x]||0)+1);console.log(process.argv[2],"files",r.length,"messages",m.length,JSON.stringify(c))' "$(realpath "$OUT/$repo.json")" "$repo"
done
