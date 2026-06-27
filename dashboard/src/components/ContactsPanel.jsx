import { useEffect, useState } from "react";

const SENIORITY_LABEL = {
  cxo: "C-suite",
  vp: "VP",
  director: "Director",
  manager: "Manager",
  ic: "IC"
};

// Slide-over listing decision-makers who WORK at the company. These people are
// explicitly NOT identified as the visitor — the disclaimer makes that clear.
export default function ContactsPanel({ company, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);

    fetch(`/contacts/${encodeURIComponent(company.domain)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [company.domain]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const contacts = data?.contacts || [];

  return (
    <div className="overlay" onClick={onClose}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={`People who work at ${company.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-head">
          <div>
            <h2 className="panel-title">People who work at {company.name}</h2>
            <div className="panel-domain">{company.domain}</div>
          </div>
          <button className="panel-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {(data?.disclaimer || true) && (
          <div className="panel-disclaimer">
            <span className="panel-disclaimer-icon" aria-hidden="true">
              ⚠
            </span>
            <p>
              {data?.disclaimer ||
                "These people work at this company. They are NOT identified as the visitor who browsed your site."}
            </p>
          </div>
        )}

        <div className="panel-body">
          {loading && <div className="panel-state">Loading contacts…</div>}

          {error && (
            <div className="panel-state panel-state-error">
              Couldn’t load contacts for this company.
            </div>
          )}

          {!loading && !error && contacts.length === 0 && (
            <div className="panel-state">No contacts available for this company.</div>
          )}

          {!loading && !error && contacts.length > 0 && (
            <ul className="contact-list">
              {contacts.map((c, i) => (
                <li className="contact" key={`${c.email || c.name}-${i}`}>
                  <div className="contact-top">
                    <span className="contact-name">{c.name}</span>
                    <span className={`seniority-tag seniority-${c.seniority || "ic"}`}>
                      {SENIORITY_LABEL[c.seniority] || c.seniority || "—"}
                    </span>
                  </div>
                  <div className="contact-title">{c.title}</div>
                  <div className="contact-links">
                    {c.email && (
                      <a className="contact-link" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    )}
                    {c.linkedin && (
                      <a
                        className="contact-link"
                        href={c.linkedin}
                        target="_blank"
                        rel="noreferrer"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="panel-foot">
          <span className="panel-source">
            Source: {data?.source || "licensed contacts provider (mock)"}
          </span>
          {typeof data?.count === "number" && (
            <span className="panel-count">{data.count} listed</span>
          )}
        </footer>
      </aside>
    </div>
  );
}
