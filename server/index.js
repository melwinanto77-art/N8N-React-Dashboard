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
import { scoreSeo, scoreAeoAndGeo } from "./seo.js";
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
  s = s.trim();
  
  if (
    s === "localhost:3100" ||
    s === "localhost:3000" ||
    s === "localhost" ||
    s === "127.0.0.1" ||
    s === "127.0.0.1:3100" ||
    s === "127.0.0.1:3000"
  ) {
    return "sashainfinity.com";
  }
  
  return s;
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
    email: client.email || null,
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
      identifiedEmail: client.email || null,
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
  if (client.email) sessionDoc.identifiedEmail = client.email;

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
      hot: sessionDoc.hot,
      email: client.email || null
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
  const { aeoScore, geoScore, aeoRecommendations, geoRecommendations } = scoreAeoAndGeo(seo);
  
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
      recommendations,
      aeoScore,
      geoScore,
      aeoRecommendations,
      geoRecommendations
    },
    { upsert: true, new: true }
  );
}

async function buildSeoReport(site) {
  const pages = await SeoSnapshotModel.find({ site });
  const overallScore = pages.length
    ? Math.round(pages.reduce((s, p) => s + (p.score || 0), 0) / pages.length)
    : 0;
  const overallAeoScore = pages.length
    ? Math.round(pages.reduce((s, p) => s + (p.aeoScore || 0), 0) / pages.length)
    : 0;
  const overallGeoScore = pages.length
    ? Math.round(pages.reduce((s, p) => s + (p.geoScore || 0), 0) / pages.length)
    : 0;
    
  const recommendations = [];
  const aeoRecommendations = [];
  const geoRecommendations = [];
  
  for (const p of pages) {
    for (const r of p.recommendations || []) {
      recommendations.push({ ...r, page: p.path });
    }
    for (const r of p.aeoRecommendations || []) {
      aeoRecommendations.push({ ...r, page: p.path });
    }
    for (const r of p.geoRecommendations || []) {
      geoRecommendations.push({ ...r, page: p.path });
    }
  }
  
  const severityRank = { critical: 0, warning: 1, info: 2 };
  const sortRecs = (arr) => arr.sort(
    (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
  );
  
  return {
    site,
    overallScore,
    overallAeoScore,
    overallGeoScore,
    pagesAnalyzed: pages.length,
    pages: pages
      .map((p) => ({
        path: p.path,
        url: p.url,
        title: p.title,
        score: p.score,
        aeoScore: p.aeoScore || 0,
        geoScore: p.geoScore || 0,
        issues: (p.recommendations || []).length + (p.aeoRecommendations || []).length + (p.geoRecommendations || []).length,
        capturedAt: p.capturedAt,
      }))
      .sort((a, b) => a.score - b.score), // worst first
    recommendations: sortRecs(recommendations),
    aeoRecommendations: sortRecs(aeoRecommendations),
    geoRecommendations: sortRecs(geoRecommendations)
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

const DEMO_ON = false;
if (DEMO_ON) {
  setInterval(() => {
    for (const site of activeSites) synthesizeVisit(site).catch(() => {});
  }, 4000);
}

// Seed a brand-new site with the exact 17 high-fidelity corporate B2B sessions.
async function seedSite(site) {
  console.log(`[Seeder] Seeding custom B2B analytics data for site: ${site}`);
  
  const now = new Date();
  
  const mockDataset = [
    {
      company: { name: 'Microsoft Corporation', domain: 'microsoft.com', industry: 'Hosting / Cloud', size: '10,000+', country: 'United States', city: 'New York', logo: 'https://logo.clearbit.com/microsoft.com', asn: 'AS8075 Microsoft Corporation' },
      score: 100, hot: true, totalSeconds: 734, pageViews: 8,
      client: { device: 'tablet', browser: 'Chrome', os: 'Windows', referrer: 'https://linkedin.com' },
      identifiedEmail: 'team-lead-3@datadoghq.com',
      timeline: [
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 118, ts: new Date(now.getTime() - 1000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 97, ts: new Date(now.getTime() - 5000) },
        { path: '/docs/api', label: 'API Docs', intent: 'medium', durationSec: 95, ts: new Date(now.getTime() - 10000) },
        { path: '/contact', label: '/contact', intent: 'medium', durationSec: 71, ts: new Date(now.getTime() - 15000) },
        { path: '/pricing/enterprise', label: 'Enterprise Pricing', intent: 'high', durationSec: 47, ts: new Date(now.getTime() - 20000) },
        { path: '/docs/api', label: 'API Docs', intent: 'medium', durationSec: 96, ts: new Date(now.getTime() - 25000) },
        { path: '/contact', label: '/contact', intent: 'medium', durationSec: 94, ts: new Date(now.getTime() - 30000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 116, ts: new Date(now.getTime() - 35000) }
      ]
    },
    {
      company: { name: 'Fastly, Inc.', domain: 'fastly.com', industry: 'Hosting / Cloud', size: '1,000-5,000', country: 'Canada', city: 'Montreal', logo: 'https://logo.clearbit.com/fastly.com', asn: 'AS54113 Fastly, Inc.' },
      score: 37, hot: false, totalSeconds: 369, pageViews: 3,
      client: { device: 'desktop', browser: 'Chrome', os: '—', referrer: '' },
      timeline: [
        { path: '/', label: 'Home', intent: 'low', durationSec: 207, ts: new Date(now.getTime() - 1000) },
        { path: '/docs/api', label: 'API Docs', intent: 'medium', durationSec: 29, ts: new Date(now.getTime() - 5000) },
        { path: '/', label: 'Home', intent: 'low', durationSec: 133, ts: new Date(now.getTime() - 10000) }
      ]
    },
    {
      company: { name: 'GitHub, Inc.', domain: 'github.com', industry: 'Corporate / ISP', size: '1,000-5,000', country: 'Germany', city: 'Frankfurt am Main', logo: 'https://logo.clearbit.com/github.com', asn: 'AS36459 GitHub, Inc.' },
      score: 100, hot: true, totalSeconds: 781, pageViews: 5,
      client: { device: 'desktop', browser: 'Chrome', os: '—', referrer: '' },
      timeline: [
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 139, ts: new Date(now.getTime() - 1000) },
        { path: '/case-studies/fintech', label: 'Fintech Case Study', intent: 'medium', durationSec: 118, ts: new Date(now.getTime() - 5000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 185, ts: new Date(now.getTime() - 10000) },
        { path: '/case-studies/fintech', label: 'Fintech Case Study', intent: 'medium', durationSec: 152, ts: new Date(now.getTime() - 15000) },
        { path: '/pricing/enterprise', label: 'Enterprise Pricing', intent: 'high', durationSec: 187, ts: new Date(now.getTime() - 20000) }
      ]
    },
    {
      company: { name: 'Apple Inc', domain: 'apple.com', industry: 'Corporate / ISP', size: '10,000+', country: 'United States', city: 'Cupertino', logo: 'https://logo.clearbit.com/apple.com', asn: 'AS714 Apple Inc.' },
      score: 35, hot: false, totalSeconds: 450, pageViews: 2,
      client: { device: 'desktop', browser: 'Chrome', os: '—', referrer: '' },
      timeline: [
        { path: '/case-studies/fintech', label: 'Fintech Case Study', intent: 'medium', durationSec: 211, ts: new Date(now.getTime() - 1000) },
        { path: '/', label: 'Home', intent: 'low', durationSec: 239, ts: new Date(now.getTime() - 5000) }
      ]
    },
    {
      company: { name: 'Cloudflare, Inc.', domain: 'cloudflare.com', industry: 'Hosting / Cloud', size: '1,000-5,000', country: 'Canada', city: 'Toronto', logo: 'https://logo.clearbit.com/cloudflare.com', asn: 'AS13335 Cloudflare, Inc.' },
      score: 54, hot: false, totalSeconds: 281, pageViews: 2,
      client: { device: 'tablet', browser: 'Safari', os: 'Linux', referrer: 'https://github.com' },
      timeline: [
        { path: '/courses/fullstack-node', label: '/courses/fullstack-node', intent: 'high', durationSec: 157, ts: new Date(now.getTime() - 1000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 124, ts: new Date(now.getTime() - 5000) }
      ]
    },
    {
      company: { name: 'Google Cloud', domain: 'cloud.google.com', industry: 'Hosting / Cloud', size: '10,000+', country: 'United States', city: 'Kansas City', logo: 'https://logo.clearbit.com/google.com', asn: 'AS396982 Google LLC' },
      score: 68, hot: true, totalSeconds: 413, pageViews: 4,
      client: { device: 'tablet', browser: 'Edge', os: 'Linux', referrer: 'https://linkedin.com' },
      identifiedEmail: 'team-lead-2@atlassian.com',
      timeline: [
        { path: '/contact', label: '/contact', intent: 'medium', durationSec: 20, ts: new Date(now.getTime() - 1000) },
        { path: '/contact', label: '/contact', intent: 'medium', durationSec: 94, ts: new Date(now.getTime() - 5000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 106, ts: new Date(now.getTime() - 10000) },
        { path: '/courses/fullstack-node', label: '/courses/fullstack-node', intent: 'high', durationSec: 193, ts: new Date(now.getTime() - 15000) }
      ]
    },
    {
      company: { name: 'AWS EC2 (us-west-1)', domain: 'amazonaws.com', industry: 'Hosting / Cloud', size: '10,000+', country: 'United States', city: 'San Jose', logo: 'https://logo.clearbit.com/amazon.com', asn: 'AS16509 Amazon.com, Inc.' },
      score: 23, hot: false, totalSeconds: 261, pageViews: 3,
      client: { device: 'tablet', browser: 'Firefox', os: 'iOS', referrer: 'https://github.com' },
      identifiedEmail: 'team-lead-1@plaid.com',
      timeline: [
        { path: '/courses/react-native', label: '/courses/react-native', intent: 'high', durationSec: 118, ts: new Date(now.getTime() - 1000) },
        { path: '/courses/fullstack-node', label: '/courses/fullstack-node', intent: 'high', durationSec: 44, ts: new Date(now.getTime() - 5000) },
        { path: '/contact', label: '/contact', intent: 'medium', durationSec: 99, ts: new Date(now.getTime() - 10000) }
      ]
    },
    {
      company: { name: 'Google Public DNS', domain: 'dns.google', industry: 'Hosting / Cloud', size: '10,000+', country: 'United States', city: 'Ashburn', logo: 'https://logo.clearbit.com/google.com', asn: 'AS15169 Google LLC' },
      score: 100, hot: true, totalSeconds: 962, pageViews: 6,
      client: { device: 'desktop', browser: 'Chrome', os: '—', referrer: '' },
      timeline: [
        { path: '/case-studies/fintech', label: 'Fintech Case Study', intent: 'medium', durationSec: 99, ts: new Date(now.getTime() - 1000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 200, ts: new Date(now.getTime() - 5000) },
        { path: '/blog/automation', label: 'Blog: Automation', intent: 'low', durationSec: 152, ts: new Date(now.getTime() - 10000) },
        { path: '/docs/api', label: 'API Docs', intent: 'medium', durationSec: 191, ts: new Date(now.getTime() - 15000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 222, ts: new Date(now.getTime() - 20000) },
        { path: '/pricing', label: 'Pricing', intent: 'medium', durationSec: 98, ts: new Date(now.getTime() - 25000) }
      ]
    },
    {
      company: { name: 'Edgecast Inc', domain: 'edgecast.com', industry: 'Corporate / ISP', size: '1,000-5,000', country: 'Canada', city: 'Montreal', logo: 'https://logo.clearbit.com/edgecast.com', asn: '' },
      score: 18, hot: false, totalSeconds: 109, pageViews: 1,
      client: { device: 'mobile', browser: 'Firefox', os: 'Windows', referrer: 'https://github.com' },
      timeline: [
        { path: '/docs/api', label: 'API Docs', intent: 'medium', durationSec: 109, ts: new Date(now.getTime() - 1000) }
      ]
    },
    {
      company: { name: 'Snowflake', domain: 'snowflake.com', industry: 'Data Analytics', size: '5,000-10,000', country: 'US', city: 'Bozeman', logo: 'https://logo.clearbit.com/snowflake.com', asn: 'AS9876' },
      score: 93, hot: true, totalSeconds: 469, pageViews: 7,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      identifiedEmail: 'lead-architect@snowflake.com',
      timeline: [
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 51, ts: new Date(now.getTime() - 1000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 101, ts: new Date(now.getTime() - 5000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 25, ts: new Date(now.getTime() - 10000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 124, ts: new Date(now.getTime() - 15000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 73, ts: new Date(now.getTime() - 20000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 72, ts: new Date(now.getTime() - 25000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 23, ts: new Date(now.getTime() - 30000) }
      ]
    },
    {
      company: { name: 'GitHub', domain: 'github.com', industry: 'Software Development', size: '1,000-5,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/github.com', asn: 'AS3421' },
      score: 94, hot: true, totalSeconds: 528, pageViews: 7,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      timeline: [
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 102, ts: new Date(now.getTime() - 1000) },
        { path: '/pricing', label: 'Pricing Plans', intent: 'medium', durationSec: 86, ts: new Date(now.getTime() - 5000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 24, ts: new Date(now.getTime() - 10000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 62, ts: new Date(now.getTime() - 15000) },
        { path: '/pricing', label: 'Pricing Plans', intent: 'medium', durationSec: 47, ts: new Date(now.getTime() - 20000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 76, ts: new Date(now.getTime() - 25000) },
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 131, ts: new Date(now.getTime() - 30000) }
      ]
    },
    {
      company: { name: 'Plaid', domain: 'plaid.com', industry: 'Financial Tech', size: '500-1,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/plaid.com', asn: 'AS2311' },
      score: 85, hot: true, totalSeconds: 445, pageViews: 6,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      timeline: [
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 66, ts: new Date(now.getTime() - 1000) },
        { path: '/pricing', label: 'Pricing Plans', intent: 'medium', durationSec: 96, ts: new Date(now.getTime() - 5000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 103, ts: new Date(now.getTime() - 10000) },
        { path: '/pricing', label: 'Pricing Plans', intent: 'medium', durationSec: 72, ts: new Date(now.getTime() - 15000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 79, ts: new Date(now.getTime() - 20000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 29, ts: new Date(now.getTime() - 25000) }
      ]
    },
    {
      company: { name: 'Datadog', domain: 'datadoghq.com', industry: 'Cloud & DevOps', size: '1,000-5,000', country: 'US', city: 'New York', logo: 'https://logo.clearbit.com/datadoghq.com', asn: 'AS5432' },
      score: 94, hot: true, totalSeconds: 517, pageViews: 7,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      timeline: [
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 44, ts: new Date(now.getTime() - 1000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 21, ts: new Date(now.getTime() - 5000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 86, ts: new Date(now.getTime() - 10000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 52, ts: new Date(now.getTime() - 15000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 83, ts: new Date(now.getTime() - 20000) },
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 126, ts: new Date(now.getTime() - 25000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 105, ts: new Date(now.getTime() - 30000) }
      ]
    },
    {
      company: { name: 'HashiCorp', domain: 'hashicorp.com', industry: 'Software & Cloud', size: '1,000-5,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/hashicorp.com', asn: 'AS8976' },
      score: 77, hot: true, totalSeconds: 421, pageViews: 5,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      identifiedEmail: 'lead-architect@hashicorp.com',
      timeline: [
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 32, ts: new Date(now.getTime() - 1000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 98, ts: new Date(now.getTime() - 5000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 71, ts: new Date(now.getTime() - 10000) },
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 130, ts: new Date(now.getTime() - 15000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 90, ts: new Date(now.getTime() - 20000) }
      ]
    },
    {
      company: { name: 'Shopify', domain: 'shopify.com', industry: 'E-Commerce', size: '10,000+', country: 'CA', city: 'Ottawa', logo: 'https://logo.clearbit.com/shopify.com', asn: 'AS1342' },
      score: 100, hot: true, totalSeconds: 688, pageViews: 10,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      timeline: [
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 112, ts: new Date(now.getTime() - 1000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 40, ts: new Date(now.getTime() - 5000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 43, ts: new Date(now.getTime() - 10000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 101, ts: new Date(now.getTime() - 15000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 56, ts: new Date(now.getTime() - 20000) },
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 56, ts: new Date(now.getTime() - 25000) },
        { path: '/pricing', label: 'Pricing Plans', intent: 'medium', durationSec: 49, ts: new Date(now.getTime() - 30000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 98, ts: new Date(now.getTime() - 35000) },
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 34, ts: new Date(now.getTime() - 40000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 99, ts: new Date(now.getTime() - 45000) }
      ]
    },
    {
      company: { name: 'Stripe', domain: 'stripe.com', industry: 'Financial Services', size: '5,000-10,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/stripe.com', asn: 'AS3214' },
      score: 100, hot: true, totalSeconds: 624, pageViews: 9,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      identifiedEmail: 'lead-architect@stripe.com',
      timeline: [
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 35, ts: new Date(now.getTime() - 1000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 122, ts: new Date(now.getTime() - 5000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 72, ts: new Date(now.getTime() - 10000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 16, ts: new Date(now.getTime() - 15000) },
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 62, ts: new Date(now.getTime() - 20000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 84, ts: new Date(now.getTime() - 25000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 38, ts: new Date(now.getTime() - 30000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 87, ts: new Date(now.getTime() - 35000) },
        { path: '/', label: 'Home Page', intent: 'low', durationSec: 108, ts: new Date(now.getTime() - 40000) }
      ]
    },
    {
      company: { name: 'Atlassian', domain: 'atlassian.com', industry: 'Collaboration Software', size: '5,000-10,000', country: 'AU', city: 'Sydney', logo: 'https://logo.clearbit.com/atlassian.com', asn: 'AS6543' },
      score: 100, hot: true, totalSeconds: 540, pageViews: 8,
      client: { device: 'desktop', browser: 'Chrome', os: 'Windows', referrer: 'https://google.com' },
      identifiedEmail: 'lead-architect@atlassian.com',
      timeline: [
        { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high', durationSec: 134, ts: new Date(now.getTime() - 1000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 110, ts: new Date(now.getTime() - 5000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 75, ts: new Date(now.getTime() - 10000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 32, ts: new Date(now.getTime() - 15000) },
        { path: '/docs/api', label: 'Developer API Docs', intent: 'medium', durationSec: 17, ts: new Date(now.getTime() - 20000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 108, ts: new Date(now.getTime() - 25000) },
        { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low', durationSec: 31, ts: new Date(now.getTime() - 30000) },
        { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high', durationSec: 33, ts: new Date(now.getTime() - 35000) }
      ]
    }
  ];

  for (const data of mockDataset) {
    const session = new SessionModel({
      id: data.company.domain,
      site,
      company: data.company,
      firstSeen: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      lastSeen: now,
      totalSeconds: data.totalSeconds,
      pageViews: data.pageViews,
      timeline: data.timeline.map(t => ({
        ...t,
        device: data.client.device,
        browser: data.client.browser,
        os: data.client.os,
        referrer: data.client.referrer,
        country: data.company.country,
        city: data.company.city
      })),
      client: data.client,
      score: data.score,
      hot: data.hot,
      hasContacts: true,
      identifiedEmail: data.identifiedEmail || null
    });
    await session.save();

    for (const t of data.timeline) {
      const visit = new VisitModel({
        clientId: 'client_12345',
        site,
        page: t.path,
        url: `http://${site}${t.path}`,
        durationSec: t.durationSec,
        ts: t.ts,
        ip: '8.8.8.8',
        device: data.client.device,
        browser: data.client.browser,
        os: data.client.os,
        referrer: data.client.referrer,
        scrollDepth: 80,
        company: data.company,
        score: data.score,
        hot: data.hot,
        email: t.email || null
      });
      await visit.save();
    }
  }

  // Seed default SEO snapshots for this site
  const seoData = [
    { path: '/', title: 'Home Page', score: 95 },
    { path: '/pricing', title: 'Pricing Plans', score: 88 },
    { path: '/docs/api', title: 'Developer API Docs', score: 90 },
    { path: '/courses/react-native', title: 'React Native Masterclass', score: 82 },
    { path: '/courses/fullstack-node', title: 'Node.js & Express Course', score: 85 }
  ];

  for (const item of seoData) {
    const seo = new SeoSnapshotModel({
      site,
      path: item.path,
      url: `http://${site}${item.path}`,
      title: item.title,
      capturedAt: now,
      score: item.score,
      seo: {
        title: item.title,
        titleLength: item.title.length,
        metaDescription: `Discover and learn ${item.title} on our platform.`,
        metaDescriptionLength: 45,
        h1Count: 1,
        h2Count: 3,
        totalImages: 8,
        imagesWithoutAlt: 0,
        internalLinks: 15,
        externalLinks: 2,
        hasViewportMeta: true,
        wordCount: 650
      },
      recommendations: []
    });
    await seo.save();
  }

  console.log(`[Seeder] Successfully seeded ${mockDataset.length} B2B sessions for ${site}`);
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
    performance: body.performance || {},
    email: body.email || null
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
    performance: body.performance || {},
    email: body.email || null
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
      performance: body.performance || {},
      email: body.email || null
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

app.get("/api/analytics/pages", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });
  try {
    const pages = await VisitModel.aggregate([
      { $match: { site } },
      {
        $group: {
          _id: "$page",
          views: { $sum: 1 },
          avgDuration: { $avg: "$durationSec" },
          avgScroll: { $avg: "$scrollDepth" }
        }
      },
      { $sort: { views: -1 } }
    ]);
    res.json(pages.map(p => ({
      path: p._id,
      views: p.views,
      avgDuration: Math.round(p.avgDuration || 0),
      avgScroll: Math.round(p.avgScroll || 0)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/users", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });
  try {
    const sessions = await SessionModel.find({ site }).sort({ lastSeen: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/new-logins", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });
  try {
    const sessions = await SessionModel.find({ site, identifiedEmail: { $ne: null } }).sort({ lastSeen: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/overview", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });
  try {
    const totalPages = await VisitModel.distinct("page", { site });
    const totalUsers = await SessionModel.countDocuments({ site });
    const totalLogins = await SessionModel.countDocuments({ site, identifiedEmail: { $ne: null } });
    const hotLeads = await SessionModel.countDocuments({ site, hot: true });
    
    const totalDurationResult = await SessionModel.aggregate([
      { $match: { site } },
      { $group: { _id: null, totalSeconds: { $sum: "$totalSeconds" } } }
    ]);
    const totalSeconds = totalDurationResult.length ? totalDurationResult[0].totalSeconds : 0;
    const minutesEngaged = Math.round(totalSeconds / 60);
    
    // Calculate active users in the last 5 minutes (based on unique IPs or Client IDs)
    const activeUsersList = await VisitModel.distinct("ip", {
      site,
      ts: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
    });
    const activeUsers = activeUsersList.length;
    
    const perfData = await VisitModel.aggregate([
      { $match: { site, "performance.pageLoadMs": { $exists: true } } },
      { $group: {
          _id: null,
          avgPageLoad: { $avg: "$performance.pageLoadMs" },
          avgTtfb: { $avg: "$performance.ttfbMs" }
        }
      }
    ]);
    
    const avgPageLoadMs = perfData.length ? Math.round(perfData[0].avgPageLoad) : 0;
    const avgTtfbMs = perfData.length ? Math.round(perfData[0].avgTtfb) : 0;
    
    res.json({
      totalPages: totalPages.length,
      totalUsers,
      totalLogins,
      hotLeads,
      minutesEngaged,
      activeUsers,
      avgPageLoadMs,
      avgTtfbMs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/ai-summary", async (req, res) => {
  const { site, domain } = req.query;
  if (!site || !domain) {
    return res.status(400).json({ error: "site and domain are required" });
  }

  try {
    const session = await SessionModel.findOne({ site, id: domain });
    if (!session) {
      return res.status(404).json({ error: "Company session not found" });
    }

    const timelineStr = session.timeline
      .map(t => `- Page: ${t.path} (${t.label || ""}) for ${t.durationSec}s`)
      .join("\n");

    const prompt = `You are B2B Inbound Radar AI. Analyze this B2B visitor activity and respond in clean Markdown:

### 🎯 Intent Summary
[Provide a 2-sentence summary of what this company is searching for based on their page visits.]

### 📈 Buying Stage
**[Awareness, Consideration, or Decision]** (Brief 1-sentence explanation why)

### ✉️ Suggested Outreach
[A short, personalized 3-line email copy to send to their team.]

Visitor Activity for ${session.company.name}:
${timelineStr}`;

    const ollamaResponse = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: prompt,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error("Ollama returned an error");
    }

    const data = await ollamaResponse.json();
    res.json({ summary: data.response });
  } catch (err) {
    console.error("AI Summary Error:", err);
    res.status(503).json({
      error: "Local AI (Ollama) is offline or loading.",
      details: "Please make sure Ollama is running and you have run 'ollama run llama3' in your terminal."
    });
  }
});

app.get("/api/analytics/ai-site-analysis", async (req, res) => {
  const site = normalizeSite(req.query.site);
  if (!site) return res.status(400).json({ error: "site is required" });

  try {
    const sessions = await SessionModel.find({ site }).sort({ score: -1 }).limit(10);
    const totalPages = await VisitModel.distinct("page", { site });
    const totalUsers = await SessionModel.countDocuments({ site });
    const totalLogins = await SessionModel.countDocuments({ site, identifiedEmail: { $ne: null } });
    
    const pages = await VisitModel.aggregate([
      { $match: { site } },
      { $group: { _id: "$page", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 5 }
    ]);

    const logins = await SessionModel.find({ site, identifiedEmail: { $ne: null } }).sort({ lastSeen: -1 }).limit(5);

    const statsStr = `Site: ${site}
Total Unique Companies: ${totalUsers}
Total Unique Pages Tracked: ${totalPages.length}
Total Captured Logins: ${totalLogins}

Top 10 Engaged Companies:
${sessions.map(s => `- ${s.company.name} (${s.company.domain}) | Score: ${s.score} | Views: ${s.pageViews} | Email: ${s.identifiedEmail || "None"}`).join("\n")}

Top 5 Visited Pages:
${pages.map(p => `- ${p._id} | Views: ${p.views}`).join("\n")}

Recent Captured Logins:
${logins.map(l => `- Email: ${l.identifiedEmail} | Company: ${l.company.name}`).join("\n")}`;

    const prompt = `You are B2B Inbound Radar's Chief AI Analyst. Analyze this site-wide B2B traffic data and generate a comprehensive executive report in clean Markdown:

# 📊 Executive B2B Analytics Report for ${site}

### 1. 📈 Traffic & Intent Overview
[Provide a high-level summary of the traffic quality, company types, and overall intent levels.]

### 2. 🔥 Top Sales Opportunities
[Identify the most promising hot leads/companies from the list and explain why they should be contacted immediately.]

### 3. 🎯 Content & Page Performance
[Analyze which pages are driving the most high-intent engagement and what that tells us about the buyers' needs.]

### 4. 🚀 Actionable Recommendations
[Provide 3 specific, actionable sales or marketing recommendations to convert these leads.]

Site Traffic Data:
${statsStr}`;

    const ollamaResponse = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: prompt,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error("Ollama returned an error");
    }

    const data = await ollamaResponse.json();
    res.json({ report: data.response });
  } catch (err) {
    console.error("AI Site Analysis Error:", err);
    res.status(503).json({
      error: "Local AI (Ollama) is offline.",
      details: "Please make sure Ollama is running with 'ollama run llama3' to generate the AI site report."
    });
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
