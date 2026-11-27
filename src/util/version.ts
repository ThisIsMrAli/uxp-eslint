import hostUxp from "../data/generated/host-uxp-versions.js";

export type HostApp = "PS" | "ID" | "premierepro" | string;

export function parseVersion(v: string | undefined | null): number[] | null {
  if (!v || typeof v !== "string") return null;
  const m = v.trim().replace(/^v|^UXP\s*/i, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** Negative if a < b, 0 if equal, positive if a > b. Unparseable versions compare as equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const d = pa[i]! - pb[i]!;
    if (d) return d;
  }
  return 0;
}

export function isOlder(target: string, required: string): boolean {
  return compareVersions(target, required) < 0;
}

// Additional host releases from Adobe's UXP runtime matrix:
// https://developer.adobe.com/uxp/uxp-api/versions
const adobeHostVersions: Record<string, { host: string; uxp: string }[]> = {
  ame: [{ host: "27.0.0", uxp: "9.4.0" }],
  aftereffects: [{ host: "27.1.0", uxp: "9.4.0" }],
  premierepro: [{ host: "27.0.0", uxp: "9.4.0" }],
  ID: [{ host: "22.0.0", uxp: "9.4.0" }],
  PS: [{ host: "27.11.0", uxp: "9.4.1" }],
};

/**
 * UXP version bundled with a host version, using the nearest documented row at or below `hostVersion`.
 * Returns null when the host is unknown or the version is older than every documented row (unknown, never guessed).
 */
export function uxpForHost(app: HostApp, hostVersion: string): string | null {
  const hosts = hostUxp.hosts as Record<string, { host: string; uxp: string }[]>;
  const bundled = Object.hasOwn(hosts, app) ? hosts[app] : undefined;
  const rows = [...(Object.hasOwn(adobeHostVersions, app) ? adobeHostVersions[app]! : []), ...(bundled ?? [])];
  if (!parseVersion(hostVersion)) return null;
  let best: { host: string; uxp: string } | null = null;
  for (const r of rows) {
    if (compareVersions(r.host, hostVersion) <= 0 && (!best || compareVersions(r.host, best.host) > 0)) best = r;
  }
  return best ? best.uxp : null;
}
