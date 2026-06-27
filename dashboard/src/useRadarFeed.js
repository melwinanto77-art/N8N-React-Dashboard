import { useEffect, useRef, useState } from "react";

// Subscribes to the relay's SSE feed for a given site and maintains a live
// map of company sessions keyed by session.id (the company domain). Each
// incoming "visit" event carries the full session object, so we simply upsert.
export function useRadarFeed(site) {
  const [sessions, setSessions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [flash, setFlash] = useState(() => new Set());

  // Track pending flash-removal timers so we can clear them on teardown.
  const flashTimers = useRef(new Map());

  useEffect(() => {
    // Reset all state whenever the watched site changes.
    setSessions([]);
    setConnected(false);
    setFlash(new Set());

    // Clear any outstanding flash timers from a previous site.
    for (const timer of flashTimers.current.values()) clearTimeout(timer);
    flashTimers.current.clear();

    if (!site) return undefined;

    const byId = new Map();
    const es = new EventSource("/events?site=" + encodeURIComponent(site));

    es.addEventListener("open", () => setConnected(true));

    es.addEventListener("error", () => setConnected(false));

    es.addEventListener("visit", (e) => {
      let session;
      try {
        session = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!session || !session.id) return;

      byId.set(session.id, session);
      setSessions(Array.from(byId.values()));

      // Mark this session as freshly updated, then drop the flag after 1.5s.
      setFlash((prev) => {
        const next = new Set(prev);
        next.add(session.id);
        return next;
      });

      const existing = flashTimers.current.get(session.id);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        flashTimers.current.delete(session.id);
        setFlash((prev) => {
          const next = new Set(prev);
          next.delete(session.id);
          return next;
        });
      }, 1500);
      flashTimers.current.set(session.id, timer);
    });

    return () => {
      es.close();
      for (const timer of flashTimers.current.values()) clearTimeout(timer);
      flashTimers.current.clear();
    };
  }, [site]);

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)
  );

  return { sessions: sorted, connected, flash };
}
