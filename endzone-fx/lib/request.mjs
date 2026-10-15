// Transforme une demande en texte libre (« la renaissance de Tom Brady »)
// en réglages d'edit : style, joueur, titre affiché et nom de dossier.

const STOPWORDS = new Set(
  (
    "la le les de du des d l un une au aux et en avec sur pour par ses sa son leur leurs " +
    "the of a an and in with on for his her their all time ever edit edits nfl video " +
    "plus gros grosse grosses meilleur meilleurs meilleure meilleures top best biggest greatest " +
    "career carriere moments moment"
  ).split(/\s+/),
);

// Expression trouvée dans la demande -> titre affiché (en anglais pour le public NFL).
const TITLES = [
  ["biggest hits", "BIGGEST HITS"],
  ["hardest hits", "HARDEST HITS"],
  ["big hits", "BIGGEST HITS"],
  ["plaquages", "BIGGEST HITS"],
  ["plaquage", "BIGGEST HITS"],
  ["tackles", "BIGGEST TACKLES"],
  ["tackle", "BIGGEST TACKLES"],
  ["hits", "BIGGEST HITS"],
  ["hit", "BIGGEST HITS"],
  ["sacks", "BEST SACKS"],
  ["sack", "BEST SACKS"],
  ["best throws", "BEST THROWS"],
  ["best throw", "BEST THROWS"],
  ["throws", "BEST THROWS"],
  ["throw", "BEST THROWS"],
  ["passes", "BEST THROWS"],
  ["passe", "BEST THROWS"],
  ["dimes", "DIMES"],
  ["catches", "BEST CATCHES"],
  ["catch", "BEST CATCHES"],
  ["runs", "BEST RUNS"],
  ["run", "BEST RUNS"],
  ["touchdowns", "TOUCHDOWNS"],
  ["touchdown", "TOUCHDOWNS"],
  ["td", "TOUCHDOWNS"],
  ["renaissance", "THE RENAISSANCE"],
  ["rebirth", "THE REBIRTH"],
  ["comeback", "THE COMEBACK"],
  ["retour", "THE COMEBACK"],
  ["legacy", "THE LEGACY"],
  ["heritage", "THE LEGACY"],
  ["journey", "THE JOURNEY"],
  ["ascension", "THE RISE"],
  ["rise", "THE RISE"],
  ["redemption", "REDEMPTION"],
  ["revanche", "REVENGE"],
  ["goat", "THE GOAT"],
  ["legende", "LEGEND"],
  ["legend", "LEGEND"],
  ["highlights", "HIGHLIGHTS"],
];

export function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9#. -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(text) {
  return normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function hasPhrase(norm, phrase) {
  return new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(norm);
}

function titleCase(words) {
  return words.map((w) => (w.length <= 2 && /^[a-z]+$/.test(w) && w !== "jr" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}

export function parseRequest(text, styles) {
  const norm = normalize(text);
  // 1. Style : celui dont le plus de mots-clés apparaissent.
  let style = "highlights";
  let best = 0;
  for (const s of Object.values(styles)) {
    const score = s.keywords.reduce((n, k) => n + (hasPhrase(norm, normalize(k)) ? normalize(k).split(" ").length : 0), 0);
    if (score > best) {
      best = score;
      style = s.id;
    }
  }
  // 2. Titre : première expression connue, sinon le titre par défaut du style.
  const hit = TITLES.find(([p]) => hasPhrase(norm, p));
  const title = hit ? hit[1] : styles[style].defaultTitle;
  // 3. Joueur : ce qui reste une fois les mots-clés et petits mots retirés.
  const removable = new Set(STOPWORDS);
  for (const s of Object.values(styles)) for (const k of s.keywords) for (const w of normalize(k).split(" ")) removable.add(w);
  for (const [p] of TITLES) for (const w of p.split(" ")) removable.add(w);
  const words = norm.split(" ").filter((w) => w && !removable.has(w));
  const player = words.length ? titleCase(words) : "";
  const slug = [slugify(player), slugify(hit ? hit[0] : style)].filter(Boolean).join("-") || "edit";
  return { style, player, title, slug };
}
