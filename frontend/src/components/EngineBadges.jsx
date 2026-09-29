// Affiche quels moteurs IA sont réellement disponibles côté backend.
export default function EngineBadges({ health }) {
  if (!health) {
    return (
      <div className="badges">
        <span className="badge badge-off">🔌 connexion au backend…</span>
      </div>
    );
  }
  const c = health.capabilities;
  const device = { mps: "🍏 Apple MPS", cuda: "⚡ CUDA", cpu: "🐢 CPU" }[c.device] || c.device;
  const items = [
    { on: true, label: device, title: "Accélérateur utilisé par PyTorch" },
    {
      on: c.sam2,
      label: c.sam2 ? "🎯 SAM2" : "🛠️ GrabCut",
      title: c.sam2 ? `Segmentation + tracking : ${c.models.sam2}` : "SAM2 non installé : segmentation OpenCV",
    },
    {
      on: c.diffusion,
      label: c.diffusion ? "🎨 Diffusion" : "🎨 Recolor only",
      title: c.diffusion
        ? `Génération : ${c.models.inpaint}`
        : "Pas de modèle de diffusion : le mode Remplacer bascule en Recolorer (ou importe ton image)",
    },
    {
      on: c.propainter || c.lama,
      label: c.propainter ? "🧽 ProPainter" : c.lama ? "🧽 Temporel + LaMa" : "🧽 Temporel",
      title: "Moteur d'effacement de l'objet d'origine",
    },
  ];
  return (
    <div className="badges">
      {items.map((b) => (
        <span key={b.label} className={`badge ${b.on ? "badge-on" : "badge-off"}`} title={b.title}>
          {b.label}
        </span>
      ))}
      {c.ai_disabled && <span className="badge badge-warn">DISABLE_AI=1</span>}
    </div>
  );
}
