#!/usr/bin/env bash
# usage: run.sh <outdir>
OUT=${1:-/tmp/corpus-out}; mkdir -p $OUT
CLI=/workspace/repos/uxp-eslint/dist/cli.js
cd /workspace/uxp-tools/eslint/corpus
for d in */; do d=${d%/}; [ -e "$d/.git" ] || [ -L "$d" ] || continue
  s=$(date +%s%N)
  node $CLI "$d" --format json > $OUT/$d.json 2> $OUT/$d.err; code=$?
  ms=$(( ($(date +%s%N)-s)/1000000 ))
  node -e '
const fs=require("fs");let r=[];try{r=JSON.parse(fs.readFileSync(process.argv[1]))}catch(e){console.log(process.argv[2],"BADJSON");process.exit()}
const c={};let n=0;for(const f of r)for(const m of f.messages){n++;const k=(m.ruleId||"FATAL").replace("uxp-lint/","");c[k]=(c[k]||0)+1}
console.log(process.argv[2],"exit="+process.argv[3],"ms="+process.argv[4],"files="+r.length,"msgs="+n,JSON.stringify(c))' $OUT/$d.json $d $code $ms
done
