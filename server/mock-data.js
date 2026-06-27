// server/mock-data.js
//
// The data seam. This file used to return synthetic mock data; it now performs
// REAL reverse-IP resolution against ip-api.com (free, no key) so the feed shows
// real organizations, geo, and ASN for each visitor's public IP.
//
// IMPORTANT (compliance): We still only ever resolve an IP to the ORGANIZATION /
// network that owns it (the IP owner — an ISP, host, or company network), never
// to an individual person. Free IP intelligence cannot map an IP to a specific
// company *domain* or to named employees — that requires a licensed vendor — so
// the "company" shown here is the real IP-owning org/ASN, honestly coarse.
//
// Swap-in seam: replace reverseIpLookup() with a licensed IP->company provider
// (Clearbit Reveal, IPinfo Company/Privacy, 6sense, ...) and getContacts() with a
// licensed B2B contact provider. Keep the exported names and return shapes.

// Tracked pages with their human label and buying-intent classification.
// Intent drives scoring: high (pricing/enterprise) > medium (docs/case studies) > low (blog/home).
// Unknown paths fall back to "low" intent in the relay.
export const PAGES = [
  { path: "/pricing/enterprise", label: "Enterprise Pricing", intent: "high" },
  { path: "/pricing", label: "Pricing", intent: "high" },
  { path: "/case-studies/fintech", label: "Fintech Case Study", intent: "medium" },
  { path: "/docs/api", label: "API Docs", intent: "medium" },
  { path: "/blog/automation", label: "Blog: Automation", intent: "low" },
  { path: "/", label: "Home", intent: "low" },
];

// Real public IPs used to seed a brand-new site / drive demo traffic, so the feed
// isn't empty before real beacons arrive. These resolve to real, well-known orgs.
export const SEED_IPS = [
  "8.8.8.8", // Google
  "1.1.1.1", // Cloudflare
  "13.107.42.14", // Microsoft
  "140.82.121.4", // GitHub
  "151.101.1.69", // Fastly
  "17.253.144.10", // Apple
];

// Private / link-local / CGNAT ranges that can never be a public org. Resolved to
// null (dropped) before we ever hit the network — these are LAN/loopback, not a
// browsing organization.
export const NON_CORPORATE_PREFIXES = [
  "10.",
  "192.168.",
  "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
  "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.",
  "169.254.", // link-local
  "100.64.", // carrier-grade NAT
  "127.", // loopback
];

// Contacts require a licensed B2B contact provider. With only free IP intelligence
// we have no real named decision-makers, so the contacts layer returns nothing and
// the endpoint says so. (Swap getContacts() for a real provider to populate this.)
export const CONTACTS_DB = {};
export const SUPPRESSION_LIST = new Set();

// ---------------------------------------------------------------------------
// Real reverse-IP resolution (ip-api.com, free tier: 45 req/min, HTTP only).
// Cached per-IP to stay well under the rate limit and to be fast on repeats.
// ---------------------------------------------------------------------------
const IP_CACHE = new Map(); // cleanIp -> { company: object|null, expires: number }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cleanIp(ip) {
  return String(ip).trim().replace(/^::ffff:/i, "");
}

function isPrivate(ip) {
  if (ip === "::1" || ip === "") return true;
  return NON_CORPORATE_PREFIXES.some((p) => ip.startsWith(p));
}

// Build a stable, readable aggregation key for an org (used as company.domain / id).
function orgKey(asname, org, isp, ip) {
  const base = asname || org || isp || ip || "unknown";
  return String(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

/**
 * Reverse-resolve a public IP to the real organization that owns it.
 * - Returns null for private/loopback/CGNAT ranges (never hit the network).
 * - Returns null on lookup failure or when ip-api can't resolve.
 * - Otherwise returns a real company-shaped record. The `_mobile/_proxy/_hosting`
 *   flags carry ip-api's network classification for the ICP/corporate filter.
 */
export async function reverseIpLookup(ip) {
  if (!ip || typeof ip !== "string") return null;
  const clean = cleanIp(ip);
  if (isPrivate(clean)) return null;

  const cached = IP_CACHE.get(clean);
  if (cached && cached.expires > Date.now()) return cached.company;

  let company = null;
  try {
    const url =
      `http://ip-api.com/json/${encodeURIComponent(clean)}` +
      `?fields=status,message,country,countryCode,regionName,city,isp,org,as,asname,mobile,proxy,hosting,query`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data.status === "success") {
      const name = data.org || data.asname || data.isp || "Unknown organization";
      company = {
        domain: orgKey(data.asname, data.org, data.isp, clean),
        name,
        industry: data.hosting
          ? "Hosting / Cloud"
          : data.mobile
          ? "Mobile carrier"
          : "Corporate / ISP",
        size: null,
        country: data.country || null,
        city: data.city || null,
        region: data.regionName || null,
        isp: data.isp || null,
        asn: data.as || null,
        logo: null,
        _mobile: !!data.mobile,
        _proxy: !!data.proxy,
        _hosting: !!data.hosting,
      };
    }
  } catch (e) {
    company = null; // network error — drop rather than guess
  }

  IP_CACHE.set(clean, { company, expires: Date.now() + CACHE_TTL_MS });
  return company;
}

/**
 * Corporate/ICP filter. With only free IP data we have no industry, so this is a
 * network-quality gate rather than an industry ICP: drop mobile-carrier and known
 * proxy/VPN exits (a person on a phone or anonymizer, not an identifiable org
 * network). Keeps the exported name for the relay's pipeline contract.
 */
export function isTargetIndustry(company) {
  return !!company && !company._mobile && !company._proxy;
}

/**
 * Contacts: no licensed provider configured, so always empty. Endpoint surfaces a
 * message explaining a licensed provider is required. Keeps the seniority-sort and
 * suppression behavior for when a real CONTACTS_DB is swapped in.
 */
const SENIORITY_RANK = { cxo: 0, vp: 1, director: 2, manager: 3, ic: 4 };

export function getContacts(domain) {
  const list = CONTACTS_DB[domain] || [];
  return list
    .filter((c) => !SUPPRESSION_LIST.has(c.email))
    .slice()
    .sort(
      (a, b) =>
        (SENIORITY_RANK[a.seniority] ?? 99) - (SENIORITY_RANK[b.seniority] ?? 99)
    );
}
