import { useMemo, useState } from "react";
import { useRadarFeed } from "./useRadarFeed.js";
import SiteGate from "./components/SiteGate.jsx";
import StatBar from "./components/StatBar.jsx";
import CompanyCard from "./components/CompanyCard.jsx";
import ContactsPanel from "./components/ContactsPanel.jsx";
import SEOPanel from "./components/SEOPanel.jsx";
import AnalyticsPanel from "./components/AnalyticsPanel.jsx";

export default function App() {
  const [site, setSite] = useState("");
  const [hotOnly, setHotOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [seoOpen, setSeoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("live"); // "live" or "analytics"

  const { sessions, connected, flash } = useRadarFeed(site);

  const visible = useMemo(
    () => (hotOnly ? sessions.filter((s) => s.hot) : sessions),
    [sessions, hotOnly]
  );

  if (!site) {
    return <SiteGate onSubmit={setSite} />;
  }

  function changeSite() {
    setSelected(null);
    setSeoOpen(false);
    setHotOnly(false);
    setActiveTab("live");
    setSite("");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className={`radar-dot${connected ? " radar-dot-live" : ""}`} />
          <span className="brand-name">Inbound Radar</span>
          <span className="brand-site">{site}</span>
        </div>

        <div className="topbar-tabs">
          <button 
            className={`tab-btn${activeTab === "live" ? " active" : ""}`} 
            onClick={() => setActiveTab("live")}
            type="button"
          >
            Live Feed
          </button>
          <button 
            className={`tab-btn${activeTab === "analytics" ? " active" : ""}`} 
            onClick={() => setActiveTab("analytics")}
            type="button"
          >
            Analytics
          </button>
        </div>

        <div className="topbar-right">
          <span className={`live-pill${connected ? " live-pill-on" : ""}`}>
            <span className="live-pill-dot" />
            {connected ? "LIVE" : "connecting…"}
          </span>
          <button className="btn btn-ghost" type="button" onClick={() => setSeoOpen(true)}>
            SEO health
          </button>
          <button className="btn btn-ghost" type="button" onClick={changeSite}>
            Change site
          </button>
        </div>
      </header>

      <main className="content">
        <StatBar sessions={sessions} />

        {activeTab === "live" ? (
          <>
            <div className="toolbar">
              <h2 className="toolbar-title">
                Companies browsing <span className="toolbar-site">{site}</span>
              </h2>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={hotOnly}
                  onChange={(e) => setHotOnly(e.target.checked)}
                />
                <span>Hot leads only</span>
              </label>
            </div>

            {visible.length === 0 ? (
              <div className="empty">
                <span className="empty-radar" aria-hidden="true" />
                <p className="empty-title">
                  {hotOnly ? "No hot leads yet" : "Listening for companies…"}
                </p>
                <p className="empty-sub">
                  {hotOnly
                    ? "Companies appear here the moment their intent score crosses 60."
                    : "De-anonymized companies will stream in as they browse your site."}
                </p>
              </div>
            ) : (
              <div className="grid">
                {visible.map((session) => (
                  <CompanyCard
                    key={session.id}
                    session={session}
                    flashing={flash.has(session.id)}
                    onViewContacts={setSelected}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <AnalyticsPanel site={site} />
        )}
      </main>

      <footer className="footer">
        Company-level analytics only — we resolve visitors to organizations, never
        to individuals. Contacts shown are people who work at a company, sourced
        from a licensed provider, and are not the visitor.
      </footer>

      {selected && (
        <ContactsPanel company={selected} onClose={() => setSelected(null)} />
      )}

      {seoOpen && <SEOPanel site={site} onClose={() => setSeoOpen(false)} />}
    </div>
  );
}
