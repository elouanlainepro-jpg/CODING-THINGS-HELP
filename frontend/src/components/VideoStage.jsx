import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "../api.js";
import { burst } from "../confetti.js";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Transforme le masque PNG (niveaux de gris) en calque arc-en-ciel semi-transparent. */
function useTintedMask(result) {
  const [canvas, setCanvas] = useState(null);
  useEffect(() => {
    if (!result) {
      setCanvas(null);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const { width: w, height: h } = img;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i + 3] = d[i];
        d[i] = d[i + 1] = d[i + 2] = 255;
      }
      ctx.putImageData(data, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      const g = ctx.createLinearGradient(0, 0, w, h);
      ["#ff4fd8", "#ffb300", "#fff200", "#b6ff00", "#00f0ff", "#8a2be2"].forEach((c, i, arr) =>
        g.addColorStop(i / (arr.length - 1), c),
      );
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      setCanvas(off);
    };
    img.src = `data:image/png;base64,${result.mask_png}`;
    return () => {
      cancelled = true;
    };
  }, [result]);
  return canvas;
}

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
};

export default function VideoStage({
  video,
  selection,
  segmenting,
  tool,
  onToolChange,
  onPick,
  onClear,
  onChangeVideo,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const overlay = useTintedMask(selection?.result);

  const fps = video.fps;
  const last = video.frame_count - 1;
  const frameFromTime = useCallback(
    (t) => Math.min(last, Math.max(0, Math.floor(t * fps + 1e-3))),
    [fps, last],
  );

  // --- suivi de la frame réellement affichée (requestVideoFrameCallback si dispo)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    let handle = null;
    const rvfc = typeof v.requestVideoFrameCallback === "function";
    const onFrame = (_now, meta) => {
      setFrame(frameFromTime(meta?.mediaTime ?? v.currentTime));
      handle = v.requestVideoFrameCallback(onFrame);
    };
    if (rvfc) handle = v.requestVideoFrameCallback(onFrame);
    const onTime = () => setFrame(frameFromTime(v.currentTime));
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("seeked", onTime);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      if (rvfc && handle !== null) v.cancelVideoFrameCallback(handle);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [video.id, frameFromTime]);

  // --- taille affichée (pour le canvas superposé)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seek = useCallback(
    (f) => {
      const v = videoRef.current;
      if (!v) return;
      const target = Math.min(last, Math.max(0, f));
      v.pause();
      v.currentTime = (target + 0.5) / fps; // milieu de la frame : pas d'ambiguïté d'arrondi
      setFrame(target);
    },
    [fps, last],
  );

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else seek(frameFromTime(v.currentTime));
  };

  // --- clic sur la vidéo = sélection
  const handlePointer = (e, forcedLabel) => {
    e.preventDefault();
    const v = videoRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    let f = frame;
    if (v && !v.paused) {
      f = frameFromTime(v.currentTime);
      seek(f);
    }
    const label = forcedLabel ?? (e.shiftKey || e.altKey || tool === "remove" ? 0 : 1);
    burst(e.clientX, e.clientY, { count: 10, power: 4, emojiRatio: 0.6 });
    onPick(f, x, y, label);
  };

  // --- dessin du masque + fourmis + points
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return undefined;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d");
    const visible = selection && selection.frameIndex === frame;
    let raf = 0;
    let offset = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (visible) {
        if (overlay && selection.result) {
          ctx.globalAlpha = 0.5;
          ctx.drawImage(overlay, 0, 0, size.w, size.h);
          ctx.globalAlpha = 1;
        }
        for (const poly of selection.result?.contours || []) {
          ctx.beginPath();
          poly.forEach(([px, py], i) => (i ? ctx.lineTo(px * size.w, py * size.h) : ctx.moveTo(px * size.w, py * size.h)));
          ctx.closePath();
          ctx.setLineDash([]);
          ctx.lineWidth = 4;
          ctx.strokeStyle = "#1b0b2e";
          ctx.stroke();
          ctx.setLineDash([9, 7]);
          ctx.lineDashOffset = -offset;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const p of selection.points) {
          const px = p.x * size.w;
          const py = p.y * size.h;
          ctx.beginPath();
          ctx.arc(px, py, 10, 0, Math.PI * 2);
          ctx.fillStyle = p.label ? "#b6ff00" : "#ff2e97";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#1b0b2e";
          ctx.stroke();
          ctx.fillStyle = "#1b0b2e";
          ctx.font = "bold 16px 'Comic Neue', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.label ? "+" : "−", px, py + 1);
        }
      }
      offset = (offset + 0.5) % 1000;
      if (visible && selection.result && !reducedMotion()) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [overlay, selection, frame, size]);

  const onKeyDown = (e) => {
    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seek(frame - (e.shiftKey ? 10 : 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seek(frame + (e.shiftKey ? 10 : 1));
    }
  };

  const ratio = video.width / video.height;
  const res = selection?.result;

  return (
    <div className="stage-block">
      <div className="stage-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Outil de sélection">
          <button
            type="button"
            role="radio"
            aria-checked={tool === "add"}
            className={tool === "add" ? "on" : ""}
            onClick={() => onToolChange("add")}
          >
            ✨ Inclure
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={tool === "remove"}
            className={tool === "remove" ? "on" : ""}
            onClick={() => onToolChange("remove")}
          >
            🚫 Exclure
          </button>
        </div>
        <button type="button" className="btn small" onClick={onClear} disabled={!selection}>
          🧽 Reset sélection
        </button>
        <button type="button" className="btn small ghost" onClick={onChangeVideo}>
          📼 Autre vidéo
        </button>
      </div>

      <div className="stage-wrap" tabIndex={0} onKeyDown={onKeyDown} aria-label="Lecteur vidéo interactif">
        <div
          className="stage"
          ref={stageRef}
          style={{ aspectRatio: `${video.width} / ${video.height}`, maxWidth: `calc(60vh * ${ratio})` }}
        >
          <video
            ref={videoRef}
            src={assetUrl(video.proxy_url)}
            playsInline
            muted={muted}
            preload="auto"
            onLoadedData={() => seek(0)}
          />
          <canvas
            ref={canvasRef}
            className={`overlay tool-${tool}`}
            onClick={(e) => handlePointer(e)}
            onContextMenu={(e) => handlePointer(e, 0)}
          />
          {segmenting && <div className="stage-chip">🎯 La licorne détoure…</div>}
          {selection && selection.frameIndex !== frame && (
            <button type="button" className="stage-chip clickable" onClick={() => seek(selection.frameIndex)}>
              🎯 Sélection sur la frame {selection.frameIndex + 1} → y aller
            </button>
          )}
          {!selection && !playing && <div className="stage-hint">👆 Clique sur l'objet à transformer</div>}
        </div>
      </div>

      <div className="transport">
        <button type="button" className="icon-btn" onClick={() => seek(frame - 1)} aria-label="Frame précédente">
          ⏮
        </button>
        <button type="button" className="icon-btn big" onClick={togglePlay} aria-label={playing ? "Pause" : "Lecture"}>
          {playing ? "⏸" : "▶"}
        </button>
        <button type="button" className="icon-btn" onClick={() => seek(frame + 1)} aria-label="Frame suivante">
          ⏭
        </button>
        <input
          type="range"
          className="scrub"
          min={0}
          max={last}
          value={frame}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Position"
        />
        <span className="counter">
          {frame + 1}/{last + 1} · {fmt(frame / fps)}
        </span>
        <button type="button" className="icon-btn" onClick={() => setMuted((m) => !m)} aria-label="Son">
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      <p className="stage-help">
        Clic = inclure • <kbd>Shift</kbd>+clic ou clic droit = exclure • <kbd>Espace</kbd> lecture •{" "}
        <kbd>←</kbd>/<kbd>→</kbd> image par image
        {res && (
          <span className="sel-info">
            {" "}
            — objet détouré par <b>{res.engine}</b> · {(res.area * 100).toFixed(1)} % de l'image · confiance{" "}
            {Math.round(res.score * 100)} %
          </span>
        )}
      </p>
    </div>
  );
}
