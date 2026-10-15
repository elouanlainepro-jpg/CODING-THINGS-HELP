// Planification d'un edit : choisit le passage de la musique, découpe le temps en plans
// calés sur les beats, place l'impact de chaque clip sur un temps et calcule les vitesses
// (accéléré avant le choc, ralenti après). Tout est en secondes, temps de l'edit.

export const MIN_DURATION = 10;
export const MAX_DURATION = 30;
const EPS = 1e-6;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

function nearest(arr, t) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - t) < Math.abs(arr[best] - t)) best = i;
  return best;
}

// Passage de la musique : le drop tombe après `dropAt` × durée (arrondi à la mesure).
export function chooseWindow(music, wantDuration, dropAt) {
  const bl = music.beatLen;
  if (music.duration < MIN_DURATION + 0.1) throw new Error(`Musique trop courte (${music.duration.toFixed(1)} s, minimum ${MIN_DURATION} s)`);
  let D = clamp(wantDuration, MIN_DURATION, MAX_DURATION);
  const beats = music.beats;
  let start;
  if (music.drop != null) {
    const preBeats = Math.max(4, Math.round((dropAt * D) / bl / 4) * 4);
    start = music.drop - preBeats * bl;
  } else {
    start = (music.downbeats && music.downbeats[0]) ?? beats[0];
  }
  let i = nearest(beats, Math.max(start, beats[0]));
  // Le passage doit tenir dans la musique.
  while (i > 0 && beats[i] + D > music.duration - 0.05) i--;
  start = beats[i];
  if (start + D > music.duration - 0.05) D = Math.max(MIN_DURATION, music.duration - 0.05 - start);
  const local = beats.map((t) => t - start).filter((t) => t > -EPS && t < MAX_DURATION + 2 && start + t < music.duration - 0.05);
  const drop = music.drop != null && music.drop - start > 0.5 && music.drop - start < D - 2 ? music.drop - start : null;
  // Fin sur une barre de mesure (comptée depuis le drop, sinon depuis le début).
  const ref = drop != null ? nearest(local, drop) : 0;
  const candidates = local
    .map((t, k) => ({ t, k }))
    .filter(({ t, k }) => (k - ref) % 4 === 0 && t >= MIN_DURATION - EPS && t <= MAX_DURATION + EPS && t >= D - 2.5 && t <= D + 2);
  if (candidates.length) D = candidates.reduce((a, b) => (Math.abs(b.t - D) < Math.abs(a.t - D) ? b : a)).t;
  return { musicStart: round(start), duration: round(D), drop: drop == null ? null : round(drop), beats: local.filter((t) => t < D - EPS).map((t) => round(t)), beatLen: bl };
}

// Nombre de beats par plan : puissance de 2 la plus proche de la durée visée.
function beatsPerSlot(targetSec, bl) {
  const ideal = targetSec / bl;
  return [1, 2, 4, 8, 16, 32].reduce((a, b) => (Math.abs(Math.log(b / ideal)) < Math.abs(Math.log(a / ideal)) ? b : a));
}

// Tailles des plans (en beats) pour couvrir `L` beats avec au plus `n` plans,
// en partant de `b` beats par plan et en regroupant de préférence par mesure (4 beats).
export function slotSizes(L, n, b) {
  if (L <= 0 || n <= 0) return [];
  if (Math.floor(L / b) <= n) {
    const k = Math.max(1, Math.floor(L / b));
    const sizes = Array(k).fill(b);
    sizes[k - 1] += L - k * b;
    // Dernier plan trop court : fusion avec le précédent.
    if (k > 1 && sizes[k - 1] < b / 2) sizes.splice(k - 2, 2, sizes[k - 2] + sizes[k - 1]);
    return sizes;
  }
  let unit = b < 4 && Math.floor(L / 4) >= n ? 4 : b;
  while (Math.floor(L / unit) > 2 * n) unit *= 2;
  const k = Math.floor(L / unit);
  const groups = Math.min(n, k);
  const q = Math.floor(k / groups);
  const extra = k - groups * q;
  // Les plans plus longs vont à la fin (le final a besoin de temps pour le freeze).
  const sizes = Array.from({ length: groups }, (_, i) => (q + (i >= groups - extra ? 1 : 0)) * unit);
  sizes[groups - 1] += L - k * unit;
  return sizes;
}

function makeSlots(section, beats, sizes) {
  const inside = beats.filter((t) => t >= section.start - EPS && t < section.end - EPS);
  const slots = [];
  let k = 0;
  for (const size of sizes) {
    if (k >= inside.length) break;
    slots.push({ start: k === 0 ? section.start : inside[k], end: section.end, beats: inside.slice(k, k + size), section: section.name });
    k += size;
  }
  for (let i = 0; i < slots.length - 1; i++) slots[i].end = slots[i + 1].start;
  return slots;
}

// Morceaux de vidéo d'un plan : [avant le choc à `pre`] [freeze] [ralenti `post`] [reprise `rec`].
export function solveShot({ s, e, a, clip, p, beatLen, freezeLen = 0 }) {
  const pieces = [];
  const fps = clip.fps || 30;
  // L'impact est calé sur la grille d'images de la source.
  const ti = Math.round(clip.impact * fps) / fps;
  const D = clip.duration;
  const last = Math.max(0, Math.floor((D - 1e-6) * fps - 1) / fps);
  const lead = a - s;
  const frame = 1 / 120;
  const pushVideo = (start, dur, mediaStart, rate) => {
    // Garde-fou : si la source s'épuise, on fige la dernière image.
    const room = Math.max(0, last - mediaStart) / rate;
    if (room + EPS < dur) {
      if (room > frame) pieces.push({ kind: "video", start, dur: room, mediaStart, rate });
      pieces.push({ kind: "freeze", start: start + Math.max(0, room), dur: dur - Math.max(0, room), at: last });
    } else pieces.push({ kind: "video", start, dur, mediaStart, rate });
  };
  if (lead > frame) {
    let rate = p.pre;
    let m0 = ti - rate * lead;
    if (m0 < 0) {
      rate = clamp(ti / lead, 0.1, 10);
      m0 = Math.max(0, ti - rate * lead);
    }
    pushVideo(s, lead, m0, rate);
  }
  let t = a;
  if (freezeLen > frame) {
    pieces.push({ kind: "freeze", start: a, dur: freezeLen, at: ti, hero: true });
    t += freezeLen;
  }
  const rem = e - t;
  if (rem > frame) {
    const slow = Math.min(rem, p.slowBeats * beatLen);
    const recLen = rem - slow;
    let post = p.post;
    let rec = p.rec;
    const avail = last - ti;
    if (post * slow + rec * recLen > avail) {
      if (recLen > frame && post * slow + 0.1 * recLen <= avail) rec = Math.max(0.1, (avail - post * slow) / recLen);
      else {
        post = Math.max(0.1, avail / rem);
        rec = post;
      }
    }
    if (avail < 0.05) pieces.push({ kind: "freeze", start: t, dur: rem, at: last });
    else {
      if (slow > frame) pushVideo(t, slow, ti, post);
      if (recLen > frame) pushVideo(t + slow, recLen, ti + post * slow, rec);
    }
  }
  // HyperFrames prend l'image source « à l'arrondi inférieur » : un quart d'image de marge
  // évite qu'un 1,2333 s écrit 1,233 s ne montre l'image d'avant (3 images de décalage en ralenti).
  const nudge = 0.25 / fps;
  return pieces.map((x) => ({
    ...x,
    start: round(x.start),
    dur: round(x.dur),
    ...(x.mediaStart != null ? { mediaStart: round(x.mediaStart + nudge, 5), rate: round(x.rate, 4) } : {}),
    ...(x.at != null ? { at: round(x.at + nudge, 5), frame: Math.round(x.at * fps) } : {}),
  }));
}

// Ordre des clips : l'ordre donné, et le clip « hero » (sinon le dernier) pour le final.
export function clipSequence(n, clips) {
  const hero = clips.findIndex((c) => c.hero);
  const finale = hero >= 0 ? hero : clips.length - 1;
  const others = clips.map((_, i) => i).filter((i) => i !== finale);
  const seq = [];
  for (let k = 0; k < n - 1; k++) seq.push(others.length ? others[k % others.length] : finale);
  if (n > 0) seq.push(finale);
  return seq;
}

function accentFor(slot, sp) {
  if (sp.accentBeat === "end") return slot.end;
  if (slot.beats.length < 2) return slot.start;
  return slot.beats[Math.min(sp.accentBeat, slot.beats.length - 1)];
}

export function planEdit({ edit, style, music, clips }) {
  const warnings = [];
  const win = chooseWindow(music, edit.duration ?? style.duration, style.dropAt);
  const { duration: D, beats, beatLen: bl, drop } = win;
  const idxAt = (t) => nearest(beats, t);

  // Outro : ~1,3 s calé sur un beat.
  let outro = null;
  let contentEnd = D;
  if (edit.outro !== false) {
    const n = Math.max(2, Math.round(1.3 / bl));
    const start = beats[Math.max(0, beats.length - n)];
    if (start > D * 0.6) {
      outro = { start, end: D };
      contentEnd = start;
    }
  }

  // Sections.
  const names = Object.keys(style.sections);
  const first = names[0];
  const second = names[1];
  let split = drop;
  if (split == null || split < 1 || split > contentEnd - 2) {
    if (style.id === "story") split = beats[idxAt(contentEnd * 0.38)];
    else split = null;
  }
  const sections = split == null ? [{ name: second, start: 0, end: contentEnd }] : [{ name: first, start: 0, end: split }, { name: second, start: split, end: contentEnd }];

  // Plans : chaque section reçoit une part des clips, puis on découpe ses beats.
  const lengthInBeats = (sec) => beats.filter((t) => t >= sec.start - EPS && t < sec.end - EPS).length;
  // Intro « carry » : le premier clip arrive au ralenti et son impact tombe pile sur le drop,
  // puis le plan suivant continue le même clip (il ne consomme pas de clip en plus).
  const introCarries = sections.length > 1 && style.sections[first].accentBeat === "end";
  const plan = sections.map((sec) => {
    const L = lengthInBeats(sec);
    const b = beatsPerSlot(style.sections[sec.name].slotSec, bl);
    return { sec, L, b, ideal: Math.max(1, Math.floor(L / b)) };
  });
  let budget = clips.length;
  if (introCarries) {
    plan[0].n = 1;
    plan[1].n = budget;
  } else if (plan.length === 2) {
    const total = plan[0].ideal + plan[1].ideal;
    // Part des clips pour la 1re section (ex. story : ~35 % pour l'acte 1), sinon au prorata.
    const share = style.sections[first].share;
    const wanted = share != null ? Math.ceil(budget * share) : Math.round((budget * plan[0].ideal) / total);
    plan[0].n = budget >= total ? plan[0].ideal : clamp(wanted, 1, Math.max(1, Math.min(plan[0].ideal, budget - 1)));
    plan[1].n = budget >= total ? plan[1].ideal : Math.max(1, budget - plan[0].n);
  } else plan[0].n = budget;
  const slots = plan.flatMap((p) => makeSlots(p.sec, beats, slotSizes(p.L, p.n, p.b)));
  const carry = introCarries && slots.length > 1;
  const needed = slots.length - (carry ? 1 : 0);
  const seq = clipSequence(needed, clips);
  const unused = clips.filter((_, i) => !seq.includes(i)).map((c) => c.name);
  if (needed > clips.length) warnings.push(`${clips.length} clips pour ${needed} plans : certains clips sont réutilisés. Ajoute des clips pour un edit plus varié.`);
  if (unused.length) warnings.push(`${unused.length} clip(s) non utilisé(s) (${unused.join(", ")}) : allonge l'edit pour tous les montrer.`);

  const shots = [];
  let q = 0;
  slots.forEach((slot, k) => {
    const sp = style.sections[slot.section];
    const isFinale = k === slots.length - 1;
    const continuing = carry && k === 1;
    const clipIndex = continuing ? shots[0].clipIndex : seq[q++];
    const clip = clips[clipIndex];
    const a = continuing ? slot.start : accentFor(slot, sp);
    const freezeLen = isFinale && style.finale ? Math.min(style.finale.freezeBeats * bl, (slot.end - a) * 0.75) : 0;
    const pieces = solveShot({ s: slot.start, e: slot.end, a, clip, p: sp, beatLen: bl, freezeLen });
    shots.push({
      index: k,
      section: slot.section,
      clipIndex,
      clip: clip.name,
      start: round(slot.start),
      end: round(slot.end),
      accent: round(a),
      focus: clip.focus ?? 0.5,
      label: clip.label || "",
      continuing,
      finale: isFinale,
      freeze: freezeLen > 0 ? { start: round(a), end: round(a + freezeLen) } : null,
      pieces,
      fx: sp,
    });
  });

  const slow = shots.filter((s) => !s.finale && s.section === second && s.end - s.start > 3);
  if (slow.length) warnings.push(`${slow.length} plan(s) de plus de 3 s après le drop : ajoute des clips ou raccourcis l'edit (--duration) pour un rythme plus nerveux.`);

  // Textes.
  const texts = [];
  const player = (edit.player || "").toUpperCase();
  const title = (edit.title || style.defaultTitle).toUpperCase();
  if (style.id === "story") {
    // Titre au début, puis les phrases d'histoire réparties sur le reste de l'acte 1 (calées sur les beats).
    const act1End = split ?? beats[idxAt(Math.min(2.6, contentEnd / 3))];
    const lines = (edit.story_lines || []).map((l) => String(l).toUpperCase()).filter(Boolean);
    const titleEnd = lines.length ? beats[idxAt(Math.min(2.6, act1End / (lines.length + 1)))] : act1End;
    texts.push({ kind: "title", player, title, start: 0, end: titleEnd });
    const per = (act1End - titleEnd) / Math.max(1, lines.length);
    const fit = per >= 1.2 ? lines : lines.slice(0, Math.max(0, Math.floor((act1End - titleEnd) / 1.2)));
    if (fit.length < lines.length) warnings.push(`Acte 1 trop court : ${lines.length - fit.length} phrase(s) d'histoire non affichée(s).`);
    fit.forEach((text, i) => {
      const step = (act1End - titleEnd) / fit.length;
      const start = beats[idxAt(titleEnd + i * step)];
      const end = i === fit.length - 1 ? act1End : beats[idxAt(titleEnd + (i + 1) * step)];
      if (end - start > 0.5) texts.push({ kind: "line", text, start, end });
    });
  } else {
    const introEnd = split ?? beats[idxAt(Math.min(2.2, contentEnd / 3))];
    texts.push({ kind: "title", player, title, start: 0, end: introEnd });
  }
  for (const s of shots) if (s.label && !s.finale) texts.push({ kind: "label", text: s.label.toUpperCase(), start: s.start, end: s.end });
  const fin = shots[shots.length - 1];
  if (fin && style.finale?.stamp) texts.push({ kind: "stamp", player, title, start: fin.freeze ? fin.freeze.start : fin.accent, end: fin.end });

  // Bruitages.
  const sfx = [];
  const cat = style.sfx || {};
  shots.forEach((s, k) => {
    if (k > 0 && !s.continuing && cat.cut) sfx.push({ cat: cat.cut, t: round(Math.max(0, s.start - 0.12)), vol: 0.55 });
    const intense = s.fx.flash > 0 || s.finale;
    if (intense && cat.accent && !s.continuing) sfx.push({ cat: cat.accent, t: s.accent, vol: s.finale ? 1 : 0.85 });
    if (s.freeze && cat.freeze) sfx.push({ cat: cat.freeze, t: s.freeze.start, vol: 0.7 });
  });
  if (drop != null && split === drop) {
    if (cat.drop) sfx.push({ cat: cat.drop, t: drop, vol: 0.9 });
    if (cat.riser) sfx.push({ cat: cat.riser, end: drop, maxLen: Math.min(3, drop), vol: 0.6 });
  }
  if (fin && cat.finale) sfx.push({ cat: cat.finale, t: fin.accent, vol: 0.35, maxLen: 3 });

  return {
    version: 1,
    style: style.id,
    duration: D,
    musicStart: win.musicStart,
    bpm: round(60 / bl, 2),
    beatLen: bl,
    beats,
    drop,
    sections,
    outro,
    shots,
    texts,
    sfx,
    warnings,
  };
}
