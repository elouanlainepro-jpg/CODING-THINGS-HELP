// Confettis + emojis sur un canvas plein écran (pointer-events: none). Zéro dépendance.
const COLORS = ["#ff4fd8", "#ff2e97", "#00f0ff", "#b6ff00", "#fff200", "#8a2be2", "#ff9a00"];
const EMOJIS = ["🦄", "🌈", "✨", "💖", "⭐", "🍭", "🎉"];

let canvas = null;
let ctx = null;
let particles = [];
let running = false;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);
}

function tick() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += p.gravity;
    p.vx *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.spin;
    p.life -= 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.emoji) {
      ctx.font = `${p.size * 2.2}px serif`;
      ctx.fillText(p.emoji, -p.size, p.size);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
    ctx.restore();
  }
  if (particles.length) requestAnimationFrame(tick);
  else running = false;
}

/** Explosion de confettis en (x, y) — coordonnées écran. */
export function burst(x, y, { count = 18, power = 7, emojiRatio = 0.25 } = {}) {
  if (typeof window === "undefined" || reducedMotion()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = power * (0.4 + Math.random());
    const emoji = Math.random() < emojiRatio ? EMOJIS[(Math.random() * EMOJIS.length) | 0] : null;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - power * 0.6,
      gravity: 0.22 + Math.random() * 0.1,
      size: emoji ? 9 + Math.random() * 6 : 6 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      emoji,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      life: 60 + Math.random() * 50,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

/** Grosse fête (fin de rendu). */
export function party() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  burst(w * 0.2, h * 0.6, { count: 60, power: 12, emojiRatio: 0.35 });
  setTimeout(() => burst(w * 0.8, h * 0.6, { count: 60, power: 12, emojiRatio: 0.35 }), 180);
  setTimeout(() => burst(w * 0.5, h * 0.35, { count: 80, power: 14, emojiRatio: 0.4 }), 360);
}
