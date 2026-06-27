# De-Anonymized B2B Inbound Radar — "Who is Browsing"

Turn anonymous website traffic into a live feed of **companies** showing buying
intent. A lightweight JavaScript beacon on a client site reports each page view
and dwell time. The relay reverse-resolves the visitor's public IP to an
**organization** (never an individual), filters that company against the
client's Ideal Customer Profile (ICP), scores buying intent, aggregates a
session per `(site, companyDomain)`, and streams matching companies to a
real-time React sales feed over Server-Sent Events (SSE).

A separate, on-demand **contacts layer** lists decision-makers who *work at* a
surfaced company, pulled from a (mock) licensed data provider. These people are
clearly labelled as **NOT the visitor** — they are commercially available
business contacts at that organization, surfaced so a salesperson has someone to
reach out to.

> **Company-level only. No individual de-anonymization. No LinkedIn scraping.**

---

## How it works

```
tracker/radar.js ──POST /webhook──▶ relay (server/index.js) ──SSE──▶ React feed (dashboard)
  site, page,                       reverseIp ▸ company                companies, scores,
  durationSec, ts                   ICP filter (drop non-matches)      hot leads, timeline
                                    aggregate session per (site,domain)
                                    score intent ▸ broadcast(site)
                                          ▲
        n8n workflow (mirror) ──POST /ingest (already resolved + ICP-passed)
```

- The relay runs at **http://localhost:4000**.
- The dashboard runs at **http://localhost:5173** and proxies `/events`,
  `/sessions`, `/contacts`, `/webhook`, `/ingest`, and `/health` to the relay.
- The relay is **in-memory**: all sessions live in process state and reset on
  restart. There is no database.

### Lead scoring

A session's score is recomputed from its page timeline on every update:

```
intentWeight = { high: 40, medium: 15, low: 5 }
score = min(100, Σ over timeline (intentWeight[intent] ?? 5) + floor(totalSeconds / 30))
hot   = score >= 60
```

High-intent pages (`/pricing`, `/pricing/enterprise`) move the needle most;
raw dwell time adds a smaller, steady contribution. The **identical** formula is
implemented in both the relay and the n8n Code node so the two ingest paths
agree.

---

## Run it (two terminals)

**Terminal 1 — relay (port 4000):**

```bash
cd server
npm install
npm start        # http://localhost:4000
```

The relay serves the tracker at `/radar.js`, exposes the HTTP/SSE contract, and
(unless disabled) runs a **demo traffic generator**: every 4 seconds it
synthesizes one visit for each watched site using a random in-ICP company, so
the feed is alive even with no real beacon traffic. Disable it with:

```bash
DEMO=off npm start
```

**Terminal 2 — dashboard (port 5173):**

```bash
cd dashboard
npm install
npm run dev      # http://localhost:5173
```

Open http://localhost:5173, paste any host (e.g. `acme.com`) into the site gate,
and watch companies stream in. The site host you enter is normalized
server-side (scheme, `www.`, and any path/query/hash are stripped to a bare
host), so paste a full URL if you like.

---

## Send a visit manually (curl)

Hit the public `/webhook` endpoint the way the tracker would. Pass an `ip`
inside a corporate prefix so it resolves to a company (see `server/mock-data.js`
`COMPANY_DB` for the prefixes — e.g. `52.95.` maps to a sample company):

```bash
curl -X POST http://localhost:4000/webhook \
  -H "Content-Type: application/json" \
  -d '{"site":"acme.com","page":"/pricing/enterprise","durationSec":120,"ip":"52.95.1.10","ts":"2026-06-25T12:00:00.000Z"}'
# -> { "status": "tracked", "site": "acme.com", "domain": "...", "score": 45 }
```

- `ip` is optional in the body; if omitted, the relay uses the first hop of
  `x-forwarded-for`, then `req.socket.remoteAddress`.
- A residential / ISP IP (see `NON_CORPORATE_PREFIXES`) resolves to `null` and is
  dropped: `{ "status": "dropped", "reason": "..." }`.
- A company outside the ICP (`TARGET_INDUSTRIES`) is also dropped — that's the
  ICP filter working.

To see the resolved sessions or the live stream directly:

```bash
curl 'http://localhost:4000/sessions?site=acme.com'          # JSON, newest first
curl -N 'http://localhost:4000/events?site=acme.com'         # raw SSE stream
curl 'http://localhost:4000/contacts/<domain>'               # contacts at a company
curl http://localhost:4000/health                            # { ok:true, sites:N }
```

---

## Embed the tracker on a site

The relay serves the beacon, so the snippet is two lines in the page `<head>`
(see `tracker/snippet.html`):

```html
<script>window.__RADAR_ENDPOINT__ = "http://localhost:4000";</script>
<script src="http://localhost:4000/radar.js" defer></script>
```

The beacon captures `location.host`, `location.pathname`, and seconds since
load, and sends `{ site, page, durationSec, ts }` to `<endpoint>/webhook` on
`visibilitychange → hidden` and `pagehide` (via `navigator.sendBeacon`, with a
`fetch({ keepalive: true })` fallback). The public IP is added server-side. For
production, repoint `__RADAR_ENDPOINT__` and the `<script src>` host at your
deployed relay (or at the n8n webhook, below).

---

## Run the pipeline through n8n (optional)

`n8n/workflow.json` mirrors the relay pipeline so the resolve → ICP → ingest
step can run inside n8n instead of (or in front of) the relay.

1. In n8n (tested against **2.26**), **Import from File** and select
   `n8n/workflow.json`. The workflow **B2B Inbound Radar** appears with four
   nodes: `Webhook` → `Reverse IP + ICP` (Code) → `Push to Radar` (HTTP
   Request) → `Respond to Webhook`.
2. Activate it. The webhook listens at path `radar`, so its production URL is
   roughly `http://<your-n8n-host>:5678/webhook/radar`.
3. **Repoint the snippet at the n8n webhook** so beacons flow through n8n:

   ```html
   <script>window.__RADAR_ENDPOINT__ = "http://<your-n8n-host>:5678/webhook";</script>
   <script src="http://localhost:4000/radar.js" defer></script>
   ```

   The tracker always POSTs to `<endpoint>/webhook`, so an endpoint of
   `http://<n8n-host>:5678/webhook` sends the beacon to the n8n path `radar`.

The Code node embeds a company map mirroring `COMPANY_DB`, drops non-corporate
and out-of-ICP traffic (by returning no items), and otherwise emits a single
resolved item. The HTTP Request node POSTs that item to
`http://host.docker.internal:4000/ingest` — `host.docker.internal` lets the n8n
container reach the relay running on the host. `/ingest` accepts an
already-resolved, already-ICP-passed company and only aggregates + broadcasts.

---

## Compliance stance

- **Company-level only.** The relay resolves a public IP to an *organization*.
  It never identifies the individual person browsing, and there is no LinkedIn
  or social scraping. IPs that resolve to residential / ISP ranges are dropped
  rather than guessed at.
- **Contacts are licensed and clearly labelled.** The contacts layer lists
  decision-makers who *work at* a surfaced company, sourced from a (mock)
  licensed provider. Every contacts response carries a prominent disclaimer
  stating these people work at the company and are **NOT** identified as the
  visitor. The UI surfaces that disclaimer at the top of the slide-over.
- **Suppression / opt-out.** `SUPPRESSION_LIST` (a set of opted-out emails) is
  filtered out of every contacts response.
- **Consent.** The tracker is company-level analytics; ship a consent banner on
  the host site and honor opt-out before loading the beacon.

---

## Swapping in real providers

`server/mock-data.js` is the single **swap-in seam**. Replace the mock
implementations with calls to real vendors and nothing else in the relay needs
to change:

- **Reverse-IP → company** — replace `reverseIpLookup(ip)` with a real
  IP-to-company provider (Clearbit Reveal, IPinfo, 6sense, etc.). Keep the
  return shape `{ ipPrefix?, domain, name, industry, size, country, logo }` (or
  `null` to drop), and keep `NON_CORPORATE_PREFIXES` / residential handling so
  people are never resolved.
- **ICP filter** — `isTargetIndustry(company)` and `TARGET_INDUSTRIES` define
  the Ideal Customer Profile. Swap in per-client ICP rules here.
- **Contacts** — replace `CONTACTS_DB` / `getContacts(domain)` with a real
  licensed contact provider (e.g. a B2B data vendor). Keep the returned contact
  shape `{ name, title, seniority, email, linkedin }`, keep the seniority sort
  (`cxo < vp < director < manager < ic`), and keep applying `SUPPRESSION_LIST`.

If you run the pipeline through n8n, mirror any reverse-IP / ICP changes in the
`Reverse IP + ICP` Code node so both ingest paths stay consistent.

---

## Repo layout

| Path | What it is |
|------|-----------|
| `server/index.js` | Relay: HTTP + SSE contract, scoring, broadcast, demo traffic, serves `/radar.js`. |
| `server/mock-data.js` | The swap-in seam: `COMPANY_DB`, ICP, `PAGES`, `reverseIpLookup`, `CONTACTS_DB`, `getContacts`, suppression. |
| `tracker/radar.js` | Company-level beacon (IIFE). Posts `{ site, page, durationSec, ts }`. |
| `tracker/snippet.html` | The 2-line `<head>` snippet. |
| `dashboard/` | Vite + React 18 live sales feed (port 5173). |
| `n8n/workflow.json` | Importable n8n pipeline mirroring resolve → ICP → `/ingest`. |
