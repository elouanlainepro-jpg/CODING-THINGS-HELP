import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { burst, party } from "./confetti.js";
import FunLayer from "./components/FunLayer.jsx";
import EngineBadges from "./components/EngineBadges.jsx";
import Dropzone from "./components/Dropzone.jsx";
import VideoStage from "./components/VideoStage.jsx";
import PromptBar from "./components/PromptBar.jsx";
import OptionsPanel from "./components/OptionsPanel.jsx";
import JobProgress from "./components/JobProgress.jsx";
import Gallery from "./components/Gallery.jsx";
import CompareModal from "./components/CompareModal.jsx";
import Toasts from "./components/Toasts.jsx";

export const DEFAULT_OPTIONS = {
  preset: "equilibre",
  shadows: "auto",
  relight: true,
  grain: true,
  motion_blur: true,
  light_wrap: true,
  occlusion: true,
  motion_model: "rigid",
  shape_mode: "follow",
  mask_expand: null,
  seed: -1,
  steps: null,
  guidance: 7,
  element_scale: 1,
};

let toastId = 0;

export default function App() {
  const [health, setHealth] = useState(null);
  const [video, setVideo] = useState(null);
  const [upload, setUpload] = useState(null); // {progress, name}
  const [selection, setSelection] = useState(null); // {frameIndex, points, result}
  const [segmenting, setSegmenting] = useState(false);
  const [tool, setTool] = useState("add");
  const [mode, setMode] = useState("replace");
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [element, setElement] = useState(null);
  const [job, setJob] = useState(null);
  const [gallery, setGallery] = useState({ items: [], clips_dir: "" });
  const [compare, setCompare] = useState(null);
  const [toasts, setToasts] = useState([]);
  const segmentSeq = useRef(0);

  const toast = useCallback((text, kind = "info") => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 4500);
  }, []);

  const refreshGallery = useCallback(
    () =>
      api
        .gallery()
        .then(setGallery)
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => toast("😱 Backend introuvable : lance `./start.sh` (ou uvicorn sur le port 8000)", "error"));
    refreshGallery();
  }, [toast, refreshGallery]);

  // ------------------------------------------------------------------ import vidéo
  const onVideoFile = async (file) => {
    setUpload({ progress: 0, name: file.name });
    try {
      const meta = await api.uploadVideo(file, (p) => setUpload({ progress: p, name: file.name }));
      setVideo(meta);
      setSelection(null);
      (meta.warnings || []).forEach((w) => toast(`⚠️ ${w}`, "warn"));
      toast(`📼 ${meta.frame_count} frames chargées. Clique sur un objet !`, "success");
    } catch (e) {
      toast(`💥 ${e.message}`, "error");
    } finally {
      setUpload(null);
    }
  };

  // ------------------------------------------------------------------ clic -> segmentation
  const onPick = async (frameIndex, x, y, label) => {
    const sameFrame = selection && selection.frameIndex === frameIndex;
    const previous = sameFrame ? selection.points : [];
    if (label === 0 && !previous.length) {
      toast("👉 Commence par un clic « inclure » sur l'objet", "warn");
      return;
    }
    const points = [...previous, { x, y, label }];
    const seq = ++segmentSeq.current;
    setSelection({ frameIndex, points, result: sameFrame ? selection.result : null });
    setSegmenting(true);
    try {
      const result = await api.segment({ video_id: video.id, frame_index: frameIndex, points });
      if (seq === segmentSeq.current) setSelection({ frameIndex, points, result });
      if (result.area > 0.45) toast("😅 Sélection géante ! Ajoute des clics « Exclure » sur le décor", "warn");
    } catch (e) {
      toast(`🙈 ${e.message}`, "error");
      if (seq === segmentSeq.current) setSelection(sameFrame ? selection : null);
    } finally {
      if (seq === segmentSeq.current) setSegmenting(false);
    }
  };

  // ------------------------------------------------------------------ lancement du rendu
  const canRun =
    video && selection?.result && !segmenting && !(job && ["queued", "running"].includes(job.status));
  const needsPrompt = mode !== "erase" && !(mode === "replace" && element) && !prompt.trim();

  const run = async (e) => {
    if (e?.clientX) burst(e.clientX, e.clientY, { count: 30, power: 9, emojiRatio: 0.5 });
    try {
      const body = {
        video_id: video.id,
        mask_id: selection.result.mask_id,
        mode,
        prompt,
        negative_prompt: negative,
        element_id: mode === "replace" && element ? element.element_id : null,
        options,
      };
      const { job_id } = await api.replace(body);
      setJob({ id: job_id, status: "queued", progress: 0, stage: "🦄 En file d'attente..." });
    } catch (err) {
      toast(`💥 ${err.message}`, "error");
    }
  };

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.id);
        setJob(next);
        if (next.status === "done") {
          party();
          toast("🎉 Terminé ! Sauvegardé dans YOUR DAIL CLIPS", "success");
          (next.result?.warnings || []).forEach((w) => toast(`⚠️ ${w}`, "warn"));
          await refreshGallery();
          if (next.result) setCompare(next.result);
        } else if (next.status === "error") {
          toast(`💥 ${next.error}`, "error");
        }
      } catch {
        /* réseau : on réessaie au prochain tick */
      }
    }, 900);
    return () => clearInterval(timer);
  }, [job, toast, refreshGallery]);

  const onDelete = async (item) => {
    if (!window.confirm(`Supprimer définitivement « ${item.prompt || item.id} » ?`)) return;
    try {
      await api.deleteClip(item.id);
      toast("🗑️ Clip supprimé", "info");
      refreshGallery();
    } catch (e) {
      toast(`💥 ${e.message}`, "error");
    }
  };

  return (
    <>
      <FunLayer />
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i}>
              🦄 CLIQUE • TRACK • REMPLACE 🌈 &nbsp; SUCH REALISM. MUCH WOW. &nbsp; 📈 STONKS &nbsp; ✨ PERFECT
              CONDITIONS ONLY &nbsp; 🍭 100 % LICORNE, 0 % PIXELS BAVEUX &nbsp; 🚀 TO THE MOON &nbsp;
            </span>
          ))}
        </div>
      </div>

      <header className="hero">
        <h1 className="title">
          <span className="title-emoji">🦄</span> LICORN·IA <span className="rainbow-text">SWAP 3000</span>
        </h1>
        <p className="subtitle">
          Clique sur un truc dans ta vidéo. Dis ce que tu veux à la place. La licorne s'occupe du reste
          <span className="wink"> (lumière, ombres, mouvement…)</span>
        </p>
        <EngineBadges health={health} />
      </header>

      <main className="layout">
        <section className="panel stage-panel">
          {video ? (
            <VideoStage
              video={video}
              selection={selection}
              segmenting={segmenting}
              tool={tool}
              onToolChange={setTool}
              onPick={onPick}
              onClear={() => setSelection(null)}
              onChangeVideo={() => {
                setVideo(null);
                setSelection(null);
              }}
            />
          ) : (
            <Dropzone onFile={onVideoFile} upload={upload} />
          )}

          <PromptBar
            mode={mode}
            onMode={setMode}
            prompt={prompt}
            onPrompt={setPrompt}
            disabled={!canRun || needsPrompt}
            hint={
              !video
                ? "Importe d'abord une vidéo 📼"
                : !selection?.result
                  ? "Clique sur l'objet à transformer 🎯"
                  : needsPrompt
                    ? "Écris ta requête ✍️"
                    : job && ["queued", "running"].includes(job.status)
                      ? "La licorne bosse déjà… ⏳"
                      : ""
            }
            onRun={run}
            element={element}
          />

          {job && <JobProgress job={job} onOpen={() => job.result && setCompare(job.result)} />}
        </section>

        <aside className="panel side-panel">
          <OptionsPanel
            options={options}
            onChange={setOptions}
            mode={mode}
            negative={negative}
            onNegative={setNegative}
            element={element}
            onElement={setElement}
            health={health}
            toast={toast}
          />
        </aside>
      </main>

      <Gallery
        items={gallery.items}
        clipsDir={gallery.clips_dir}
        onOpen={setCompare}
        onDelete={onDelete}
        onRefresh={refreshGallery}
      />

      {compare && <CompareModal item={compare} onClose={() => setCompare(null)} />}
      <Toasts toasts={toasts} />

      <footer className="footer">
        Fait avec 💖, OpenCV, SAM2 & de la poudre de licorne. Les vidéos finales sont rangées dans{" "}
        <code>elements/YOUR DAIL CLIPS</code>.
      </footer>
    </>
  );
}
