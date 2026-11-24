import { SOURCES } from "./sources.js";

/**
 * UXP APIs whose reference page has no **Since** line but whose introduction version is stated elsewhere by Adobe.
 * Keys are resolved module paths (ModuleTracker) or global member paths.
 */
export const CURATED_SINCE: Record<string, { since: string; source: string }> = {
  // "UXP v6.5.0 — New: getEntryWithUrl in LocalFileProvider" (UXP changelog); forum 8224 reports it missing in PS 23.3
  "uxp.storage.localFileSystem.getEntryWithUrl": { since: "6.5.0", source: SOURCES.uxpChangelog },
  // UXP changelog 8.0.1 — New: "Support for Navigator.language API"
  "navigator.language": { since: "8.0.1", source: SOURCES.uxpChangelog },
};
