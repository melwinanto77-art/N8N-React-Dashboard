// Three stat tiles summarizing the current feed.
export default function StatBar({ sessions }) {
  const companies = sessions.length;
  const hotLeads = sessions.filter((s) => s.hot).length;
  const minutesEngaged = Math.round(
    sessions.reduce((sum, s) => sum + (s.totalSeconds || 0), 0) / 60
  );

  const tiles = [
    { label: "Companies on site", value: companies, key: "companies" },
    { label: "Hot leads", value: hotLeads, key: "hot", accent: hotLeads > 0 },
    { label: "Minutes engaged", value: minutesEngaged, key: "minutes" }
  ];

  return (
    <div className="statbar">
      {tiles.map((t) => (
        <div className={`stat-tile${t.accent ? " stat-tile-accent" : ""}`} key={t.key}>
          <div className="stat-value">{t.value}</div>
          <div className="stat-label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
