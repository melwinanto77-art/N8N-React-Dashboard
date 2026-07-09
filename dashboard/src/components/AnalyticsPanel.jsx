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
  const [geoList, setGeoList] = useState([]);
  const [rulesList, setRulesList] = useState([]);
  const [logsList, setLogsList] = useState([]);
  const [activeSimSession, setActiveSimSession] = useState(null);

  // Dynamic B2B filters & search
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");

  // B2B Trend Data
  const [trendRange, setTrendRange] = useState("7d");
  const [trendList, setTrendList] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(false);

  // Intent score configurator
  const [weightHigh, setWeightHigh] = useState(40);
  const [weightMedium, setWeightMedium] = useState(15);
  const [weightLow, setWeightLow] = useState(5);
  const [dwellBonusPer30s, setDwellBonusPer30s] = useState(1);
  const [highIntentPagesText, setHighIntentPagesText] = useState("/pricing, /checkout");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Fetch Intent Settings
  async function fetchIntentSettings() {
    if (!site) return;
    try {
      const res = await fetch(`/api/settings/intent?site=${encodeURIComponent(site)}`);
      if (res.ok) {
        const data = await res.json();
        setWeightHigh(data.weightHigh ?? 40);
        setWeightMedium(data.weightMedium ?? 15);
        setWeightLow(data.weightLow ?? 5);
        setDwellBonusPer30s(data.dwellBonusPer30s ?? 1);
        setHighIntentPagesText(data.highIntentPages ? data.highIntentPages.join(", ") : "/pricing, /checkout");
      }
    } catch (err) {
      console.error("Failed to fetch intent settings:", err);
    }
  }

  // Fetch Historical Trend
  async function fetchTrend() {
    if (!site) return;
    setLoadingTrend(true);
    try {
      const res = await fetch(`/api/analytics/historical-trend?site=${encodeURIComponent(site)}&range=${trendRange}`);
      if (res.ok) {
        const data = await res.json();
        setTrendList(data);
      }
    } catch (err) {
      console.error("Failed to fetch historical trend:", err);
    } finally {
      setLoadingTrend(false);
    }
  }

  // Save Settings
  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const list = highIntentPagesText
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
        
      const res = await fetch("/api/settings/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site,
          weightHigh: Number(weightHigh),
          weightMedium: Number(weightMedium),
          weightLow: Number(weightLow),
          dwellBonusPer30s: Number(dwellBonusPer30s),
          highIntentPages: list
        })
      });
      if (res.ok) {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
        // Refresh analytics since scores are re-calculated on the backend
        fetchAllAnalytics();
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSavingSettings(false);
    }
  }

  // Export Leads to CSV
  function handleExportCSV(listToExport) {
    const headers = ["Company Name", "Domain", "Industry", "Size", "Location", "Page Views", "Dwell Time", "Intent Score", "Identified Email", "Last Seen"];
    const rows = listToExport.map(s => [
      `"${s.company.name.replace(/"/g, '""')}"`,
      s.company.domain,
      s.company.industry || "N/A",
      s.company.size || "N/A",
      `"${[s.company.city, s.company.country].filter(Boolean).join(", ").replace(/"/g, '""')}"`,
      s.pageViews,
      `${Math.round(s.totalSeconds)}s`,
      s.score,
      s.identifiedEmail || "None",
      new Date(s.lastSeen).toLocaleString()
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `b2b_inbound_radar_leads_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Fetch trend on load/range change
  useEffect(() => {
    fetchTrend();
  }, [site, trendRange]);

  // Fetch intent settings on load
  useEffect(() => {
    fetchIntentSettings();
  }, [site]);

  async function fetchAllAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const [
          overviewRes,
          funnelRes,
          companiesRes,
          pagesIndRes,
          pagesRes,
          usersRes,
          loginsRes,
          acquisitionRes,
          geoRes,
          rulesRes,
          logsRes
        ] = await Promise.all([
          fetch(`/api/analytics/overview?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/conversion-funnel?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/top-companies?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/pages-by-industry?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/pages?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/users?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/new-logins?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/acquisition?site=${encodeURIComponent(site)}`),
          fetch(`/api/analytics/geo-distribution?site=${encodeURIComponent(site)}`),
          fetch(`/api/alerts/rules?site=${encodeURIComponent(site)}`),
          fetch(`/api/alerts/logs?site=${encodeURIComponent(site)}`)
        ]);

        if (
          !overviewRes.ok ||
          !funnelRes.ok ||
          !companiesRes.ok ||
          !pagesIndRes.ok ||
          !pagesRes.ok ||
          !usersRes.ok ||
          !loginsRes.ok ||
          !acquisitionRes.ok ||
          !geoRes.ok ||
          !rulesRes.ok ||
          !logsRes.ok
        ) {
          throw new Error("Failed to fetch some analytics data endpoints.");
        }

        const [
          overviewData,
          funnelData,
          companiesData,
          pagesIndData,
          pagesData,
          usersData,
          loginsData,
          acquisitionData,
          geoData,
          rulesData,
          logsData
        ] = await Promise.all([
          overviewRes.json(),
          funnelRes.json(),
          companiesRes.json(),
          pagesIndRes.json(),
          pagesRes.json(),
          usersRes.json(),
          loginsRes.json(),
          acquisitionRes.json(),
          geoRes.json(),
          rulesRes.json(),
          logsRes.json()
        ]);

        setOverview(overviewData);
        setFunnel(funnelData);
        setTopCompanies(companiesData);
        setPagesByIndustry(pagesIndData);
        setPagesList(pagesData);
        setUsersList(usersData);
        setLoginsList(loginsData);
        setAcquisition(acquisitionData);
        setGeoList(geoData);
        setRulesList(rulesData);
        setLogsList(logsData);
      } catch (err) {
        console.error("Analytics load error:", err);
        setError(err.message || "An error occurred while loading dashboard analytics.");
      } finally {
        setLoading(false);
      }
    }

  useEffect(() => {
    if (site) {
      fetchAllAnalytics();
    }
  }, [site]);



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
          { id: "geoMap", name: "🗺️ Geo Map" },
          { id: "users", name: `User Sessions (${usersList.length})` },
          { id: "logins", name: `New Logins (${loginsList.length})` },
          { id: "alerts", name: "⚡ Alert Rules" },
          { id: "settings", name: "⚙️ Settings" }
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

          {/* B2B Traffic & Intent Trends Chart */}
          <section className="analytics-section" style={{ marginBottom: "30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <div>
                <h3 className="section-title" style={{ margin: 0 }}>📈 B2B Traffic & Intent Trends</h3>
                <p className="section-subtitle" style={{ margin: "4px 0 0 0" }}>Historical unique company visits vs pageview volume</p>
              </div>
              <div style={{ display: "flex", gap: "6px", background: "#09090b", padding: "4px", borderRadius: "6px", border: "1px solid #27272a" }}>
                {[
                  { id: "today", name: "Today" },
                  { id: "7d", name: "7 Days" },
                  { id: "30d", name: "30 Days" }
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => setTrendRange(r.id)}
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      borderRadius: "4px",
                      border: "none",
                      cursor: "pointer",
                      backgroundColor: trendRange === r.id ? "#22c55e" : "transparent",
                      color: trendRange === r.id ? "#fff" : "#a1a1aa",
                      transition: "all 0.2s"
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "20px", position: "relative" }}>
              {loadingTrend ? (
                <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "#a1a1aa" }}>
                  <span className="spinner" style={{ display: "inline-block", width: "24px", height: "24px", border: "2px solid #27272a", borderTopColor: "#22c55e", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <span style={{ marginLeft: "10px" }}>Loading trend data...</span>
                </div>
              ) : trendList.length === 0 ? (
                <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }}>
                  No trend data recorded yet.
                </div>
              ) : (
                <div>
                  {/* Legend */}
                  <div style={{ display: "flex", gap: "20px", marginBottom: "15px", fontSize: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e4e4e7" }}>
                      <span style={{ display: "inline-block", width: "12px", height: "3px", backgroundColor: "#22c55e", borderRadius: "2px" }} />
                      Unique Companies
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e4e4e7" }}>
                      <span style={{ display: "inline-block", width: "12px", height: "3px", backgroundColor: "#a78bfa", borderRadius: "2px" }} />
                      Pageviews
                    </div>
                  </div>

                  {/* SVG Chart */}
                  <div style={{ position: "relative", width: "100%", height: "200px" }}>
                    <svg viewBox="0 0 1000 200" width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                      {/* Grid Lines */}
                      <line x1="0" y1="20" x2="1000" y2="20" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" />
                      <line x1="0" y1="80" x2="1000" y2="80" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" />
                      <line x1="0" y1="140" x2="1000" y2="140" stroke="#27272a" strokeWidth="1" strokeDasharray="4 4" />
                      <line x1="0" y1="200" x2="1000" y2="200" stroke="#3f3f46" strokeWidth="1" />

                      {(() => {
                        const maxVal = Math.max(...trendList.map(t => Math.max(t.sessions, t.pageviews, 5)));
                        const pointsCount = trendList.length;
                        const stepX = 1000 / Math.max(1, pointsCount - 1);

                        // Unique Companies points
                        const compPoints = trendList.map((t, idx) => ({
                          x: idx * stepX,
                          y: 200 - (t.sessions / maxVal) * 150 - 25
                        }));

                        // Pageviews points
                        const pvPoints = trendList.map((t, idx) => ({
                          x: idx * stepX,
                          y: 200 - (t.pageviews / maxVal) * 150 - 25
                        }));

                        const compPath = compPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                        const pvPath = pvPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

                        const compArea = `${compPath} L 1000 200 L 0 200 Z`;

                        return (
                          <>
                            {/* Area for unique companies */}
                            <path d={compArea} fill="url(#green-gradient)" opacity="0.08" />
                            
                            {/* Lines */}
                            <path d={compPath} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            <path d={pvPath} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2" />

                            {/* Dots and Labels */}
                            {trendList.map((t, idx) => {
                              const compP = compPoints[idx];
                              const pvP = pvPoints[idx];
                              return (
                                <g key={idx}>
                                  {/* Company Dot */}
                                  <circle cx={compP.x} cy={compP.y} r="5" fill="#22c55e" stroke="#18181b" strokeWidth="2" style={{ cursor: "pointer" }} />
                                  {/* Pageview Dot */}
                                  <circle cx={pvP.x} cy={pvP.y} r="4" fill="#a78bfa" stroke="#18181b" strokeWidth="1.5" style={{ cursor: "pointer" }} />
                                  
                                  {/* Value label hover effect */}
                                  <text x={compP.x} y={compP.y - 12} fill="#22c55e" fontSize="10" fontWeight="bold" textAnchor="middle">{t.sessions}</text>
                                  <text x={pvP.x} y={pvP.y - 12} fill="#a78bfa" fontSize="10" fontWeight="bold" textAnchor="middle">{t.pageviews}</text>
                                </g>
                              );
                            })}

                            {/* Gradients */}
                            <defs>
                              <linearGradient id="green-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22c55e" />
                                <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                          </>
                        );
                      })()}
                    </svg>
                  </div>

                  {/* Bottom X Axis Labels */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "15px", padding: "0 10px" }}>
                    {trendList.map((t, idx) => (
                      <div key={idx} style={{ fontSize: "11px", color: "#71717a", fontWeight: "600", textAlign: "center", width: `${100 / trendList.length}%` }}>
                        {t.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

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

          {(() => {
            const uniqueIndustries = Array.from(new Set(usersList.map(u => u.company.industry).filter(Boolean)));
            const uniqueSizes = Array.from(new Set(usersList.map(u => u.company.size).filter(Boolean)));
            const filteredUsers = usersList.filter(u => {
              const matchesSearch = !searchQuery || 
                u.company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.company.domain.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesIndustry = !industryFilter || u.company.industry === industryFilter;
              const matchesSize = !sizeFilter || u.company.size === sizeFilter;
              return matchesSearch && matchesIndustry && matchesSize;
            });

            return (
              <>
                {/* Filters Bar */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", alignItems: "center", background: "#18181b", padding: "12px", borderRadius: "8px", border: "1px solid #27272a" }}>
                  {/* Search Bar */}
                  <input
                    type="text"
                    placeholder="🔍 Search company name or domain..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ flex: 2, minWidth: "200px", padding: "8px 12px", background: "#09090b", color: "#fff", border: "1px solid #27272a", borderRadius: "6px", fontSize: "13px" }}
                  />

                  {/* Industry Filter */}
                  <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    style={{ flex: 1, minWidth: "140px", padding: "8px 12px", background: "#09090b", color: "#fff", border: "1px solid #27272a", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}
                  >
                    <option value="">All Industries</option>
                    {uniqueIndustries.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>

                  {/* Size Filter */}
                  <select
                    value={sizeFilter}
                    onChange={(e) => setSizeFilter(e.target.value)}
                    style={{ flex: 1, minWidth: "140px", padding: "8px 12px", background: "#09090b", color: "#fff", border: "1px solid #27272a", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}
                  >
                    <option value="">All Sizes</option>
                    {uniqueSizes.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>

                  {/* Export CSV Button */}
                  <button
                    onClick={() => handleExportCSV(filteredUsers)}
                    style={{ padding: "8px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s" }}
                    title="Export leads to CSV"
                  >
                    📥 Export CSV
                  </button>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="analytics-empty">No matching corporate sessions found.</div>
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
                        {filteredUsers.map((s) => (
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
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setActiveSimSession(s)}
                          style={{ padding: "4px 8px", fontSize: "11px", border: "1px solid #27272a", backgroundColor: "#22c55e", color: "#fff", cursor: "pointer", borderRadius: "4px", marginLeft: "6px" }}
                        >
                          🎬 Simulate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
              </>
            );
          })()}
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



      {/* 6. GEO MAP SUB-TAB */}
      {subTab === "geoMap" && (
        <section className="analytics-section">
          <h3 className="section-title">🗺️ Firmographic Geo Map</h3>
          <p className="section-subtitle">Geographic density of de-anonymized B2B buyer accounts</p>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", marginTop: "20px" }}>
            {/* Styled Map Container */}
            <div style={{ background: "#18181b", padding: "20px", borderRadius: "8px", border: "1px solid #27272a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "350px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, opacity: 0.05, backgroundImage: "radial-gradient(#22c55e 1px, transparent 1px)", backgroundSize: "16px 16px" }}></div>
              <div style={{ width: "100%", height: "240px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "absolute", top: "40%", left: "20%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div className="pulsing-dot" style={{ width: "14px", height: "14px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
                  <span style={{ fontSize: "9px", color: "#a1a1aa", marginTop: "4px", backgroundColor: "#09090b", padding: "2px 4px", borderRadius: "3px" }}>North America</span>
                </div>
                <div style={{ position: "absolute", top: "35%", left: "50%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div className="pulsing-dot" style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
                  <span style={{ fontSize: "9px", color: "#a1a1aa", marginTop: "4px", backgroundColor: "#09090b", padding: "2px 4px", borderRadius: "3px" }}>Europe</span>
                </div>
                <div style={{ position: "absolute", top: "55%", left: "75%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div className="pulsing-dot" style={{ width: "16px", height: "16px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
                  <span style={{ fontSize: "9px", color: "#a1a1aa", marginTop: "4px", backgroundColor: "#09090b", padding: "2px 4px", borderRadius: "3px" }}>Asia/India</span>
                </div>
                <div style={{ position: "absolute", top: "70%", left: "30%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
                  <span style={{ fontSize: "9px", color: "#a1a1aa", marginTop: "4px", backgroundColor: "#09090b", padding: "2px 4px", borderRadius: "3px" }}>South America</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#71717a", letterSpacing: "2px", textTransform: "uppercase" }}>Visual Intent Hub Map</div>
              </div>
              <div style={{ width: "100%", borderTop: "1px solid #27272a", paddingTop: "15px", display: "flex", justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#22c55e" }}>{geoList.length}</div>
                  <div style={{ fontSize: "11px", color: "#71717a" }}>Unique Cities</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#22c55e" }}>
                    {new Set(geoList.map(g => g.country)).size}
                  </div>
                  <div style={{ fontSize: "11px", color: "#71717a" }}>Countries</div>
                </div>
              </div>
            </div>

            {/* Geo Breakdown Sidebar */}
            <div style={{ background: "#18181b", padding: "20px", borderRadius: "8px", border: "1px solid #27272a", maxHeight: "350px", overflowY: "auto" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "14px", color: "#e4e4e7" }}>Session Density by City</h4>
              {geoList.length === 0 ? (
                <div style={{ color: "#71717a", fontSize: "13px" }}>No geographical data available yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {geoList.map((g, i) => {
                    const maxVal = geoList[0] ? geoList[0].count : 1;
                    const pct = Math.max(10, Math.min(100, (g.count / maxVal) * 100));
                    return (
                      <div key={i} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                          <span style={{ color: "#f4f4f5", fontWeight: "500" }}>{g.city}, {g.country}</span>
                          <span style={{ color: "#22c55e", fontWeight: "bold" }}>{g.count} leads</span>
                        </div>
                        <div style={{ width: "100%", height: "6px", backgroundColor: "#27272a", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", backgroundColor: "#22c55e", borderRadius: "3px" }}></div>
                        </div>
                        <div style={{ fontSize: "10px", color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          Org: {g.companies.map(c => c.name).join(", ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <style>{`
            .pulsing-dot {
              animation: ping 1.8s infinite;
            }
            @keyframes ping {
              0% { transform: scale(1); opacity: 1; }
              70% { transform: scale(2.2); opacity: 0; }
              100% { transform: scale(2.2); opacity: 0; }
            }
          `}</style>
        </section>
      )}

      {/* 7. ALERT RULES & WEBHOOKS SUB-TAB */}
      {subTab === "alerts" && (
        <section className="analytics-section">
          <h3 className="section-title">⚡ Intent Alert Webhook Rules</h3>
          <p className="section-subtitle">Configure real-time automated triggers to alert your Slack or webhook whenever corporate intent is recorded</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginTop: "20px" }}>
            {/* Left Column: Create & Manage Rules */}
            <div style={{ background: "#18181b", padding: "20px", borderRadius: "8px", border: "1px solid #27272a", display: "flex", flexDirection: "column", gap: "15px" }}>
              <h4 style={{ margin: "0 0 5px 0", fontSize: "15px", color: "#e4e4e7" }}>Create Custom Alert Rule</h4>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target;
                const payload = {
                  name: form.ruleName.value,
                  site,
                  triggerType: form.triggerType.value,
                  threshold: form.triggerType.value === "intent" ? form.triggerValue.value : undefined,
                  value: form.triggerType.value !== "intent" ? form.triggerValue.value : undefined,
                  webhookUrl: form.webhookUrl.value
                };
                try {
                  const res = await fetch("/api/alerts/rules", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  });
                  if (res.ok) {
                    const rule = await res.json();
                    setRulesList([...rulesList, rule]);
                    form.reset();
                  }
                } catch (err) {
                  console.error(err);
                }
              }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Rule Name</label>
                  <input name="ruleName" required placeholder="e.g. Hot Lead Alert" style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "13px" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Trigger Type</label>
                    <select name="triggerType" defaultValue="intent" style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "13px" }}>
                      <option value="intent">Intent Score Threshold</option>
                      <option value="page">Page Path Visit</option>
                      <option value="industry">Company Industry</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Threshold / Value</label>
                    <input name="triggerValue" required placeholder="e.g. SaaS / 80 / /pricing" style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "13px" }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>Webhook URL (n8n / Slack)</label>
                  <input name="webhookUrl" placeholder="http://localhost:5678/webhook/b2b-leads" style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "13px" }} />
                </div>

                <button type="submit" style={{ padding: "10px", borderRadius: "4px", backgroundColor: "#22c55e", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold", marginTop: "5px" }}>
                  Create Rule
                </button>
              </form>

              <h4 style={{ margin: "15px 0 5px 0", fontSize: "14px", color: "#e4e4e7" }}>Active Rules</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {rulesList.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#09090b", padding: "10px", borderRadius: "4px", border: "1px solid #27272a" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "#fff", fontWeight: "600" }}>{r.name}</div>
                      <div style={{ fontSize: "10px", color: "#71717a" }}>
                        If {r.triggerType} equals/exceeds {r.value || r.threshold || 80} {"\u2192"} Send Webhook
                      </div>
                    </div>
                    <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "3px", backgroundColor: r.active ? "rgba(34,197,94,0.15)" : "#27272a", color: r.active ? "#22c55e" : "#a1a1aa" }}>
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Triggered Logs Feed */}
            <div style={{ background: "#18181b", padding: "20px", borderRadius: "8px", border: "1px solid #27272a", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto" }}>
              <h4 style={{ margin: "0 0 5px 0", fontSize: "15px", color: "#e4e4e7" }}>Triggered Alerts History</h4>
              {logsList.length === 0 ? (
                <div style={{ color: "#71717a", fontSize: "13px" }}>No alerts have been tripped yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {logsList.map((log, i) => (
                    <div key={i} style={{ borderLeft: "3px solid #eab308", background: "#09090b", padding: "10px", borderRadius: "0 4px 4px 0", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "#e4e4e7", fontWeight: "bold" }}>🚨 {log.ruleName}</span>
                        <span style={{ color: "#71717a" }}>
                          {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#fff", margin: "2px 0" }}>{log.description}</div>
                      <div style={{ fontSize: "10px", color: "#22c55e" }}>domain: {log.domain}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 8. SETTINGS SUB-TAB */}
      {subTab === "settings" && (
        <section className="analytics-section">
          <h3 className="section-title">⚙️ B2B Lead Intent Score Settings</h3>
          <p className="section-subtitle">Fine-tune weights, page value multipliers, and engagement dwell bonuses to customize how Lead Intent Scores are calculated</p>

          <div style={{ maxWidth: "600px", background: "#18181b", padding: "24px", borderRadius: "8px", border: "1px solid #27272a", marginTop: "20px" }}>
            <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px", fontWeight: "600" }}>High-Intent Page Weight</label>
                  <input
                    type="number"
                    value={weightHigh}
                    onChange={(e) => setWeightHigh(e.target.value)}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "14px" }}
                  />
                  <span style={{ fontSize: "10px", color: "#71717a", marginTop: "4px", display: "block" }}>Points awarded for high value page views</span>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px", fontWeight: "600" }}>Medium-Intent Page Weight</label>
                  <input
                    type="number"
                    value={weightMedium}
                    onChange={(e) => setWeightMedium(e.target.value)}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "14px" }}
                  />
                  <span style={{ fontSize: "10px", color: "#71717a", marginTop: "4px", display: "block" }}>Points awarded for documentation/contact pages</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px", fontWeight: "600" }}>Low-Intent Page Weight</label>
                  <input
                    type="number"
                    value={weightLow}
                    onChange={(e) => setWeightLow(e.target.value)}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "14px" }}
                  />
                  <span style={{ fontSize: "10px", color: "#71717a", marginTop: "4px", display: "block" }}>Points awarded for general blog/home visits</span>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px", fontWeight: "600" }}>Dwell Time Bonus (per 30s)</label>
                  <input
                    type="number"
                    value={dwellBonusPer30s}
                    onChange={(e) => setDwellBonusPer30s(e.target.value)}
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "14px" }}
                  />
                  <span style={{ fontSize: "10px", color: "#71717a", marginTop: "4px", display: "block" }}>Multiplier added for session active duration</span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#a1a1aa", marginBottom: "6px", fontWeight: "600" }}>Custom High-Intent Page Paths (Comma-separated)</label>
                <textarea
                  value={highIntentPagesText}
                  onChange={(e) => setHighIntentPagesText(e.target.value)}
                  placeholder="/pricing, /checkout, /enterprise"
                  style={{ width: "100%", height: "80px", padding: "10px", borderRadius: "6px", border: "1px solid #27272a", backgroundColor: "#09090b", color: "#fff", fontSize: "14px", fontFamily: "monospace", resize: "none" }}
                />
                <span style={{ fontSize: "10px", color: "#71717a", marginTop: "4px", display: "block" }}>Any visiting paths starting with these will automatically get the high-intent points bonus</span>
              </div>

              {settingsSuccess && (
                <div style={{ padding: "10px 14px", borderRadius: "4px", backgroundColor: "rgba(34,197,94,0.15)", border: "1px solid #22c55e", color: "#22c55e", fontSize: "13px", fontWeight: "600" }}>
                  ✅ Settings saved successfully! All leads intent scores recalculated dynamically.
                </div>
              )}

              <button
                type="submit"
                disabled={savingSettings}
                style={{ padding: "12px", borderRadius: "6px", backgroundColor: "#22c55e", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold", fontSize: "14px", marginTop: "5px", transition: "all 0.2s", opacity: savingSettings ? 0.7 : 1 }}
              >
                {savingSettings ? "Saving Settings..." : "💾 Save Settings"}
              </button>
            </form>
          </div>
        </section>
      )}

      {/* 9. SCROLL HEATMAP & SESSION DWELL SIMULATOR MODAL */}
      {activeSimSession && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ backgroundColor: "#18181b", border: "1px solid #27272a", width: "80%", maxWidth: "800px", height: "85%", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #27272a" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "16px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                  🎬 Session Dwell & Scroll Heatmap Simulator
                </h4>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#71717a" }}>
                  Analyzing {activeSimSession.company.name} on {site}
                </p>
              </div>
              <button
                onClick={() => setActiveSimSession(null)}
                style={{ background: "transparent", border: "none", color: "#a1a1aa", fontSize: "20px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", flex: 1, overflow: "hidden" }}>
              {/* Left sidebar: Session timeline paths */}
              <div style={{ borderRight: "1px solid #27272a", padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                <h5 style={{ margin: "0 0 5px 0", fontSize: "13px", color: "#fff" }}>Pages Visited</h5>
                {activeSimSession.timeline.map((entry, idx) => (
                  <div key={idx} style={{ padding: "10px", borderRadius: "6px", backgroundColor: "#09090b", border: "1px solid #27272a", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ fontSize: "12px", color: "#22c55e", fontWeight: "600", wordBreak: "break-all" }}>{entry.path}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#71717a" }}>
                      <span>⏱️ {entry.durationSec || 15}s dwell</span>
                      <span>📜 {entry.scrollDepth || 90}% scroll</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right panel: Stylized Webpage Wireframe Heatmap simulator */}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px", overflowY: "auto" }}>
                <h5 style={{ margin: 0, fontSize: "13px", color: "#fff" }}>Webpage Wireframe Mock & Heatmap</h5>
                
                {/* Visual simulator wrapper */}
                <div style={{ flex: 1, minHeight: "450px", border: "1px solid #27272a", borderRadius: "6px", backgroundColor: "#09090b", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  
                  {/* Mock browser address bar */}
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", backgroundColor: "#18181b", padding: "8px 12px", borderBottom: "1px solid #27272a", fontSize: "11px", color: "#71717a" }}>
                    <span style={{ color: "#ef4444" }}>●</span><span style={{ color: "#eab308" }}>●</span><span style={{ color: "#22c55e" }}>●</span>
                    <div style={{ flex: 1, backgroundColor: "#09090b", padding: "2px 10px", borderRadius: "3px", textAlign: "center", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {site}{activeSimSession.timeline[0]?.path || "/"}
                    </div>
                  </div>

                  {/* Wireframe webpage layout */}
                  <div style={{ flex: 1, padding: "20px", position: "relative", display: "flex", flexDirection: "column", gap: "15px", overflowY: "auto" }}>
                    {/* Max Scroll Depth indicator line */}
                    <div style={{ position: "absolute", top: `${activeSimSession.timeline[0]?.scrollDepth || 85}%`, left: 0, right: 0, borderTop: "2px dashed #22c55e", zIndex: 10 }}>
                      <span style={{ position: "absolute", right: "10px", top: "-18px", backgroundColor: "#22c55e", color: "#fff", fontSize: "9px", padding: "2px 6px", borderRadius: "3px", fontWeight: "bold" }}>
                        Max Scroll Depth: {activeSimSession.timeline[0]?.scrollDepth || 85}%
                      </span>
                    </div>

                    {/* Section 1: Header */}
                    <div style={{ border: "1px solid #27272a", borderRadius: "4px", padding: "15px", background: "rgba(34, 197, 94, 0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#fff", fontWeight: "bold" }}>NAVBAR & HEADER HERO</span>
                        <span style={{ fontSize: "9px", color: "#22c55e", padding: "2px 4px", borderRadius: "3px", backgroundColor: "rgba(34,197,94,0.15)" }}>Low Dwell (Fast Scroll)</span>
                      </div>
                      <div style={{ width: "60%", height: "8px", background: "#27272a", marginBottom: "6px" }}></div>
                      <div style={{ width: "40%", height: "6px", background: "#27272a" }}></div>
                    </div>

                    {/* Section 2: Features Grid */}
                    <div style={{ border: "1px solid #27272a", borderRadius: "4px", padding: "15px", background: "rgba(59, 130, 246, 0.08)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#fff", fontWeight: "bold" }}>FEATURES GRID</span>
                        <span style={{ fontSize: "9px", color: "#3b82f6", padding: "2px 4px", borderRadius: "3px", backgroundColor: "rgba(59,130,246,0.15)" }}>Medium Dwell (Read Details)</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div style={{ height: "30px", background: "#27272a", borderRadius: "3px" }}></div>
                        <div style={{ height: "30px", background: "#27272a", borderRadius: "3px" }}></div>
                      </div>
                    </div>

                    {/* Section 3: Pricing Table - Dwell Hotspot! */}
                    <div style={{ border: "1px solid #ef4444", borderRadius: "4px", padding: "15px", background: "rgba(239, 68, 68, 0.12)", boxShadow: "0 0 10px rgba(239,68,68,0.1)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", color: "#ef4444", fontWeight: "bold" }}>💳 COURSE PRICING / LEAD FORM</span>
                        <span style={{ fontSize: "9px", color: "#ef4444", padding: "2px 4px", borderRadius: "3px", backgroundColor: "rgba(239,68,68,0.15)", fontWeight: "bold" }}>🔥 HOTSPOT: High Dwell (Long Hold)</span>
                      </div>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <div style={{ flex: 1, height: "45px", background: "#27272a", borderRadius: "3px" }}></div>
                        <div style={{ flex: 1, height: "45px", background: "#27272a", borderRadius: "3px" }}></div>
                      </div>
                    </div>

                    {/* Section 4: Footer */}
                    <div style={{ border: "1px solid #27272a", borderRadius: "4px", padding: "15px", background: "rgba(39, 39, 42, 0.1)", opacity: (activeSimSession.timeline[0]?.scrollDepth || 85) < 95 ? 0.3 : 1 }}>
                      <span style={{ fontSize: "11px", color: "#71717a", fontWeight: "bold" }}>FOOTER & LINKS</span>
                      <div style={{ width: "30%", height: "6px", background: "#27272a", marginTop: "8px" }}></div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
