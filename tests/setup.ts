import { RuleTester } from "eslint";
import { RuleTester as TsRuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
// eslint's RuleTester picks up global describe/it (vitest globals: true).
TsRuleTester.afterAll = afterAll;
TsRuleTester.describe = describe;
TsRuleTester.it = it;
TsRuleTester.itOnly = it.only;
void RuleTester;
