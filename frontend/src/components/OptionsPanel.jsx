import { useRef, useState } from "react";
import { api, assetUrl } from "../api.js";

const PRESETS = [
  { id: "rapide", emoji: "⚡", name: "Rapide", desc: "720p · aperçu en 2 min" },
  { id: "equilibre", emoji: "⚖️", name: "Équilibré", desc: "1280p · bon compromis" },
  { id: "perfect", emoji: "💎", name: "Perfect Conditions", desc: "pleine réso · ProPainter si dispo" },
];

const SHADOWS = [
  { id: "auto", label: "🌓 Copier l'ombre d'origine (auto)" },
  { id: "keep", label: "🫥 Garder l'ombre d'origine telle quelle" },
  { id: "contact", label: "⚫ Ombre de contact seulement" },
  { id: "off", label: "🚫 Aucune ombre" },
];

function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="switch" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}

export default function OptionsPanel({ options, onChange, mode, negative, onNegative, element, onElement, health, toast }) {
  const set = (key) => (value) => onChange({ ...options, [key]: value });
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const diffusion = health?.capabilities?.diffusion;

  const uploadElement = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      onElement(await api.uploadElement(file));
      toast("🖼️ Élément importé : il remplacera l'objet", "success");
    } catch (e) {
      toast(`💥 ${e.message}`, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="options">
      <h2 className="panel-title">⚙️ Réglages licorne</h2>

      <div className="presets" role="radiogroup" aria-label="Qualité">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={options.preset === p.id}
            className={`preset ${options.preset === p.id ? "on" : ""}`}
            onClick={() => set("preset")(p.id)}
          >
            <span className="preset-emoji">{p.emoji}</span>
            <span className="preset-name">{p.name}</span>
            <span className="preset-desc">{p.desc}</span>
          </button>
        ))}
      </div>

      {mode === "replace" && (
        <fieldset className="opt-group">
          <legend>🖼️ Ton propre élément (optionnel)</legend>
          {element ? (
            <div className="element-preview">
              <img src={assetUrl(element.url)} alt="Élément importé" />
              <div>
                <p>
                  {element.width}×{element.height} {element.has_alpha ? "· transparent ✅" : "· détourage auto 🪄"}
                </p>
                <button type="button" className="btn small ghost" onClick={() => onElement(null)}>
                  ✖ Retirer
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn small" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "⏳ Import…" : "📎 Importer une image (PNG détouré idéal)"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              uploadElement(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {element && (
            <label className="slider">
              <span>Taille de l'élément : ×{options.element_scale.toFixed(2)}</span>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={options.element_scale}
                onChange={(e) => set("element_scale")(Number(e.target.value))}
              />
            </label>
          )}
          {!element && !diffusion && (
            <p className="opt-note">
              😴 Pas de modèle de diffusion installé : sans image importée, « Remplacer » bascule en « Recolorer ».
            </p>
          )}
        </fieldset>
      )}

      {mode === "replace" && (
        <fieldset className="opt-group">
          <legend>💡 Intégration réaliste</legend>
          <Switch checked={options.relight} onChange={set("relight")} label="Lumière adaptative" hint="L'élément suit les variations de lumière de la scène" />
          <label className="select">
            <span>Ombres</span>
            <select value={options.shadows} onChange={(e) => set("shadows")(e.target.value)}>
              {SHADOWS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Switch checked={options.occlusion} onChange={set("occlusion")} label="Occlusions (ce qui passe devant reste devant)" />
          <Switch checked={options.motion_blur} onChange={set("motion_blur")} label="Flou de mouvement" />
          <Switch checked={options.grain} onChange={set("grain")} label="Grain caméra" />
          <Switch checked={options.light_wrap} onChange={set("light_wrap")} label="Light wrap (bords fondus)" />
        </fieldset>
      )}

      <details className="opt-group advanced">
        <summary>🧪 Réglages avancés</summary>

        {mode === "replace" && (
          <>
            <div className="segmented tiny" role="radiogroup" aria-label="Suivi">
              <button type="button" className={options.motion_model === "rigid" ? "on" : ""} onClick={() => set("motion_model")("rigid")}>
                🧱 Suivi rigide
              </button>
              <button
                type="button"
                className={options.motion_model === "deformable" ? "on" : ""}
                onClick={() => set("motion_model")("deformable")}
              >
                🍮 Déformable
              </button>
            </div>
            <div className="segmented tiny" role="radiogroup" aria-label="Forme">
              <button type="button" className={options.shape_mode === "follow" ? "on" : ""} onClick={() => set("shape_mode")("follow")}>
                🎯 Silhouette d'origine
              </button>
              <button type="button" className={options.shape_mode === "free" ? "on" : ""} onClick={() => set("shape_mode")("free")}>
                🆓 Forme libre
              </button>
            </div>
            <label className="field">
              <span>Prompt négatif</span>
              <input value={negative} onChange={(e) => onNegative(e.target.value)} placeholder="ex : flou, texte, doigts en trop" />
            </label>
            <label className="slider">
              <span>Étapes de diffusion : {options.steps ?? "auto"}</span>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={options.steps ?? 0}
                onChange={(e) => set("steps")(Number(e.target.value) || null)}
              />
            </label>
            <label className="slider">
              <span>Fidélité au prompt (guidance) : {options.guidance}</span>
              <input
                type="range"
                min={2}
                max={14}
                step={0.5}
                value={options.guidance}
                onChange={(e) => set("guidance")(Number(e.target.value))}
              />
            </label>
            <label className="field seed">
              <span>Seed</span>
              <input
                type="number"
                value={options.seed}
                onChange={(e) => set("seed")(Number.isFinite(+e.target.value) ? Number(e.target.value) : -1)}
              />
              <button type="button" className="icon-btn" onClick={() => set("seed")(Math.floor(Math.random() * 1e9))} aria-label="Seed aléatoire">
                🎲
              </button>
            </label>
          </>
        )}

        <label className="slider">
          <span>Marge du masque : {options.mask_expand ?? "auto"} {options.mask_expand ? "px" : ""}</span>
          <input
            type="range"
            min={0}
            max={40}
            value={options.mask_expand ?? 0}
            onChange={(e) => set("mask_expand")(Number(e.target.value) || null)}
          />
        </label>
        <p className="opt-note">
          Astuce : si des bords de l'objet d'origine « fantômisent », augmente la marge. Pour effacer aussi une ombre non
          détectée, ajoute un clic « inclure » dessus.
        </p>
      </details>
    </div>
  );
}
