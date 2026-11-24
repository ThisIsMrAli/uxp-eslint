// Browser-safe: the eslint-utils subpath only depends on applyDefault/deepMerge.
import { RuleCreator } from "@typescript-eslint/utils/eslint-utils";
import { fileKind } from "./file-kind.js";

export interface UxpRuleDocs {
  description: string;
  /** Which presets enable the rule. */
  recommended?: boolean;
  /** Where the rule's facts come from. */
  sources?: string[];
}

export const DOCS_BASE = "https://github.com/ThisIsMrAli/uxp-eslint/blob/main/docs/rules/";

const base = RuleCreator<UxpRuleDocs>((name) => `${DOCS_BASE}${name}.md`);

/**
 * RuleCreator plus one shared guard: generated/minified bundles and Node-only scripts (shebang or `node:` imports)
 * are skipped, because they are not UXP source a developer edits. Opt back in with
 * settings.uxp.lintGenerated / settings.uxp.lintNodeScripts.
 */
export const createRule: typeof base = (spec) => {
  const rule = base(spec);
  const create = rule.create;
  return {
    ...rule,
    create(context) {
      const kind = fileKind(context as never);
      if (kind !== "source") {
        const s = ((context.settings as Record<string, unknown> | undefined)?.uxp ?? {}) as { lintGenerated?: boolean; lintNodeScripts?: boolean };
        if (kind === "generated" && !s.lintGenerated) return {};
        if (kind === "node" && !s.lintNodeScripts) return {};
      }
      return create(context);
    },
  } as typeof rule;
};
