const MODES = [
  {
    id: "replace",
    label: "🦄 Remplacer",
    placeholder: "Remplace par… ex : une licorne en peluche dorée, un cactus géant, une voiture de course rose",
  },
  {
    id: "restyle",
    label: "🎨 Recolorer",
    placeholder: "Nouvelle apparence… ex : rose bonbon, en or massif, chrome, arc-en-ciel, néon bleu",
  },
  { id: "erase", label: "🧽 Effacer", placeholder: "Rien à écrire : l'objet va disparaître comme par magie ✨" },
];

const IDEAS = {
  replace: ["une licorne en peluche", "un dragon en cristal", "un chat astronaute", "une citrouille géante"],
  restyle: ["rose bonbon", "en or massif", "arc-en-ciel", "néon bleu", "chrome"],
  erase: [],
};

export default function PromptBar({ mode, onMode, prompt, onPrompt, disabled, hint, onRun, element }) {
  const current = MODES.find((m) => m.id === mode);
  return (
    <div className="prompt-bar">
      <div className="segmented modes" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={mode === m.id ? "on" : ""}
            onClick={() => onMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="prompt-row">
        <textarea
          className="prompt-input"
          value={mode === "erase" ? "" : prompt}
          onChange={(e) => onPrompt(e.target.value)}
          placeholder={current.placeholder}
          disabled={mode === "erase"}
          rows={2}
          maxLength={500}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !disabled) onRun(e);
          }}
          aria-label="Requête"
        />
        <button type="button" className="go-button" disabled={disabled} onClick={onRun}>
          <span>✨ TRANSFORMER ✨</span>
        </button>
      </div>

      <div className="prompt-foot">
        {IDEAS[mode].map((idea) => (
          <button key={idea} type="button" className="chip" onClick={() => onPrompt(idea)}>
            {idea}
          </button>
        ))}
        {mode === "replace" && element && <span className="chip chip-info">🖼️ ton image importée sera utilisée</span>}
      </div>
      {hint && <p className="prompt-hint">{hint}</p>}
    </div>
  );
}
