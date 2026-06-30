import React from "react";

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default function LoginsPanel({ sessions }) {
  const identifiedSessions = sessions.filter(s => s.identifiedEmail);

  return (
    <div className="logins-panel" style={{ padding: "20px 0" }}>
      <div className="toolbar" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="toolbar-title" style={{ margin: 0 }}>
          Captured Login Emails (Identified Users)
        </h2>
        <span className="badge" style={{ backgroundColor: "#22c55e", color: "#fff", padding: "6px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
          {identifiedSessions.length} Identified
        </span>
      </div>

      {identifiedSessions.length === 0 ? (
        <div className="empty" style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed #3f3f46", borderRadius: "8px", backgroundColor: "#09090b" }}>
          <p className="empty-title" style={{ fontSize: "18px", color: "#a1a1aa", fontWeight: "600", margin: "0 0 8px 0" }}>
            No identified users yet
          </p>
          <p className="empty-sub" style={{ color: "#71717a", fontSize: "14px", margin: 0 }}>
            Logins on Sasha LMS will capture the email and show them here in real-time.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #27272a" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#18181b", borderBottom: "1px solid #27272a" }}>
                <th style={{ padding: "14px 16px", color: "#a1a1aa", fontWeight: "600" }}>Company</th>
                <th style={{ padding: "14px 16px", color: "#a1a1aa", fontWeight: "600" }}>Identified Email</th>
                <th style={{ padding: "14px 16px", color: "#a1a1aa", fontWeight: "600" }}>Source</th>
                <th style={{ padding: "14px 16px", color: "#a1a1aa", fontWeight: "600" }}>Last Active</th>
                <th style={{ padding: "14px 16px", color: "#a1a1aa", fontWeight: "600" }}>Intent Score</th>
                <th style={{ padding: "14px 16px", color: "#a1a1aa", fontWeight: "600" }}>Last Page</th>
              </tr>
            </thead>
            <tbody>
              {identifiedSessions.map((session) => {
                const lastTimeline = session.timeline && session.timeline[0];
                const referrerHost = session.client?.referrer ? hostFromUrl(session.client.referrer) : null;
                return (
                  <tr key={session.id} style={{ borderBottom: "1px solid #27272a", backgroundColor: "#09090b" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {session.company.logo ? (
                          <img src={session.company.logo} alt={session.company.name} style={{ width: "28px", height: "28px", borderRadius: "6px" }} />
                        ) : (
                          <div style={{ width: "28px", height: "28px", borderRadius: "6px", backgroundColor: "#27272a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "14px", color: "#a1a1aa" }}>
                            {session.company.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: "600", color: "#f4f4f5" }}>{session.company.name}</div>
                          <div style={{ fontSize: "12px", color: "#71717a" }}>{session.company.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#22c55e", fontWeight: "600" }}>
                      🔑 {session.identifiedEmail}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#e4e4e7" }}>
                      {referrerHost || "Direct"}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#e4e4e7" }}>
                      {new Date(session.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        backgroundColor: session.hot ? "rgba(239, 68, 68, 0.15)" : "rgba(161, 161, 170, 0.15)",
                        color: session.hot ? "#f87171" : "#a1a1aa"
                      }}>
                        {session.score} {session.hot ? "🔥 HOT" : ""}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#a1a1aa", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lastTimeline ? lastTimeline.label || lastTimeline.path : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
