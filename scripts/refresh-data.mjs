// Fetch current upstream sources and generate a reviewable data update.
// Network access is only used by this maintainer command, never during linting.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "uxp-lint-refresh-"));
const sources = path.join(temp, "sources");
const staged = path.join(temp, "generated");
fs.mkdirSync(sources);

function run(command, args, options = {}) {
  return (execFileSync(command, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options }) ?? "").trim();
}

try {
  console.log("Fetching UXP documentation and compatibility data...");
  run("git", ["clone", "--quiet", "--depth=1", "https://github.com/AdobeDocs/uxp.git", path.join(sources, "adobedocs-uxp")]);
  run("git", ["clone", "--quiet", "--depth=1", "https://github.com/jardicc/vscode-uxp-validator.git", path.join(sources, "jarda")]);

  console.log("Fetching the latest Photoshop type definitions...");
  const packed = JSON.parse(run("npm", ["pack", "@types/photoshop@latest", "--json", "--ignore-scripts", "--pack-destination", temp]));
  const tarball = path.join(temp, packed[0].filename);
  const typesDir = path.join(sources, "types-photoshop-current");
  fs.mkdirSync(typesDir);
  run("tar", ["-xzf", tarball, "-C", typesDir]);

  run(process.execPath, [path.join(root, "scripts/build-data.mjs"), sources, staged], { stdio: "inherit" });

  // An upstream schema change can otherwise silently turn a large table into an
  // empty one and cause false positives. Leave the checked-in data untouched.
  const checks = [
    ["css.json", (data) => Object.keys(data.properties ?? {}).length],
    ["host-uxp-versions.json", (data) => Object.values(data.hosts ?? {}).reduce((n, rows) => n + rows.length, 0)],
    ["uxp-since.json", (data) => Object.keys(data.globals ?? {}).length + Object.keys(data.members ?? {}).length],
    ["fs-methods.json", (data) => (data.methods ?? []).length],
    ["photoshop-min-versions.json", (data) => Object.keys(data.members ?? {}).length],
  ];
  for (const [file, count] of checks) {
    const before = JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));
    const after = JSON.parse(fs.readFileSync(path.join(staged, "data", file), "utf8"));
    const previousCount = count(before);
    const nextCount = count(after);
    if (!after.$source || nextCount < previousCount * 0.75 || nextCount === 0) {
      throw new Error(`Refusing ${file}: extracted ${nextCount} entries (previously ${previousCount}). Check the upstream format.`);
    }
    console.log(`${file}: ${previousCount} → ${nextCount} entries`);
  }

  const updates = [];
  for (const [file] of checks) {
    const moduleName = file.replace(/\.json$/, ".ts");
    updates.push([path.join(staged, "data", file), path.join(root, "data", file)]);
    updates.push([path.join(staged, "src/data/generated", moduleName), path.join(root, "src/data/generated", moduleName)]);
  }
  const backups = updates.map(([, dest]) => fs.readFileSync(dest));
  try {
    for (const [source, dest] of updates) fs.copyFileSync(source, dest);
  } catch (error) {
    for (let i = 0; i < updates.length; i++) fs.writeFileSync(updates[i][1], backups[i]);
    throw error;
  }
  console.log("Data refreshed. Review the diff and run npm test before publishing.");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
