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
  const [logoOk, setLogoOk] = useState(true);

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
              onError={() => setLogoOk(false)}
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

      <footer className="card-foot">
        <button
          className="btn btn-ghost btn-block"
          type="button"
          onClick={() => onViewContacts(company)}
        >
          People who work here →
        </button>
      </footer>
    </article>
  );
}
