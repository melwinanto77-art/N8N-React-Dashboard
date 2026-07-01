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

function formatDuration(seconds) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function SafeCompanyLogo({ logo, name }) {
  const [logoOk, setLogoOk] = useState(() => {
    if (logo && logo.startsWith("https://logo.clearbit.com/")) {
      return false;
    }
    if (typeof window !== "undefined" && (window.__clearbitFailed || navigator.onLine === false)) {
      return false;
    }
    return true;
  });

  if (logoOk && logo) {
    return (
      <img
        className="table-company-logo"
        src={logo}
        alt=""
        onError={() => {
          setLogoOk(false);
          if (typeof window !== "undefined") {
            window.__clearbitFailed = true;
          }
        }}
      />
    );
  }
  return (
    <div className="table-company-logo table-company-fallback">
      {initials(name)}
    </div>
  );
}

export default function AnalyticsPanel({ site, onViewContacts }) {
  const [subTab, setSubTab] = useState("overview"); // "overview", "pages", "users", "logins", "aiReport"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Data states
  const [overview, setOverview] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [topCompanies, setTopCompanies] = useState([]);
  const [pagesByIndustry, setPagesByIndustry] = useState([]);
  const [pagesList, setPagesList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loginsList, setLoginsList] = useState([]);
  const [acquisition, setAcquisition] = useState({ referrers: [], entryPages: [], campaigns: [] });

  // AI Report states
  const [aiReport, setAiReport] = useState("");
  const [loadingAiReport, setLoadingAiReport] = useState(false);
  const [aiReportError, setAiReportError] = useState(null);

  useEffect(() => {
    async function fetchAllAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const [overviewRes, funnelRes, companiesRes, pagesIndRes, pagesRes, usersRes, loginsRes, acquisitionRes] = await Promise.all([
          fetch(`/api/analytics/overview?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/conversion-funnel?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/top-companies?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/pages-by-industry?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/pages?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/users?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/new-logins?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/acquisition?site=${encodeURIComponent(site)}`)
        ]);

        if (!overviewRes.ok || !funnelRes.ok || !companiesRes.ok || !pagesIndRes.ok || !pagesRes.ok || !usersRes.ok || !loginsRes.ok || !acquisitionRes.ok) {
          throw new Error("Failed to fetch some analytics data endpoints.");
        }

        const [overviewData, funnelData, companiesData, pagesIndData, pagesData, usersData, loginsData, acquisitionData] = await Promise.all([
          overviewRes.json(),
          funnelRes.json(),
          companiesRes.json(),
          pagesIndRes.json(),
          pagesRes.json(),
          usersRes.json(),
          loginsRes.json(),
          acquisitionRes.json()
        ]);

        setOverview(overviewData);
        setFunnel(funnelData);
        setTopCompanies(companiesData);
        setPagesByIndustry(pagesIndData);
        setPagesList(pagesData);
        setUsersList(usersData);
        setLoginsList(loginsData);
        setAcquisition(acquisitionData);
      } catch (err) {
        console.error("Analytics load error:", err);
        setError(err.message || "An error occurred while loading dashboard analytics.");
      } finally {
        setLoading(false);
      }
    }

    if (site) {
      fetchAllAnalytics();
    }
  }, [site]);

  async function generateAiReport() {
    setLoadingAiReport(true);
    setAiReportError(null);
    try {
      const res = await fetch(`/api/analytics/ai-site-analysis?site=${encodeURIComponent(site)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate AI report.");
      }
      const data = await res.json();
      setAiReport(data.report);
    } catch (err) {
      setAiReportError(err.message);
    } finally {
      setLoadingAiReport(false);
    }
  }

  // Trigger AI report generation when switching to the tab
  useEffect(() => {
    if (subTab === "aiReport" && !aiReport && !loadingAiReport) {
      generateAiReport();
    }
  }, [subTab]);

  if (loading) {
    return (
      <div className="analytics-loading" style={{ textAlign: "center", padding: "80px 20px" }}>
        <span className="spinner" style={{ display: "inline-block", width: "40px", height: "40px", border: "4px solid #27272a", borderTopColor: "#22c55e", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <p style={{ marginTop: "20px", color: "#a1a1aa", fontSize: "16px" }}>Assembling A-to-Z analytics report for {site}...</p>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-error" style={{ textAlign: "center", padding: "60px 20px", border: "1px solid #7f1d1d", borderRadius: "8px", backgroundColor: "rgba(127, 29, 29, 0.1)" }}>
        <div className="error-icon" style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
        <h3 style={{ color: "#f87171", fontSize: "20px", margin: "0 0 8px 0" }}>Analytics Generation Failed</h3>
        <p style={{ color: "#fca5a5", fontSize: "14px", margin: "0 0 20px 0" }}>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="analytics-container fade-in">
      {/* Sub-navigation Menu */}
      <div className="sub-tabs" style={{ display: "flex", gap: "10px", borderBottom: "1px solid #27272a", paddingBottom: "12px", marginBottom: "24px" }}>
        {[
          { id: "overview", name: "Overview & Funnel" },
          { id: "pages", name: `Pages (${pagesList.length})` },
          { id: "acquisition", name: "Acquisition & Entry Paths" },
          { id: "users", name: `User Sessions (${usersList.length})` },
          { id: "logins", name: `New Logins (${loginsList.length})` },
          { id: "aiReport", name: "✨ AI Analyst" }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              backgroundColor: subTab === t.id ? "#22c55e" : "#18181b",
              color: subTab === t.id ? "#fff" : "#a1a1aa",
              transition: "all 0.2s"
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* 1. OVERVIEW SUB-TAB */}
      {subTab === "overview" && (
        <>
          {/* Overview Stat Cards */}
          {overview && (
            <div className="overview-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "15px", marginBottom: "30px" }}>
              <div className="stat-card" style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "#a1a1aa", fontWeight: "600" }}>Total Pages</span>
                <span style={{ fontSize: "28px", color: "#fff", fontWeight: "bold", marginTop: "8px" }}>{overview.totalPages}</span>
                <span style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>Paths tracked</span>
              </div>
              <div className="stat-card" style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "#a1a1aa", fontWeight: "600" }}>Unique Visitors</span>
                <span style={{ fontSize: "28px", color: "#fff", fontWeight: "bold", marginTop: "8px" }}>{overview.totalUsers}</span>
                <span style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>Organizations</span>
              </div>
              <div className="stat-card" style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "#a1a1aa", fontWeight: "600" }}>Captured Logins</span>
                <span style={{ fontSize: "28px", color: "#22c55e", fontWeight: "bold", marginTop: "8px" }}>🔑 {overview.totalLogins}</span>
                <span style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>Email inputs</span>
              </div>
              <div className="stat-card" style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "#a1a1aa", fontWeight: "600" }}>Page Load Speed</span>
                <span style={{ fontSize: "28px", color: "#60a5fa", fontWeight: "bold", marginTop: "8px" }}>{overview.avgPageLoadMs || 280}ms</span>
                <span style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>Avg load time</span>
              </div>
              <div className="stat-card" style={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "12px", color: "#a1a1aa", fontWeight: "600" }}>Server Response</span>
                <span style={{ fontSize: "28px", color: "#a78bfa", fontWeight: "bold", marginTop: "8px" }}>{overview.avgTtfbMs || 65}ms</span>
                <span style={{ fontSize: "11px", color: "#71717a", marginTop: "4px" }}>Avg TTFB</span>
              </div>
            </div>
          )}

          {/* Funnel */}
          <section className="analytics-section funnel-section" style={{ marginBottom: "30px" }}>
            <h3 className="section-title">Lead Conversion Funnel</h3>
            <p className="section-subtitle">Progression of visiting organizations by intent levels</p>
            
            <div className="funnel-visualization">
              {funnel.map((stage, idx) => (
                <div className="funnel-row" key={stage.stage} style={{ opacity: 0.15 + (stage.pct / 100) * 0.85 }}>
                  <div className="funnel-label-container">
                    <span className="funnel-index">0{idx + 1}</span>
                    <span className="funnel-stage-name">{stage.stage}</span>
                  </div>
                  <div className="funnel-bar-container">
                    <div 
                      className={`funnel-bar funnel-bar-level-${idx}`} 
                      style={{ width: `${stage.pct}%` }}
                    >
                      <span className="funnel-value">{stage.count}</span>
                    </div>
                  </div>
                  <div className="funnel-percent">{stage.pct}%</div>
                </div>
              ))}
            </div>
          </section>

          {/* Grid: Top Companies & Industry Breakdown */}
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
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCompanies.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="table-company">
                              <SafeCompanyLogo logo={c.logo} name={c.name} />
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
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => onViewContacts({ domain: c.id, name: c.name, industry: c.industry, logo: c.logo })}
                              style={{ padding: "4px 8px", fontSize: "11px", border: "1px solid #27272a", backgroundColor: "#18181b", color: "#fff", cursor: "pointer", borderRadius: "4px" }}
                            >
                              People
                            </button>
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

          {/* Popular Key Pages Traffic Breakdown */}
          <section className="analytics-section" style={{ marginTop: "30px" }}>
            <h3 className="section-title">Popular Key Pages Traffic Breakdown</h3>
            <p className="section-subtitle">Real-time visitor counts and engagement breakdown for top pages</p>
            
            {pagesList.length === 0 ? (
              <div className="analytics-empty">No page tracking data recorded yet.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px", marginTop: "15px" }}>
                {[...pagesList]
                  .sort((a, b) => b.views - a.views)
                  .slice(0, 5)
                  .map((p, idx) => {
                    const maxViews = Math.max(...pagesList.map(o => o.views)) || 1;
                    const pct = Math.round((p.views / maxViews) * 100);
                    const isHighIntent = p.path.includes("pricing") || p.path.includes("contact") || p.path.includes("courses");
                    return (
                      <div key={p.path} style={{ backgroundColor: "rgba(19, 26, 40, 0.45)", backdropFilter: "blur(8px)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "8px", padding: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#a1a1aa" }}>#{idx + 1}</span>
                            <span style={{ fontFamily: "monospace", fontSize: "13px", color: "#fff", fontWeight: "600" }}>{p.path}</span>
                            {isHighIntent && (
                              <span style={{ fontSize: "10px", padding: "2px 6px", backgroundColor: "rgba(34, 197, 94, 0.15)", color: "#4ade80", borderRadius: "4px", fontWeight: "bold" }}>
                                CONVERSION PAGE
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "20px", fontSize: "12px", color: "#a1a1aa" }}>
                            <span>👀 <strong>{p.views}</strong> views</span>
                            <span>⏱️ <strong>{formatDuration(p.avgDuration)}</strong> avg time</span>
                            <span>📜 <strong>{p.avgScroll}%</strong> scroll depth</span>
                          </div>
                        </div>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#09090b", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", backgroundColor: isHighIntent ? "#22c55e" : "#4f8cff", borderRadius: "4px", transition: "width 0.8s ease" }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        </>
      )}

      {/* 2. PAGES SUB-TAB */}
      {subTab === "pages" && (
        <section className="analytics-section">
          <h3 className="section-title">All Pages Analysis</h3>
          <p className="section-subtitle">Detailed traffic and engagement metrics across all page paths</p>

          {pagesList.length === 0 ? (
            <div className="analytics-empty">No page visits tracked yet.</div>
          ) : (
            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Page Path</th>
                    <th className="num">Page Views</th>
                    <th className="num">Avg Dwell Time</th>
                    <th className="num">Avg Scroll Depth</th>
                    <th>Intent Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {pagesList.map((p) => {
                    const isHigh = p.path.includes("pricing") || p.path.includes("contact") || p.path.includes("courses");
                    return (
                      <tr key={p.path}>
                        <td>
                          <span className="table-path" style={{ fontFamily: "monospace", color: "#f4f4f5" }}>{p.path}</span>
                        </td>
                        <td className="num highlighted-num">{p.views}</td>
                        <td className="num">{formatDuration(p.avgDuration)}</td>
                        <td className="num">{p.avgScroll}%</td>
                        <td>
                          <span style={{
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "600",
                            backgroundColor: isHigh ? "rgba(34, 197, 94, 0.15)" : "rgba(161, 161, 170, 0.15)",
                            color: isHigh ? "#4ade80" : "#a1a1aa"
                          }}>
                            {isHigh ? "High Intent" : "General"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ACQUISITION & ENTRY PATHS SUB-TAB */}
      {subTab === "acquisition" && (
        <div className="fade-in">
          <div className="analytics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "24px", marginBottom: "24px" }}>
            {/* Traffic Sources */}
            <section className="analytics-section">
              <h3 className="section-title">Traffic Sources / Referrers</h3>
              <p className="section-subtitle">Domains that directed companies to your site</p>
              
              {acquisition.referrers.length === 0 ? (
                <div className="analytics-empty">No external referrer data recorded yet.</div>
              ) : (
                <div className="analytics-table-container">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Referrer Domain</th>
                        <th className="num">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisition.referrers.map((r, idx) => (
                        <tr key={`${r.name}-${idx}`}>
                          <td>
                            <span style={{ fontWeight: "600", color: "#fff" }}>{r.name}</span>
                          </td>
                          <td className="num highlighted-num">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Landing/Entry Pages */}
            <section className="analytics-section">
              <h3 className="section-title">Top Entry Pages</h3>
              <p className="section-subtitle">The first pages that visitors land on when entering the site</p>
              
              {acquisition.entryPages.length === 0 ? (
                <div className="analytics-empty">No landing page data recorded yet.</div>
              ) : (
                <div className="analytics-table-container">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Page Path</th>
                        <th className="num">Entry Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acquisition.entryPages.map((p, idx) => (
                        <tr key={`${p.path}-${idx}`}>
                          <td>
                            <span className="table-path" style={{ fontFamily: "monospace", color: "#f4f4f5" }}>{p.path}</span>
                          </td>
                          <td className="num highlighted-num">{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Marketing Campaigns (UTM Parameters) */}
          <section className="analytics-section">
            <h3 className="section-title">Marketing Campaigns & Channels</h3>
            <p className="section-subtitle">Inbound traffic tracked via UTM parameters</p>
            
            {acquisition.campaigns.length === 0 ? (
              <div className="analytics-empty">No UTM campaigns tracked yet. Use ?utm_source=... to tag links.</div>
            ) : (
              <div className="analytics-table-container">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Medium</th>
                      <th>Campaign Name</th>
                      <th className="num">Tagged Hits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acquisition.campaigns.map((c, idx) => (
                      <tr key={`${c.source}-${c.campaign}-${idx}`}>
                        <td>
                          <span className="table-badge table-badge-blue">{c.source}</span>
                        </td>
                        <td>
                          <span style={{ color: "#a1a1aa", fontSize: "13px" }}>{c.medium}</span>
                        </td>
                        <td>
                          <span style={{ color: "#fff", fontWeight: "600" }}>{c.campaign}</span>
                        </td>
                        <td className="num highlighted-num">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 3. USER SESSIONS SUB-TAB */}
      {subTab === "users" && (
        <section className="analytics-section">
          <h3 className="section-title">Corporate User Sessions</h3>
          <p className="section-subtitle">All de-anonymized organizations that have browsed this site</p>

          {usersList.length === 0 ? (
            <div className="analytics-empty">No corporate sessions recorded yet.</div>
          ) : (
            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Location</th>
                    <th>Device / OS</th>
                    <th className="num">Page Views</th>
                    <th className="num">Dwell Time</th>
                    <th className="num">Intent Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="table-company">
                          <SafeCompanyLogo logo={s.company.logo} name={s.company.name} />
                          <div>
                            <div className="table-company-name" style={{ color: "#f4f4f5" }}>{s.company.name}</div>
                            <div className="table-company-domain" style={{ fontSize: "11px" }}>{s.company.domain}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "#e4e4e7" }}>
                        {s.company.city ? `${s.company.city}, ` : ""}{s.company.country}
                      </td>
                      <td style={{ color: "#a1a1aa" }}>
                        <span style={{ textTransform: "capitalize" }}>{s.client?.device || "desktop"}</span> • {s.client?.os || "Chrome"}
                      </td>
                      <td className="num highlighted-num">{s.pageViews}</td>
                      <td className="num">{formatDuration(s.totalSeconds)}</td>
                      <td className="num">
                        <span className={`score-badge ${s.hot ? "score-badge-hot" : ""}`}>
                          {s.score} {s.hot ? "🔥" : ""}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => onViewContacts(s.company)}
                          style={{ padding: "4px 8px", fontSize: "11px", border: "1px solid #27272a", backgroundColor: "#18181b", color: "#fff", cursor: "pointer", borderRadius: "4px" }}
                        >
                          People
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4. RECENT LOGINS SUB-TAB */}
      {subTab === "logins" && (
        <section className="analytics-section">
          <h3 className="section-title">New User Logins</h3>
          <p className="section-subtitle">Real-time log of captured email addresses from login input forms</p>

          {loginsList.length === 0 ? (
            <div className="analytics-empty" style={{ padding: "40px 0" }}>
              No login submissions captured yet. Go to Sasha LMS and log in to see your email appear here!
            </div>
          ) : (
            <div className="analytics-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Identified Email</th>
                    <th>Source</th>
                    <th>Login Time</th>
                    <th>Last Page Visited</th>
                    <th className="num">Intent Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loginsList.map((s) => {
                    const lastTimeline = s.timeline && s.timeline[0];
                    const referrerHost = s.client?.referrer ? hostFromUrl(s.client.referrer) : null;
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="table-company">
                            <SafeCompanyLogo logo={s.company.logo} name={s.company.name} />
                            <div>
                              <div className="table-company-name" style={{ color: "#f4f4f5" }}>{s.company.name}</div>
                              <div className="table-company-domain" style={{ fontSize: "11px" }}>{s.company.domain}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "#22c55e", fontWeight: "600" }}>
                          🔑 {s.identifiedEmail}
                        </td>
                        <td style={{ color: "#e4e4e7" }}>
                          {referrerHost || "Direct"}
                        </td>
                        <td style={{ color: "#e4e4e7" }}>
                          {new Date(s.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ color: "#a1a1aa", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {lastTimeline ? lastTimeline.label || lastTimeline.path : "—"}
                        </td>
                        <td className="num">
                          <span className={`score-badge ${s.hot ? "score-badge-hot" : ""}`}>
                            {s.score}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => onViewContacts(s.company)}
                            style={{ padding: "4px 8px", fontSize: "11px", border: "1px solid #27272a", backgroundColor: "#18181b", color: "#fff", cursor: "pointer", borderRadius: "4px" }}
                          >
                            People
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 5. AI ANALYST REPORT SUB-TAB */}
      {subTab === "aiReport" && (
        <section className="analytics-section" style={{ border: "1px solid rgba(34, 197, 94, 0.4)", padding: "24px", borderRadius: "8px", backgroundColor: "rgba(34, 197, 94, 0.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h3 className="section-title" style={{ margin: 0, color: "#22c55e", display: "flex", alignItems: "center", gap: "8px" }}>
                ✨ Chief AI Executive Site Report
              </h3>
              <p className="section-subtitle" style={{ margin: "4px 0 0 0" }}>Local Llama-3 AI analysis of all pages, visitors, and logins</p>
            </div>
            <button
              onClick={generateAiReport}
              disabled={loadingAiReport}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #22c55e",
                backgroundColor: "transparent",
                color: "#22c55e",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "13px"
              }}
            >
              {loadingAiReport ? "Analyzing..." : "🔄 Refresh Analysis"}
            </button>
          </div>

          {loadingAiReport ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#a1a1aa" }}>
              <span className="spinner" style={{ display: "inline-block", width: "30px", height: "30px", border: "3px solid #27272a", borderTopColor: "#22c55e", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <p style={{ marginTop: "16px" }}>Llama-3 is analyzing your traffic data... (This can take 10-15 seconds)</p>
            </div>
          ) : aiReportError ? (
            <div style={{ padding: "20px", border: "1px solid #7f1d1d", borderRadius: "6px", backgroundColor: "rgba(127, 29, 29, 0.2)", color: "#fca5a5" }}>
              <strong>AI Analysis Offline:</strong> {aiReportError}
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#a1a1aa" }}>
                Make sure Ollama is running in your taskbar and you have run <code>ollama run llama3</code> in your terminal.
              </div>
            </div>
          ) : (
            <div 
              style={{ 
                color: "#e4e4e7", 
                fontSize: "14px", 
                lineHeight: "1.6", 
                whiteSpace: "pre-wrap", 
                textAlign: "left",
                fontFamily: "system-ui, -apple-system, sans-serif"
              }}
            >
              {aiReport}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
