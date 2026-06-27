# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

De-Anonymized B2B Inbound Radar ("Who is Browsing"). A JS beacon on a client
website reports a page visit with rich client telemetry + on-page SEO. The relay
**reverse-resolves the visitor's public IP to the real organization/network that
owns it** (via ip-api.com — never an individual), filters out mobile/proxy
networks, scores buying intent, aggregates one session per `(site, orgKey)`,
persists everything to **MongoDB**, and streams matching companies to a
real-time React sales feed over SSE. An on-demand contacts layer is wired but
returns nothing until a licensed provider is configured. **Company-level only;
no individual de-anonymization; no LinkedIn scraping.**

> Compliance note baked into the code: free IP intelligence can only map an IP to
> the owning **org/ASN** (an ISP, host, or company network), not to a company
> *domain* or named people. The "company" shown is the honest, coarse IP-owning
> org. Named contacts require a licensed vendor — see the swap-in seam below.

Deployable pieces:

- **`server/`** — Node/Express relay at **http://localhost:4000**, backed by
  **MongoDB** (Mongoose). Serves `/radar.js`, the HTTP/SSE contract, SEO +
  analytics endpoints, and a demo-traffic generator.
- **`dashboard/`** — Vite + React 18 sales UI at **http://localhost:5173** with a
  **Live Feed** tab (SSE) and an **Analytics** tab (REST aggregations).
- **`tracker/radar.js`** — the company-level beacon the relay serves at
  `/radar.js`. Captures real telemetry + on-page SEO + the visitor's public IP.
- **`n8n/workflow.json`** — importable workflow mirroring the resolve → filter
  pipeline that POSTs resolved hits to the relay's `/ingest`.
- **`backend/`** — a **separate, heavier reference platform** (Postgres + Redis +
  JWT auth + WebSocket + n8n via `docker-compose`). It is NOT the running relay;
  `server/seo.js` was adapted from its `seoService`. Treat it as a distinct app
  unless explicitly asked to work on it. See [The two backends](#the-two-backends).

## Commands

The relay requires a running **MongoDB** (default `mongodb://127.0.0.1:27017/b2b-radar`,
override with `MONGO_URI`). State now **persists across restarts** — it is no
longer in-memory. `mongodb_data/` is a local data dir (gitignored via `*.log`/
`node_modules` only — do not commit it).

```bash
# Relay (port 4000) — needs MongoDB up first
cd server && npm install && npm start
DEMO=off npm start                       # disable the synthetic demo traffic generator
MONGO_URI="mongodb://host:27017/db" npm start   # point at a different MongoDB
npm run dev                              # node --watch (auto-restart)

# Dashboard (port 5173) — proxies the relay (see vite.config.js)
cd dashboard && npm install && npm run dev
cd dashboard && npm run build            # production build

# Send a manual visit. The primary beacon endpoint is /api/collect (202, async).
# /webhook is the synchronous variant that returns the tracked/dropped result.
curl -X POST http://localhost:4000/webhook -H "Content-Type: application/json" \
  -d '{"site":"acme.com","page":"/pricing/enterprise","durationSec":120,"ip":"8.8.8.8","ts":"2026-06-27T12:00:00.000Z"}'

# Inspect state directly
curl 'http://localhost:4000/sessions?site=acme.com'   # sessions, newest first
curl 'http://localhost:4000/seo?site=acme.com'        # scored on-page SEO report
curl  http://localhost:4000/health                    # { ok, sites:N } — also pings Mongo

# The separate reference backend (Postgres/Redis/n8n)
cd backend && docker-compose up        # api on :3001, postgres :5432, redis :6379, n8n :5678
```

There is no test suite or linter configured. ES modules in `server/`,
`dashboard/`, `tracker/`; the `backend/api/` app is **CommonJS** (`require`).
2-space indentation throughout.

## Architecture

```
tracker/radar.js ──POST /api/collect──▶ server/index.js ──SSE /events──▶ dashboard (React)
  site,page,durationSec,ts,             reverseIpLookup ▸ real org (ip-api)   Live Feed + Analytics
  device/browser/os/screen,             corporate filter (drop mobile/proxy)
  utm,scrollDepth,performance,          aggregate session per (site,orgKey)
  public IP, on-page SEO                score ▸ persist to MongoDB ▸ broadcast
                                              ▲
        n8n/workflow.json ──POST /ingest (company already resolved + filtered)
```

- **`server/index.js`** wires everything: the ingest routes, scoring +
  aggregation (`aggregateVisit`), SEO storage/report (`storeSeo`/`buildSeoReport`),
  analytics aggregations, the SSE client registry + `broadcast`, the `/radar.js`
  static route, and the demo-traffic generator.
- **`server/db.js`** defines the Mongoose models and `connectDB()`. Three
  collections: **`Session`** (one per `(site, company.domain)`, unique compound
  index), **`Visit`** (one row per page view — the high-volume log analytics
  aggregate over), and **`SeoSnapshot`** (latest scored SEO per `(site, path)`,
  upserted). `connectDB()` runs in `startServer()` before `app.listen`.
- **`server/mock-data.js` is the single swap-in seam for real providers** —
  despite the name it now does **real** reverse-IP. See [the seam](#the-data-seam).
- **`server/seo.js`** is pure on-page SEO scoring: `scoreSeo(seo)` → `{ score,
  recommendations }`. No I/O or state.

### Three ingest paths converge on `aggregateVisit`

All three resolve to the identical session shape, scoring, MongoDB write, and
broadcast — only the front matter differs:

- **`POST /api/collect`** — the beacon's primary endpoint. Returns **202
  immediately** and runs `processEventAsync` (resolve → filter → aggregate →
  SEO → broadcast) in the background. Use this for high-throughput ingest.
- **`POST /webhook`** — the **synchronous** full pipeline. Same steps but awaits
  and returns `{ status: "tracked"|"dropped", reason?, site?, domain?, org?, score? }`.
  A `dropped` response (unresolved IP or mobile/proxy) is normal, not an error.
- **`POST /ingest`** — what n8n calls. The company is **already resolved and
  filtered**, so it skips resolve/ICP and only aggregates + broadcasts.

`aggregateVisit(site, company, page, durationSec, ts, client)` upserts the
`Session` doc, pushes onto `timeline` (newest-first, capped at 20), bumps
`totalSeconds`/`pageViews`/`lastSeen`, refreshes the latest client snapshot +
any geo (city/region/isp/asn), recomputes `score`/`hot`/`hasContacts`, saves,
**also writes a `Visit` row**, and returns the session object to broadcast.

### SSE feed and the session shape

- **`/events` requires `?site=`** (400 if missing). On connect it registers the
  site as **active** (so the demo generator targets it), **seeds the site from
  real SEED_IPS if it has zero sessions in Mongo**, replays every current session
  from the DB as `event: visit\ndata: <json>\n\n`, sends a `: ping\n\n`
  keep-alive every 25s, and removes the client on `req` close (dropping the site
  from `activeSites` when the last client leaves).
- **The SSE payload is the FULL session object, re-sent in its entirety on every
  update**, keyed by `id === company.domain`. The dashboard upserts by `id`; it
  never receives diffs. Shape (Mongoose doc; note `_id`/`__v`/`createdAt` etc.
  also ride along):
  `{ id, site, company:{domain,name,industry,size,country,city,region,isp,asn,logo},
  firstSeen, lastSeen, totalSeconds, pageViews, timeline:[{path,label,intent,
  durationSec,ts,device,browser,os,referrer,country,city}], client:{device,
  browser,os,language,referrer}, score, hot, hasContacts }`.

### SEO + analytics endpoints

- **`GET /seo?site=`** → `buildSeoReport`: averages per-page `SeoSnapshot` scores,
  lists pages worst-first, and flattens recommendations sorted by severity
  (`critical < warning < info`). Snapshots are written by `storeSeo` whenever a
  beacon body includes `seo`.
- **`GET /api/analytics/top-companies`** (last 7 days, Mongo `$group` over
  `Visit`), **`/api/analytics/pages-by-industry`**, **`/api/analytics/conversion-funnel`**
  (computed from `Session` docs). These power the dashboard Analytics tab.
- **`GET /contacts/:domain`** → `getContacts` (currently always empty — no
  provider). The response `disclaimer` must state these people work at the
  company and are **NOT** identified as the visitor; keep that wording.

### The data seam

`server/mock-data.js` exports the names the relay depends on — keep them and
their return shapes when swapping in real vendors:

- **`reverseIpLookup(ip)`** — calls **ip-api.com** (free tier, ~45 req/min, HTTP
  only), **cached per-IP for 1h**. Returns `null` for private/loopback/CGNAT
  (`NON_CORPORATE_PREFIXES`, checked before any network call) and on lookup
  failure (drop, never guess). Otherwise returns a real org record with
  `_mobile`/`_proxy`/`_hosting` classification flags.
- **`isTargetIndustry(company)`** — despite the name this is now a
  **network-quality gate**, not an industry ICP: `!company._mobile && !company._proxy`
  (drop phones and anonymizers). Free IP data has no real industry.
- **`PAGES`** (path → label + intent), **`SEED_IPS`** (real public IPs that
  resolve to well-known orgs, used to seed/demo so the feed isn't empty),
  **`CONTACTS_DB`** (empty `{}`), **`SUPPRESSION_LIST`** (empty `Set`),
  **`getContacts(domain)`** (filters suppression, sorts by seniority rank
  `cxo < vp < director < manager < ic`).

### Dashboard side

- **`dashboard/src/useRadarFeed.js` is the only thing that touches the SSE
  network.** It opens one `EventSource("/events?site=...")`, keeps an internal
  `Map<session.id, session>`, **upserts** each `visit` event (never diffs),
  tracks a `flash` Set (ids highlighted 1.5s after an update) and a `connected`
  flag, and returns sessions sorted by `lastSeen` desc. Changing `site` tears it
  all down and resets.
- **`App.jsx`** owns UI state: `site` (empty ⇒ `SiteGate`), `hotOnly`,
  `selected` (company whose `ContactsPanel` is open), `seoOpen` (`SEOPanel`),
  and `activeTab` (`"live"` | `"analytics"`). `ContactsPanel` fetches
  `/contacts/:domain`, `SEOPanel` fetches `/seo`, `AnalyticsPanel` fetches the
  `/api/analytics/*` endpoints — each on demand.
- **Vite proxies `/events /sessions /seo /contacts /webhook /ingest /health /api`**
  to `:4000` (`dashboard/vite.config.js`) — the dashboard uses **same-origin
  relative paths**, never absolute `:4000` URLs. Add a route here if you add a
  relay endpoint the dashboard must reach (note `/api` covers both `/api/collect`
  and `/api/analytics/*`).

### The two backends

There are two distinct server stacks; don't conflate them:

- **`server/`** — the actual relay this project runs (Express + MongoDB, port
  4000). This is what the dashboard, tracker, and n8n integrate with.
- **`backend/`** — a separate, more production-shaped reference platform
  (`backend/api/` is CommonJS Express on port **3001** with Postgres, Redis, JWT
  auth, rate limiting, and a **WebSocket** real-time channel; `docker-compose.yml`
  also brings up n8n). Its `/api/v1/collect` and `/api/v1/analytics/*` mirror the
  relay's concepts on SQL. Work here only when explicitly asked.

## Conventions / gotchas

- **Scoring must match EXACTLY in the relay and the n8n Code node:**
  ```
  intentWeight = { high: 40, medium: 15, low: 5 }
  score = Math.min(100, Σ over timeline (intentWeight[intent] ?? 5) + Math.floor(totalSeconds/30))
  hot   = score >= 60
  ```
  Change it in **both** `server/index.js` (`computeScore`) and
  `n8n/workflow.json` (the `Reverse IP + ICP` node) or the ingest paths diverge.
- **`normalizeSite(input)` must be applied consistently** (lowercase, strip
  scheme, leading `www.`, and any path/query/hash → bare host) on **every**
  site-keyed route: `/events`, `/api/collect`, `/webhook`, `/ingest`,
  `/sessions`, `/seo`, and the analytics endpoints. The SSE subscription site and
  the ingest site must normalize to the same key or events won't reach the right
  clients. `SiteGate` passes the raw host up; normalization is server-side.
- **Session key is `(site, company.domain)`** where `company.domain` is the
  `orgKey` slug derived from the resolved org (asname/org/isp), **not a real DNS
  domain** with free IP data. The unique compound index in `db.js` enforces one
  session per company per site.
- **`reverseIpLookup` drops rather than guesses**: private/CGNAT prefixes and
  lookup failures → `null` → dropped; mobile/proxy networks → dropped by
  `isTargetIndustry`. Expect a meaningful share of `dropped` responses.
- **The beacon sends to `/api/collect`** (not `/webhook`). Endpoint is
  `(window.__RADAR_ENDPOINT__ || "http://localhost:4000") + "/api/collect"`. It
  fetches the visitor's **public IP from ipify** client-side so localhost visits
  still resolve to a real org, captures device/browser/os/screen/viewport/utm/
  scrollDepth/performance and an on-page SEO snapshot, and fires on
  `visibilitychange → hidden` / `pagehide` via `navigator.sendBeacon` (fetch
  keepalive fallback). Pointing `__RADAR_ENDPOINT__` at the n8n webhook base
  routes beacons through n8n, which POSTs resolved hits to `/ingest`.
- **Demo traffic** runs every 4000ms for each active (watched) site unless
  `process.env.DEMO === "off"`; it resolves real `SEED_IPS`, so it makes live
  network calls to ip-api. Tests asserting on a quiet feed should set `DEMO=off`.
- **Ports/shapes are a fixed contract.** Relay 4000, dashboard 5173, the SSE
  session shape, the scoring constants, the `/contacts` response shape, and the
  `mock-data.js` export names are shared across the relay, dashboard, tracker, and
  n8n — keep them identical so the pieces integrate without changes.
- **`README.md` predates the rewrite** in places (it still references the old
  in-memory store and a `COMPANY_DB`/`TARGET_INDUSTRIES` mock that no longer
  exist). Trust the code in `server/` over the README when they disagree.
