// Browser-safe: the eslint-utils subpath only depends on applyDefault/deepMerge.
import { RuleCreator } from "@typescript-eslint/utils/eslint-utils";

export interface UxpRuleDocs {
  description: string;
  /** Which presets enable the rule. */
  recommended?: boolean;
  /** Where the rule's facts come from. */
  sources?: string[];
}

export const createRule = RuleCreator<UxpRuleDocs>(
  (name) => `https://github.com/ThisIsMrAli/uxp-eslint/blob/main/docs/rules/${name}.md`,
);
