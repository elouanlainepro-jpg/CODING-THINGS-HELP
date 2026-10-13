/* Démarrage : coque de l'application, navigation, actions communes. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  ELA.actions = ELA.actions || {};
  ELA.submits = ELA.submits || {};
  const store = () => ELA.store;
  const st = () => ELA.store.state;
  const A = (ELA.app = {});

  const TABS = [
    ['planning', 'Planning', 'calendar'],
    ['taches', 'Tâches', 'tasks'],
    ['sport', 'Sport', 'dumbbell'],
    ['motivation', 'Motivation', 'flame'],
    ['albums', 'Albums', 'disc'],
    ['reglages', 'Réglages', 'sliders'],
  ];

  /* ---------- Premier lancement : exemple semaine 42 + tâches d'exemple ---------- */
  A.seed = function () {
    const rows = ELA.timetable.prepare(ELA.timetable.exampleRows());
    ELA.timetable.importRows(rows, { replaceDays: true });
    const today = u.today();
    const thu = '2026-10-15';
    store().commit((x) => {
      x.tasks.push(
        { id: u.uid('t'), title: 'Relire le CM de Biostatistiques', due: u.addDays(today, 1), subjectId: 'biostat', est: 45, prio: 2, done: false, example: true, created: Date.now() },
        { id: u.uid('t'), title: 'Préparer le TP de Bio animale (groupe C)', due: thu >= today ? thu : u.addDays(today, 2), subjectId: 'bioanim', est: 30, prio: 1, done: false, example: true, created: Date.now() },
        { id: u.uid('t'), title: 'Fiche de synthèse Métabolisme (TD Gr2)', due: u.addDays(today, 4), subjectId: 'biochim', est: 60, prio: 2, done: false, example: true, created: Date.now() }
      );
      x.meta.seeded = true;
    }, { silent: true });
    ELA.planner.ensureWeek(u.weekStart(today));
    /* l'exemple de départ ne doit jamais écraser des données déjà synchronisées */
    store().commit((x) => { x.meta.updatedAt = 0; }, { silent: true, auto: true });
    store().emit({});
  };

  /* ---------- Coque ---------- */
  function idHTML(compact) {
    const p = st().profile;
    const b = u.fmtDateFR(p.birth);
    const h = (p.height / 100).toFixed(2).replace('.', 'm');
    return '<h1 class="idname">' + u.esc(p.name) + '</h1>' +
      '<p class="idmeta"><span>' + b + '</span><span>' + h + '</span><button type="button" class="weight-btn" data-act="weight" aria-label="Modifier le poids (' + String(p.weight).replace('.', ',') + ' kg)">' +
      String(p.weight).replace('.', ',') + ' kg' + (compact ? '' : u.icon('edit', 'wt-ic')) + '</button></p>';
  }

  function nextUp() {
    const today = u.today(), now = u.nowMin();
    const list = store().eventsOn(today).filter((e) => !e.allDay && e.kind !== 'routine' && e.end > now && !e.tentative);
    return list.slice(0, 3);
  }

  A.renderChrome = function () {
    const tab = store().ui.tab;
    const side = document.getElementById('side');
    const up = nextUp();
    side.innerHTML =
      '<div class="idcard"><img class="idcard-img" src="' + ELA.data.images.roar.src + '" alt=""><div class="idcard-body">' + idHTML(false) + '</div></div>' +
      '<nav class="sidenav" aria-label="Sections">' + TABS.map(([k, l, ic]) =>
        '<button type="button" class="navbtn" data-act="tab" data-tab="' + k + '"' + (tab === k ? ' aria-current="page"' : '') + '>' + u.icon(ic) + '<span>' + l + '</span></button>').join('') + '</nav>' +
      '<section class="side-today"><p class="eyebrow">' + u.esc(u.fmtDay(u.today()).replace(/^./, (c) => c.toUpperCase())) + '</p>' +
      (up.length
        ? '<ul class="upnext">' + up.map((e) => '<li style="--c:' + ELA.cal.colorOf(e) + '"><button type="button" data-act="open-ev" data-id="' + u.esc(e.id) + '"><span>' + u.hm(e.start) + '</span><b>' + u.esc(ELA.cal.titleOf(e)) + '</b>' + (e.location ? '<small>' + u.esc(e.location) + '</small>' : '') + '</button></li>').join('') + '</ul>'
        : '<p class="muted small">Plus rien aujourd’hui. Repos, révision ou shoot.</p>') +
      '</section>' +
      '<p class="side-foot"><span class="sync sync-' + store().sync + '">' + (store().sync === 'cloud' ? 'Synchronisé' : 'Enregistré sur cet appareil') + '</span></p>';

    document.getElementById('top').innerHTML =
      '<div class="top-id">' + idHTML(true) + '</div>' +
      '<button type="button" class="iconbtn" data-act="tab" data-tab="reglages" aria-label="Réglages"' + (tab === 'reglages' ? ' aria-current="page"' : '') + '>' + u.icon('sliders') + '</button>';

    document.getElementById('tabbar').innerHTML = TABS.slice(0, 5).map(([k, l, ic]) =>
      '<button type="button" class="tabbtn" data-act="tab" data-tab="' + k + '"' + (tab === k ? ' aria-current="page"' : '') + '>' + u.icon(ic) + '<span>' + l + '</span></button>').join('');
  };

  let lastTab = null;
  A.render = function () {
    const main = document.getElementById('main');
    const tab = store().ui.tab in ELA.pages ? store().ui.tab : 'planning';
    const page = ELA.pages[tab];
    const keep = tab === lastTab ? main.scrollTop : 0;
    if (lastTab && lastTab !== tab && ELA.pages[lastTab] && ELA.pages[lastTab].leave) ELA.pages[lastTab].leave();
    A.renderChrome();
    document.body.setAttribute('data-tab', tab);
    try {
      page.render(main);
    } catch (err) {
      console.error(err);
      main.innerHTML = '<section class="page"><p class="form-err">Un affichage a échoué : ' + u.esc(err.message) + '</p><button type="button" class="btn btn-ghost" data-act="tab" data-tab="planning">Revenir au planning</button></section>';
    }
    if (tab === 'planning' && ELA.cal.needScroll) {
      ELA.cal.needScroll = false;
      requestAnimationFrame(() => ELA.cal.autoScroll(main));
    } else main.scrollTop = keep;
    lastTab = tab;
  };

  A.go = function (tab) {
    if (store().ui.tab !== tab) {
      store().ui.tab = tab;
      if (tab === 'planning') ELA.cal.needScroll = true;
      lastTab = lastTab === tab ? null : lastTab;
    }
    store().saveUi();
    A.render();
    const main = document.getElementById('main');
    if (tab !== 'planning') main.scrollTop = 0;
  };

  /* ---------- Actions communes ---------- */
  const act = ELA.actions;
  act.tab = (el) => A.go(el.dataset.tab);
  act.weight = () => ELA.editor.weight();
  act.goday = (el) => {
    store().ui.date = el.dataset.date;
    if (store().ui.tab !== 'planning' || ELA.cal.view() !== 'day') store().ui.view = 'day';
    ELA.cal.needScroll = true;
    store().saveUi();
    if (store().ui.tab !== 'planning') A.go('planning'); else A.render();
  };
  const shift = (dir) => {
    const v = ELA.cal.view(), d = store().ui.date;
    if (v === 'day') store().ui.date = u.addDays(d, dir);
    else if (v === 'week') store().ui.date = u.addDays(d, 7 * dir);
    else {
      const dt = u.parse(d.slice(0, 8) + '01');
      dt.setMonth(dt.getMonth() + dir);
      store().ui.date = u.ymd(dt);
    }
    ELA.cal.needScroll = true;
    store().saveUi();
    A.render();
  };
  act['cal-prev'] = () => shift(-1);
  act['cal-next'] = () => shift(1);
  act['cal-today'] = () => { store().ui.date = u.today(); ELA.cal.needScroll = true; store().saveUi(); A.render(); };
  act['cal-view'] = (el) => { store().ui.view = el.dataset.view; ELA.cal.needScroll = true; store().saveUi(); A.render(); };
  act.free = () => { store().ui.showFree = !store().ui.showFree; store().saveUi(); A.render(); };
  act.replan = () => {
    const monday = u.weekStart(store().ui.date);
    ELA.planner.planWeek(monday, { undo: true });
    ELA.ui.undoToast('Semaine ' + u.isoWeek(monday) + ' réadaptée : routine et sport recalculés');
  };
  act.import = () => ELA.editor.importTimetable();
  act.new = () => ELA.editor.openNew({ date: store().ui.date, start: 17 * 60, end: 18 * 60 });
  act.place = (el) => {
    const id = el.dataset.subject;
    ELA.cal.placing = ELA.cal.placing === id ? null : id;
    if (ELA.cal.placing && ELA.cal.view() === 'month') { store().ui.view = 'week'; ELA.cal.needScroll = true; }
    A.render();
  };
  act['place-cancel'] = () => { ELA.cal.placing = null; A.render(); };
  act.dismiss = (el) => { store().ui.dismissed[el.dataset.key] = true; store().saveUi(); A.render(); };
  act.opt = (el) => {
    ELA.planner.setOptional(el.dataset.key, el.dataset.v);
    ELA.ui.toast(el.dataset.v === 'yes' ? 'Entraînement confirmé' : 'Entraînement retiré · semaine réadaptée');
  };
  act['goto-settings'] = (el) => {
    A.go('reglages');
    const t = document.getElementById(el.dataset.anchor);
    if (t) requestAnimationFrame(() => t.scrollIntoView({ block: 'start' }));
  };

  /* ---------- Démarrage ---------- */
  A.init = function () {
    store().load();
    if (!st().meta.seeded) A.seed();
    if (!store().ui.date) store().ui.date = u.today();
    store().on((info) => {
      if (info.silentView) { A.renderChrome(); return; }
      A.render();
    });

    const app = document.getElementById('app');
    app.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !app.contains(el)) return;
      const fn = ELA.actions[el.dataset.act];
      if (fn) {
        if (el.tagName === 'A') e.preventDefault();
        fn(el, e);
      }
    });
    document.getElementById('layer').addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el && ELA.actions[el.dataset.act]) ELA.actions[el.dataset.act](el, e);
    });
    app.addEventListener('submit', (e) => {
      const fn = ELA.submits[e.target.id];
      if (fn) { e.preventDefault(); fn(e.target); }
    });
    ELA.cal.bind(document.getElementById('main'));

    let wasMobile = ELA.cal.isMobile();
    window.addEventListener('resize', u.debounce(() => {
      const m = ELA.cal.isMobile();
      if (m !== wasMobile) { wasMobile = m; if (store().ui.tab === 'planning') { ELA.cal.needScroll = true; A.render(); } }
    }, 200));
    setInterval(() => {
      ELA.cal.tickNow();
      if (u.today() !== A._day) { A._day = u.today(); A.renderChrome(); }
    }, 60000);
    A._day = u.today();

    ELA.cal.needScroll = true;
    A.render();
    document.documentElement.classList.add('is-ready');

    /* lien partagé (#s=…) : proposer l'import */
    const h = location.hash || '';
    if (h.indexOf('#s=') === 0) {
      const code = h.slice(3);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      store().decode(code).then((data) => {
        if (!data || !Array.isArray(data.events)) return;
        ELA.ui.confirm({ title: 'Ouvrir le planning partagé ?', text: 'Ce lien contient ' + data.events.length + ' éléments. Ton planning actuel sera remplacé (tu pourras annuler).', ok: 'Ouvrir' }).then((ok) => {
          if (!ok) return;
          store().pushUndo('Planning partagé');
          store().replace(data);
          ELA.ui.undoToast('Planning partagé chargé');
        });
      }).catch(() => ELA.ui.toast('Lien de partage illisible'));
    }

    store().remote.init();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.init);
  else A.init();
})();
