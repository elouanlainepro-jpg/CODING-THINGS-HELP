/* Onglet Tâches : liste par échéance, ajout rapide, planification dans un créneau libre. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  ELA.pages = ELA.pages || {};
  ELA.actions = ELA.actions || {};
  ELA.submits = ELA.submits || {};
  const store = () => ELA.store;
  const st = () => ELA.store.state;

  const PRIO = { 1: 'Haute', 2: 'Normale', 3: 'Basse' };

  function itemHTML(t) {
    const today = u.today();
    const s = t.subjectId ? store().subject(t.subjectId) : null;
    const ev = t.eventId ? store().event(t.eventId) : null;
    const late = t.due && t.due < today && !t.done;
    const chips = [];
    if (t.due) chips.push('<span class="chip' + (late ? ' chip-late' : '') + '">' + u.icon('calendar') + u.esc(u.relDay(t.due)) + '</span>');
    if (s) chips.push('<span class="chip" style="--c:' + s.color + '"><i class="dot"></i>' + u.esc(s.short) + '</span>');
    if (t.est) chips.push('<span class="chip">' + u.icon('clock') + u.dur(t.est) + '</span>');
    if (t.prio === 1) chips.push('<span class="chip chip-hot">Priorité haute</span>');
    if (ev) chips.push('<button type="button" class="chip chip-link" data-act="goday" data-date="' + ev.date + '">' + u.icon('target') + 'Planifiée ' + u.esc(u.fmtDayShort(ev.date)) + ' ' + u.hm(ev.start) + '</button>');
    if (t.example) chips.push('<span class="chip chip-ex">Exemple</span>');
    return (
      '<li class="titem' + (t.done ? ' is-done' : '') + (t.prio === 1 ? ' is-hot' : '') + '">' +
      '<button type="button" class="tcheck" data-act="task-toggle" data-id="' + u.esc(t.id) + '" aria-pressed="' + !!t.done + '" aria-label="' + (t.done ? 'Remettre à faire' : 'Marquer comme faite') + '">' + u.icon('check') + '</button>' +
      '<div class="tmain"><button type="button" class="ttitle" data-act="task-edit" data-id="' + u.esc(t.id) + '">' + u.esc(t.title) + '</button>' +
      (t.notes ? '<p class="tnotes">' + u.esc(t.notes) + '</p>' : '') +
      '<div class="tmeta">' + chips.join('') + '</div></div>' +
      (!t.done && !ev ? '<button type="button" class="btn btn-ghost btn-sm tplan" data-act="task-plan" data-id="' + u.esc(t.id) + '">' + u.icon('clock') + '<span>Planifier</span></button>' : '') +
      '</li>'
    );
  }

  ELA.pages.taches = {
    render(root) {
      const today = u.today();
      const in7 = u.addDays(today, 7);
      const all = st().tasks.slice().sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : a.prio - b.prio);
      const open = all.filter((t) => !t.done);
      const groups = [
        ['En retard', open.filter((t) => t.due && t.due < today)],
        ['Aujourd’hui', open.filter((t) => t.due === today)],
        ['Cette semaine', open.filter((t) => t.due && t.due > today && t.due <= in7)],
        ['Plus tard', open.filter((t) => t.due && t.due > in7)],
        ['Sans date', open.filter((t) => !t.due)],
      ];
      const done = all.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
      const late = groups[0][1].length;
      const monday = u.weekStart(today);
      const doneWeek = done.filter((t) => t.doneAt && u.ymd(new Date(t.doneAt)) >= monday).length;

      root.innerHTML =
        '<section class="page tasks">' +
        '<header class="page-head"><div><p class="eyebrow">Tâches</p><h2 class="h-page">À faire</h2></div>' +
        '<p class="page-stats"><span><b>' + open.length + '</b> en cours</span>' + (late ? '<span class="is-late"><b>' + late + '</b> en retard</span>' : '') + '<span><b>' + doneWeek + '</b> faites cette semaine</span></p></header>' +
        '<form class="quickadd" id="qa" novalidate autocomplete="off">' +
        '<label for="qa-title" class="sr">Nouvelle tâche</label><input id="qa-title" name="qtitle" placeholder="Nouvelle tâche… (ex. Fiche Immuno chap. 2)" maxlength="140">' +
        '<div class="qa-opts">' +
        '<label class="sr" for="qa-due">Échéance</label><input type="date" id="qa-due" name="due" value="' + u.addDays(today, 1) + '">' +
        '<label class="sr" for="qa-subj">Matière</label><select id="qa-subj" name="subjectId"><option value="">Matière</option>' +
        st().subjects.map((s) => '<option value="' + u.esc(s.id) + '">' + u.esc(s.name) + '</option>').join('') + '</select>' +
        '<label class="sr" for="qa-est">Durée</label><select id="qa-est" name="est">' + [15, 30, 45, 60, 90, 120].map((m) => '<option value="' + m + '"' + (m === 30 ? ' selected' : '') + '>' + u.dur(m) + '</option>').join('') + '</select>' +
        '<button type="submit" class="btn btn-primary">' + u.icon('plus') + '<span>Ajouter</span></button></div></form>' +
        (open.length
          ? groups.filter((g) => g[1].length).map((g) =>
              '<section class="tgroup"><h3 class="h-sub">' + g[0] + ' <small>' + g[1].length + '</small></h3><ul class="tlist">' + g[1].map(itemHTML).join('') + '</ul></section>'
            ).join('')
          : '<figure class="empty"><img src="' + ELA.data.images.celebration.src + '" alt="' + u.esc(ELA.data.images.celebration.alt) + '" loading="lazy"><figcaption><b>Rien en attente.</b> Tout est fait : va shooter.</figcaption></figure>') +
        (done.length
          ? '<details class="tgroup tdone"><summary class="h-sub">Terminées <small>' + done.length + '</small></summary><ul class="tlist">' + done.slice(0, 40).map(itemHTML).join('') + '</ul>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="task-clear">' + u.icon('trash') + 'Effacer les tâches terminées</button></details>'
          : '') +
        '</section>';
    },
  };

  ELA.submits.qa = function (form) {
    const title = form.elements.qtitle.value.trim();
    if (!title) { form.elements.qtitle.focus(); return; }
    store().commit((x) => {
      x.tasks.push({ id: u.uid('t'), title: title, due: form.elements.due.value, subjectId: form.elements.subjectId.value, est: +form.elements.est.value, prio: 2, done: false, created: Date.now() });
    }, { undo: 'Ajout de tâche' });
    ELA.ui.toast('Tâche ajoutée');
    const input = document.getElementById('qa-title');
    if (input) input.focus();
  };

  ELA.actions['task-toggle'] = function (el) {
    const id = el.dataset.id;
    const t = store().task(id);
    if (!t) return;
    const now = !t.done;
    store().commit((x) => {
      const cur = x.tasks.find((z) => z.id === id);
      cur.done = now;
      cur.doneAt = now ? Date.now() : 0;
      const ev = cur.eventId && x.events.find((z) => z.id === cur.eventId);
      if (ev) ev.done = now || undefined;
    }, { undo: 'Tâche' });
    if (now) ELA.ui.undoToast('Bien joué : « ' + t.title + ' »');
  };
  ELA.actions['task-edit'] = (el) => ELA.editor.task(el.dataset.id);
  ELA.actions['task-new'] = () => ELA.editor.task(null);
  ELA.actions['task-clear'] = function () {
    store().commit((x) => { x.tasks = x.tasks.filter((t) => !t.done); }, { undo: 'Effacement' });
    ELA.ui.undoToast('Tâches terminées effacées');
  };
  ELA.actions['task-plan'] = function (el) {
    const t = store().task(el.dataset.id);
    if (!t) return;
    const dur = t.est || 30;
    const slot = ELA.planner.nextFree(dur);
    if (!slot) { ELA.ui.toast('Aucun créneau libre dans les 3 prochaines semaines'); return; }
    const evId = u.uid('k');
    store().commit((x) => {
      x.events.push({ id: evId, kind: 'task', taskId: t.id, title: t.title, subjectId: t.subjectId || '', date: slot.date, start: slot.start, end: Math.min(1440, slot.start + dur), source: 'manual' });
      const cur = x.tasks.find((z) => z.id === t.id);
      cur.eventId = evId;
    }, { undo: 'Planification' });
    ELA.ui.toast('Planifiée ' + u.fmtDayShort(slot.date) + ' à ' + u.hm(slot.start), {
      action: { label: 'Voir', fn: () => { store().ui.date = slot.date; store().ui.view = 'day'; ELA.cal.needScroll = true; ELA.app.go('planning'); } },
    });
  };
})();
