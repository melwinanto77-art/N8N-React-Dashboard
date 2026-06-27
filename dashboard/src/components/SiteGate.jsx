import { useState } from "react";

// Landing screen. Normalization happens server-side; we just pass the raw
// host the user pasted up via onSubmit.
export default function SiteGate({ onSubmit }) {
  const [value, setValue] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    onSubmit(raw);
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-badge">
          <span className="radar-dot" />
          Inbound Radar
        </div>

        <h1 className="gate-title">See which companies are browsing your site</h1>
        <p className="gate-sub">
          Drop in the beacon, paste your domain, and watch de-anonymized
          companies stream into a live sales feed scored by buying intent.
        </p>

        <form className="gate-form" onSubmit={handleSubmit}>
          <input
            className="gate-input"
            type="text"
            inputMode="url"
            autoFocus
            placeholder="yourcompany.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Your site domain"
          />
          <button className="btn btn-primary" type="submit" disabled={!value.trim()}>
            Open radar
          </button>
        </form>

        <ul className="gate-points">
          <li>Company-level only — never an individual.</li>
          <li>ICP filtering keeps the feed to accounts worth your time.</li>
          <li>Intent scoring surfaces hot leads in real time.</li>
        </ul>

        <p className="gate-note">
          Company-level analytics. Ship a consent banner and honor opt-outs.
        </p>
      </div>
    </div>
  );
}
