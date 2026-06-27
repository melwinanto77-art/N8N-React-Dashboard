import { useEffect, useState } from "react";

// Slide-over showing the REAL on-page SEO report for the tracked site: an overall
// score, per-page scores (worst first), and prioritized recommendations captured
// from the actual page DOM by the beacon.
export default function SEOPanel({ site, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);

    fetch(`/seo?site=${encodeURIComponent(site)}`)
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
  }, [site]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pages = data?.pages || [];
  const recs = data?.recommendations || [];
  const overall = data?.overallScore ?? 0;
  const good = overall >= 80;

  return (
    <div className="overlay" onClick={onClose}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={`SEO health for ${site}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-head">
          <div>
            <h2 className="panel-title">SEO health — {site}</h2>
            <div className="panel-domain">
              {data ? `${data.pagesAnalyzed} page(s) analyzed` : "Loading…"}
            </div>
          </div>
          <button className="panel-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="panel-body">
          {loading && <div className="panel-state">Loading SEO report…</div>}

          {error && (
            <div className="panel-state panel-state-error">Couldn’t load the SEO report.</div>
          )}

          {!loading && !error && data && data.pagesAnalyzed === 0 && (
            <div className="panel-state">
              No SEO captured yet. The beacon records on-page SEO on each visit — once a
              page with the tracker is visited it will appear here.
            </div>
          )}

          {!loading && !error && data && data.pagesAnalyzed > 0 && (
            <>
              <div className="seo-overall">
                <div className={`score-ring score-ring-lg${good ? " score-ring-hot" : ""}`}>
                  <span className="score-value">{overall}</span>
                </div>
                <div className="seo-overall-label">
                  Overall on-page SEO score
                  <span className="seo-overall-sub">across {data.pagesAnalyzed} page(s)</span>
                </div>
              </div>

              <h3 className="seo-section">Pages (worst first)</h3>
              <ul className="seo-pages">
                {pages.map((p) => (
                  <li className="seo-page" key={p.path}>
                    <span className="seo-page-path" title={p.url || p.path}>
                      {p.path}
                    </span>
                    <span className="seo-page-issues">{p.issues} issue(s)</span>
                    <span
                      className={`seo-page-score${p.score >= 80 ? " seo-page-score-good" : p.score >= 50 ? " seo-page-score-mid" : " seo-page-score-bad"}`}
                    >
                      {p.score}
                    </span>
                  </li>
                ))}
              </ul>

              <h3 className="seo-section">Recommendations</h3>
              <ul className="seo-recs">
                {recs.map((r, i) => (
                  <li className={`seo-rec seo-rec-${r.severity}`} key={`${r.category}-${i}`}>
                    <div className="seo-rec-top">
                      <span className={`seo-rec-sev seo-rec-sev-${r.severity}`}>
                        {r.severity}
                      </span>
                      <span className="seo-rec-page">{r.page}</span>
                    </div>
                    <div className="seo-rec-msg">{r.message}</div>
                    <div className="seo-rec-fix">{r.fix}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="panel-foot">
          <span className="panel-source">Real on-page SEO, captured from the page DOM</span>
        </footer>
      </aside>
    </div>
  );
}
