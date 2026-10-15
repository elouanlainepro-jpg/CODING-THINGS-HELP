#!/usr/bin/env node
// Prépare un kit DaVinci Resolve : timeline déjà coupée sur les beats + marqueurs + titres/logo.
//
//   npm run davinci -- ray-lewis-biggest-hits
//   options : --no-graphics (pas de calque titres/logo) · --smooth (ralentis lissés, plus long)
//             --full-frame (garde le 16:9 d'origine) · --format landscape

import fs from "node:fs";
import path from "node:path";
import { ROOT, PYTHON, spawn } from "../lib/sys.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const fmtIdx = args.indexOf("--format");
const format = fmtIdx >= 0 ? args[fmtIdx + 1] : null;
const id = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--format"));
if (!id) {
  console.error("\n❌ Indique le dossier de l'edit : npm run davinci -- ray-lewis-biggest-hits\n");
  process.exit(1);
}

function step(cmd, cmdArgs) {
  const r = spawn(cmd, cmdArgs, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const fmtArgs = format ? ["--format", format] : [];
const suffix = format && format !== "vertical" ? `-${format}` : "";
const make = path.join(ROOT, "scripts", "make-edit.mjs");

console.log("\n1/3 · Plan de montage (analyse musique + clips)");
step(process.execPath, [make, id, "--no-render", ...fmtArgs]);

let graphics = null;
if (!flag("no-graphics")) {
  console.log("\n2/3 · Calque titres / logo / outro (transparent)");
  step(process.execPath, [make, id, "--graphics-only", ...fmtArgs]);
  graphics = path.join(ROOT, "renders", `${id}${suffix}-graphics.mov`);
}

console.log("\n3/3 · Kit DaVinci");
const out = path.join(ROOT, "davinci", `${id}${suffix}`);
const kitArgs = [path.join(ROOT, "scripts", "davinci_kit.py"), path.join(ROOT, "build", `${id}${suffix}`), out];
if (graphics && fs.existsSync(graphics)) kitArgs.push("--graphics", graphics);
if (flag("smooth")) kitArgs.push("--smooth");
if (flag("full-frame")) kitArgs.push("--full-frame");
step(PYTHON, kitArgs);

console.log(`
✅ Ouvre DaVinci Resolve puis :
   1. Fichier > Importer > Timeline…  →  davinci/${id}${suffix}/timeline.xml
   2. Media Pool : clic droit sur la timeline > Timelines > Import > Timeline Markers from EDL  →  markers.edl
   3. Ajoute tes effets aux marqueurs jaunes (impacts). Détails : DAVINCI.md et davinci/${id}${suffix}/PLAN.md
`);
