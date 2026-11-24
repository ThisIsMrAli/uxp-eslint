import css from "../data/generated/css.js";
import { isOlder } from "./version.js";

type Item = { since: string | null; values?: Record<string, string | null> };
type Category = "properties" | "atDirectives" | "pseudoClasses" | "pseudoElements" | "units" | "functionNames" | "mediaFeatures";
const data = css as unknown as Record<Category, Record<string, Item>> & { knownFunctionNames: string[] };
const knownFunctions = new Set(data.knownFunctionNames.map((f) => f.toLowerCase()));
export const CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);

export type CssVerdict = { ok: true } | { ok: false; reason: "unsupported" } | { ok: false; reason: "newer"; since: string };

export function checkCss(category: Category, name: string, uxpVersion: string | null): CssVerdict {
  const item = data[category]?.[name.toLowerCase()] ?? data[category]?.[name];
  if (!item) return { ok: false, reason: "unsupported" };
  if (uxpVersion && item.since && isOlder(uxpVersion, item.since)) return { ok: false, reason: "newer", since: item.since };
  return { ok: true };
}

export function checkCssValue(property: string, value: string, uxpVersion: string | null): CssVerdict {
  const item = data.properties[property.toLowerCase()];
  if (!item?.values || CSS_WIDE.has(value.toLowerCase())) return { ok: true };
  const since = item.values[value.toLowerCase()];
  if (since === undefined) return { ok: false, reason: "unsupported" };
  if (uxpVersion && since && isOlder(uxpVersion, since)) return { ok: false, reason: "newer", since };
  return { ok: true };
}

/** Only judge functions that the data knows about as web functions; unknown names are left alone. */
export function isKnownWebFunction(name: string): boolean {
  return knownFunctions.has(name.toLowerCase()) || !!data.functionNames[name];
}

export function hasProperty(name: string): boolean {
  return !!data.properties[name.toLowerCase()];
}
