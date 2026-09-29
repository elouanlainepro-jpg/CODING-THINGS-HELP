import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../api.js";

const TABS = [
  { id: "compare", label: "🆚 Avant / Après", file: "final.mp4" },
  { id: "final", label: "🎬 Résultat", file: "final.mp4" },
  { id: "mask", label: "🎯 Suivi", file: "mask_track.mp4" },
  { id: "clean", label: "🧽 Décor nettoyé", file: "clean_plate.mp4" },
  { id: "element", label: "🦄 Élément", file: "element.png" },
  { id: "recipe", label: "📜 Recette", file: null },
];

export default function CompareModal({ item, onClose }) {
  const files = item.files || {};
  const tabs = TABS.filter((t) => !t.file || files[t.file]);
  const [tab, setTab] = useState("compare");
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);
  const after = useRef(null);
  const before = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // synchronisation des deux vidéos du comparateur
  useEffect(() => {
    if (tab !== "compare") return undefined;
    const a = after.current;
    const b = before.current;
    if (!a || !b) return undefined;
    const sync = () => {
      if (Math.abs(b.currentTime - a.currentTime) > 0.06) b.currentTime = a.currentTime;
    };
    const onPlay = () => {
      setPlaying(true);
      b.play().catch(() => {});
    };
    const onPause = () => {
      setPlaying(false);
      b.pause();
      sync();
    };
    a.addEventListener("timeupdate", sync);
    a.addEventListener("seeked", sync);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.play().catch(() => {});
    return () => {
      a.removeEventListener("timeupdate", sync);
      a.removeEventListener("seeked", sync);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [tab]);

  const ratio = item.video ? `${item.video.width} / ${item.video.height}` : "16 / 9";
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Résultat" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="panel-title">{item.prompt ? `« ${item.prompt} »` : "Résultat"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            ✖
          </button>
        </div>
        <div className="segmented tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "compare" && (
            <>
              <div className="compare" style={{ aspectRatio: ratio }}>
                <video ref={before} src={assetUrl(files["source.mp4"])} muted playsInline loop preload="auto" />
                <video
                  ref={after}
                  src={assetUrl(files["final.mp4"])}
                  muted
                  playsInline
                  loop
                  preload="auto"
                  style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                />
                <div className="compare-handle" style={{ left: `${split}%` }}>
                  <span>🦄</span>
                </div>
                <span className="compare-label left">AVANT</span>
                <span className="compare-label right">APRÈS</span>
                <input
                  className="compare-range"
                  type="range"
                  min={0}
                  max={100}
                  step={0.2}
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  aria-label="Curseur avant/après"
                />
              </div>
              <div className="transport">
                <button
                  type="button"
                  className="icon-btn big"
                  onClick={() => (after.current?.paused ? after.current.play() : after.current?.pause())}
                >
                  {playing ? "⏸" : "▶"}
                </button>
                <span className="counter">Glisse la licorne pour comparer</span>
              </div>
            </>
          )}

          {["final", "mask", "clean"].includes(tab) && (
            <video className="modal-video" src={assetUrl(files[current.file])} controls autoPlay loop muted playsInline />
          )}
          {tab === "element" && (
            <div className="checker">
              <img src={assetUrl(files["element.png"])} alt="Élément incrusté" />
            </div>
          )}
          {tab === "recipe" && (
            <div className="recipe">
              <p>
                <b>Mode :</b> {item.mode} {item.requested_mode !== item.mode && `(demandé : ${item.requested_mode})`}
              </p>
              <p>
                <b>Moteurs :</b>{" "}
                {Object.entries(item.engines || {})
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </p>
              <p>
                <b>Temps :</b>{" "}
                {Object.entries(item.timings_s || {})
                  .map(([k, v]) => `${k} ${v}s`)
                  .join(" · ")}
              </p>
              {(item.warnings || []).map((w) => (
                <p key={w} className="opt-note">
                  ⚠️ {w}
                </p>
              ))}
              <p className="gallery-path">
                📁 <code>{item.folder}</code>
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {Object.entries(files).map(([name, url]) => (
            <a key={name} className="btn small ghost" href={assetUrl(url)} download>
              ⬇️ {name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
