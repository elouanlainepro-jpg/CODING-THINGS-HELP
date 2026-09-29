import { useEffect, useState } from "react";

const QUOTES = [
  "Much wait. Very IA. Wow. 🐕",
  "Stonks 📈 — la licorne compte les pixels un par un",
  "Charging rainbow lasers 🔫🌈",
  "Ceci n'est pas un GIF, c'est de l'art 🎨",
  "Pendant ce temps, va boire un verre d'eau 💧",
  "La licorne négocie avec les photons 💡",
  "Loading… comme en 2003 📟",
  "It's over 9000 (images par seconde… non) 💥",
];

export default function JobProgress({ job, onOpen }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 3500);
    return () => clearInterval(t);
  }, []);
  const pct = Math.round((job.progress || 0) * 100);
  const running = job.status === "queued" || job.status === "running";

  return (
    <div className={`job job-${job.status}`} role="status" aria-live="polite">
      <div className="job-head">
        <span className="job-stage">{job.stage}</span>
        <strong className="job-pct">{pct}%</strong>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
        <span className={`progress-unicorn ${running ? "gallop" : ""}`} style={{ left: `${Math.min(pct, 97)}%` }}>
          🦄
        </span>
      </div>
      {running && <p className="job-quote">{QUOTES[tick % QUOTES.length]}</p>}
      {job.status === "error" && <p className="job-error">😵 {job.error}</p>}
      {job.status === "done" && (
        <button type="button" className="btn" onClick={onOpen}>
          🍿 Voir le résultat (avant / après)
        </button>
      )}
    </div>
  );
}
