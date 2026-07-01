import { useState } from "react";

// Format a duration in seconds as "Xm Ys" / "Ys".
function formatDwell(totalSeconds) {
  const secs = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default function CompanyCard({ session, flashing, onViewContacts }) {
  const { company, score, hot, totalSeconds, pageViews, timeline, client } = session;
  const [logoOk, setLogoOk] = useState(() => {
    if (typeof window !== "undefined" && (window.__clearbitFailed || navigator.onLine === false)) {
      return false;
    }
    return true;
  });

  // AI states
  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiError, setAiError] = useState(null);

  const place = [company.city, company.country].filter(Boolean).join(", ");
  const meta = [place || company.country, company.industry]
    .filter(Boolean)
    .join(" · ");

  // Real telemetry summary (latest visit).
  const referrerHost = client?.referrer ? hostFromUrl(client.referrer) : null;
  const techBits = [client?.device, client?.browser, client?.os].filter(Boolean).join(" · ");

  async function fetchAiInsights() {
    if (aiData) {
      setShowAi(!showAi);
      return;
    }
    setLoadingAi(true);
    setAiError(null);
    setShowAi(true);
    try {
      const res = await fetch(`/api/analytics/ai-summary?site=${encodeURIComponent(session.site)}&domain=${encodeURIComponent(company.domain)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch AI insights");
      }
      const data = await res.json();
      setAiData(data.summary);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <article className={`card${hot ? " card-hot" : ""}${flashing ? " card-flash" : ""}`}>
      <header className="card-head">
        <div className="card-identity">
          {logoOk && company.logo ? (
            <img
              className="card-logo"
              src={company.logo}
              alt=""
              loading="lazy"
              onError={() => {
                setLogoOk(false);
                if (typeof window !== "undefined") {
                  window.__clearbitFailed = true;
                }
              }}
            />
          ) : (
            <div className="card-logo card-logo-fallback" aria-hidden="true">
              {initials(company.name) || "?"}
            </div>
          )}
          <div className="card-titles">
            <h3 className="card-name" title={company.domain}>
              {company.name}
            </h3>
            <div className="card-meta">{meta}</div>
          </div>
        </div>

        <div className="card-scorebox">
          <div className={`score-ring${hot ? " score-ring-hot" : ""}`}>
            <span className="score-value">{score}</span>
          </div>
          {hot && <span className="hot-badge">HOT</span>}
        </div>
      </header>

      <div className="card-stats">
        <div className="card-stat">
          <span className="card-stat-value">{formatDwell(totalSeconds)}</span>
          <span className="card-stat-label">dwell</span>
        </div>
        <div className="card-stat">
          <span className="card-stat-value">{pageViews}</span>
          <span className="card-stat-label">page views</span>
        </div>
      </div>

      <div className="card-realinfo">
        {company.asn && (
          <div className="card-realinfo-row" title="Network / ASN that owns the visitor IP">
            <span className="card-realinfo-key">network</span>
            <span className="card-realinfo-val">{company.asn}</span>
          </div>
        )}
        {techBits && (
          <div className="card-realinfo-row">
            <span className="card-realinfo-key">client</span>
            <span className="card-realinfo-val">{techBits}</span>
          </div>
        )}
        <div className="card-realinfo-row">
          <span className="card-realinfo-key">source</span>
          <span className="card-realinfo-val">{referrerHost || "Direct"}</span>
        </div>
        {session.identifiedEmail && (
          <div className="card-realinfo-row" style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px dashed #3f3f46" }}>
            <span className="card-realinfo-key" style={{ color: "#22c55e" }}>identified user</span>
            <span className="card-realinfo-val" style={{ color: "#22c55e", fontWeight: "600" }}>🔑 {session.identifiedEmail}</span>
          </div>
        )}
      </div>

      <ul className="timeline">
        {timeline.map((row, i) => (
          <li className="timeline-row" key={`${row.ts}-${i}`}>
            <span className={`intent-dot intent-${row.intent || "low"}`} aria-hidden="true" />
            <span className="timeline-label" title={row.path}>
              {row.label}
            </span>
            <span className="timeline-dwell">{formatDwell(row.durationSec)}</span>
          </li>
        ))}
      </ul>

      {showAi && (
        <div className="ai-insights-panel" style={{
          margin: "12px 16px 0 16px",
          padding: "12px",
          borderRadius: "6px",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          backgroundColor: "rgba(34, 197, 94, 0.05)",
          fontSize: "13px",
          lineHeight: "1.5",
          textAlign: "left"
        }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#22c55e", display: "flex", alignItems: "center", gap: "6px", fontSize: "14px" }}>
            ✨ Local AI Lead Analysis
          </h4>
          {loadingAi ? (
            <div style={{ color: "#a1a1aa" }}>Thinking...</div>
          ) : aiError ? (
            <div style={{ color: "#f87171", fontSize: "12px" }}>
              <strong>Ollama is Offline</strong>
              <div style={{ marginTop: "4px", color: "#71717a", fontSize: "11px" }}>
                Please run <code>ollama run llama3</code> in your terminal.
              </div>
            </div>
          ) : (
            <div style={{ color: "#e4e4e7", whiteSpace: "pre-wrap" }}>
              {aiData}
            </div>
          )}
        </div>
      )}

      <footer className="card-foot" style={{ display: "flex", gap: "8px", padding: "12px 16px" }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, padding: "6px 12px", fontSize: "13px" }}
          type="button"
          onClick={() => onViewContacts(company)}
        >
          People →
        </button>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, padding: "6px 12px", fontSize: "13px", borderColor: "rgba(34, 197, 94, 0.4)", color: "#4ade80" }}
          type="button"
          onClick={fetchAiInsights}
        >
          ✨ AI Insights
        </button>
      </footer>
    </article>
  );
}
