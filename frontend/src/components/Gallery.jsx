import { useRef } from "react";
import { assetUrl } from "../api.js";

const BOTTOM = ["MUCH REALISM", "SUCH WOW", "STONKS 📈", "PERFECT CONDITIONS", "LA LICORNE APPROUVE", "10/10 IGN"];
const MODE_LABEL = { replace: "🦄 remplacé", restyle: "🎨 recoloré", erase: "🧽 effacé" };

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function ClipCard({ item, onOpen, onDelete }) {
  const vid = useRef(null);
  const top = (item.prompt || MODE_LABEL[item.mode] || "clip").toUpperCase();
  const bottom = BOTTOM[hash(item.id) % BOTTOM.length];
  const f = item.files || {};
  return (
    <article className="card">
      <div
        className="card-media"
        onMouseEnter={() => vid.current?.play().catch(() => {})}
        onMouseLeave={() => {
          if (vid.current) {
            vid.current.pause();
            vid.current.currentTime = 0;
          }
        }}
        onClick={() => onOpen(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
        aria-label={`Ouvrir ${item.prompt || item.id}`}
      >
        <video ref={vid} src={assetUrl(f["final.mp4"])} poster={assetUrl(f["preview.jpg"])} muted loop playsInline preload="none" />
        <span className="meme meme-top">{top.length > 42 ? `${top.slice(0, 40)}…` : top}</span>
        <span className="meme meme-bottom">{bottom}</span>
        <span className="card-mode">{MODE_LABEL[item.mode] || item.mode}</span>
      </div>
      <div className="card-body">
        <p className="card-meta">
          {item.created_at} · {item.video?.width}×{item.video?.height} · {item.timings_s?.total}s de calcul
        </p>
        <div className="card-actions">
          <button type="button" className="btn small" onClick={() => onOpen(item)}>
            🆚 Avant / Après
          </button>
          <a className="btn small ghost" href={assetUrl(f["final.mp4"])} download={`${item.id}.mp4`}>
            ⬇️ MP4
          </a>
          <button type="button" className="btn small danger" onClick={() => onDelete(item)} aria-label="Supprimer">
            🗑️
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Gallery({ items, clipsDir, onOpen, onDelete, onRefresh }) {
  return (
    <section className="panel gallery">
      <div className="gallery-head">
        <h2 className="panel-title">🖼️ Galerie « YOUR DAIL CLIPS »</h2>
        <button type="button" className="icon-btn" onClick={onRefresh} aria-label="Rafraîchir">
          🔄
        </button>
      </div>
      {clipsDir && (
        <p className="gallery-path">
          📁 <code>{clipsDir}</code>
        </p>
      )}
      {items.length === 0 ? (
        <div className="empty">
          <span className="empty-emoji">🦗</span>
          <p>Aucun clip pour l'instant… La galerie attend ton chef-d'œuvre.</p>
        </div>
      ) : (
        <div className="cards">
          {items.map((item) => (
            <ClipCard key={item.id} item={item} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
