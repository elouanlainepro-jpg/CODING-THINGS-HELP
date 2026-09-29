import { useRef, useState } from "react";

const MESSAGES = [
  "La licorne mâchouille tes pixels…",
  "Conversion en H.264 magique…",
  "Calibrage des arcs-en-ciel…",
];

export default function Dropzone({ onFile, upload }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const pick = (files) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  if (upload) {
    const pct = Math.round(upload.progress * 100);
    return (
      <div className="dropzone busy" role="status">
        <div className="dz-emoji spin">🦄</div>
        <p className="dz-title">{pct < 100 ? `Upload… ${pct}%` : MESSAGES[Math.floor(Date.now() / 3000) % 3]}</p>
        <div className="mini-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="dz-sub">{upload.name}</p>
      </div>
    );
  }

  return (
    <div
      className={`dropzone ${over ? "over" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
    >
      <div className="dz-emoji">📼</div>
      <p className="dz-title">BALANCE TA VIDÉO ICI</p>
      <p className="dz-sub">glisser-déposer ou clic • mp4, mov, webm… • idéal : 5 à 20 secondes</p>
      <input
        ref={input}
        type="file"
        accept="video/*,.mov,.mkv"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
