import { useEffect } from "react";
import { burst } from "../confetti.js";

// Couche décorative : licornes qui glissent, paillettes qui flottent, confettis au clic.
const RUNNERS = [
  { emoji: "🦄", top: "14%", duration: 19, delay: 0, size: 2.6 },
  { emoji: "🦄", top: "46%", duration: 26, delay: 7, size: 2.1, reverse: true },
  { emoji: "🌈", top: "72%", duration: 31, delay: 3, size: 2.2 },
  { emoji: "🦄", top: "88%", duration: 23, delay: 12, size: 3.2 },
  { emoji: "🐱‍🚀", top: "30%", duration: 37, delay: 18, size: 1.9, reverse: true },
];

const SPARKLES = Array.from({ length: 18 }, (_, i) => ({
  emoji: ["✨", "💖", "⭐", "🍭", "💫", "🌟"][i % 6],
  left: `${(i * 53) % 100}%`,
  delay: (i * 1.7) % 12,
  duration: 12 + ((i * 7) % 10),
  size: 0.9 + ((i * 13) % 10) / 10,
}));

export default function FunLayer() {
  useEffect(() => {
    const onDown = (e) => {
      // pas de confettis quand on vise un objet dans la vidéo : on garde la précision
      if (e.target.closest?.(".stage")) return;
      burst(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <div className="fun-layer" aria-hidden="true">
      {SPARKLES.map((s, i) => (
        <span
          key={`s${i}`}
          className="sparkle"
          style={{
            left: s.left,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            fontSize: `${s.size}rem`,
          }}
        >
          {s.emoji}
        </span>
      ))}
      {RUNNERS.map((r, i) => (
        <span
          key={`r${i}`}
          className={`runner ${r.reverse ? "reverse" : ""}`}
          style={{
            top: r.top,
            animationDuration: `${r.duration}s`,
            animationDelay: `${r.delay}s`,
            fontSize: `${r.size}rem`,
          }}
        >
          <span className="runner-bob">{r.emoji}</span>
        </span>
      ))}
    </div>
  );
}
