/** Host part of an absolute URL-ish string, or null for relative/unknown. Browser-safe (no URL global required). */
export function urlParts(u: string): { scheme: string; host: string | null; path: string } | null {
  const m = u.trim().match(/^([a-z][a-z0-9+.-]*):(\/\/)?([^/?#]*)?([^?#]*)/i);
  if (!m) return null;
  const scheme = m[1]!.toLowerCase();
  const host = m[2] ? (m[3] ?? "").replace(/^[^@]*@/, "").replace(/:\d+$/, "").toLowerCase() || null : null;
  return { scheme, host, path: m[4] ?? "" };
}

/** Does a manifest domain entry ("https://*.adobe.com", "adobe.com", "*.x.io") allow `host`? Matches on host only. */
export function domainAllows(entry: string, host: string): boolean {
  let e = entry.trim().toLowerCase();
  e = e.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  if (!e) return false;
  if (e === "*") return true;
  if (e.startsWith("*.")) {
    const base = e.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === e;
}

export function domainsAllow(domains: unknown, host: string): boolean | null {
  if (domains === "all") return true;
  if (!Array.isArray(domains)) return null;
  return domains.some((d) => typeof d === "string" && domainAllows(d, host));
}
