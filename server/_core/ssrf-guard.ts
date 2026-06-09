// ============================================================
// ssrf-guard — validate that an outbound URL targets a public
// provider CDN and never an internal/loopback/private address.
//
// Two layers:
//   1. Hard floor (always on): only http(s); reject any hostname
//      that is, or resolves to, a loopback / private / link-local /
//      unique-local address. This blocks DNS-rebinding-style abuse
//      of the download proxy on a box running ~53 localhost services.
//   2. Hostname allow-list: the URL's host must match (exact or as a
//      suffix, e.g. ".blob.core.windows.net") one of the allowed
//      provider CDN hosts. Defaults cover the media providers this
//      app legitimately downloads from; override with the
//      DOWNLOAD_PROXY_ALLOWED_HOSTS env var (comma-separated).
// ============================================================

import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Default provider CDN hosts. The upstream URLs are not hardcoded in
 * this app — they come back inside provider API responses — so this is
 * a best-effort list of the domains generated-media URLs actually use:
 *   - OpenAI images (gpt-image / DALL-E): Azure blob storage
 *   - OpenAI Sora video content: api.openai.com
 *   - Google Gemini / Imagen: generativelanguage + googleusercontent
 *   - Runware images/video CDN
 *   - xAI / Grok image + video CDN
 * Entries are matched as exact host or as a dot-suffix, so
 * "blob.core.windows.net" also allows "oaidalleapiprodscus.blob.core.windows.net".
 */
const DEFAULT_ALLOWED_HOSTS = [
  // OpenAI
  "blob.core.windows.net",
  "oaiusercontent.com",
  "api.openai.com",
  // Google Gemini / Imagen
  "generativelanguage.googleapis.com",
  "googleusercontent.com",
  "storage.googleapis.com",
  // Runware
  "runware.ai",
  "im.runware.ai",
  "vm.runware.ai",
  // xAI / Grok
  "x.ai",
  "api.x.ai",
  "grok.com",
  "imgen.x.ai",
  // This app's own public origin — the client also routes its
  // locally-persisted /generated/* and /uploads/* URLs (which the
  // browser resolves to the page origin) through this proxy.
  "dr.eamer.dev",
];

function getAllowedHosts(): string[] {
  const raw = process.env.DOWNLOAD_PROXY_ALLOWED_HOSTS;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_HOSTS;
}

/** host matches an allow-list entry exactly or as a dot-suffix. */
function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return allowed.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

/**
 * True if the given IP literal is in a range we must never proxy to:
 * loopback, RFC-1918 private, link-local, carrier-grade NAT,
 * IPv6 loopback / unique-local / link-local, and IPv4-mapped IPv6.
 */
export function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP — treat as blocked
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved (224.0.0.0+)
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — defer to the IPv4 rules.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

export type SsrfCheckResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Validate a user-supplied URL before the server fetches it.
 * Enforces the hard floor (scheme + private-IP block, including a DNS
 * resolution check) and the provider-CDN allow-list.
 */
export async function checkDownloadUrl(raw: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed" };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Hard floor part 1: a hostname that is itself an IP literal must not
  // be in a blocked range.
  if (net.isIP(host) && isBlockedIp(host)) {
    return { ok: false, reason: "URL targets a private or loopback address" };
  }

  // Allow-list: reject anything that isn't a known provider CDN.
  if (!hostAllowed(host, getAllowedHosts())) {
    return { ok: false, reason: "Host is not an allowed media provider" };
  }

  // Hard floor part 2: resolve the hostname and reject if ANY resolved
  // address is private/loopback (defends against allow-listed names that
  // resolve inward, and DNS rebinding).
  if (!net.isIP(host)) {
    try {
      const addrs = await lookup(host, { all: true });
      if (addrs.length === 0) {
        return { ok: false, reason: "Host did not resolve" };
      }
      for (const a of addrs) {
        if (isBlockedIp(a.address)) {
          return {
            ok: false,
            reason: "Host resolves to a private or loopback address",
          };
        }
      }
    } catch {
      return { ok: false, reason: "Host did not resolve" };
    }
  }

  return { ok: true, url };
}
