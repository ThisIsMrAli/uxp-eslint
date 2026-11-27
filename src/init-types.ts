import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findProjects, projectFor, readManifest } from "./node.js";

const declarationFile = "uxp-editor.d.ts";
const coreTypes = "@adobe/cc-ext-uxp-types";
const hostTypes = new Map([
  ["PS", "@types/photoshop"],
  ["premierepro", "@adobe/premierepro"],
  ["ID", "indesign-uxp-types"],
]);

function writeNew(root: string, name: string, contents: string): boolean {
  try {
    writeFileSync(join(root, name), contents, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export function initTypes(dir: string, manifestArg?: string): void {
  const projects = manifestArg ? [projectFor(resolve(manifestArg), dir)] : findProjects(dir);
  if (projects.length === 0) throw new Error("No UXP manifest found. Run --init-types in a UXP project or pass --manifest <file>.");
  const roots = new Map<string, Set<string>>();
  for (const project of projects) {
    const manifest = readManifest(project.manifest);
    if (!manifest) throw new Error(`Cannot read UXP manifest: ${project.manifest}`);
    const entries = Array.isArray(manifest.host) ? manifest.host : [manifest.host];
    const hosts = roots.get(project.root) ?? new Set<string>();
    for (const entry of entries) {
      if (typeof entry?.app === "string") hosts.add(entry.app);
    }
    roots.set(project.root, hosts);
  }

  for (const [root, hosts] of roots) {
    const dependencies = [coreTypes];
    for (const host of hosts) {
      const types = hostTypes.get(host);
      if (types && !dependencies.includes(types)) dependencies.push(types);
    }

    const declarations = [
      `/// <reference types="${coreTypes}" />`,
      ...(hosts.has("PS") ? ['/// <reference types="photoshop" />'] : []),
      ...(hosts.has("ID") ? ['/// <reference types="indesign-uxp-types" />'] : []),
      "",
      "// Adobe’s UXP declarations describe the provider type but omit this property.",
      'declare module "uxp" {',
      "  namespace storage {",
      "    const localFileSystem: FileSystemProvider;",
      "  }",
      "}",
      ...(hosts.has("premierepro") ? [
        "",
        'declare module "premierepro" {',
        '  const api: import("@adobe/premierepro").premierepro;',
        "  export = api;",
        "}",
      ] : []),
      "",
    ].join("\n");

    const config = ["tsconfig.json", "jsconfig.json"].find((name) => existsSync(join(root, name)));
    const displayRoot = relative(dir, root) || ".";
    process.stdout.write(`UXP editor types in ${displayRoot}\n`);
    if (writeNew(root, declarationFile, declarations)) {
      process.stdout.write(`Created ${declarationFile}.\n`);
    } else if (readFileSync(join(root, declarationFile), "utf8") !== declarations) {
      process.stdout.write(`${declarationFile} already exists. To add missing declarations, merge this into it:\n\n${declarations}\n`);
    }
    const configText = JSON.stringify({
      compilerOptions: { allowJs: true, noEmit: true, target: "ES2020", lib: ["ES2020"], module: "Node16", skipLibCheck: true },
      exclude: ["node_modules", "dist", "build", "out"],
    }, null, 2) + "\n";
    if (!config && writeNew(root, "jsconfig.json", configText)) {
      process.stdout.write("Created jsconfig.json.\n");
    } else {
      process.stdout.write(`Keep your existing ${config ?? "jsconfig.json"} and make sure it includes ${declarationFile}.\n`);
      process.stdout.write("For UXP-only code, use an ES lib without the browser DOM lib. Use Node or Bundler module resolution for npm types.\n");
    }
    process.stdout.write(`From ${displayRoot}, install: npm install -D ${dependencies.join(" ")}\n`);
    const coreOnly = [...hosts].filter((host) => !hostTypes.has(host));
    if (coreOnly.length) process.stdout.write(`Shared UXP types only for: ${coreOnly.join(", ")}.\n`);
  }
}
