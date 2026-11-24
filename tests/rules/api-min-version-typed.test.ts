import { RuleTester } from "@typescript-eslint/rule-tester";
import path from "node:path";
import { rule, manifest, settings } from "../helpers.js";

const fixtures = path.resolve(__dirname, "../fixtures/typed");
const tester = new RuleTester({ languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: fixtures } } });
const ps = (minVersion: string) => settings(manifest({ host: { app: "PS", minVersion } }));

tester.run("api-min-version (type-aware)", rule("api-min-version"), {
  valid: [
    { filename: path.join(fixtures, "file.ts"), code: "import { app } from 'photoshop'; export const n = app.activeDocument?.layers.length;", settings: ps("24.0.0") },
  ],
  invalid: [
    {
      filename: path.join(fixtures, "file.ts"),
      // Document.suspendHistory has @minVersion 23.0; reached through a typed variable, which the syntactic mode cannot see.
      code: "import { app } from 'photoshop'; const doc = app.activeDocument!; export const p = doc.suspendHistory(async () => {}, 'x');",
      settings: ps("22.5.0"),
      errors: [{ messageId: "hostTooOld" }, { messageId: "hostTooOld" }],
    },
  ],
});
