import { SOURCES, type Confidence } from "./sources.js";

export interface ApiFact { message: string; source: string; confidence: Confidence }

/** Browser globals reported as unavailable in UXP. */
export const UNAVAILABLE_GLOBALS: Record<string, ApiFact> = {
  MutationObserver: { message: "MutationObserver is not available in UXP (needs a polyfill such as mutationobserver-shim).", source: `${SOURCES.bubblydooPolyfills} ; ${SOURCES.forum4605}`, confidence: "community" },
  matchMedia: { message: "matchMedia is not available in UXP (needs a polyfill such as matchmedia-polyfill).", source: SOURCES.bubblydooPolyfills, confidence: "community" },
  "performance.measure": { message: "performance.measure is not available in UXP.", source: SOURCES.bubblydooPolyfills, confidence: "community" },
};

export const UNSUPPORTED_EVENTS: Record<string, ApiFact> = {
  keypress: { message: "`keypress` is not supported in UXP; use keydown/keyup.", source: SOURCES.knownIssues, confidence: "docs" },
};

/** Node core modules with no UXP equivalent (UXP modules are fs, os, uxp plus host modules). path/process/buffer etc. are not listed because UXP or bundlers provide them. */
export const NODE_ONLY_MODULES = ["child_process", "cluster", "dgram", "dns", "dns/promises", "http", "http2", "https", "inspector", "net", "readline", "readline/promises", "repl", "tls", "tty", "v8", "vm", "worker_threads", "fs/promises"];

/** Modules UXP resolves natively. */
export const UXP_NATIVE_MODULES = ["uxp", "fs", "os", "path", "process", "photoshop", "indesign", "premierepro", "application", "scenegraph"];
