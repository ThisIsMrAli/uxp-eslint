import type { TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util/create-rule.js";
import { ModuleTracker, propertyName, mergeVisitors } from "../util/ast.js";
import fsData from "../data/generated/fs-methods.js";
import { SOURCES } from "../data/sources.js";

type MessageIds = "unsupported" | "promises";
const DOCUMENTED = new Set(fsData.methods as string[]);
const SYNC_TO_DOC: Record<string, string> = { existsSync: "lstatSync (wrapped in try/catch)", statSync: "lstatSync", mkdirSync: "await fs.mkdir", unlinkSync: "await fs.unlink", stat: "lstat", exists: "lstat", appendFile: "writeFile with flag \"a\"", readFileAsync: "readFile" };

export default createRule<[], MessageIds>({
  name: "no-unsupported-fs-method",
  meta: {
    type: "problem",
    docs: { description: "Disallow Node `fs` methods that UXP's `require(\"fs\")` does not document", recommended: true, sources: [SOURCES.fs] },
    schema: [],
    messages: {
      unsupported: "`fs.{{name}}` is not part of UXP's fs module (documented: {{list}}).{{hint}}",
      promises: "`fs.promises` is not part of UXP's fs module; UXP's fs methods already return promises when no callback is passed.",
    },
  },
  defaultOptions: [],
  create(context) {
    const tracker = new ModuleTracker(new Set(["fs", "uxp"]));
    const members: TSESTree.MemberExpression[] = [];
    const list = [...DOCUMENTED].join(", ");
    return mergeVisitors(tracker.visitors(), {
      MemberExpression(node) { members.push(node); },
      ImportDeclaration(node) {
        if (node.source.value === "fs/promises") context.report({ node, messageId: "promises" });
      },
      "Program:exit"() {
        tracker.finalize();
        for (const n of members) {
          const base = tracker.resolve(n.object);
          if (base !== "fs" && base !== "uxp.storage.fs") continue;
          const name = propertyName(n);
          if (!name) continue;
          if (name === "promises") { context.report({ node: n.property, messageId: "promises" }); continue; }
          if (!DOCUMENTED.has(name) && !["constants", "default"].includes(name)) context.report({ node: n.property, messageId: "unsupported", data: { name, list, hint: SYNC_TO_DOC[name] ? ` Use ${SYNC_TO_DOC[name]}.` : "" } });
        }
      },
    });
  },
});
