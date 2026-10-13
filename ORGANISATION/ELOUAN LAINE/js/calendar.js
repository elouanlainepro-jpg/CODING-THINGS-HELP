/* Planning : vues Jour / Semaine / Mois, placement des matières, glisser-déposer. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  const C = (ELA.cal = { placing: null, suppress: 0, needScroll: true });

  const store = () => ELA.store;
  const st = () => ELA.store.state;
  const ui = () => ELA.store.ui;
  const GRID_BG = '#111015';

  C.isMobile = () => window.matchMedia('(max-width: 819px)').matches;
  C.view = () => ui().view || (C.isMobile() ? 'day' : 'week');
  C.dayStart = () => Math.floor(st().settings.wake / 60) * 60;
  C.hourH = (mode) => (mode === 'day' ? 64 : C.isMobile() ? 46 : 50);

  /* ---------- Couleurs & libellés ---------- */
  C.colorOf = function (e) {
    if (e.color) return e.color;
    if ((e.kind === 'course' || e.kind === 'study' || e.kind === 'task') && e.subjectId) {
      const s = store().subject(e.subjectId);
      if (s) return s.color;
    }
    if (e.kind === 'sport') return (ELA.data.sports[e.sport] || ELA.data.sports.other).color;
    return (ELA.data.kinds[e.kind] || ELA.data.kinds.event).color;
  };
  const ALPHA = { course: 0.3, study: 0.16, sport: 0.24, routine: 0.12, rdv: 0.26, event: 0.24, task: 0.14 };
  C.paint = function (e) {
    const c = C.colorOf(e);
    let a = ALPHA[e.kind] || 0.22;
    if (e.kind === 'sport' && /^(push|pull|legsA|legsB)$/.test(e.sport)) a = 0.13;
    return { c: c, bg: u.over(c, GRID_BG, a), bd: u.rgba(c, e.kind === 'routine' ? 0.22 : 0.6) };
  };
  C.iconOf = function (e) {
    if (e.kind === 'sport') return (ELA.data.sports[e.sport] || ELA.data.sports.other).icon;
    if (e.kind === 'routine') return (ELA.data.routines[e.routine] || ELA.data.routines.other).icon;
    return (ELA.data.kinds[e.kind] || ELA.data.kinds.event).icon;
  };
  C.tagOf = function (e) {
    if (e.kind === 'course') return e.courseType || 'Cours';
    if (e.kind === 'study') return 'Révision';
    if (e.kind === 'task') return 'Tâche';
    if (e.kind === 'rdv') return 'RDV';
    if (e.kind === 'sport' && e.tentative) return 'À confirmer';
    return '';
  };
  C.titleOf = function (e) {
    if (e.kind === 'study' && !e.title) {
      const s = store().subject(e.subjectId);
      return s ? s.name : 'Révision';
    }
    return e.title || (ELA.data.kinds[e.kind] || {}).label || 'Sans titre';
  };
  C.shortTitle = function (e) {
    if ((e.kind === 'course' || e.kind === 'study') && e.subjectId) {
      const s = store().subject(e.subjectId);
      if (s) return s.short;
    }
    if (e.kind === 'sport') return (ELA.data.sports[e.sport] || ELA.data.sports.other).label;
    return C.titleOf(e);
  };

  /* ---------- Chevauchements ---------- */
  C.layout = function (evs) {
    const items = evs.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    const res = {};
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const cols = [];
      cluster.forEach((e) => {
        let k = cols.findIndex((end) => end <= e.start);
        if (k < 0) { k = cols.length; cols.push(e.end); } else cols[k] = e.end;
        res[e.id] = { col: k, cols: 1 };
      });
      cluster.forEach((e) => { res[e.id].cols = cols.length; });
      cluster = [];
    };
    items.forEach((e) => {
      if (cluster.length && e.start >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, e.end);
    });
    if (cluster.length) flush();
    return res;
  };

  /* ---------- Blocs ---------- */
  C.blockHTML = function (e, pos, startMin, hh, mode) {
    const p = C.paint(e);
    const s = Math.max(e.start, startMin);
    const top = ((s - startMin) / 60) * hh;
    const h = Math.max(((e.end - s) / 60) * hh - 2, 13);
    const cols = pos ? pos.cols : 1, col = pos ? pos.col : 0;
    const w = 100 / cols, l = col * w;
    const size = h < 24 ? 'is-tiny' : h < 46 ? 'is-short' : '';
    const cls = ['ev', 'ev-' + e.kind, size, e.done ? 'is-done' : '', e.tentative ? 'is-tentative' : '', e.auto ? 'is-auto' : ''].join(' ');
    const tag = C.tagOf(e);
    const title = mode === 'week' && (cols > 1 || C.isMobile()) ? C.shortTitle(e) : C.titleOf(e);
    const time = u.hm(e.start) + (size === 'is-tiny' ? '' : ' – ' + u.hm(e.end));
    const doneMark = e.done ? u.icon('check', 'ev-done') : '';
    let meta = '';
    if (!size) {
      const bits = [];
      if (e.location) bits.push(e.location);
      if (mode === 'day') {
        if (e.teacher) bits.push(e.teacher);
        if (e.kind === 'sport' && ELA.data.programs[e.sport]) bits.push(ELA.data.programs[e.sport].focus);
        if (e.kind === 'study' && e.notes) bits.push(e.notes);
      }
      if (bits.length) meta = '<p class="ev-meta">' + u.esc(bits.join(' · ')) + '</p>';
    }
    const inner =
      size === 'is-tiny' || size === 'is-short'
        ? '<p class="ev-line">' + doneMark + '<span class="ev-time">' + time + '</span> <span class="ev-title">' + u.esc(title) + '</span>' +
          (tag && size === 'is-short' && mode === 'day' ? ' <span class="ev-tag">' + u.esc(tag) + '</span>' : '') + '</p>'
        : '<p class="ev-time">' + u.icon(C.iconOf(e), 'ev-ic') + time + (tag ? ' <span class="ev-tag">' + u.esc(tag) + '</span>' : '') + '</p>' +
          '<p class="ev-title">' + doneMark + u.esc(title) + '</p>' + meta;
    return (
      '<div class="' + cls + '" data-id="' + u.esc(e.id) + '" tabindex="0" role="button" aria-label="' +
      u.esc(title + ', ' + u.hm(e.start) + ' à ' + u.hm(e.end)) + '" style="--c:' + p.c + ';--bg:' + p.bg + ';--bd:' + p.bd +
      ';top:' + top.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;left:calc(' + l.toFixed(3) + '% + 2px);width:calc(' + w.toFixed(3) + '% - 4px)">' +
      inner + (e.kind !== 'routine' || mode === 'day' ? '<span class="ev-resize" data-resize aria-hidden="true"></span>' : '') + '</div>'
    );
  };

  /* ---------- Grille (semaine ou jour) ---------- */
  C.gridHTML = function (dates, mode) {
    const startMin = C.dayStart(), endMin = 1440, hh = C.hourH(mode);
    const H = ((endMin - startMin) / 60) * hh;
    const today = u.today(), now = u.nowMin();
    const S = st().settings;

    const head =
      mode === 'week'
        ? '<div class="wk-head"><div class="wk-gutter"></div>' +
          dates.map((d) => {
            const dw = u.dow(d);
            return '<button type="button" class="wk-day' + (d === today ? ' is-today' : '') + (dw >= 5 ? ' is-we' : '') +
              '" data-act="goday" data-date="' + d + '"><span>' + u.DAYS_SHORT[dw] + '</span><b>' + u.parse(d).getDate() + '</b></button>';
          }).join('') + '</div>'
        : '';

    const allDay = dates.map((d) => store().eventsOn(d).filter((e) => e.allDay));
    const adRow = allDay.some((a) => a.length)
      ? '<div class="wk-allday"><div class="wk-gutter">Journée</div>' +
        allDay.map((list) =>
          '<div class="wk-adcell">' + list.map((e) => {
            const p = C.paint(e);
            return '<button type="button" class="ev-allday" data-id="' + u.esc(e.id) + '" style="--c:' + p.c + ';--bg:' + p.bg + ';--bd:' + p.bd + '">' + u.esc(C.titleOf(e)) + '</button>';
          }).join('') + '</div>'
        ).join('') + '</div>'
      : '';

    let times = '';
    for (let m = startMin; m < endMin; m += 60) {
      times += '<span class="wk-t" style="top:' + (((m - startMin) / 60) * hh) + 'px">' + u.hm(m) + '</span>';
    }

    const cols = dates.map((d) => {
      const evs = store().eventsOn(d).filter((e) => !e.allDay && e.end > startMin);
      const lay = C.layout(evs);
      let free = '';
      if (ui().showFree) {
        free = ELA.planner.freeSlots(d, 45).map(([a, b]) => {
          const top = ((a - startMin) / 60) * hh, h = ((b - a) / 60) * hh;
          return '<div class="free" style="top:' + top + 'px;height:' + h + 'px"><span>' + u.dur(b - a) + ' libre</span></div>';
        }).join('');
      }
      const now_ = d === today && now >= startMin ? '<div class="nowline" style="top:' + (((now - startMin) / 60) * hh) + 'px"></div>' : '';
      const sleepY = ((S.sleep - startMin) / 60) * hh;
      return '<div class="wk-col' + (d === today ? ' is-today' : '') + (u.dow(d) >= 5 ? ' is-we' : '') + '" data-date="' + d + '">' +
        free + evs.map((e) => C.blockHTML(e, lay[e.id], startMin, hh, mode)).join('') + now_ +
        (S.sleep < 1440 ? '<div class="sleepzone" style="top:' + sleepY + 'px"></div>' : '') + '</div>';
    }).join('');

    return (
      '<div class="wk wk--' + mode + '" data-start="' + startMin + '" data-hh="' + hh + '" style="--hh:' + hh + 'px;--n:' + dates.length + '">' +
      head + adRow +
      '<div class="wk-body" style="height:' + H + 'px"><div class="wk-times">' + times + '</div><div class="wk-cols">' + cols + '</div></div>' +
      '<p class="wk-foot">' + u.icon('moon') + ' Coucher ' + (S.sleep >= 1440 ? '00:00' : u.hm(S.sleep)) + ' · réveil ' + u.hm(S.wake) + '</p>' +
      '</div>'
    );
  };

  /* ---------- Bandeau de la semaine (vue jour) ---------- */
  C.stripHTML = function (date) {
    const monday = u.weekStart(date), today = u.today();
    return '<div class="strip" role="tablist" aria-label="Jours de la semaine">' + u.weekDays(monday).map((d) => {
      const evs = store().eventsOn(d).filter((e) => e.kind !== 'routine');
      const dots = evs.slice(0, 5).map((e) => '<i style="background:' + C.colorOf(e) + '"></i>').join('');
      return '<button type="button" role="tab" aria-selected="' + (d === date) + '" class="strip-day' + (d === date ? ' is-sel' : '') + (d === today ? ' is-today' : '') +
        '" data-act="goday" data-date="' + d + '"><span>' + u.DAYS_SHORT[u.dow(d)] + '</span><b>' + u.parse(d).getDate() + '</b><em>' + dots + '</em></button>';
    }).join('') + '</div>';
  };

  /* ---------- Mois ---------- */
  C.monthHTML = function (date) {
    const first = date.slice(0, 8) + '01';
    const start = u.weekStart(first);
    const month = date.slice(0, 7), today = u.today();
    let cells = '';
    for (let k = 0; k < 42; k++) {
      const d = u.addDays(start, k);
      if (k === 35 && d.slice(0, 7) !== month) break;
      const evs = store().eventsOn(d).filter((e) => e.kind !== 'routine');
      const items = evs.slice(0, 3).map((e) =>
        '<li style="--c:' + C.colorOf(e) + '">' + (e.allDay ? '' : '<span>' + u.hm(e.start) + '</span> ') + u.esc(C.shortTitle(e)) + '</li>'
      ).join('');
      const dots = evs.slice(0, 6).map((e) => '<i style="background:' + C.colorOf(e) + '"></i>').join('');
      cells += '<button type="button" class="mo-cell' + (d.slice(0, 7) !== month ? ' is-out' : '') + (d === today ? ' is-today' : '') + (u.dow(d) >= 5 ? ' is-we' : '') +
        '" data-act="goday" data-date="' + d + '" aria-label="' + u.esc(u.fmtDay(d) + ', ' + evs.length + ' éléments') + '">' +
        '<span class="mo-num">' + u.parse(d).getDate() + '</span><ul>' + items + '</ul>' +
        (evs.length > 3 ? '<span class="mo-more">+' + (evs.length - 3) + '</span>' : '') + '<em class="mo-dots">' + dots + '</em></button>';
    }
    return '<div class="mo"><div class="mo-head">' + u.DAYS_SHORT.map((d) => '<span>' + d + '</span>').join('') + '</div><div class="mo-grid">' + cells + '</div></div>';
  };

  /* ---------- Statistiques de la semaine ---------- */
  C.weekStats = function (monday) {
    const evs = store().eventsWeek(monday);
    const course = { CM: 0, TD: 0, TP: 0, autre: 0 };
    const study = {};
    const sport = {};
    evs.forEach((e) => {
      const d = e.allDay ? 0 : e.end - e.start;
      if (e.kind === 'course') course[course[e.courseType] !== undefined ? e.courseType : 'autre'] += d;
      if (e.kind === 'study' && e.subjectId) {
        study[e.subjectId] = study[e.subjectId] || { plan: 0, done: 0 };
        study[e.subjectId].plan += d;
        if (e.done) study[e.subjectId].done += d;
      }
      if (e.kind === 'sport' && !e.tentative) {
        const k = /^legs/.test(e.sport) ? 'legs' : /^(push|pull)$/.test(e.sport) ? 'gym' : e.sport;
        sport[k] = sport[k] || { n: 0, done: 0 };
        sport[k].n++;
        if (e.done) sport[k].done++;
      }
    });
    return { course: course, study: study, sport: sport, evs: evs };
  };

  C.sideHTML = function (monday) {
    const ws = C.weekStats(monday);
    const courseTotal = ws.course.CM + ws.course.TD + ws.course.TP + ws.course.autre;
    const studyTotal = Object.values(ws.study).reduce((a, x) => a + x.plan, 0);
    const targetTotal = st().subjects.reduce((a, s) => a + (+s.target || 0) * 60, 0);
    const rows = st().subjects.map((s) => {
      const x = ws.study[s.id] || { plan: 0, done: 0 };
      const tgt = (+s.target || 0) * 60;
      const pct = tgt ? Math.min(100, (x.plan / tgt) * 100) : 0;
      const pd = tgt ? Math.min(100, (x.done / tgt) * 100) : 0;
      return '<li class="bar-row"><span class="bar-name"><i class="dot" style="background:' + s.color + '"></i>' + u.esc(s.short) + '</span>' +
        '<span class="bar"><span class="bar-plan" style="width:' + pct + '%;background:' + u.rgba(s.color, 0.35) + '"></span><span class="bar-done" style="width:' + pd + '%;background:' + s.color + '"></span></span>' +
        '<span class="bar-val">' + u.hours(x.plan) + '<small>/' + String(s.target || 0).replace('.', ',') + ' h</small></span></li>';
    }).join('');
    const SP = [['team', 'Basket univ'], ['solo', 'Basket solo'], ['gym', 'Push / Pull'], ['legs', 'Legs'], ['footing', 'Footing'], ['tomholland', 'Tom Holland']];
    const sp = SP.map(([k, label]) => {
      const x = ws.sport[k] || { n: 0, done: 0 };
      return '<li><span>' + label + '</span><b>' + x.done + '<small>/' + x.n + '</small></b></li>';
    }).join('');
    const tasks = st().tasks.filter((t) => !t.done && t.due && t.due >= monday && t.due <= u.addDays(monday, 6)).slice(0, 4);
    return (
      '<section class="side-card"><p class="eyebrow">Cours</p><p class="big-num">' + u.dur(courseTotal) + '</p>' +
      '<p class="muted small">CM ' + u.dur(ws.course.CM) + ' · TD ' + u.dur(ws.course.TD) + ' · TP ' + u.dur(ws.course.TP) + '</p></section>' +
      '<section class="side-card"><div class="side-row"><p class="eyebrow">Révisions</p><span class="muted small">' + u.hours(studyTotal) + ' h / ' + u.hours(targetTotal) + ' h</span></div><ul class="bars">' + rows + '</ul>' +
      '<p class="hint">Barre claire : prévu · barre pleine : fait</p></section>' +
      '<section class="side-card"><p class="eyebrow">Sport (fait / prévu)</p><ul class="kv">' + sp + '</ul></section>' +
      (tasks.length
        ? '<section class="side-card"><p class="eyebrow">Tâches de la semaine</p><ul class="mini-tasks">' +
          tasks.map((t) => '<li><button type="button" class="tcheck sm" data-act="task-toggle" data-id="' + u.esc(t.id) + '" aria-label="Terminer">' + u.icon('check') + '</button><span>' + u.esc(t.title) + '</span><small>' + u.esc(u.relDay(t.due)) + '</small></li>').join('') +
          '</ul></section>'
        : '')
    );
  };

  /* ---------- Page Planning ---------- */
  C.render = function (root) {
    const view = C.view();
    const date = ui().date;
    const monday = u.weekStart(date);
    if (view === 'month') {
      const first = u.weekStart(date.slice(0, 8) + '01');
      for (let k = 0; k < 6; k++) ELA.planner.ensureWeek(u.addDays(first, 7 * k));
    } else ELA.planner.ensureWeek(monday);

    const today = u.today();
    let eyebrow, title;
    if (view === 'week') { eyebrow = 'Semaine ' + u.isoWeek(date); title = u.fmtWeekRange(monday); }
    else if (view === 'day') { eyebrow = 'Semaine ' + u.isoWeek(date) + ' · ' + u.relDay(date); title = u.fmtDay(date); }
    else { eyebrow = 'Mois'; title = u.fmtMonth(date); }

    const ws = C.weekStats(monday);
    const chips = st().subjects.map((s) => {
      const x = ws.study[s.id] || { plan: 0 };
      return '<button type="button" class="subj-chip' + (C.placing === s.id ? ' is-placing' : '') + '" data-act="place" data-subject="' + u.esc(s.id) +
        '" style="--c:' + s.color + '" title="Glisse ou touche puis choisis un créneau"><i class="dot"></i><span>' + u.esc(s.short) + '</span><small>' +
        (Math.round((x.plan / 60) * 10) / 10) + '/' + (s.target || 0) + 'h</small></button>';
    }).join('');

    const tr = st().settings.trainings;
    const onboarding = !ui().dismissed.trainings && tr.length
      ? '<div class="note">' + u.icon('ball', 'note-ic') + '<p><b>Basket univ :</b> ' +
        u.esc(tr.map((t) => u.DAYS_SHORT[t.day].toLowerCase() + '. ' + u.hmShort(t.start) + '–' + u.hmShort(t.end) + (t.optional ? ' (parfois)' : '')).join(' · ')) +
        '. Vérifie tes jours, la semaine se cale dessus.</p><div class="note-acts"><button type="button" class="btn btn-ghost btn-sm" data-act="goto-settings" data-anchor="set-basket">Modifier</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-act="dismiss" data-key="trainings">C’est bon</button></div></div>'
      : '';

    const placingBar = C.placing
      ? '<div class="placing" role="status">' + u.icon('target') + '<p>Touche un créneau pour placer <b>' + u.esc((store().subject(C.placing) || {}).name || '') +
        '</b> (1 h). Sur ordinateur, tu peux aussi glisser la matière.</p><button type="button" class="btn btn-sm btn-ghost" data-act="place-cancel">Annuler</button></div>'
      : '';

    let body;
    if (view === 'month') body = C.monthHTML(date);
    else if (view === 'day') body = C.stripHTML(date) + C.gridHTML([date], 'day');
    else body = C.gridHTML(u.weekDays(monday), 'week');

    const optEv = view !== 'month' ? (view === 'day' ? store().eventsOn(date) : ws.evs).filter((e) => e.tentative && e.optKey) : [];
    const ask = optEv.length
      ? '<div class="note note-ask">' + u.icon('ball', 'note-ic') + '<p>' + optEv.map((e) =>
          '<span class="ask-line"><b>Basket ' + u.esc(u.fmtDayShort(e.date)) + ' ' + u.hmShort(e.start) + '–' + u.hmShort(e.end) + ' :</b> tu y vas ?</span>'
        ).join('') + '</p><div class="note-acts">' + optEv.map((e) =>
          '<button type="button" class="btn btn-sm btn-primary" data-act="opt" data-key="' + u.esc(e.optKey) + '" data-v="yes">Oui</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-act="opt" data-key="' + u.esc(e.optKey) + '" data-v="no">Pas cette fois</button>'
        ).join('') + '</div></div>'
      : '';

    root.innerHTML =
      '<section class="plan plan-' + view + '">' +
      '<div class="plan-head">' +
      '<div class="plan-title"><p class="eyebrow">' + u.esc(eyebrow) + '</p><h2 class="h-page">' + u.esc(title.replace(/^./, (c) => c.toUpperCase())) + '</h2></div>' +
      '<div class="plan-ctrl">' +
      '<div class="plan-nav"><button type="button" class="iconbtn" data-act="cal-prev" aria-label="Précédent">' + u.icon('left') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="cal-today"' + (date === today ? ' aria-current="date"' : '') + '>Aujourd’hui</button>' +
      '<button type="button" class="iconbtn" data-act="cal-next" aria-label="Suivant">' + u.icon('right') + '</button></div>' +
      '<div class="seg" role="group" aria-label="Vue">' +
      [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([v, l]) =>
        '<button type="button" data-act="cal-view" data-view="' + v + '" aria-pressed="' + (view === v) + '">' + l + '</button>').join('') +
      '</div></div>' +
      '<div class="plan-tools">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="free" aria-pressed="' + !!ui().showFree + '" title="Afficher les créneaux libres" aria-label="Créneaux libres">' + u.icon('grid') + '<span>Créneaux libres</span></button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="replan" title="Recalculer routine et sport de la semaine" aria-label="Réadapter la semaine">' + u.icon('wand') + '<span>Réadapter</span></button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="import" title="Importer ou ajouter des cours" aria-label="Emploi du temps">' + u.icon('upload') + '<span>Emploi du temps</span></button>' +
      '<button type="button" class="btn btn-primary btn-sm btn-new" data-act="new">' + u.icon('plus') + '<span>Nouveau</span></button>' +
      '</div></div>' +
      onboarding + ask +
      '<div class="palette"><span class="palette-label">' + u.icon('book') + 'Matières</span><div class="palette-chips">' + chips + '</div></div>' +
      placingBar +
      '<div class="plan-body"><div class="cal">' + body + '</div>' +
      (view !== 'month' ? '<aside class="plan-side" aria-label="Résumé de la semaine">' + C.sideHTML(monday) + '</aside>' : '') +
      '</div></section>' +
      '<button type="button" class="fab" data-act="new" aria-label="Nouvel élément">' + u.icon('plus') + '</button>';
  };

  ELA.pages = ELA.pages || {};
  ELA.pages.planning = { render: (root) => C.render(root) };

  /* défilement initial : vers maintenant (aujourd'hui) ou 7h */
  C.autoScroll = function (main) {
    const wk = main.querySelector('.wk');
    if (!wk) return;
    const body = wk.querySelector('.wk-body');
    const start = +wk.dataset.start, hh = +wk.dataset.hh;
    const dates = Array.from(wk.querySelectorAll('.wk-col')).map((c) => c.dataset.date);
    const target = dates.indexOf(u.today()) >= 0 ? Math.max(start, u.nowMin() - 90) : 7 * 60;
    const y = body.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop + ((target - start) / 60) * hh;
    const head = wk.querySelector('.wk-head');
    main.scrollTop = Math.max(0, y - (head ? head.offsetHeight : 0) - 12);
  };

  C.tickNow = function () {
    const wk = document.querySelector('.wk');
    if (!wk) return;
    const line = wk.querySelector('.nowline');
    if (line) line.style.top = ((u.nowMin() - +wk.dataset.start) / 60) * +wk.dataset.hh + 'px';
  };

  /* ---------- Interaction : clic sur un créneau / un bloc ---------- */
  C.minAt = function (col, clientY) {
    const wk = col.closest('.wk');
    const start = +wk.dataset.start, hh = +wk.dataset.hh;
    const r = col.getBoundingClientRect();
    const m = start + ((clientY - r.top) / hh) * 60;
    return u.clamp(Math.floor(m / 15) * 15, start, 1440 - 15);
  };

  C.placeAt = function (subjectId, date, start) {
    const s = store().subject(subjectId);
    if (!s) return;
    const end = Math.min(1440, start + 60);
    store().commit((x) => {
      x.events.push({ id: u.uid('s'), kind: 'study', subjectId: subjectId, title: s.name, date: date, start: start, end: end });
    }, { undo: 'Placement de ' + s.name });
    ELA.ui.undoToast(s.name + ' placée · ' + u.fmtDayShort(date) + ' ' + u.hm(start) + '–' + u.hm(end));
  };

  C.bind = function (main) {
    main.addEventListener('click', (e) => {
      if (Date.now() - C.suppress < 250) { e.stopPropagation(); e.preventDefault(); return; }
      const evEl = e.target.closest('.ev, .ev-allday');
      if (evEl && evEl.dataset.id) {
        e.stopPropagation();
        ELA.editor.openEvent(evEl.dataset.id);
        return;
      }
      const col = e.target.closest('.wk-col');
      if (col) {
        e.stopPropagation();
        const min = C.minAt(col, e.clientY);
        if (C.placing) {
          const id = C.placing;
          C.placing = null;
          C.placeAt(id, col.dataset.date, min);
        } else {
          ELA.editor.openNew({ date: col.dataset.date, start: min, end: Math.min(1440, min + 60) });
        }
      }
    }, true);
    main.addEventListener('keydown', (e) => {
      const evEl = e.target.closest && e.target.closest('.ev');
      if (evEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ELA.editor.openEvent(evEl.dataset.id); }
    });
    Drag.bind(main);
  };

  /* ---------- Glisser-déposer (souris + appui long au doigt) ---------- */
  const Drag = { p: null, a: null };

  function colsInfo() {
    return Array.from(document.querySelectorAll('.wk-col')).map((c) => ({ el: c, date: c.dataset.date, r: c.getBoundingClientRect() }));
  }
  function colAt(x, cols) {
    let best = null;
    cols.forEach((c) => { if (x >= c.r.left && x <= c.r.right) best = c; });
    if (!best && cols.length === 1) best = cols[0];
    return best;
  }

  Drag.begin = function (p) {
    const wk = document.querySelector('.wk');
    if (!wk) return false;
    const start = +wk.dataset.start, hh = +wk.dataset.hh;
    const a = { mode: p.mode, start: start, hh: hh, x: p.x, y: p.y };
    if (p.mode === 'create') {
      const s = store().subject(p.subject);
      if (!s) return false;
      const ghost = document.createElement('div');
      ghost.className = 'ev ev-study is-dragging is-ghost';
      const pt = C.paint({ kind: 'study', subjectId: p.subject });
      ghost.style.cssText = '--c:' + pt.c + ';--bg:' + pt.bg + ';--bd:' + pt.bd + ';height:' + hh + 'px;left:2px;width:calc(100% - 4px);display:none';
      ghost.innerHTML = '<p class="ev-time"></p><p class="ev-title">' + u.esc(s.name) + '</p>';
      a.el = ghost;
      a.subject = p.subject;
      a.dur = 60;
      a.grab = 0;
    } else {
      const e = store().event(p.id);
      if (!e) return false;
      a.id = p.id;
      a.el = p.el;
      a.dur = e.end - e.start;
      a.orig = { date: e.date, start: e.start, end: e.end };
      const col = p.el.closest('.wk-col');
      a.grab = col ? start + ((p.y - col.getBoundingClientRect().top) / hh) * 60 - e.start : 0;
      a.el.classList.add('is-dragging');
      a.el.style.left = '2px';
      a.el.style.width = 'calc(100% - 4px)';
    }
    document.body.classList.add('is-dragging-cal');
    Drag.a = a;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* ignore */ }
    Drag.move(p.x, p.y);
    return true;
  };

  Drag.move = function (x, y) {
    const a = Drag.a;
    if (!a) return;
    const main = document.getElementById('main');
    const mr = main.getBoundingClientRect();
    if (y < mr.top + 48) main.scrollTop -= 14;
    else if (y > mr.bottom - 48) main.scrollTop += 14;
    const cols = colsInfo();
    const c = colAt(x, cols);
    if (!c) { if (a.mode === 'create') a.el.style.display = 'none'; a.target = null; return; }
    const raw = a.start + ((y - c.r.top) / a.hh) * 60;
    let s, en;
    if (a.mode === 'resize') {
      const e = store().event(a.id);
      s = e.start;
      en = u.clamp(Math.round(raw / 15) * 15, s + 15, 1440);
      a.el.style.height = Math.max(((en - s) / 60) * a.hh - 2, 13) + 'px';
      a.target = { date: e.date, start: s, end: en };
    } else {
      s = u.clamp(Math.round((raw - a.grab) / 15) * 15, a.start, 1440 - Math.min(a.dur, 1440 - a.start));
      en = Math.min(1440, s + a.dur);
      if (a.el.parentNode !== c.el) c.el.appendChild(a.el);
      a.el.style.display = '';
      a.el.style.top = ((s - a.start) / 60) * a.hh + 'px';
      a.target = { date: c.date, start: s, end: en };
    }
    const t = a.el.querySelector('.ev-time, .ev-line .ev-time');
    if (t) t.textContent = u.hm(a.target.start) + ' – ' + u.hm(a.target.end);
  };

  Drag.end = function (cancel) {
    const a = Drag.a;
    Drag.a = null;
    document.body.classList.remove('is-dragging-cal');
    if (!a) return;
    C.suppress = Date.now();
    if (a.mode === 'create') a.el.remove();
    if (cancel || !a.target) { ELA.app.render(); return; }
    const tg = a.target;
    if (a.mode === 'create') {
      C.placing = null;
      C.placeAt(a.subject, tg.date, tg.start);
      return;
    }
    if (tg.date === a.orig.date && tg.start === a.orig.start && tg.end === a.orig.end) { ELA.app.render(); return; }
    store().commit((x) => {
      const e = x.events.find((ev) => ev.id === a.id);
      if (!e) return;
      e.date = tg.date; e.start = tg.start; e.end = tg.end; e.auto = false;
    }, { undo: 'Déplacement' });
    ELA.ui.undoToast('Déplacé · ' + u.fmtDayShort(tg.date) + ' ' + u.hm(tg.start) + '–' + u.hm(tg.end));
  };

  Drag.bind = function (main) {
    /* souris / stylet */
    main.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const evEl = e.target.closest('.ev');
      const chip = e.target.closest('.subj-chip');
      if (evEl && evEl.dataset.id) {
        Drag.p = { mode: e.target.closest('[data-resize]') ? 'resize' : 'move', id: evEl.dataset.id, el: evEl, x: e.clientX, y: e.clientY };
      } else if (chip) {
        Drag.p = { mode: 'create', subject: chip.dataset.subject, x: e.clientX, y: e.clientY };
      }
    });
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (Drag.a) { e.preventDefault(); Drag.move(e.clientX, e.clientY); return; }
      if (Drag.p && Math.hypot(e.clientX - Drag.p.x, e.clientY - Drag.p.y) > 5) {
        const p = Drag.p;
        Drag.p = null;
        p.x = e.clientX; p.y = e.clientY;
        Drag.begin(p);
      }
    });
    document.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      Drag.p = null;
      if (Drag.a) Drag.end(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (Drag.a) Drag.end(true);
        else if (C.placing) { C.placing = null; ELA.app.render(); }
      }
    });

    /* doigt : appui long pour déplacer, glissement horizontal pour changer de jour */
    let lp = null, swipe = null;
    main.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { if (lp) { clearTimeout(lp.timer); lp = null; } return; }
      const t = e.touches[0];
      const evEl = e.target.closest('.ev');
      const chip = e.target.closest('.subj-chip');
      swipe = e.target.closest('.wk--day .wk-body') ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
      if (!evEl && !chip) return;
      const p = evEl && evEl.dataset.id
        ? { mode: e.target.closest('[data-resize]') ? 'resize' : 'move', id: evEl.dataset.id, el: evEl, x: t.clientX, y: t.clientY }
        : chip ? { mode: 'create', subject: chip.dataset.subject, x: t.clientX, y: t.clientY } : null;
      if (!p) return;
      lp = { p: p, x: t.clientX, y: t.clientY };
      lp.timer = setTimeout(() => {
        if (!lp) return;
        Drag.begin(Object.assign(lp.p, { x: lp.x, y: lp.y }));
        lp = null;
        swipe = null;
      }, 420);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Drag.a) { e.preventDefault(); Drag.move(t.clientX, t.clientY); return; }
      if (lp) {
        lp.x = t.clientX; lp.y = t.clientY;
        if (Math.hypot(t.clientX - lp.p.x, t.clientY - lp.p.y) > 9) { clearTimeout(lp.timer); lp = null; }
      }
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      if (lp) { clearTimeout(lp.timer); lp = null; }
      if (Drag.a) { e.preventDefault(); Drag.end(false); swipe = null; return; }
      if (swipe && e.changedTouches.length) {
        const t = e.changedTouches[0];
        const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - swipe.t < 600 && C.view() === 'day') {
          ui().date = u.addDays(ui().date, dx < 0 ? 1 : -1);
          C.needScroll = true;
          ELA.store.saveUi();
          ELA.app.render();
        }
      }
      swipe = null;
    });
    document.addEventListener('touchcancel', () => {
      if (lp) { clearTimeout(lp.timer); lp = null; }
      if (Drag.a) Drag.end(true);
      swipe = null;
    });
  };
})();
