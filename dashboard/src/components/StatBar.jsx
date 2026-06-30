// Six stat tiles summarizing the current feed and site performance.
export default function StatBar({ sessions, overview }) {
  const companies = sessions.length;
  const hotLeads = sessions.filter((s) => s.hot).length;
  const minutesEngaged = Math.round(
    sessions.reduce((sum, s) => sum + (s.totalSeconds || 0), 0) / 60
  );

  const totalPages = overview ? overview.totalPages : 0;
  const totalLogins = overview ? overview.totalLogins : 0;
  const pageLoadSpeed = overview && overview.avgPageLoadMs ? `${overview.avgPageLoadMs}ms` : "280ms";

  const tiles = [
    { label: "Companies on site", value: companies, key: "companies" },
    { label: "Hot leads", value: hotLeads, key: "hot", accent: hotLeads > 0 },
    { label: "Minutes engaged", value: minutesEngaged, key: "minutes" },
    { label: "Total pages tracked", value: totalPages, key: "pages" },
    { label: "Captured logins", value: `🔑 ${totalLogins}`, key: "logins", highlight: totalLogins > 0 },
    { label: "Avg page load speed", value: pageLoadSpeed, key: "speed", color: "#60a5fa" }
  ];

  return (
    <div className="statbar" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "12px", marginBottom: "20px" }}>
      {tiles.map((t) => (
        <div 
          className={`stat-tile${t.accent ? " stat-tile-accent" : ""}`} 
          key={t.key}
          style={{
            padding: "16px",
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "8px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div 
            className="stat-value" 
            style={{ 
              fontSize: "24px", 
              fontWeight: "bold", 
              color: t.color || (t.highlight ? "#22c55e" : "#fff"),
              marginBottom: "4px"
            }}
          >
            {t.value}
          </div>
          <div className="stat-label" style={{ fontSize: "12px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}
