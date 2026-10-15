#!/usr/bin/env node
// Télécharge les bruitages depuis Freesound (licence CC0 uniquement : utilisables partout,
// y compris sur une chaîne monétisée, sans obligation de créditer).
//
//   FREESOUND_API_KEY=xxxx npm run sfx              4 sons par catégorie
//   FREESOUND_API_KEY=xxxx npm run sfx -- --per 6 --only impact,whoosh
//   npm run sfx -- --dry-run                        affiche les recherches sans rien télécharger
//
// Clé gratuite : crée un compte sur freesound.org puis https://freesound.org/apiv2/apply

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://freesound.org/apiv2";

// Catégories utilisées par les styles (styles/*.json → "sfx").
export const CATEGORIES = {
  whoosh: { queries: ["whoosh fast", "swoosh transition"], duration: [0.2, 1.6] },
  impact: { queries: ["body hit impact", "punch impact heavy", "football tackle hit"], duration: [0.15, 2.5] },
  swish: { queries: ["swish air fast", "throw swish"], duration: [0.1, 1.2] },
  boom: { queries: ["sub boom", "cinematic boom bass hit"], duration: [0.6, 5] },
  riser: { queries: ["riser build up", "tension riser"], duration: [1.5, 6] },
  shutter: { queries: ["camera shutter"], duration: [0.1, 1.2] },
  crowd: { queries: ["stadium crowd cheer", "crowd cheering roar"], duration: [1.5, 10] },
};

export function searchUrl(query, [dmin, dmax], key, endpoint = "search/text") {
  const params = new URLSearchParams({
    query,
    filter: `license:"Creative Commons 0" duration:[${dmin} TO ${dmax}]`,
    sort: "rating_desc",
    fields: "id,name,username,license,duration,previews,url",
    page_size: "15",
    token: key,
  });
  return `${API}/${endpoint}/?${params}`;
}

// Garde les meilleurs sons uniques, en CC0, qui ont un aperçu MP3 haute qualité.
export function selectSounds(responses, n) {
  const seen = new Set();
  const out = [];
  const lists = responses.map((r) => (r && Array.isArray(r.results) ? r.results : []));
  for (let i = 0; out.length < n && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const s = list[i];
      if (!s || seen.has(s.id)) continue;
      const cc0 = /creative commons 0|publicdomain\/zero/i.test(String(s.license));
      const mp3 = s.previews && s.previews["preview-hq-mp3"];
      if (!cc0 || !mp3) continue;
      seen.add(s.id);
      out.push(s);
      if (out.length >= n) break;
    }
  }
  return out;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function search(query, duration, key) {
  try {
    return await getJSON(searchUrl(query, duration, key));
  } catch (e) {
    if (e.status === 404) return getJSON(searchUrl(query, duration, key, "search")); // nouvelle API
    throw e;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const per = Number(opt("per", 4));
  const only = opt("only", null)?.split(",");
  const dry = args.includes("--dry-run");
  const key = process.env.FREESOUND_API_KEY || opt("key", "");
  const cats = Object.entries(CATEGORIES).filter(([c]) => !only || only.includes(c));
  if (dry) {
    for (const [cat, def] of cats) for (const q of def.queries) console.log(`${cat.padEnd(8)} ${searchUrl(q, def.duration, "CLE")}`);
    return;
  }
  if (!key) {
    console.error("\n❌ Clé Freesound manquante. Crée-la sur https://freesound.org/apiv2/apply puis :\n   FREESOUND_API_KEY=ta_cle npm run sfx\n");
    process.exit(1);
  }
  const outDir = path.join(ROOT, "assets", "sfx");
  const creditsFile = path.join(outDir, "credits.json");
  const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, "utf8")) : [];
  for (const [cat, def] of cats) {
    let responses;
    try {
      responses = await Promise.all(def.queries.map((q) => search(q, def.duration, key)));
    } catch (e) {
      const blocked = /fetch failed|ENOTFOUND|ECONNREFUSED|403/.test(String(e.cause || e.message));
      console.error(`\n❌ Freesound injoignable (${e.message}).` + (blocked ? " Si tu es dans une session cloud, autorise freesound.org et cdn.freesound.org dans les réglages réseau de l'environnement." : ""));
      process.exit(1);
    }
    const picks = selectSounds(responses, per);
    fs.mkdirSync(path.join(outDir, cat), { recursive: true });
    for (const s of picks) {
      const file = path.join(outDir, cat, `${s.id}-${slug(s.name)}.mp3`);
      if (!fs.existsSync(file)) {
        const res = await fetch(s.previews["preview-hq-mp3"]);
        if (!res.ok) {
          console.warn(`  ⚠️  ${s.name} : téléchargement impossible (HTTP ${res.status})`);
          continue;
        }
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      if (!credits.some((c) => c.id === s.id)) credits.push({ category: cat, id: s.id, name: s.name, author: s.username, license: s.license, url: s.url, file: path.relative(ROOT, file) });
      console.log(`  🔊 ${cat.padEnd(8)} ${s.name} — ${s.username} (CC0)`);
    }
    if (!picks.length) console.warn(`  ⚠️  ${cat} : aucun son CC0 trouvé`);
  }
  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
  const md = ["# Bruitages (Freesound, licence CC0)", "", "| Catégorie | Son | Auteur | Lien |", "|---|---|---|---|", ...credits.map((c) => `| ${c.category} | ${c.name} | ${c.author} | ${c.url} |`), ""];
  fs.writeFileSync(path.join(outDir, "CREDITS.md"), md.join("\n"));
  console.log(`\n✅ ${credits.length} bruitages prêts dans assets/sfx/ (liste : assets/sfx/CREDITS.md)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
