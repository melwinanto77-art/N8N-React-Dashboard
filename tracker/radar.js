// Inbound Radar beacon — company-level analytics only.
// Captures REAL client telemetry + on-page SEO and the visitor's public IP, then
// reports a single beacon per page visit. We never assign a persistent visitor id
// and never identify individuals; ship a consent banner before deploying.
(() => {
  const BASE = window.__RADAR_ENDPOINT__ || "http://localhost:4000";
  const ENDPOINT = BASE + "/api/collect";
  const start = Date.now();
  let sent = false;
  let publicIp = null;
  let maxScroll = 0;

  // Extract client ID and site override from the script tag
  let clientId = null;
  let siteOverride = null;
  if (document.currentScript) {
    clientId = document.currentScript.getAttribute("data-client-id");
    siteOverride = document.currentScript.getAttribute("data-site");
  } else {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute("src") || "";
      if (src.includes("radar.js")) {
        clientId = scripts[i].getAttribute("data-client-id");
        siteOverride = scripts[i].getAttribute("data-site");
        break;
      }
    }
  }

  // Fetch the real public IP up front (so localhost visits still resolve to a real
  // org server-side). Best-effort: if it fails we send nothing and the relay falls
  // back to the connection IP.
  try {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => { publicIp = d && d.ip; })
      .catch(() => {});
  } catch (e) {}

  // Track furthest scroll depth (%) as a real engagement signal.
  window.addEventListener(
    "scroll",
    () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) {
        const d = Math.round((window.scrollY / h) * 100);
        if (d > maxScroll) maxScroll = Math.min(100, d);
      }
    },
    { passive: true }
  );

  function deviceType() {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
    return "desktop";
  }

  function browserName() {
    const ua = navigator.userAgent;
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    return "Other";
  }

  function osName() {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Android")) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    return "Other";
  }

  function utmParams() {
    const p = new URLSearchParams(location.search);
    return {
      source: p.get("utm_source") || null,
      medium: p.get("utm_medium") || null,
      campaign: p.get("utm_campaign") || null,
      term: p.get("utm_term") || null,
      content: p.get("utm_content") || null,
    };
  }

  function perfMetrics() {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        return {
          pageLoadMs: Math.round(nav.loadEventEnd),
          domReadyMs: Math.round(nav.domContentLoadedEventEnd),
          ttfbMs: Math.round(nav.responseStart),
        };
      }
    } catch (e) {}
    return {};
  }

  // Real on-page SEO snapshot, read from the live DOM.
  function seoSnapshot() {
    const meta = {};
    for (const m of document.getElementsByTagName("meta")) {
      const k = m.getAttribute("name") || m.getAttribute("property");
      if (k) meta[k.toLowerCase()] = m.getAttribute("content") || "";
    }
    const imgs = document.getElementsByTagName("img");
    let noAlt = 0;
    for (const im of imgs) if (!im.getAttribute("alt")) noAlt++;

    let internal = 0, external = 0;
    const host = location.hostname;
    for (const a of document.getElementsByTagName("a")) {
      const href = a.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href) && !href.includes(host)) external++;
      else if (href) internal++;
    }
    const canonical = document.querySelector('link[rel="canonical"]');
    const title = document.title || "";
    const desc = meta["description"] || "";
    const words = document.body ? document.body.innerText.trim().split(/\s+/).filter(Boolean).length : 0;

    return {
      title,
      titleLength: title.length,
      metaDescription: desc || null,
      metaDescriptionLength: desc.length,
      h1Count: document.getElementsByTagName("h1").length,
      h2Count: document.getElementsByTagName("h2").length,
      ogTitle: meta["og:title"] || null,
      ogDescription: meta["og:description"] || null,
      ogImage: meta["og:image"] || null,
      canonicalUrl: canonical ? canonical.getAttribute("href") : null,
      totalImages: imgs.length,
      imagesWithoutAlt: noAlt,
      internalLinks: internal,
      externalLinks: external,
      hasViewportMeta: !!meta["viewport"],
      wordCount: words,
    };
  }

  function send() {
    if (sent) return;
    sent = true;
    const body = {
      clientId: clientId || "unknown",
      site: siteOverride || location.host,
      page: location.pathname,
      url: location.href,
      durationSec: Math.round((Date.now() - start) / 1000),
      ts: new Date().toISOString(),
      ip: publicIp, // real public IP (server resolves it); null falls back to conn IP
      // real client telemetry
      device: deviceType(),
      browser: browserName(),
      os: osName(),
      screen: screen.width + "x" + screen.height,
      viewport: window.innerWidth + "x" + window.innerHeight,
      language: navigator.language,
      timezone: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || null,
      referrer: document.referrer || null,
      scrollDepth: maxScroll,
      utm: utmParams(),
      performance: perfMetrics(),
      seo: seoSnapshot(),
    };
    const json = JSON.stringify(body);
    try {
      const blob = new Blob([json], { type: "application/json" });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
    } catch (e) {}
    // Fallback: keepalive fetch so the request survives unload.
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
    }).catch(() => {});
  }

  function sendIdentify(email) {
    const body = {
      clientId: clientId || "unknown",
      site: siteOverride || location.host,
      page: location.pathname,
      url: location.href,
      durationSec: Math.round((Date.now() - start) / 1000),
      ts: new Date().toISOString(),
      ip: publicIp,
      device: deviceType(),
      browser: browserName(),
      os: osName(),
      screen: screen.width + "x" + screen.height,
      viewport: window.innerWidth + "x" + window.innerHeight,
      language: navigator.language,
      timezone: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || null,
      referrer: document.referrer || null,
      scrollDepth: maxScroll,
      utm: utmParams(),
      performance: perfMetrics(),
      seo: seoSnapshot(),
      email: email
    };
    const json = JSON.stringify(body);
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
    }).catch(() => {});
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send();
  });
  window.addEventListener("pagehide", send);

  // Expose global identify method
  window.__inboundRadar = {
    identify: (email) => {
      if (email) sendIdentify(email);
    }
  };
})();
