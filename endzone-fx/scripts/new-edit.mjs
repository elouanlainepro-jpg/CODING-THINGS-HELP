#!/usr/bin/env node
// Crée un nouvel edit à partir d'une demande en texte libre.
//
//   npm run new -- "la renaissance de Tom Brady"
//   npm run new -- "Patrick Mahomes best throws" --duration 20
//   npm run new -- "Ray Lewis biggest hits" --style hits --name ray-lewis

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequest, slugify } from "../lib/request.mjs";
import { MIN_DURATION, MAX_DURATION } from "../lib/plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const request = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))).join(" ").trim();
if (!request) {
  console.error('\n❌ Écris ta demande : npm run new -- "la renaissance de Tom Brady"\n');
  process.exit(1);
}

const styles = Object.fromEntries(
  fs.readdirSync(path.join(ROOT, "styles")).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "styles", f), "utf8"))).map((s) => [s.id, s]),
);
const parsed = parseRequest(request, styles);
const style = opt("style") || parsed.style;
if (!styles[style]) {
  console.error(`\n❌ Style inconnu : ${style} (choix : ${Object.keys(styles).join(", ")})\n`);
  process.exit(1);
}
const duration = opt("duration") ? Number(opt("duration")) : "auto";
if (duration !== "auto" && !(duration >= MIN_DURATION && duration <= MAX_DURATION)) {
  console.error(`\n❌ La durée doit être entre ${MIN_DURATION} et ${MAX_DURATION} secondes.\n`);
  process.exit(1);
}
const id = opt("name") ? slugify(opt("name")) : parsed.slug;
const dir = path.join(ROOT, "edits", id);
if (fs.existsSync(path.join(dir, "edit.json"))) {
  console.error(`\n❌ edits/${id}/ existe déjà. Choisis un autre nom avec --name.\n`);
  process.exit(1);
}
fs.mkdirSync(path.join(dir, "clips"), { recursive: true });
fs.writeFileSync(path.join(dir, "clips", ".gitkeep"), "");
const edit = {
  request,
  style,
  player: parsed.player,
  title: style === parsed.style ? parsed.title : styles[style].defaultTitle,
  duration,
  format: "vertical",
  music: { file: null },
  story_lines: style === "story" ? [] : undefined,
  outro: true,
  clips: [],
};
fs.writeFileSync(path.join(dir, "edit.json"), JSON.stringify(edit, null, 2) + "\n");

console.log(`
✅ Edit créé : edits/${id}/
   style ${style} · joueur « ${edit.player || "?"} » · titre « ${edit.title} » · durée ${duration === "auto" ? "auto (10-30 s)" : duration + " s"}

Étapes suivantes :
  1. Dépose tes clips dans edits/${id}/clips/  (dans l'ordre voulu : 01-..., 02-...)
  2. Dépose la musique dans edits/${id}/        (mp3 ou wav)
  3. npm run edit -- ${id}
     → la vidéo sort dans renders/${id}.mp4
`);
