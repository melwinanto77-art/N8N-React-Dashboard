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

function getIcpTier(company) {
  const targetIndustries = ["Fintech", "E-commerce", "SaaS", "Software", "Infrastructure"];
  const primaryCountries = ["United States", "Canada", "United Kingdom", "Sweden", "Germany", "France", "Australia"];
  
  const isTargetInd = targetIndustries.includes(company.industry);
  const isPrimaryCountry = primaryCountries.includes(company.country);
  
  let isLarge = false;
  if (company.size) {
    const parts = company.size.split("-");
    const val = parseInt(parts[parts.length - 1].replace(/\+/g, ""));
    if (!isNaN(val) && val >= 1000) {
      isLarge = true;
    }
  }
  
  if (isTargetInd && isLarge && isPrimaryCountry) return "A";
  if (isTargetInd) return "B";
  if (isLarge || company.size === "100-500" || company.size === "500-1000") return "C";
  return "D";
}

export default function CompanyCard({ session, flashing, onViewContacts }) {
  const { company, score, hot, totalSeconds, pageViews, timeline, client } = session;
  const [logoOk, setLogoOk] = useState(() => {
    if (company.logo && company.logo.startsWith("https://logo.clearbit.com/")) {
      return false;
    }
    if (typeof window !== "undefined" && (window.__clearbitFailed || navigator.onLine === false)) {
      return false;
    }
    return true;
  });

  const place = [company.city, company.country].filter(Boolean).join(", ");
  const meta = [place || company.country, company.industry]
    .filter(Boolean)
    .join(" · ");

  // Real telemetry summary (latest visit).
  const referrerHost = client?.referrer ? hostFromUrl(client.referrer) : null;
  const techBits = [client?.device, client?.browser, client?.os].filter(Boolean).join(" · ");

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
            <h3 className="card-name" title={company.domain} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {company.name}
              {(() => {
                const icpTier = getIcpTier(company);
                const colorMap = {
                  A: { bg: "#065f46", text: "#34d399" },
                  B: { bg: "#1e3a8a", text: "#93c5fd" },
                  C: { bg: "#78350f", text: "#fcd34d" },
                  D: { bg: "#3f3f46", text: "#d4d4d8" }
                };
                const config = colorMap[icpTier] || colorMap.D;
                return (
                  <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", backgroundColor: config.bg, color: config.text, fontWeight: "bold" }}>
                    ICP {icpTier}
                  </span>
                );
              })()}
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

      {/* Horizontal B2B Journey Path Flow */}
      <div className="journey-flow" style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto", padding: "10px 14px", background: "#09090b", borderRadius: "6px", margin: "12px 16px 0 16px", border: "1px solid #27272a" }}>
        {timeline.map((row, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            {idx > 0 && <span style={{ color: "#71717a", fontSize: "11px" }}>➔</span>}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: "#18181b", padding: "3px 8px", borderRadius: "4px", border: "1px solid #27272a" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: row.intent === "high" ? "#22c55e" : row.intent === "medium" ? "#3b82f6" : "#71717a" }} />
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#e4e4e7" }} title={row.path}>
                {row.label}
              </span>
            </div>
          </div>
        ))}
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

      <footer className="card-foot" style={{ display: "flex", gap: "8px", padding: "12px 16px" }}>
        <button
          className="btn btn-ghost"
          style={{ flex: 1, padding: "6px 12px", fontSize: "13px" }}
          type="button"
          onClick={() => onViewContacts(company)}
        >
          People →
        </button>
      </footer>
    </article>
  );
}
