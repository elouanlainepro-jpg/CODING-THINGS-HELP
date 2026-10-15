#!/usr/bin/env node
// Fabrique un edit complet : analyse musique + clips, plan, composition HyperFrames, rendu MP4.
//
//   npm run edit -- <nom-du-dossier>            rendu final (60 i/s)
//   npm run edit -- <nom> --draft               rendu brouillon rapide
//   npm run build -- <nom>                      prépare la composition sans rendre (pour l'aperçu)
//   options : --format landscape (16:9, expérimental) · --debug-timing (sans effets, pour vérifier la synchro)

import fs from "node:fs";
import path from "node:path";
import { planEdit, MIN_DURATION, MAX_DURATION } from "../lib/plan.mjs";
import { compose, hashString, mulberry32 } from "../lib/compose.mjs";
import { ROOT, PYTHON, HYPERFRAMES, spawn } from "../lib/sys.mjs";

const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const id = args.find((a, i) => !a.startsWith("--") && !(i > 0 && ["format", "quality"].includes(args[i - 1].replace(/^--/, ""))));
if (!id) fail("Indique le dossier de l'edit : npm run edit -- tom-brady-renaissance");

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const rel = (p) => path.relative(ROOT, p);

function run(cmd, cmdArgs, opts = {}) {
  const r = spawn(cmd, cmdArgs, { stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit", ...opts });
  if (r.status !== 0) fail(`La commande a échoué : ${cmd} ${cmdArgs.join(" ")}`);
  return r.stdout;
}

// Cache : on ne relance une analyse que si les fichiers ont changé.
function cached(file, inputs, compute) {
  const key = inputs.map((p) => `${p}:${fs.statSync(p).size}:${fs.statSync(p).mtimeMs}`).join("|");
  if (fs.existsSync(file)) {
    const c = readJSON(file);
    if (c.key === key) return c.value;
  }
  const value = compute();
  fs.writeFileSync(file, JSON.stringify({ key, value }, null, 1));
  return value;
}

const editDir = path.join(ROOT, "edits", id);
if (!fs.existsSync(path.join(editDir, "edit.json"))) fail(`Pas de edits/${id}/edit.json. Crée l'edit avec : npm run new -- "ta demande"`);
const edit = readJSON(path.join(editDir, "edit.json"));
const styles = Object.fromEntries(fs.readdirSync(path.join(ROOT, "styles")).map((f) => readJSON(path.join(ROOT, "styles", f))).map((s) => [s.id, s]));
const style = styles[edit.style];
if (!style) fail(`Style inconnu « ${edit.style} » (choix : ${Object.keys(styles).join(", ")})`);
const formatId = opt("format", edit.format || "vertical");
const format = readJSON(path.join(ROOT, "formats", `${formatId}.json`));
if (!format.enabled) console.warn(`⚠️  Format ${formatId} : ${format.label}. Le rendu est possible mais pas encore validé.`);
const brand = readJSON(path.join(ROOT, "brand", "brand.json"));
if (edit.duration != null && edit.duration !== "auto" && (edit.duration < MIN_DURATION || edit.duration > MAX_DURATION)) fail(`Durée ${edit.duration} s hors limites (${MIN_DURATION} à ${MAX_DURATION} s).`);

// ---------- Fichiers de l'edit ----------
const musicFile = edit.music?.file ? path.join(editDir, edit.music.file) : fs.readdirSync(editDir).filter((f) => AUDIO_EXT.test(f)).map((f) => path.join(editDir, f))[0];
if (!musicFile || !fs.existsSync(musicFile)) fail(`Aucune musique dans edits/${id}/ : ajoute un fichier .mp3 ou .wav (ou "music": {"file": "..."} dans edit.json).`);
const clipsDir = path.join(editDir, "clips");
let clipEntries = (edit.clips || []).filter((c) => c && c.file);
if (!clipEntries.length && fs.existsSync(clipsDir)) clipEntries = fs.readdirSync(clipsDir).filter((f) => VIDEO_EXT.test(f)).sort().map((f) => ({ file: `clips/${f}` }));
if (!clipEntries.length) fail(`Aucun clip dans edits/${id}/clips/ : dépose tes clips (mp4, mov…) puis relance.`);
for (const c of clipEntries) if (!fs.existsSync(path.join(editDir, c.file))) fail(`Clip introuvable : edits/${id}/${c.file}`);

// ---------- Analyses ----------
const cacheDir = path.join(editDir, ".cache");
fs.mkdirSync(cacheDir, { recursive: true });
console.log(`\n🏈 Endzone FX · ${id} · style ${style.id} · format ${formatId}`);
const music = cached(path.join(cacheDir, "music.json"), [musicFile], () => {
  run(PYTHON, [path.join(ROOT, "scripts/analyze_music.py"), musicFile, "-o", path.join(cacheDir, "music.raw.json")]);
  return readJSON(path.join(cacheDir, "music.raw.json"));
});
console.log(`♪ ${path.basename(musicFile)} · ${music.bpm.toFixed(1)} BPM · drop ${music.drop == null ? "non détecté" : music.drop.toFixed(2) + " s"}`);
// Préparation des clips : H.264 à cadence fixe, une image clé toutes les 0,5 s (recherche
// d'image fiable dans HyperFrames), 1920 px max, sans son. Gardée en cache.
const prepDir = path.join(cacheDir, "prep");
fs.mkdirSync(prepDir, { recursive: true });
const clipPaths = clipEntries.map((c, i) => {
  const src = path.join(editDir, c.file);
  const out = path.join(prepDir, `${String(i + 1).padStart(2, "0")}-${path.basename(c.file).replace(/\.[^.]+$/, "")}.mp4`);
  const st = fs.statSync(src);
  const key = `${src}:${st.size}:${st.mtimeMs}`;
  if (fs.existsSync(out) && fs.existsSync(`${out}.key`) && fs.readFileSync(`${out}.key`, "utf8") === key) return out;
  const rate = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate", "-of", "csv=p=0", src], { capture: true }).trim();
  const [num, den] = rate.split("/").map(Number);
  const fps = Math.min(60, Math.max(24, Math.round(num / (den || 1)) || 30));
  console.log(`🔧 Préparation de ${path.basename(c.file)} (${fps} i/s)`);
  run("ffmpeg", [
    "-v", "error", "-y", "-i", src, "-map", "0:v:0", "-an",
    "-vf", "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))',format=yuv420p",
    "-fps_mode", "cfr", "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "14",
    "-g", String(Math.round(fps / 2)), "-keyint_min", String(Math.round(fps / 2)), "-sc_threshold", "0", "-movflags", "+faststart", out,
  ]);
  fs.writeFileSync(`${out}.key`, key);
  return out;
});
const analyzed = cached(path.join(cacheDir, "clips.json"), clipPaths, () => {
  run(PYTHON, [path.join(ROOT, "scripts/analyze_clips.py"), ...clipPaths, "-o", path.join(cacheDir, "clips.raw.json"), "--sheet", path.join(editDir, "impacts.jpg")]);
  return readJSON(path.join(cacheDir, "clips.raw.json"));
});
// Les réglages de edit.json (impact, cadrage, texte) passent avant l'estimation automatique.
const clips = analyzed.map((a, i) => {
  const c = clipEntries[i];
  return { ...a, name: path.basename(c.file), impact: c.impact ?? a.impact, focus: c.focus ?? a.focus, label: c.label || "", hero: !!c.hero };
});

// ---------- Durée automatique ----------
let duration = edit.duration;
if (duration == null || duration === "auto") {
  const perClip = style.id === "story" ? 3.2 : 2.4;
  const byClips = 1.8 + clips.length * perClip + 1.3;
  duration = Math.max(MIN_DURATION, Math.min(style.duration, byClips, MAX_DURATION));
}

// ---------- Plan ----------
const plan = planEdit({ edit: { ...edit, duration }, style, music, clips });
console.log(`✂️  ${plan.shots.length} plans · ${plan.duration.toFixed(2)} s · ${plan.bpm} BPM · drop dans l'edit : ${plan.drop == null ? "—" : plan.drop.toFixed(2) + " s"}`);
for (const w of plan.warnings) console.warn(`⚠️  ${w}`);

// ---------- Dossier de rendu (projet HyperFrames autonome) ----------
const graphicsOnly = flag("graphics-only");
const build = path.join(ROOT, "build", (formatId === "vertical" ? id : `${id}-${formatId}`) + (graphicsOnly ? "-gfx" : ""));
fs.rmSync(build, { recursive: true, force: true });
for (const d of ["assets/clips", "assets/freeze", "assets/sfx", "assets/fonts", "assets/brand"]) fs.mkdirSync(path.join(build, d), { recursive: true });
const copy = (src, dst) => {
  fs.copyFileSync(src, path.join(build, dst));
  return dst;
};
const assets = {
  gsap: copy(path.join(ROOT, "node_modules/gsap/dist/gsap.min.js"), "assets/gsap.min.js"),
  fonts: {
    display: copy(path.join(ROOT, "node_modules", brand.fonts.display.package, "files", brand.fonts.display.file), `assets/fonts/${brand.fonts.display.file}`),
    text: copy(path.join(ROOT, "node_modules", brand.fonts.text.package, "files", brand.fonts.text.file), `assets/fonts/${brand.fonts.text.file}`),
  },
  badge: copy(path.join(ROOT, brand.badge), "assets/brand/badge.png"),
  music: copy(musicFile, `assets/music${path.extname(musicFile).toLowerCase()}`),
  clips: clips.map((c, i) => copy(clipPaths[i], `assets/clips/c${String(i + 1).padStart(2, "0")}${path.extname(c.file).toLowerCase()}`)),
  freezes: {},
  grain: "assets/grain.png",
  sfx: [],
};
run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=512x512,noise=alls=70:allf=u", "-frames:v", "1", path.join(build, assets.grain)]);
// Images figées (freeze) extraites de la source.
for (const s of plan.shots) {
  s.pieces.forEach((p, j) => {
    if (p.kind !== "freeze") return;
    const out = `assets/freeze/s${s.index}-${j}.jpg`;
    // Sélection par numéro d'image : exact, contrairement à -ss.
    run("ffmpeg", ["-v", "error", "-y", "-i", clipPaths[s.clipIndex], "-vf", `select=eq(n\\,${p.frame})`, "-fps_mode", "passthrough", "-frames:v", "1", "-q:v", "2", path.join(build, out)]);
    assets.freezes[`${s.index}-${j}`] = out;
  });
}
// Bruitages : pris dans assets/sfx/<catégorie>/ (téléchargés depuis Freesound avec npm run sfx).
const rnd = mulberry32(hashString(id));
const sfxDir = path.join(ROOT, "assets", "sfx");
const missing = new Set();
const probeDur = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { capture: true }).trim());
for (const ev of plan.sfx) {
  const dir = path.join(sfxDir, ev.cat);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => AUDIO_EXT.test(f)).sort() : [];
  if (!files.length) {
    missing.add(ev.cat);
    continue;
  }
  const pick = files[Math.floor(rnd() * files.length)];
  const name = `${ev.cat}-${pick}`;
  if (!fs.existsSync(path.join(build, "assets/sfx", name))) copy(path.join(dir, pick), `assets/sfx/${name}`);
  const fileDur = probeDur(path.join(dir, pick));
  if (ev.end != null) {
    const len = Math.min(fileDur, ev.maxLen);
    assets.sfx.push({ src: `assets/sfx/${name}`, start: ev.end - len, dur: len, mediaStart: fileDur - len, vol: ev.vol });
  } else {
    const len = Math.min(fileDur, ev.maxLen ?? fileDur, plan.duration - ev.t);
    if (len > 0.05) assets.sfx.push({ src: `assets/sfx/${name}`, start: ev.t, dur: len, mediaStart: 0, vol: ev.vol });
  }
}
if (missing.size) console.warn(`🔇 Bruitages absents (${[...missing].join(", ")}) : lance « npm run sfx » pour les télécharger depuis Freesound.`);

const html = compose({ plan, brand, format, assets, seed: hashString(id), debugTiming: flag("debug-timing"), graphicsOnly });
fs.writeFileSync(path.join(build, "index.html"), html);
fs.writeFileSync(path.join(build, "plan.json"), JSON.stringify(plan, null, 1));
// Fiche pour l'export DaVinci (npm run davinci) : chemins absolus de tout ce qu'il faut.
const abs = (p) => path.resolve(build, p);
fs.writeFileSync(
  path.join(build, "kit.json"),
  JSON.stringify(
    {
      id,
      fps: format.fps,
      width: format.width,
      height: format.height,
      music: path.resolve(musicFile),
      clips: clipPaths.map((p) => path.resolve(p)),
      clipFps: clips.map((c) => c.fps || 30),
      originals: clipEntries.map((c) => path.resolve(editDir, c.file)),
      freezes: Object.fromEntries(Object.entries(assets.freezes).map(([k, v]) => [k, abs(v)])),
      sfx: assets.sfx.map((x) => ({ ...x, src: abs(x.src) })),
    },
    null,
    1,
  ),
);
fs.writeFileSync(
  path.join(build, "hyperframes.json"),
  JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2),
);
fs.writeFileSync(path.join(build, "meta.json"), JSON.stringify({ id, name: `${brand.name} — ${id}` }, null, 2));
console.log(`🧱 Composition prête : ${rel(build)}/index.html`);

if (flag("no-render")) {
  console.log(`👀 Aperçu : npm run preview -- ${id}\n`);
  process.exit(0);
}

// ---------- Rendu ----------
fs.mkdirSync(path.join(ROOT, "renders"), { recursive: true });
const suffix = formatId === "vertical" ? "" : `-${formatId}`;
const out = graphicsOnly
  ? path.join(ROOT, "renders", `${id}${suffix}-graphics.mov`)
  : path.join(ROOT, "renders", `${id}${suffix}${flag("draft") ? "-draft" : ""}.mp4`);
const quality = flag("draft") ? "draft" : opt("quality", "standard");
const renderArgs = ["render", build, "--output", out, "--fps", String(format.fps), "--strict", "--quiet"];
// MOV = ProRes 4444 avec transparence (calque titres/logo pour DaVinci) ; sa qualité est fixe.
if (graphicsOnly) renderArgs.push("--format", "mov");
else renderArgs.push("--quality", quality);
run(HYPERFRAMES, renderArgs);
const info = run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "compact=p=0:nk=1", out], { capture: true });
console.log(`\n✅ Edit prêt : ${rel(out)}\n${info.trim()}\n`);
