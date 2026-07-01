import { useEffect, useState } from "react";
import SiteGate from "./components/SiteGate.jsx";
import StatBar from "./components/StatBar.jsx";
import ContactsPanel from "./components/ContactsPanel.jsx";
import SEOPanel from "./components/SEOPanel.jsx";
import AnalyticsPanel from "./components/AnalyticsPanel.jsx";

export default function App() {
  const [site, setSite] = useState("");
  const [selected, setSelected] = useState(null);
  const [seoOpen, setSeoOpen] = useState(false);
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    if (!site) return;
    async function fetchOverview() {
      try {
        const res = await fetch(`/api/analytics/overview?site=${encodeURIComponent(site)}`);
        if (res.ok) {
          const data = await res.json();
          setOverview(data);
        }
      } catch (err) {
        console.error("Overview fetch error:", err);
      }
    }
    fetchOverview();
    const interval = setInterval(fetchOverview, 5000);
    return () => clearInterval(interval);
  }, [site]);

  if (!site) {
    return <SiteGate onSubmit={setSite} />;
  }

  // Backwards compatibility for overview to prevent crash before load
  const cleanOverview = overview || {
    totalPages: 0,
    totalUsers: 0,
    totalLogins: 0,
    hotLeads: 0,
    minutesEngaged: 0,
    avgPageLoadMs: 280,
    avgTtfbMs: 65
  };

  function changeSite() {
    setSelected(null);
    setSeoOpen(false);
    setOverview(null);
    setSite("");
  }

  return (
    <div className="app">
      <header className="topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px" }}>
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="radar-dot" style={{ backgroundColor: "#22c55e" }} />
          <span className="brand-name" style={{ fontWeight: "800", color: "#fff", fontSize: "16px" }}>Inbound Radar</span>
          <span className="brand-badge" style={{ fontSize: "10px", padding: "3px 8px", backgroundColor: "#22c55e", color: "#fff", borderRadius: "4px", fontWeight: "bold" }}>ANALYTICS</span>
          <span className="brand-site" style={{ fontSize: "13px", color: "#a1a1aa", border: "1px solid #27272a", padding: "3px 10px", borderRadius: "20px", backgroundColor: "#09090b" }}>{site}</span>
        </div>

        <div className="topbar-right" style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-ghost" type="button" onClick={() => setSeoOpen(true)} style={{ padding: "8px 16px", cursor: "pointer", fontWeight: "600" }}>
            SEO / AEO / GEO Health
          </button>
          <button className="btn btn-ghost" type="button" onClick={changeSite} style={{ padding: "8px 16px", cursor: "pointer", fontWeight: "600" }}>
            Change Site
          </button>
        </div>
      </header>

      <main className="content" style={{ padding: "24px" }}>
        <StatBar sessions={[]} overview={cleanOverview} />
        <AnalyticsPanel site={site} onViewContacts={setSelected} />
      </main>

      <footer className="footer" style={{ padding: "20px 24px", color: "#71717a", fontSize: "12px", borderTop: "1px solid #27272a", marginTop: "40px", textAlign: "center" }}>
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
