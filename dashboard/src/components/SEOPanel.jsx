import { useEffect, useState } from "react";

// Slide-over showing the REAL on-page SEO, AEO, and GEO report for the tracked site:
// overall scores, per-page scores, and prioritized recommendations.
export default function SEOPanel({ site, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("seo"); // "seo", "aeo", "geo"

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
  const seoRecs = data?.recommendations || [];
  const aeoRecs = data?.aeoRecommendations || [];
  const geoRecs = data?.geoRecommendations || [];
  const overall = data?.overallScore ?? 0;

  return (
    <div className="overlay" onClick={onClose}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Search & AI Engine Health for ${site}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "500px", maxWidth: "100%" }}
      >
        <header className="panel-head">
          <div>
            <h2 className="panel-title">AI Search & SEO Health</h2>
            <div className="panel-domain" style={{ color: "#a1a1aa", fontSize: "13px", marginTop: "4px" }}>
              {data ? `${data.pagesAnalyzed} page(s) analyzed for ${site}` : "Loading…"}
            </div>
          </div>
          <button className="panel-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="panel-body" style={{ padding: "20px" }}>
          {loading && <div className="panel-state">Loading optimization report…</div>}

          {error && (
            <div className="panel-state panel-state-error">Couldn’t load the optimization report.</div>
          )}

          {!loading && !error && data && data.pagesAnalyzed === 0 && (
            <div className="panel-state">
              No analytics captured yet. The beacon records on-page metrics on each visit — once a
              page with the tracker is visited it will appear here.
            </div>
          )}

          {!loading && !error && data && data.pagesAnalyzed > 0 && (
            <>
              {/* Three Optimization Score Rings */}
              <div className="seo-overall" style={{ display: "flex", justifyContent: "space-around", gap: "10px", margin: "10px 0 24px 0", textAlign: "center", borderBottom: "1px solid #27272a", paddingBottom: "20px" }}>
                <div>
                  <div className={`score-ring score-ring-lg${overall >= 80 ? " score-ring-hot" : ""}`} style={{ margin: "0 auto" }}>
                    <span className="score-value">{overall}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#e4e4e7", marginTop: "8px", fontWeight: "600" }}>SEO Score</div>
                  <div style={{ fontSize: "10px", color: "#71717a", marginTop: "2px" }}>Google / Bing</div>
                </div>
                <div>
                  <div className={`score-ring score-ring-lg${data.overallAeoScore >= 80 ? " score-ring-hot" : ""}`} style={{ margin: "0 auto", borderColor: "#a78bfa" }}>
                    <span className="score-value" style={{ color: "#a78bfa" }}>{data.overallAeoScore}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#e4e4e7", marginTop: "8px", fontWeight: "600" }}>AEO Score</div>
                  <div style={{ fontSize: "10px", color: "#71717a", marginTop: "2px" }}>Voice / Q&A</div>
                </div>
                <div>
                  <div className={`score-ring score-ring-lg${data.overallGeoScore >= 80 ? " score-ring-hot" : ""}`} style={{ margin: "0 auto", borderColor: "#60a5fa" }}>
                    <span className="score-value" style={{ color: "#60a5fa" }}>{data.overallGeoScore}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#e4e4e7", marginTop: "8px", fontWeight: "600" }}>GEO Score</div>
                  <div style={{ fontSize: "10px", color: "#71717a", marginTop: "2px" }}>LLM Citations</div>
                </div>
              </div>

              {/* Pages breakdown */}
              <h3 className="seo-section" style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#fff" }}>Pages Analysis</h3>
              <ul className="seo-pages" style={{ maxHeight: "150px", overflowY: "auto", marginBottom: "24px", padding: 0, listStyle: "none" }}>
                {pages.map((p) => (
                  <li className="seo-page" key={p.path} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: "6px", marginBottom: "6px" }}>
                    <span className="seo-page-path" title={p.url || p.path} style={{ fontFamily: "monospace", fontSize: "12px", color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>
                      {p.path}
                    </span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "#a1a1aa" }}>S:{p.score} | A:{p.aeoScore} | G:{p.geoScore}</span>
                      <span className={`seo-page-score${p.score >= 80 ? " seo-page-score-good" : p.score >= 50 ? " seo-page-score-mid" : " seo-page-score-bad"}`}>
                        {p.score}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Recommendations Tab Selector */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "16px", borderBottom: "1px solid #27272a", paddingBottom: "10px" }}>
                {[
                  { id: "seo", label: `SEO (${seoRecs.length})`, color: "#22c55e" },
                  { id: "aeo", label: `AEO (${aeoRecs.length})`, color: "#a78bfa" },
                  { id: "geo", label: `GEO (${geoRecs.length})`, color: "#60a5fa" }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveSubTab(t.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "600",
                      backgroundColor: activeSubTab === t.id ? t.color : "#18181b",
                      color: "#fff",
                      transition: "all 0.2s"
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Displaying active tab recommendations */}
              <h3 className="seo-section" style={{ fontSize: "14px", color: "#fff", margin: "0 0 10px 0" }}>
                {activeSubTab.toUpperCase()} Recommendations
              </h3>

              <ul className="seo-recs" style={{ padding: 0, margin: 0, listStyle: "none", maxHeight: "250px", overflowY: "auto" }}>
                {activeSubTab === "seo" && seoRecs.length === 0 && <li style={{ color: "#a1a1aa", fontSize: "13px" }}>No SEO improvements needed!</li>}
                {activeSubTab === "aeo" && aeoRecs.length === 0 && <li style={{ color: "#a1a1aa", fontSize: "13px" }}>No AEO improvements needed!</li>}
                {activeSubTab === "geo" && geoRecs.length === 0 && <li style={{ color: "#a1a1aa", fontSize: "13px" }}>No GEO improvements needed!</li>}

                {activeSubTab === "seo" && seoRecs.map((r, i) => (
                  <li className={`seo-rec seo-rec-${r.severity}`} key={`seo-${i}`} style={{ padding: "12px", borderRadius: "6px", backgroundColor: "#18181b", borderLeft: `4px solid ${r.severity === "critical" ? "#f87171" : r.severity === "warning" ? "#fbbf24" : "#60a5fa"}`, marginBottom: "8px" }}>
                    <div className="seo-rec-top" style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
                      <span className={`seo-rec-sev seo-rec-sev-${r.severity}`} style={{ fontWeight: "bold", textTransform: "uppercase" }}>
                        {r.severity}
                      </span>
                      <span className="seo-rec-page" style={{ fontFamily: "monospace", color: "#a1a1aa" }}>{r.page}</span>
                    </div>
                    <div className="seo-rec-msg" style={{ color: "#f4f4f5", fontWeight: "600", fontSize: "13px", marginBottom: "4px" }}>{r.message}</div>
                    <div className="seo-rec-fix" style={{ color: "#a1a1aa", fontSize: "12px" }}>{r.fix}</div>
                  </li>
                ))}

                {activeSubTab === "aeo" && aeoRecs.map((r, i) => (
                  <li className={`seo-rec seo-rec-${r.severity}`} key={`aeo-${i}`} style={{ padding: "12px", borderRadius: "6px", backgroundColor: "#18181b", borderLeft: `4px solid ${r.severity === "critical" ? "#f87171" : r.severity === "warning" ? "#fbbf24" : "#60a5fa"}`, marginBottom: "8px" }}>
                    <div className="seo-rec-top" style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
                      <span className={`seo-rec-sev seo-rec-sev-${r.severity}`} style={{ fontWeight: "bold", textTransform: "uppercase" }}>
                        {r.severity}
                      </span>
                      <span className="seo-rec-page" style={{ fontFamily: "monospace", color: "#a1a1aa" }}>{r.page}</span>
                    </div>
                    <div className="seo-rec-msg" style={{ color: "#f4f4f5", fontWeight: "600", fontSize: "13px", marginBottom: "4px" }}>{r.message}</div>
                    <div className="seo-rec-fix" style={{ color: "#a1a1aa", fontSize: "12px" }}>{r.fix}</div>
                  </li>
                ))}

                {activeSubTab === "geo" && geoRecs.map((r, i) => (
                  <li className={`seo-rec seo-rec-${r.severity}`} key={`geo-${i}`} style={{ padding: "12px", borderRadius: "6px", backgroundColor: "#18181b", borderLeft: `4px solid ${r.severity === "critical" ? "#f87171" : r.severity === "warning" ? "#fbbf24" : "#60a5fa"}`, marginBottom: "8px" }}>
                    <div className="seo-rec-top" style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "11px" }}>
                      <span className={`seo-rec-sev seo-rec-sev-${r.severity}`} style={{ fontWeight: "bold", textTransform: "uppercase" }}>
                        {r.severity}
                      </span>
                      <span className="seo-rec-page" style={{ fontFamily: "monospace", color: "#a1a1aa" }}>{r.page}</span>
                    </div>
                    <div className="seo-rec-msg" style={{ color: "#f4f4f5", fontWeight: "600", fontSize: "13px", marginBottom: "4px" }}>{r.message}</div>
                    <div className="seo-rec-fix" style={{ color: "#a1a1aa", fontSize: "12px" }}>{r.fix}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="panel-foot" style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#71717a", borderTop: "1px solid #27272a", paddingTop: "12px", padding: "12px 20px" }}>
          <span>Source: On-Page DOM Telemetry</span>
          <span>AEO & GEO Powered by Local AI</span>
        </footer>
      </aside>
    </div>
  );
}
