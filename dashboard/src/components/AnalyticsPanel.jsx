import { useState, useEffect } from "react";

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function AnalyticsPanel({ site }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [topCompanies, setTopCompanies] = useState([]);
  const [pagesByIndustry, setPagesByIndustry] = useState([]);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const [funnelRes, companiesRes, pagesRes] = await Promise.all([
          fetch(`/api/analytics/conversion-funnel?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/top-companies?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/pages-by-industry?site=${encodeURIComponent(site)}`)
        ]);

        if (!funnelRes.ok || !companiesRes.ok || !pagesRes.ok) {
          throw new Error("Failed to fetch analytics data");
        }

        const [funnelData, companiesData, pagesData] = await Promise.all([
          funnelRes.json(),
          companiesRes.json(),
          pagesRes.json()
        ]);

        setFunnel(funnelData);
        setTopCompanies(companiesData);
        setPagesByIndustry(pagesData);
      } catch (err) {
        console.error("Analytics fetch error:", err);
        setError(err.message || "An error occurred while loading analytics.");
      } finally {
        setLoading(false);
      }
    }

    if (site) {
      fetchAnalytics();
    }
  }, [site]);

  if (loading) {
    return (
      <div className="analytics-loading">
        <span className="spinner" />
        <p>Crunching analytics data for {site}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-error">
        <div className="error-icon">⚠️</div>
        <h3>Analytics Load Failed</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="analytics-container fade-in">
      {/* Top row: Funnel */}
      <section className="analytics-section funnel-section">
        <h3 className="section-title">Lead Conversion Funnel</h3>
        <p className="section-subtitle">Progression of visiting organizations by intent levels</p>
        
        <div className="funnel-visualization">
          {funnel.map((stage, idx) => {
            // Compute width of funnel stage
            const widthPct = stage.pct;
            return (
              <div className="funnel-row" key={stage.stage} style={{ opacity: 0.15 + (stage.pct / 100) * 0.85 }}>
                <div className="funnel-label-container">
                  <span className="funnel-index">0{idx + 1}</span>
                  <span className="funnel-stage-name">{stage.stage}</span>
                </div>
                <div className="funnel-bar-container">
                  <div 
                    className={`funnel-bar funnel-bar-level-${idx}`} 
                    style={{ width: `${widthPct}%` }}
                  >
                    <span className="funnel-value">{stage.count}</span>
                  </div>
                </div>
                <div className="funnel-percent">
                  {stage.pct}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Grid row: Top Companies & Pages by Industry */}
      <div className="analytics-grid">
        <section className="analytics-section">
          <h3 className="section-title">Top Companies (This Week)</h3>
          <p className="section-subtitle">Organizations with highest engagement by page views</p>
          
          {topCompanies.length === 0 ? (
            <div className="analytics-empty">No company visits recorded this week.</div>
          ) : (
            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Industry</th>
                    <th className="num">Page Views</th>
                    <th className="num">Max Intent</th>
                  </tr>
                </thead>
                <tbody>
                  {topCompanies.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="table-company">
                          {c.logo ? (
                            <img className="table-company-logo" src={c.logo} alt="" />
                          ) : (
                            <div className="table-company-logo table-company-fallback">
                              {initials(c.name)}
                            </div>
                          )}
                          <div>
                            <div className="table-company-name">{c.name}</div>
                            <div className="table-company-domain">{c.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="table-badge">{c.industry || "Unknown"}</span>
                      </td>
                      <td className="num highlighted-num">{c.pageViews}</td>
                      <td className="num">
                        <span className={`score-badge ${c.score >= 60 ? "score-badge-hot" : ""}`}>
                          {c.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="analytics-section">
          <h3 className="section-title">Most Viewed Pages by Industry</h3>
          <p className="section-subtitle">Breakdown of content consumption across target industries</p>

          {pagesByIndustry.length === 0 ? (
            <div className="analytics-empty">No industry activity data recorded yet.</div>
          ) : (
            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Page Path</th>
                    <th>Industry</th>
                    <th className="num">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {pagesByIndustry.map((row, idx) => (
                    <tr key={`${row.page}-${row.industry}-${idx}`}>
                      <td>
                        <span className="table-path" title={row.page}>{row.page}</span>
                      </td>
                      <td>
                        <span className="table-badge table-badge-blue">{row.industry}</span>
                      </td>
                      <td className="num highlighted-num">{row.pageViews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
