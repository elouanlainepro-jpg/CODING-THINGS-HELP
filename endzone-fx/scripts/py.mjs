#!/usr/bin/env node
// Lance Python avec la bonne commande selon le système : node scripts/py.mjs <args…>
import { PYTHON, spawn } from "../lib/sys.mjs";

const r = spawn(PYTHON, process.argv.slice(2), { stdio: "inherit" });
if (r.error) console.error(`\n❌ Python introuvable (${PYTHON}). Installe Python 3 ou indique-le avec la variable PYTHON.\n`);
process.exit(r.status ?? 1);
