// server/index.js
//
// De-Anonymized B2B Inbound Radar — relay.
//
// Pipeline: tracker beacon -> POST /api/collect (or /webhook) -> REAL reverse-IP to org (ip-api) ->
// corporate filter -> aggregate session per (site, orgKey) -> compute lead score ->
// save in MongoDB -> broadcast over SSE -> React feed. On-page SEO captured by the beacon is scored and
// stored per (site, path) in MongoDB.
//
// Compliance: we resolve to the ORGANIZATION/network that owns the IP only, never an
// individual. Free IP data cannot map an IP to a company domain or to named people;
// the /contacts layer requires a licensed provider and returns nothing until one is set.

import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PAGES,
  SEED_IPS,
  reverseIpLookup,
  isTargetIndustry,
  getContacts,
  CONTACTS_DB,
} from "./mock-data.js";
import { scoreSeo } from "./seo.js";
import {
  connectDB,
  SessionModel,
  VisitModel,
  SeoSnapshotModel,
} from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = 4000;

// ---------------------------------------------------------------------------
// Lead scoring.
// ---------------------------------------------------------------------------
const intentWeight = { high: 40, medium: 15, low: 5 };

function computeScore(timeline, totalSeconds) {
  const intentSum = timeline.reduce(
    (acc, t) => acc + (intentWeight[t.intent] ?? 5),
    0
  );
  return Math.min(100, intentSum + Math.floor(totalSeconds / 30));
}

// ---------------------------------------------------------------------------
// Site normalization: lowercase, strip scheme, leading www., and any
// path/query/hash -> bare host.
// ---------------------------------------------------------------------------
function normalizeSite(input) {
  if (!input || typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme://
  s = s.replace(/^www\./, ""); // strip leading www.
  s = s.split("/")[0]; // drop path
  s = s.split("?")[0]; // drop query
  s = s.split("#")[0]; // drop hash
  return s.trim();
}

// ---------------------------------------------------------------------------
// SSE Clients and active sites registry.
// ---------------------------------------------------------------------------
// sseClients: Map<site, Set<res>>
const sseClients = new Map();
// activeSites: sites that have an open SSE connection -> receive demo traffic
const activeSites = new Set();

// ---------------------------------------------------------------------------
// Aggregation: fold one resolved visit into the (site, orgKey) session in DB.
// `client` carries the real per-visit telemetry the beacon sent (device, browser,
// os, referrer, ...). Returns the updated session object.
// ---------------------------------------------------------------------------
async function aggregateVisit(site, company, page, durationSec, ts, client = {}) {
  const dwell = Math.max(0, Math.round(Number(durationSec) || 0));
  const when = ts ? new Date(ts) : new Date();
  const iso = isNaN(when.getTime()) ? new Date() : when;

  const pageMeta =
    PAGES.find((p) => p.path === page) || { path: page, label: page, intent: "low" };

  const timelineEntry = {
    path: pageMeta.path,
    label: pageMeta.label,
    intent: pageMeta.intent,
    durationSec: dwell,
    ts: iso,
    device: client.device || null,
    browser: client.browser || null,
    os: client.os || null,
    referrer: client.referrer || null,
    country: company.country || null,
    city: company.city || null,
  };

  let sessionDoc = await SessionModel.findOne({ site, "company.domain": company.domain });

  if (!sessionDoc) {
    sessionDoc = new SessionModel({
      id: company.domain,
      site,
      company: {
        domain: company.domain,
        name: company.name,
        industry: company.industry,
        size: company.size,
        country: company.country,
        city: company.city || null,
        region: company.region || null,
        isp: company.isp || null,
        asn: company.asn || null,
        logo: company.logo,
      },
      firstSeen: iso,
      lastSeen: iso,
      totalSeconds: 0,
      pageViews: 0,
      timeline: [],
      client: {
        device: client.device || null,
        browser: client.browser || null,
        os: client.os || null,
        language: client.language || null,
        referrer: client.referrer || null,
      },
      score: 0,
      hot: false,
      hasContacts: false,
    });
  }

  sessionDoc.totalSeconds += dwell;
  sessionDoc.pageViews += 1;
  sessionDoc.lastSeen = iso;
  if (iso < sessionDoc.firstSeen) sessionDoc.firstSeen = iso;

  // Refresh latest client snapshot + any geo we learned
  sessionDoc.client = {
    device: client.device || sessionDoc.client?.device || null,
    browser: client.browser || sessionDoc.client?.browser || null,
    os: client.os || sessionDoc.client?.os || null,
    language: client.language || sessionDoc.client?.language || null,
    referrer: client.referrer || sessionDoc.client?.referrer || null,
  };
  if (company.city) sessionDoc.company.city = company.city;
  if (company.region) sessionDoc.company.region = company.region;
  if (company.isp) sessionDoc.company.isp = company.isp;
  if (company.asn) sessionDoc.company.asn = company.asn;

  // Newest-first, capped at 20
  sessionDoc.timeline.unshift(timelineEntry);
  if (sessionDoc.timeline.length > 20) sessionDoc.timeline.length = 20;

  sessionDoc.score = computeScore(sessionDoc.timeline, sessionDoc.totalSeconds);
  sessionDoc.hot = sessionDoc.score >= 60;
  sessionDoc.hasContacts = Array.isArray(CONTACTS_DB[company.domain])
    ? CONTACTS_DB[company.domain].length > 0
    : false;

  await sessionDoc.save();

  // Write individual visit to log
  try {
    const visitDoc = new VisitModel({
      clientId: client.clientId || null,
      site,
      page,
      url: client.url || null,
      durationSec: dwell,
      ts: iso,
      ip: client.ip || null,
      device: client.device || null,
      browser: client.browser || null,
      os: client.os || null,
      screen: client.screen || null,
      viewport: client.viewport || null,
      language: client.language || null,
      timezone: client.timezone || null,
      referrer: client.referrer || null,
      scrollDepth: client.scrollDepth || 0,
      utm: client.utm || {},
      performance: client.performance || {},
      company: sessionDoc.company,
      score: sessionDoc.score,
      hot: sessionDoc.hot
    });
    await visitDoc.save();
  } catch (err) {
    console.error("Failed to save visit record to MongoDB:", err);
  }

  return sessionDoc.toObject();
}

// ---------------------------------------------------------------------------
// SEO snapshot store: score a real on-page SEO capture and keep the latest per path in DB.
// ---------------------------------------------------------------------------
async function storeSeo(site, path, url, seo) {
  if (!seo || typeof seo !== "object") return;
  const { score, recommendations } = scoreSeo(seo);
  
  await SeoSnapshotModel.findOneAndUpdate(
    { site, path: path || "/" },
    {
      site,
      path: path || "/",
      url: url || null,
      title: seo.title || null,
      capturedAt: new Date(),
      seo,
      score,
      recommendations
    },
    { upsert: true, new: true }
  );
}

async function buildSeoReport(site) {
  const pages = await SeoSnapshotModel.find({ site });
  const overallScore = pages.length
    ? Math.round(pages.reduce((s, p) => s + (p.score || 0), 0) / pages.length)
    : 0;
  const recommendations = [];
  for (const p of pages) {
    for (const r of p.recommendations || []) {
      recommendations.push({ ...r, page: p.path });
    }
  }
  const severityRank = { critical: 0, warning: 1, info: 2 };
  recommendations.sort(
    (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
  );
  return {
    site,
    overallScore,
    pagesAnalyzed: pages.length,
    pages: pages
      .map((p) => ({
        path: p.path,
        url: p.url,
        title: p.title,
        score: p.score,
        issues: (p.recommendations || []).length,
        capturedAt: p.capturedAt,
      }))
      .sort((a, b) => a.score - b.score), // worst first
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// SSE broadcast: write the visit frame to every client subscribed to `site`.
// ---------------------------------------------------------------------------
function broadcast(site, session) {
  const clients = sseClients.get(site);
  if (!clients || clients.size === 0) return;
  const frame = `event: visit\ndata: ${JSON.stringify(session)}\n\n`;
  for (const res of clients) {
    res.write(frame);
  }
}

// ---------------------------------------------------------------------------
// IP extraction for /api/collect and /webhook.
// ---------------------------------------------------------------------------
function extractIp(req) {
  if (req.body && req.body.ip) return String(req.body.ip).trim();
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || "";
}

// Pull the real per-visit client telemetry out of a beacon body.
function extractClient(body) {
  return {
    device: body.device || null,
    browser: body.browser || null,
    os: body.os || null,
    language: body.language || null,
    referrer: body.referrer || null,
    screen: body.screen || null,
  };
}

// ---------------------------------------------------------------------------
// Demo / seed traffic: resolve REAL seed IPs so a fresh feed isn't empty.
// ---------------------------------------------------------------------------
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function synthesizeVisit(site) {
  const ip = randomItem(SEED_IPS);
  const page = randomItem(PAGES).path;
  const durationSec = 20 + Math.floor(Math.random() * 221); // 20..240
  const ts = new Date().toISOString();

  const company = await reverseIpLookup(ip);
  if (!company || !isTargetIndustry(company)) return;

  const session = await aggregateVisit(site, company, page, durationSec, ts, {
    device: "desktop",
    browser: "Chrome",
    os: "—",
    ip
  });
  broadcast(site, session);
}

const DEMO_ON = process.env.DEMO !== "off";
if (DEMO_ON) {
  setInterval(() => {
    for (const site of activeSites) synthesizeVisit(site).catch(() => {});
  }, 4000);
}

// Seed a brand-new site with a few real-IP visits so the feed isn't empty.
async function seedSite(site) {
  const ips = [...SEED_IPS].sort(() => Math.random() - 0.5).slice(0, 4);
  for (const ip of ips) {
    const company = await reverseIpLookup(ip);
    if (!company || !isTargetIndustry(company)) continue;
    const page = randomItem(PAGES).path;
    const durationSec = 20 + Math.floor(Math.random() * 221);
    await aggregateVisit(site, company, page, durationSec, new Date().toISOString(), {
      device: "desktop",
      browser: "Chrome",
      os: "—",
      ip
    });
  }
}

// ---------------------------------------------------------------------------
// Express app.
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "256kb" }));
// Open CORS everywhere: collect, webhook and radar.js are hit from arbitrary client origins,
// and the dashboard talks to us through its dev proxy. This relay holds no secrets.
app.use(cors());

// Serve the tracker beacon cross-site. Read from disk on each request so edits to the
// tracker are picked up without restarting the relay.
const TRACKER_PATH = join(__dirname, "..", "tracker", "radar.js");
app.get("/radar.js", (req, res) => {
  let src;
  try {
    src = readFileSync(TRACKER_PATH, "utf8");
  } catch {
    res.status(404).type("application/javascript").send("// radar.js not found");
    return;
  }
  res.set("Content-Type", "application/javascript");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(src);
});

// Health.
app.get("/health", async (req, res) => {
  try {
    const sitesCount = await SessionModel.distinct("site");
    res.json({ ok: true, sites: sitesCount.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ingestion API (High-throughput): Receives the payload and immediately acknowledges receipt
app.post("/api/collect", (req, res) => {
  const body = req.body || {};
  const site = normalizeSite(body.site);
  if (!site) {
    res.json({ status: "dropped", reason: "missing site" });
    return;
  }

  const ip = extractIp(req);

  // Acknowledge receipt immediately (202 Accepted)
  res.status(202).json({ status: "received", message: "Event queued for processing" });

  // Process enrichment & storage asynchronously in the background
  processEventAsync(site, ip, body).catch((err) => {
    console.error("[Background Ingestion Error]:", err);
  });
});

// Background worker for processing events
async function processEventAsync(site, ip, body) {
  let company;
  try {
    company = await reverseIpLookup(ip);
  } catch {
    company = null;
  }
  if (!company) {
    console.log(`[Queue] Event dropped: Unresolved IP ${ip} for site ${site}`);
    return;
  }
  if (!isTargetIndustry(company)) {
    console.log(`[Queue] Event dropped: Non-corporate IP for company ${company.name} (${company.domain}) for site ${site}`);
    return;
  }

  const clientInfo = {
    ...extractClient(body),
    clientId: body.clientId || null,
    url: body.url || null,
    ip,
    screen: body.screen || null,
    viewport: body.viewport || null,
    timezone: body.timezone || null,
    scrollDepth: body.scrollDepth || 0,
    utm: body.utm || {},
    performance: body.performance || {}
  };

  const session = await aggregateVisit(
    site,
    company,
    body.page || "/",
    body.durationSec,
    body.ts,
    clientInfo
  );

  if (body.seo) {
    await storeSeo(site, body.page || "/", body.url, body.seo);
  }

  broadcast(site, session);
  console.log(`[Queue] Event processed: ${company.name} on ${site}`);
}

// Full pipeline: REAL resolve IP -> org -> corporate filter -> aggregate -> broadcast.
app.post("/webhook", async (req, res) => {
  const body = req.body || {};
  const site = normalizeSite(body.site);
  if (!site) {
    res.json({ status: "dropped", reason: "missing site" });
    return;
  }

  const ip = extractIp(req);
  let company;
  try {
    company = await reverseIpLookup(ip);
  } catch {
    company = null;
  }
  if (!company) {
    res.json({ status: "dropped", reason: "unresolved ip", site });
    return;
  }
  if (!isTargetIndustry(company)) {
    res.json({
      status: "dropped",
      reason: "non-corporate (mobile/proxy)",
      site,
      domain: company.domain,
    });
    return;
  }

  const clientInfo = {
    ...extractClient(body),
    clientId: body.clientId || null,
    url: body.url || null,
    ip,
    screen: body.screen || null,
    viewport: body.viewport || null,
    timezone: body.timezone || null,
    scrollDepth: body.scrollDepth || 0,
    utm: body.utm || {},
    performance: body.performance || {}
  };

  const session = await aggregateVisit(
    site,
    company,
    body.page || "/",
    body.durationSec,
    body.ts,
    clientInfo
  );
  
  if (body.seo) await storeSeo(site, body.page || "/", body.url, body.seo);
  broadcast(site, session);

  res.json({
    status: "tracked",
    site,
    domain: company.domain,
    org: company.name,
    score: session.score,
  });
});

// Already-resolved + filtered hit (what n8n calls): aggregate + broadcast.
app.post("/ingest", async (req, res) => {
  const body = req.body || {};
  const site = normalizeSite(body.site);
  const company = body.company;
  if (!site || !company || !company.domain) {
    res.status(400).json({ status: "dropped", reason: "missing site or company" });
    return;
  }

  try {
    const clientInfo = {
      ...extractClient(body),
      clientId: body.clientId || null,
      url: body.url || null,
      ip: body.ip || null,
      screen: body.screen || null,
      viewport: body.viewport || null,
      timezone: body.timezone || null,
      scrollDepth: body.scrollDepth || 0,
      utm: body.utm || {},
      performance: body.performance || {}
    };

    const session = await aggregateVisit(
      site,
      {
        domain: company.domain,
        name: company.name,
        industry: company.industry,
        size: company.size,
        country: company.country,
        city: company.city,
        region: company.region,
        isp: company.isp,
        asn: company.asn,
        logo: company.logo,
      },
      body.page || "/",
      body.durationSec,
      body.ts,
      clientInfo
    );
    if (body.seo) await storeSeo(site, body.page || "/", body.url, body.seo);
    broadcast(site, session);

    res.json({ status: "tracked" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE feed.
app.get("/events", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) {
    res.status(400).json({ error: "site is required" });
    return;
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Register the site as active (it now receives demo traffic).
  activeSites.add(site);
  if (!sseClients.has(site)) sseClients.set(site, new Set());
  sseClients.get(site).add(res);

  try {
    // Seed if this site has no sessions in MongoDB yet
    const count = await SessionModel.countDocuments({ site });
    if (count === 0) {
      await seedSite(site);
    }

    // Replay all current sessions from DB to the newly connected client.
    const allSessions = await SessionModel.find({ site }).sort({ lastSeen: -1 });
    for (const session of allSessions) {
      res.write(`event: visit\ndata: ${JSON.stringify(session.toObject())}\n\n`);
    }
  } catch (err) {
    console.error("Error seeding or fetching sessions for SSE client:", err);
  }

  // Keep-alive comment ping so proxies don't drop the idle connection.
  const ping = setInterval(() => res.write(`: ping\n\n`), 25000);

  req.on("close", () => {
    clearInterval(ping);
    const clients = sseClients.get(site);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(site);
        activeSites.delete(site);
      }
    }
  });
});

// Snapshot of sessions for a site, sorted by lastSeen desc.
app.get("/sessions", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) {
    res.status(400).json({ error: "site is required" });
    return;
  }
  try {
    const list = await SessionModel.find({ site }).sort({ lastSeen: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real on-page SEO report for a site (scored snapshots per path).
app.get("/seo", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) {
    res.status(400).json({ error: "site is required" });
    return;
  }
  try {
    const report = await buildSeoReport(site);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// On-demand contacts layer. No licensed provider configured -> empty, with a message.
app.get("/contacts/:domain", (req, res) => {
  const domain = String(req.params.domain || "").toLowerCase();
  const contacts = getContacts(domain);
  res.json({
    domain,
    source: "Licensed B2B contact provider (not configured)",
    disclaimer:
      "Named contacts require a licensed B2B data provider, which is not configured. " +
      "We resolve inbound traffic to the organization/network that owns the IP only — " +
      "never to an individual visitor. Add a provider key to populate real contacts.",
    count: contacts.length,
    contacts,
  });
});

// ---------------------------------------------------------------------------
// Analytics Endpoints (Weekly Top Companies, Pages by Industry, Funnel)
// ---------------------------------------------------------------------------
app.get("/api/analytics/top-companies", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const results = await VisitModel.aggregate([
      {
        $match: {
          site,
          ts: { $gte: sevenDaysAgo },
          "company.domain": { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$company.domain",
          name: { $first: "$company.name" },
          logo: { $first: "$company.logo" },
          industry: { $first: "$company.industry" },
          country: { $first: "$company.country" },
          pageViews: { $sum: 1 },
          score: { $max: "$score" }
        }
      },
      { $sort: { pageViews: -1 } },
      { $limit: 10 }
    ]);

    const formatted = results.map(r => ({
      id: r._id,
      name: r.name,
      logo: r.logo,
      industry: r.industry,
      country: r.country,
      pageViews: r.pageViews,
      score: r.score
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/pages-by-industry", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });

  try {
    const results = await VisitModel.aggregate([
      {
        $match: {
          site,
          "company.industry": { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            industry: "$company.industry",
            page: "$page"
          },
          pageViews: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          industry: "$_id.industry",
          page: "$_id.page",
          pageViews: 1
        }
      },
      { $sort: { pageViews: -1 } },
      { $limit: 15 }
    ]);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/conversion-funnel", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });

  try {
    const allSessions = await SessionModel.find({ site });

    const total = allSessions.length;
    const engaged = allSessions.filter(s => s.pageViews > 1 || s.totalSeconds >= 30).length;
    const highIntentPages = allSessions.filter(s => 
      s.timeline.some(t => t.intent === "high" || t.intent === "medium")
    ).length;
    const hotLeads = allSessions.filter(s => s.score >= 60).length;

    res.json([
      { stage: "Total Companies", count: total, pct: 100 },
      { stage: "Engaged (Click/Dwell)", count: engaged, pct: total ? Math.round((engaged / total) * 100) : 0 },
      { stage: "Target Interest (High/Med)", count: highIntentPages, pct: total ? Math.round((highIntentPages / total) * 100) : 0 },
      { stage: "Hot Leads (Score >= 60)", count: hotLeads, pct: total ? Math.round((hotLeads / total) * 100) : 0 }
    ]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await connectDB();
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
  }

  app.listen(PORT, () => {
    console.log(`B2B Inbound Radar relay listening on http://localhost:${PORT}`);
    console.log(`  -> tracker served at  http://localhost:${PORT}/radar.js`);
    console.log(`  -> reverse-IP: REAL via ip-api.com (free, cached 1h)`);
    console.log(
      `  -> demo traffic generator is ${DEMO_ON ? "ON (every 4000ms per active site, real seed IPs)" : "OFF (DEMO=off)"}`
    );
  });
}

startServer();
