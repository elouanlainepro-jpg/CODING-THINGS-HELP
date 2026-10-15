#!/usr/bin/env node
// Ouvre l'aperçu HyperFrames (Studio dans le navigateur) d'un edit déjà préparé.
//   npm run build -- tom-brady-renaissance && npm run preview -- tom-brady-renaissance

import fs from "node:fs";
import path from "node:path";
import { ROOT, HYPERFRAMES, spawn } from "../lib/sys.mjs";

const id = process.argv[2];
const build = path.join(ROOT, "build", id || "");
if (!id || !fs.existsSync(path.join(build, "index.html"))) {
  console.error(`\n❌ Prépare d'abord l'edit : npm run build -- ${id || "<nom>"}\n`);
  process.exit(1);
}
spawn(HYPERFRAMES, ["preview", build], { stdio: "inherit" });
