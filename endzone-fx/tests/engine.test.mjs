// Tests du moteur (sans rendu) : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequest } from "../lib/request.mjs";
import { planEdit, slotSizes, clipSequence, MIN_DURATION, MAX_DURATION } from "../lib/plan.mjs";
import { Track } from "../lib/compose.mjs";
import { selectSounds } from "../scripts/fetch-sfx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = Object.fromEntries(
  fs.readdirSync(path.join(ROOT, "styles")).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "styles", f), "utf8"))).map((s) => [s.id, s]),
);

// Musique synthétique : 140 BPM, drop au beat 32, 40 s.
const bl = 60 / 140;
const beats = Array.from({ length: Math.floor(40 / bl) }, (_, i) => i * bl);
const music = { duration: 40, bpm: 140, beatLen: bl, beats, downbeats: beats.filter((_, i) => i % 4 === 0), drop: 32 * bl };
const makeClips = (n) =>
  Array.from({ length: n }, (_, i) => ({ name: `c${i}.mp4`, duration: 3 + (i % 3) * 0.5, fps: 60, impact: 1.2 + (i % 4) * 0.3, focus: 0.5 }));

test("demandes de l'utilisateur → style, joueur, titre", () => {
  assert.deepEqual(parseRequest("la renaissance de Tom Brady", styles), { style: "story", player: "Tom Brady", title: "THE RENAISSANCE", slug: "tom-brady-renaissance" });
  assert.deepEqual(parseRequest("patrick mahomes best throw", styles), { style: "highlights", player: "Patrick Mahomes", title: "BEST THROWS", slug: "patrick-mahomes-best-throw" });
  assert.deepEqual(parseRequest("Ray Lewis biggest hits", styles), { style: "hits", player: "Ray Lewis", title: "BIGGEST HITS", slug: "ray-lewis-biggest-hits" });
  assert.equal(parseRequest("les plus gros plaquages de TJ Watt", styles).player, "TJ Watt");
  assert.equal(parseRequest("le comeback de Joe Burrow", styles).style, "story");
});

test("découpage des plans : couvre la section, au plus n plans", () => {
  for (const [L, n, b] of [[37, 7, 2], [24, 3, 4], [16, 16, 2], [33, 1, 2], [9, 4, 4]]) {
    const sizes = slotSizes(L, n, b);
    assert.equal(sizes.reduce((a, x) => a + x, 0), L, `somme ${L}`);
    assert.ok(sizes.length <= Math.max(n, 1), `${sizes.length} plans pour ${n} clips`);
    assert.ok(sizes.every((x) => x >= 1));
  }
});

test("ordre des clips : le clip hero termine l'edit", () => {
  assert.deepEqual(clipSequence(4, makeClips(6)), [0, 1, 2, 5]);
  const clips = makeClips(5);
  clips[1].hero = true;
  assert.deepEqual(clipSequence(5, clips), [0, 2, 3, 4, 1]);
  assert.deepEqual(clipSequence(5, makeClips(2)), [0, 0, 0, 0, 1]);
});

for (const id of Object.keys(styles)) {
  for (const [n, dur] of [[3, 12], [8, 15], [8, 25], [14, 30]]) {
    test(`plan ${id} · ${n} clips · ${dur} s : contraintes respectées`, () => {
      const clips = makeClips(n);
      const p = planEdit({ edit: { duration: dur, player: "X" }, style: styles[id], music, clips });
      assert.ok(p.duration >= MIN_DURATION - 1e-6 && p.duration <= MAX_DURATION + 1e-6, `durée ${p.duration}`);
      // Le passage de musique tient dans le morceau.
      assert.ok(p.musicStart >= 0 && p.musicStart + p.duration <= music.duration);
      // Les plans se suivent sans trou ni chevauchement jusqu'à l'outro.
      const end = p.outro ? p.outro.start : p.duration;
      assert.ok(Math.abs(p.shots[0].start) < 1e-6);
      for (let k = 1; k < p.shots.length; k++) assert.ok(Math.abs(p.shots[k].start - p.shots[k - 1].end) < 1e-3);
      assert.ok(Math.abs(p.shots[p.shots.length - 1].end - end) < 1e-3);
      for (const s of p.shots) {
        // Chaque coupe tombe sur un beat.
        assert.ok(p.beats.some((b) => Math.abs(b - s.start) < 1e-3), `coupe hors beat à ${s.start}`);
        // Les morceaux couvrent le plan.
        let t = s.start;
        for (const piece of s.pieces) {
          assert.ok(Math.abs(piece.start - t) < 2e-3, `trou dans le plan ${s.index}`);
          t = piece.start + piece.dur;
          if (piece.kind === "video") {
            const clip = clips[s.clipIndex];
            assert.ok(piece.mediaStart >= 0, "source avant le début");
            assert.ok(piece.mediaStart + piece.rate * piece.dur <= clip.duration + 1e-3, "source après la fin");
            assert.ok(piece.rate >= 0.1 && piece.rate <= 10);
          }
        }
        assert.ok(Math.abs(t - s.end) < 2e-3, `fin du plan ${s.index}`);
        // L'impact tombe sur l'accent quand le clip le permet.
        const pre = s.pieces.find((x) => x.kind === "video" && x.start + x.dur <= s.accent + 1e-3 && Math.abs(x.start + x.dur - s.accent) < 1e-3);
        const clip = clips[s.clipIndex];
        if (pre && pre.mediaStart > 0.01) {
          const ti = Math.round(clip.impact * clip.fps) / clip.fps;
          assert.ok(Math.abs(pre.mediaStart - 0.25 / clip.fps + pre.rate * pre.dur - ti) < 2e-3, `impact décalé plan ${s.index}`);
        }
      }
      assert.ok(p.shots[p.shots.length - 1].finale);
    });
  }
}

test("pistes d'animation : aucune zone non couverte", () => {
  const tr = new Track("#x", "scale", 1);
  tr.add(1, 0.5, 1, 1.2).add(1.2, 0.5, 1.2, 1).add(3, 1, 1, 2);
  const tw = tr.tweens(5);
  let t = 0;
  for (const [, , at, dur] of tw) {
    assert.ok(Math.abs(at - t) < 2e-3, `trou à ${t}`);
    t = at + dur;
  }
  assert.ok(Math.abs(t - 5) < 2e-3);
});

test("Freesound : uniquement CC0 avec aperçu MP3, sans doublon", () => {
  const ok = (id) => ({ id, name: `s${id}`, license: "http://creativecommons.org/publicdomain/zero/1.0/", previews: { "preview-hq-mp3": `https://cdn/${id}.mp3` } });
  const nc = { id: 9, license: "Attribution NonCommercial 4.0", previews: { "preview-hq-mp3": "x" } };
  const picks = selectSounds([{ results: [ok(1), nc, ok(2)] }, { results: [ok(1), ok(3)] }], 3);
  assert.deepEqual(picks.map((s) => s.id), [1, 3, 2]); // alterne entre les recherches
});
