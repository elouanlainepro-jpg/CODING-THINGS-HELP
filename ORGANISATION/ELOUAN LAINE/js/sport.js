/* Onglet Sport : séances de la semaine, programme PPL adapté basket, Tom Holland, poids. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  ELA.pages = ELA.pages || {};
  ELA.actions = ELA.actions || {};
  ELA.submits = ELA.submits || {};
  const store = () => ELA.store;
  const st = () => ELA.store.state;

  /* courbe de poids : une série, aire légère, grille discrète, dernier point mis en avant */
  function weightChart(log) {
    if (log.length < 2) return '<p class="hint">Ajoute une deuxième pesée pour voir ta courbe.</p>';
    const W = 320, H = 120, pl = 34, pr = 12, pt = 12, pb = 22;
    const pts = log.slice(-24);
    const t0 = u.parse(pts[0].date).getTime(), t1 = u.parse(pts[pts.length - 1].date).getTime();
    const kgs = pts.map((p) => p.kg);
    let lo = Math.floor(Math.min.apply(null, kgs) - 0.5), hi = Math.ceil(Math.max.apply(null, kgs) + 0.5);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    const x = (d) => pl + (t1 === t0 ? (W - pl - pr) / 2 : ((u.parse(d).getTime() - t0) / (t1 - t0)) * (W - pl - pr));
    const y = (k) => pt + (1 - (k - lo) / (hi - lo)) * (H - pt - pb);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p.date).toFixed(1) + ' ' + y(p.kg).toFixed(1)).join(' ');
    const area = line + ' L' + x(pts[pts.length - 1].date).toFixed(1) + ' ' + (H - pb) + ' L' + x(pts[0].date).toFixed(1) + ' ' + (H - pb) + ' Z';
    const ticks = [lo, Math.round(((lo + hi) / 2) * 10) / 10, hi];
    const last = pts[pts.length - 1];
    return (
      '<div class="wchart" data-pts="' + u.esc(JSON.stringify(pts.map((p) => [p.date, p.kg, +x(p.date).toFixed(1), +y(p.kg).toFixed(1)]))) + '">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Évolution du poids, de ' + u.esc(String(pts[0].kg)) + ' à ' + u.esc(String(last.kg)) + ' kg">' +
      ticks.map((t) => '<line class="wc-grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text class="wc-tick" x="' + (pl - 6) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end">' + String(t).replace('.', ',') + '</text>').join('') +
      '<text class="wc-tick" x="' + pl + '" y="' + (H - 6) + '">' + u.esc(u.fmtDateFR(pts[0].date)) + '</text>' +
      '<text class="wc-tick" x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">' + u.esc(u.fmtDateFR(last.date)) + '</text>' +
      '<path class="wc-area" d="' + area + '"/><path class="wc-line" d="' + line + '"/>' +
      '<line class="wc-cross" x1="0" x2="0" y1="' + pt + '" y2="' + (H - pb) + '" visibility="hidden"/>' +
      '<circle class="wc-hover" r="4" cx="0" cy="0" visibility="hidden"/>' +
      '<circle class="wc-last" r="4.5" cx="' + x(last.date).toFixed(1) + '" cy="' + y(last.kg).toFixed(1) + '"/>' +
      '</svg><div class="wc-tip" hidden></div></div>'
    );
  }

  function bindChart(root) {
    const box = root.querySelector('.wchart');
    if (!box) return;
    const pts = JSON.parse(box.dataset.pts);
    const svg = box.querySelector('svg');
    const cross = svg.querySelector('.wc-cross'), dot = svg.querySelector('.wc-hover'), tip = box.querySelector('.wc-tip');
    const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * 320;
      let best = pts[0];
      pts.forEach((p) => { if (Math.abs(p[2] - vx) < Math.abs(best[2] - vx)) best = p; });
      cross.setAttribute('x1', best[2]); cross.setAttribute('x2', best[2]); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', best[2]); dot.setAttribute('cy', best[3]); dot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '<b>' + String(best[1]).replace('.', ',') + ' kg</b><span>' + u.esc(u.fmtDayShort(best[0])) + '</span>';
      const px = (best[2] / 320) * r.width;
      tip.style.left = u.clamp(px, 40, r.width - 40) + 'px';
    });
    svg.addEventListener('pointerleave', hide);
  }

  const SESS = ['push', 'pull', 'legsA', 'legsB', 'solo', 'footing', 'tomholland', 'team'];

  ELA.pages.sport = {
    render(root) {
      const date = store().ui.date;
      const monday = u.weekStart(date);
      ELA.planner.ensureWeek(monday);
      const evs = store().eventsWeek(monday).filter((e) => e.kind === 'sport');
      const real = evs.filter((e) => !e.tentative);
      const doneN = real.filter((e) => e.done).length;
      const pct = real.length ? Math.round((doneN / real.length) * 100) : 0;
      const p = st().profile;
      const log = p.weightLog.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      const first = log[0];
      const delta = first ? Math.round((p.weight - first.kg) * 10) / 10 : 0;
      const thWeek = real.filter((e) => e.sport === 'tomholland');
      const thBest = st().th.reduce((m, x) => Math.max(m, x.rounds), 0);
      const S = st().settings;

      const sessions = evs.map((e) => {
        const sp = ELA.data.sports[e.sport] || ELA.data.sports.other;
        return '<li class="srow' + (e.done ? ' is-done' : '') + (e.tentative ? ' is-tentative' : '') + '" style="--c:' + sp.color + '">' +
          '<span class="srow-day"><b>' + u.DAYS_SHORT[u.dow(e.date)] + '</b>' + u.parse(e.date).getDate() + '</span>' +
          '<span class="srow-ic">' + u.icon(sp.icon) + '</span>' +
          '<button type="button" class="srow-main" data-act="open-ev" data-id="' + u.esc(e.id) + '"><b>' + u.esc(e.title) + '</b><small>' + u.hm(e.start) + ' – ' + u.hm(e.end) + (e.location ? ' · ' + u.esc(e.location) : '') + '</small></button>' +
          (e.tentative && e.optKey
            ? '<span class="srow-ask"><button type="button" class="btn btn-sm btn-primary" data-act="opt" data-key="' + u.esc(e.optKey) + '" data-v="yes">Oui</button><button type="button" class="btn btn-sm btn-ghost" data-act="opt" data-key="' + u.esc(e.optKey) + '" data-v="no">Non</button></span>'
            : '<button type="button" class="tcheck" data-act="ev-done" data-id="' + u.esc(e.id) + '" aria-pressed="' + !!e.done + '" aria-label="' + (e.done ? 'Marquer non faite' : 'Marquer faite') + '">' + u.icon('check') + '</button>') +
          '</li>';
      }).join('');

      const progs = SESS.filter((k) => ELA.data.programs[k].items.length).map((k) => {
        const pr = ELA.data.programs[k];
        return '<details class="prog"' + (k === 'legsB' ? ' open' : '') + '><summary><span class="prog-name">' + u.esc(pr.title) + '</span><span class="prog-focus">' + u.esc(pr.focus) + '</span>' + u.icon('down', 'prog-chev') + '</summary>' +
          '<table class="prog-table"><thead><tr><th scope="col">Exercice</th><th scope="col">Séries × reps</th><th scope="col">Repos</th></tr></thead><tbody>' +
          pr.items.map((it) => '<tr><td>' + u.esc(it[0]) + '</td><td>' + u.esc(it[1]) + '</td><td>' + u.esc(it[2] || '—') + '</td></tr>').join('') +
          '</tbody></table><p class="hint">' + u.esc(pr.note) + '</p></details>';
      }).join('');

      const trainings = S.trainings.map((t) => u.DAYS_LONG[t.day] + ' ' + u.hmShort(t.start) + '–' + u.hmShort(t.end) + (t.optional ? ' (parfois)' : '')).join(', ');

      root.innerHTML =
        '<section class="page sport">' +
        '<div class="hero hero-sport"><img src="' + ELA.data.images.antman.src + '" alt="' + u.esc(ELA.data.images.antman.alt) + '">' +
        '<div class="hero-txt"><p class="eyebrow">Semaine ' + u.isoWeek(date) + ' · ' + u.esc(u.fmtWeekRange(monday)) + '</p><h2 class="h-hero">Sport</h2>' +
        '<p class="hero-num"><b>' + doneN + '</b>/' + real.length + ' séances faites</p>' +
        '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Séances faites"><span style="width:' + pct + '%"></span></div>' +
        '<div class="hero-nav"><button type="button" class="iconbtn" data-act="sport-week" data-d="-7" aria-label="Semaine précédente">' + u.icon('left') + '</button>' +
        '<button type="button" class="iconbtn" data-act="sport-week" data-d="7" aria-label="Semaine suivante">' + u.icon('right') + '</button></div></div></div>' +
        '<div class="sport-grid">' +
        '<section class="card card-week"><header class="card-head"><h3 class="h-sub">Séances de la semaine</h3><button type="button" class="btn btn-ghost btn-sm" data-act="replan">' + u.icon('wand') + 'Réadapter</button></header>' +
        (sessions ? '<ul class="slist">' + sessions + '</ul>' : '<p class="muted">Aucune séance. Touche « Réadapter » pour générer la semaine.</p>') + '</section>' +
        '<section class="card card-prog"><header class="card-head"><h3 class="h-sub">Programme</h3><span class="muted small">Push · Pull · Legs ×2, adapté au basket</span></header>' + progs + '</section>' +
        '<section class="card card-th"><header class="card-head"><h3 class="h-sub">Tom Holland challenge</h3><span class="pill">' + thWeek.filter((e) => e.done).length + '/' + S.tomholland.perWeek + ' cette semaine</span></header>' +
        '<p class="th-formula"><b>5</b> tractions <b>10</b> pompes <b>15</b> squats</p><p class="muted small">Un maximum de tours en 20 min. Record : <b>' + (thBest ? thBest + ' tours' : '—') + '</b></p>' +
        '<form id="thf" class="inline-form" novalidate><label for="th-date" class="sr">Date</label><input type="date" id="th-date" name="date" value="' + u.today() + '">' +
        '<label for="th-rounds" class="sr">Tours</label><input type="number" id="th-rounds" name="rounds" min="1" max="60" inputmode="numeric" placeholder="Tours">' +
        '<button type="submit" class="btn btn-primary btn-sm">Noter</button></form>' +
        (st().th.length ? '<ul class="loglist">' + st().th.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6).map((x) =>
          '<li><span>' + u.esc(u.fmtDayShort(x.date)) + '</span><b>' + x.rounds + ' tours</b><button type="button" class="iconbtn sm" data-act="th-del" data-id="' + u.esc(x.id) + '" aria-label="Supprimer">' + u.icon('x') + '</button></li>').join('') + '</ul>' : '') +
        '</section>' +
        '<section class="card card-weight"><header class="card-head"><h3 class="h-sub">Poids</h3><button type="button" class="btn btn-ghost btn-sm" data-act="weight">' + u.icon('edit') + 'Pesée</button></header>' +
        '<p class="big-num">' + String(p.weight).replace('.', ',') + '<small> kg</small></p>' +
        (log.length > 1 ? '<p class="muted small">' + (delta > 0 ? '+' : '') + String(delta).replace('.', ',') + ' kg depuis le ' + u.esc(u.fmtDateFR(first.date)) + '</p>' : '') +
        weightChart(log) +
        '<details class="wlog"><summary>Toutes les pesées (' + log.length + ')</summary><ul class="loglist">' + log.slice().reverse().map((w) =>
          '<li><span>' + u.esc(u.fmtDayShort(w.date)) + '</span><b>' + String(w.kg).replace('.', ',') + ' kg</b>' + (log.length > 1 ? '<button type="button" class="iconbtn sm" data-act="w-del" data-date="' + w.date + '" aria-label="Supprimer">' + u.icon('x') + '</button>' : '') + '</li>').join('') + '</ul></details>' +
        '</section>' +
        '<section class="card card-logic"><header class="card-head"><h3 class="h-sub">Comment ta semaine est calée</h3></header><ul class="logic">' +
        '<li><b>Basket univ :</b> ' + u.esc(trainings) + '. Le jeudi reste « à confirmer » tant que tu n’as pas répondu.</li>' +
        '<li><b>Salle le soir</b> les jours sans entraînement (sinon l’après-midi si un créneau se libère).</li>' +
        '<li><b>Legs ×2</b> jamais le même jour qu’un entraînement, et le moins possible la veille. Legs A = force et prévention, Legs B = détente et appuis.</li>' +
        '<li><b>Basket solo</b> le matin (' + u.hmShort(S.solo.start) + ' en semaine, ' + u.hmShort(S.solo.weekendStart) + ' le week-end), au moins 45 min avant le premier cours, loin des jours de legs.</li>' +
        '<li><b>Footing 1 h</b> en zone 2, de préférence le week-end matin.</li>' +
        '<li><b>Tom Holland ×2</b> les jours sans push ni pull.</li></ul>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="goto-settings" data-anchor="set-sport">' + u.icon('sliders') + 'Régler le sport</button></section>' +
        '</div></section>';
      bindChart(root);
    },
  };

  ELA.submits.thf = function (form) {
    const r = parseInt(form.elements.rounds.value, 10);
    const d = form.elements.date.value || u.today();
    if (!(r > 0 && r < 100)) { ELA.ui.toast('Entre ton nombre de tours'); form.elements.rounds.focus(); return; }
    const prevBest = st().th.reduce((m, x) => Math.max(m, x.rounds), 0);
    store().commit((x) => {
      x.th.push({ id: u.uid('th'), date: d, rounds: r });
      const ev = x.events.find((e) => e.kind === 'sport' && e.sport === 'tomholland' && e.date === d);
      if (ev) ev.done = true;
    }, { undo: 'Tom Holland' });
    ELA.ui.undoToast(r > prevBest && prevBest ? 'Nouveau record : ' + r + ' tours !' : r + ' tours notés');
  };
  ELA.actions['th-del'] = (el) => {
    store().commit((x) => { x.th = x.th.filter((t) => t.id !== el.dataset.id); }, { undo: 'Suppression' });
    ELA.ui.undoToast('Supprimé');
  };
  ELA.actions['w-del'] = (el) => {
    store().commit((x) => {
      x.profile.weightLog = x.profile.weightLog.filter((w) => w.date !== el.dataset.date);
      const log = x.profile.weightLog.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      if (log.length) x.profile.weight = log[log.length - 1].kg;
    }, { undo: 'Suppression de pesée' });
    ELA.ui.undoToast('Pesée supprimée');
  };
  ELA.actions['ev-done'] = (el) => {
    const id = el.dataset.id;
    let now = false;
    store().commit((x) => {
      const e = x.events.find((z) => z.id === id);
      if (!e) return;
      e.done = !e.done || undefined;
      now = !!e.done;
      if (e.taskId) { const t = x.tasks.find((z) => z.id === e.taskId); if (t) { t.done = now; t.doneAt = now ? Date.now() : 0; } }
    }, { undo: 'Séance' });
    if (now) ELA.ui.undoToast('Séance validée');
  };
  ELA.actions['sport-week'] = (el) => {
    store().ui.date = u.addDays(store().ui.date, +el.dataset.d);
    store().saveUi();
    ELA.app.render();
  };
  ELA.actions['open-ev'] = (el) => ELA.editor.openEvent(el.dataset.id);
})();
