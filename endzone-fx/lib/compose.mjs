// Génère la composition HyperFrames (index.html) à partir d'un plan d'edit.
// Toutes les animations sont pré-calculées ici puis rejouées par une timeline GSAP en pause :
// pour chaque propriété animée, les tweens couvrent toute la durée sans trou, ce qui rend
// le rendu identique quel que soit l'ordre dans lequel HyperFrames demande les images.

const r3 = (x) => Math.round(x * 1000) / 1000;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GRADES = {
  none: "none",
  cold: "contrast(1.12) saturate(0.75) brightness(0.9)",
  punchy: "contrast(1.2) saturate(1.28) brightness(1.03)",
  mono: "grayscale(1) contrast(1.32) brightness(0.92)",
  freeze: "grayscale(0.55) contrast(1.38) brightness(1.06)",
};
const TINT = { cold: 0.45 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Une propriété animée sur un élément, sur la plage [t0, t1].
export class Track {
  constructor(sel, prop, rest, t0 = 0, t1 = null) {
    Object.assign(this, { sel, prop, rest, t0, t1, segs: [] });
  }
  add(at, dur, from, to, ease = "none") {
    if (dur > 0.0005) this.segs.push({ at, dur, from, to, ease });
    return this;
  }
  hold(at, dur, v) {
    return this.add(at, dur, v, v);
  }
  tweens(end) {
    const t1 = this.t1 ?? end;
    const segs = [...this.segs].sort((a, b) => a.at - b.at);
    const out = [];
    let t = this.t0;
    for (const s0 of segs) {
      const s = { ...s0 };
      if (s.at < this.t0) {
        s.dur -= this.t0 - s.at;
        s.at = this.t0;
      }
      if (s.at + s.dur > t1) s.dur = t1 - s.at;
      if (s.dur <= 0.0005) continue;
      const prev = out[out.length - 1];
      if (prev && prev.at + prev.dur > s.at + 1e-6) {
        prev.dur = s.at - prev.at; // le segment suivant coupe le précédent
        if (prev.dur <= 0.0005) out.pop();
      }
      if (s.at > t + 1e-6) out.push({ at: t, dur: s.at - t, from: this.rest, to: this.rest, ease: "none" });
      out.push(s);
      t = s.at + s.dur;
    }
    if (t < t1 - 1e-6) out.push({ at: t, dur: t1 - t, from: this.rest, to: this.rest, ease: "none" });
    return out.map((s) => [this.sel, this.prop, r3(s.at), r3(Math.max(s.dur, 0.001)), s.from, s.to, s.ease]);
  }
}

function fontSizeFor(text, W, minDim, base, perChar = 0.47, fill = 0.9) {
  const n = Math.max(1, String(text).length);
  return Math.round(Math.min(base * minDim, (fill * W) / (n * perChar)));
}

// graphicsOnly : uniquement titres, logo, outro, flashs et vignette sur fond transparent
// (calque à poser au-dessus des clips dans DaVinci).
export function compose({ plan, brand, format, assets, seed = 1, debugTiming = false, graphicsOnly = false }) {
  const W = format.width;
  const H = format.height;
  const D = plan.duration;
  const minDim = Math.min(W, H);
  const rnd = mulberry32(seed);
  const tracks = [];
  const T = (sel, prop, rest, t0, t1) => {
    const tr = new Track(sel, prop, rest, t0, t1);
    tracks.push(tr);
    return tr;
  };
  const C = brand.colors;

  // ---------- Image : plans vidéo, freeze, effets caméra ----------
  const grade = T("#grade", "filter", GRADES.none);
  const tint = T("#tint", "opacity", 0);
  const rgb = T("#rgb", "filter", "none");
  const rgbR = T("#rgbR", "attr:dx", 0);
  const rgbB = T("#rgbB", "attr:dx", 0);
  const blur = T("#blur", "filter", "blur(0px)");
  const zoom = T("#zoom", "scale", 1);
  const whip = T("#zoom", "xPercent", 0);
  const shakeX = T("#shake", "x", 0);
  const shakeY = T("#shake", "y", 0);
  const flash = T("#flash", "opacity", 0);
  const dim = T("#dim", "opacity", 0);

  const media = [];
  for (const s of plan.shots) {
    const fx = debugTiming ? { flash: 0, shake: 0, punch: 0, rgb: false, enter: "none", grade: "none" } : s.fx;
    const src = assets.clips[s.clipIndex];
    s.pieces.forEach((p, j) => {
      if (graphicsOnly) return;
      const style = `object-position:${r3(s.focus * 100)}% 50%`;
      if (p.kind === "video") {
        media.push(
          `<video id="v${s.index}-${j}" class="clip shot" src="${esc(src)}" muted playsinline data-start="${p.start}" data-duration="${p.dur}" data-media-start="${p.mediaStart}" data-playback-rate="${p.rate}" data-track-index="0" style="${style}"></video>`,
        );
      } else {
        const img = assets.freezes[`${s.index}-${j}`];
        media.push(`<img id="f${s.index}-${j}" class="clip shot" src="${esc(img)}" alt="" data-start="${p.start}" data-duration="${p.dur}" data-track-index="0" style="${style}" />`);
      }
    });

    const span = s.end - s.start;
    grade.hold(s.start, span, GRADES[fx.grade] || GRADES.none);
    if (TINT[fx.grade] && !graphicsOnly) tint.hold(s.start, span, TINT[fx.grade]);
    const lead = s.accent - s.start;
    // Entrée du plan.
    if (!s.continuing && (s.index > 0 || fx.enter === "fade")) {
      const d = lead > 0.04 ? Math.min(0.16, lead) : 0.16;
      if (fx.enter === "zoomblur") {
        zoom.add(s.start, d, 1.22, 1, "power3.out");
        blur.add(s.start, d, "blur(14px)", "blur(0px)", "power2.out");
      } else if (fx.enter === "whip") {
        whip.add(s.start, 0.14, s.index % 2 ? 22 : -22, 0, "power3.out");
        blur.add(s.start, 0.14, "blur(18px)", "blur(0px)", "power2.out");
      } else if (fx.enter === "fade") {
        dim.add(s.start, Math.min(0.35, span / 3), 1, 0, "power1.out");
      }
    }
    // Choc : flash, zoom « punch », secousse, séparation RVB.
    const after = s.end - s.accent;
    if (fx.punch > 0 && after > 0.08) {
      zoom.add(s.accent, 0.06, 1, 1 + fx.punch, "power2.out");
      zoom.add(s.accent + 0.06, after - 0.06, 1 + fx.punch, 1 + fx.punch * 0.35, "power2.out");
    } else if (lead > 0.2 && fx.punch > 0) {
      zoom.add(s.start, span, 1, 1 + fx.punch, "none"); // lente poussée (intro)
    }
    if (fx.flash > 0) flash.add(s.accent, Math.min(0.22, after || 0.22), fx.flash, 0, "power2.out");
    if (fx.shake > 0) {
      const n = 10;
      const step = 0.032;
      let px = 0;
      let py = 0;
      for (let i = 0; i < n; i++) {
        const decay = 1 - i / n;
        const nx = i === n - 1 ? 0 : (rnd() * 2 - 1) * fx.shake * decay;
        const ny = i === n - 1 ? 0 : (rnd() * 2 - 1) * fx.shake * decay * 0.7;
        shakeX.add(s.accent + i * step, step, px, r3(nx));
        shakeY.add(s.accent + i * step, step, py, r3(ny));
        px = r3(nx);
        py = r3(ny);
      }
    }
    if (fx.rgb) {
      rgb.hold(s.accent, 0.14, "url(#rgbsplit)");
      rgbR.add(s.accent, 0.14, 28, 0, "power2.out");
      rgbB.add(s.accent, 0.14, -28, 0, "power2.out");
    }
    if (s.freeze && !debugTiming) {
      const fl = s.freeze.end - s.freeze.start;
      grade.hold(s.freeze.start, fl, GRADES.freeze);
      tint.hold(s.freeze.start, fl, 0);
      flash.add(s.freeze.start, 0.28, 0.95, 0, "power2.out");
      zoom.add(s.freeze.start, 0.06, 1, 1.1, "power2.out");
      zoom.add(s.freeze.start + 0.06, s.end - s.freeze.start - 0.06, 1.1, 1.2, "power1.inOut");
    }
  }

  // Grain : la texture bouge toutes les 2 images (déterministe).
  const grain = T("#grain", "backgroundPosition", "0px 0px");
  if (!debugTiming && !graphicsOnly) for (let t = 0; t < D; t += 1 / 30) grain.hold(t, 1 / 30, `${Math.floor(rnd() * 512)}px ${Math.floor(rnd() * 512)}px`);

  // ---------- Textes ----------
  const texts = [];
  plan.texts.forEach((tx, i) => {
    const id = `t${i}`;
    const t0 = tx.start;
    const t1 = Math.min(tx.end, plan.outro ? plan.outro.start : D);
    const dur = t1 - t0;
    if (dur < 0.2) return;
    const outAt = t1 - Math.min(0.14, dur * 0.2);
    const head = `<div id="${id}" class="clip txt" data-start="${r3(t0)}" data-duration="${r3(dur)}" data-track-index="3">`;
    if (tx.kind === "title" || tx.kind === "stamp") {
      const stamp = tx.kind === "stamp";
      const pSize = fontSizeFor(tx.player, W, minDim, stamp ? 0.13 : 0.15);
      const rSize = fontSizeFor(tx.title, W, minDim, stamp ? 0.07 : 0.058, 0.62, 0.78);
      const top = stamp ? format.lineY - 0.1 : format.titleY;
      texts.push(
        `${head}<div class="title-block" style="top:${r3(top * 100)}%">` +
          (tx.player ? `<div id="${id}p" class="player" style="font-size:${pSize}px">${esc(tx.player)}</div>` : "") +
          `<div id="${id}r" class="ribbon" style="font-size:${rSize}px"><span>${esc(tx.title)}</span></div></div></div>`,
      );
      if (tx.player) {
        const sc = T(`#${id}p`, "scale", 1, t0, t1).add(t0, 0.03, 2.2, 2.2).add(t0 + 0.03, 0.18, 2.2, 1, "power4.out");
        const op = T(`#${id}p`, "opacity", 1, t0, t1).add(t0, 0.03, 0, 0).add(t0 + 0.03, 0.12, 0, 1, "power2.out");
        sc.add(outAt, t1 - outAt, 1, 1.12, "power2.in");
        op.add(outAt, t1 - outAt, 1, 0, "power2.in");
      }
      const rd = t0 + (tx.player ? 0.2 : 0.03);
      if (stamp) {
        T(`#${id}r`, "scale", 1, t0, t1).add(t0, rd - t0, 1.7, 1.7).add(rd, 0.16, 1.7, 1, "power4.out");
        T(`#${id}r`, "rotation", -3, t0, t1).add(t0, rd - t0, -9, -9).add(rd, 0.16, -9, -3, "power3.out");
      } else {
        T(`#${id}r`, "xPercent", 0, t0, t1).add(t0, rd - t0, -130, -130).add(rd, 0.26, -130, 0, "power3.out");
      }
      T(`#${id}r`, "opacity", 1, t0, t1).add(t0, rd - t0, 0, 0).add(rd, 0.1, 0, 1).add(outAt, t1 - outAt, 1, 0, "power2.in");
    } else if (tx.kind === "line") {
      const words = tx.text.split(/\s+/).filter(Boolean);
      const size = Math.round(0.062 * minDim);
      texts.push(
        `${head}<div class="line-block" style="top:${r3(format.lineY * 100)}%;font-size:${size}px">` +
          words.map((w, k) => `<span id="${id}w${k}" class="w">${esc(w)}</span>`).join(" ") +
          `</div></div>`,
      );
      words.forEach((_, k) => {
        const at = t0 + 0.12 + k * 0.07;
        T(`#${id}w${k}`, "y", 0, t0, t1).add(t0, at - t0, 50, 50).add(at, 0.35, 50, 0, "power3.out");
        T(`#${id}w${k}`, "opacity", 1, t0, t1).add(t0, at - t0, 0, 0).add(at, 0.25, 0, 1).add(outAt, t1 - outAt, 1, 0);
      });
    } else if (tx.kind === "label") {
      const size = Math.round(0.04 * minDim);
      texts.push(`${head}<div class="label-block" style="top:${r3((format.lineY + 0.06) * 100)}%"><div id="${id}l" class="label" style="font-size:${size}px">${esc(tx.text)}</div></div></div>`);
      T(`#${id}l`, "x", 0, t0, t1).add(t0, 0.25, -40, 0, "power3.out");
      T(`#${id}l`, "opacity", 1, t0, t1).add(t0, 0.2, 0, 1).add(outAt, t1 - outAt, 1, 0);
    }
  });

  // ---------- Filigrane et outro ----------
  const wmEnd = plan.outro ? plan.outro.start : D;
  const wmSize = Math.round(format.watermark.size * W);
  const watermark = `<img id="wm" class="clip" src="${esc(assets.badge)}" alt="" data-start="0" data-duration="${r3(wmEnd)}" data-track-index="4" style="width:${wmSize}px;height:${wmSize}px;top:${r3(format.safe.top * 100 - 2)}%;right:4%" />`;
  let outro = "";
  if (plan.outro) {
    const o0 = plan.outro.start;
    const o1 = D;
    const bSize = Math.round(0.44 * minDim);
    outro =
      `<div id="outro" class="clip" data-start="${r3(o0)}" data-duration="${r3(o1 - o0)}" data-track-index="5">` +
      `<div class="outro-bg"></div><div class="outro-col">` +
      `<img id="ob" class="outro-badge" src="${esc(assets.badge)}" alt="" style="width:${bSize}px;height:${bSize}px" />` +
      `<div id="on" class="outro-name" style="font-size:${Math.round(0.12 * minDim)}px">${esc(brand.outro.line1)}</div>` +
      `<div id="of" class="ribbon" style="font-size:${Math.round(0.05 * minDim)}px"><span>${esc(brand.outro.line2)}</span></div>` +
      `</div></div>`;
    T("#ob", "scale", 1, o0, o1).add(o0, 0.45, 0.25, 1, "back.out(1.8)");
    T("#ob", "rotation", 0, o0, o1).add(o0, 0.45, -25, 0, "power3.out");
    T("#on", "y", 0, o0, o1).add(o0, 0.12, 60, 60).add(o0 + 0.12, 0.35, 60, 0, "power3.out");
    T("#on", "opacity", 1, o0, o1).add(o0, 0.12, 0, 0).add(o0 + 0.12, 0.25, 0, 1);
    T("#of", "opacity", 1, o0, o1).add(o0, 0.3, 0, 0).add(o0 + 0.3, 0.2, 0, 1);
    T("#of", "scale", 1, o0, o1).add(o0, 0.3, 1.4, 1.4).add(o0 + 0.3, 0.2, 1.4, 1, "power3.out");
  }

  // ---------- Son ----------
  const fadeStart = Math.max(0, D - 1.0);
  const lane = { version: 1, lanes: [{ target: "volume", points: [{ t: 0, v: 0 }, { t: 0.03, v: 1 }, { t: r3(fadeStart), v: 1 }, { t: r3(D), v: 0 }] }] };
  const audio = graphicsOnly ? [] : [
    `<audio id="music" src="${esc(assets.music)}" data-start="0" data-duration="${r3(D)}" data-media-start="${plan.musicStart}" data-volume="1" data-track-index="10" data-automation='${JSON.stringify(lane)}'></audio>`,
  ];
  // Chaque bruitage va sur la première piste libre à son instant (pas de sons empilés sur une piste).
  const laneEnds = [];
  [...(graphicsOnly ? [] : assets.sfx || [])].sort((a, b) => a.start - b.start).forEach((x, i) => {
    let lane = laneEnds.findIndex((end) => end <= x.start + 1e-3);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = x.start + x.dur;
    audio.push(
      `<audio id="sfx${i}" src="${esc(x.src)}" data-start="${r3(x.start)}" data-duration="${r3(x.dur)}" data-media-start="${r3(x.mediaStart || 0)}" data-volume="${x.vol}" data-track-index="${11 + lane}"></audio>`,
    );
  });

  const tweens = tracks.flatMap((tr) => tr.tweens(D));
  const fonts = brand.fonts;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(brand.name)} — ${esc(plan.style)}</title>
    <script src="${esc(assets.gsap)}"></script>
    <style>
      @font-face { font-family: "${fonts.display.family}"; src: url("${esc(assets.fonts.display)}") format("woff2"); font-weight: ${fonts.display.weight}; }
      @font-face { font-family: "${fonts.text.family}"; src: url("${esc(assets.fonts.text)}") format("woff2"); font-weight: ${fonts.text.weight}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${graphicsOnly ? "transparent" : C.black}; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${graphicsOnly ? "transparent" : C.black}; }
      .layer { position: absolute; inset: 0; }
      .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #tint { background: ${C.navy}; mix-blend-mode: soft-light; opacity: 0; }
      #vignette { background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%); }
      #grain { background-image: url("${esc(assets.grain)}"); background-size: 512px 512px; mix-blend-mode: overlay; opacity: ${debugTiming || graphicsOnly ? 0 : 0.1}; }
      #dim { background: #000; opacity: 0; }
      #flash { background: #fff; opacity: 0; }
      .txt { position: absolute; inset: 0; }
      .title-block, .line-block, .label-block { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: ${Math.round(0.018 * minDim)}px; text-align: center; }
      .player { display: block; font-family: "${fonts.display.family}"; color: ${C.cream}; line-height: 1; letter-spacing: 0.02em; text-shadow: 0 ${Math.round(0.008 * minDim)}px 0 ${C.redDark}, 0 0 ${Math.round(0.05 * minDim)}px rgba(0,0,0,0.7); white-space: nowrap; }
      .ribbon { display: block; position: relative; font-family: "${fonts.text.family}"; font-weight: 700; color: ${C.cream}; background: ${C.red}; padding: 0.18em 0.9em 0.22em; letter-spacing: 0.08em; line-height: 1.1; outline: ${Math.max(3, Math.round(0.004 * minDim))}px solid ${C.cream}; outline-offset: -${Math.round(0.012 * minDim)}px; box-shadow: 0 0 ${Math.round(0.04 * minDim)}px rgba(0,0,0,0.6); white-space: nowrap; }
      .line-block { display: block; padding: 0 6%; font-family: "${fonts.text.family}"; font-weight: 700; color: ${C.cream}; line-height: 1.15; letter-spacing: 0.04em; text-shadow: 0 3px 0 ${C.navy}, 0 0 30px rgba(0,0,0,0.8); }
      .w { display: inline-block; }
      .label { display: block; font-family: "${fonts.text.family}"; font-weight: 700; color: ${C.cream}; background: rgba(26,39,69,0.82); padding: 0.25em 0.8em; letter-spacing: 0.06em; border-left: 0.35em solid ${C.red}; }
      #wm { position: absolute; opacity: 0.92; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6)); }
      #outro { position: absolute; inset: 0; }
      .outro-bg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, #24365f 0%, ${C.navy} 45%, ${C.black} 100%); }
      .outro-col { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${Math.round(0.03 * minDim)}px; }
      .outro-badge { display: block; filter: drop-shadow(0 10px 30px rgba(0,0,0,0.6)); }
      .outro-name { display: block; font-family: "${fonts.display.family}"; color: ${C.cream}; letter-spacing: 0.04em; line-height: 1; }
    </style>
  </head>
  <body>
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <filter id="rgbsplit" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
        <feOffset id="rgbR" in="r" dx="0" dy="0" result="r2" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
        <feOffset id="rgbB" in="b" dx="0" dy="0" result="b2" />
        <feBlend in="r2" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b2" mode="screen" />
      </filter>
    </svg>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${r3(D)}" data-width="${W}" data-height="${H}" data-fps="${format.fps}">
      <div id="grade" class="layer"><div id="rgb" class="layer"><div id="blur" class="layer"><div id="zoom" class="layer"><div id="shake" class="layer">
        ${media.join("\n        ")}
      </div></div></div></div></div>
      <div id="tint" class="layer"></div>
      ${graphicsOnly ? "" : '<div id="vignette" class="layer"></div>'}
      <div id="grain" class="layer"></div>
      <div id="dim" class="layer"></div>
      <div id="flash" class="layer"></div>
      ${texts.join("\n      ")}
      ${watermark}
      ${outro}
      ${audio.join("\n      ")}
    </div>
    <script>
      const TW = ${JSON.stringify(tweens)};
      const tl = gsap.timeline({ paused: true });
      for (const [sel, prop, at, dur, from, to, ease] of TW) {
        const key = prop.startsWith("attr:") ? prop.slice(5) : null;
        const f = key ? { attr: { [key]: from } } : { [prop]: from };
        const t = key ? { attr: { [key]: to } } : { [prop]: to };
        tl.fromTo(sel, f, Object.assign(t, { duration: dur, ease, immediateRender: false }), at);
      }
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
