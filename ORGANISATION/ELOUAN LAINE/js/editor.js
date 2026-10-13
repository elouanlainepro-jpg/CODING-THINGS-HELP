/* Fenêtres d'édition : événements, tâches, poids, import de l'emploi du temps. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  const E = (ELA.editor = {});
  const store = () => ELA.store;
  const st = () => ELA.store.state;

  const KINDS = ['study', 'course', 'sport', 'rdv', 'event', 'task', 'routine'];
  const subjOptions = (sel, empty) =>
    (empty ? '<option value="">' + u.esc(empty) + '</option>' : '') +
    st().subjects.map((s) => '<option value="' + u.esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + u.esc(s.name) + '</option>').join('');
  const opt = (v, label, sel) => '<option value="' + u.esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + u.esc(label) + '</option>';

  /* ---------- Événement ---------- */
  E.openNew = function (preset) {
    const p = Object.assign({ kind: 'study', date: store().ui.date, start: 17 * 60, end: 18 * 60 }, preset || {});
    if (C().placing) p.subjectId = C().placing;
    E.form(p, true);
  };
  E.openEvent = function (id) {
    const e = store().event(id);
    if (!e) return;
    E.form(JSON.parse(JSON.stringify(e)), false);
  };
  const C = () => ELA.cal;

  E.form = function (ev, isNew) {
    const k = ev.kind || 'study';
    const sports = Object.keys(ELA.data.sports).filter((x) => x !== 'other');
    const routines = Object.keys(ELA.data.routines);
    const prog = ev.kind === 'sport' ? ELA.data.programs[ev.sport] : null;
    const body = u.html`
      <form id="evf" class="form" novalidate autocomplete="off">
        <fieldset class="kinds"><legend class="sr">Type</legend>
          ${KINDS.map((x) => u.html`<label class="kind-pill"><input type="radio" name="kind" value="${x}" ${x === k ? u.raw('checked') : ''}><span>${u.ic(ELA.data.kinds[x].icon)}${ELA.data.kinds[x].label}</span></label>`)}
        </fieldset>
        <div class="field" data-show="course study task rdv event sport routine">
          <label for="ef-title">Titre</label>
          <input id="ef-title" name="title" value="${ev.title || ''}" placeholder="Ex. Révision chapitre 3" maxlength="120">
        </div>
        <div class="grid2">
          <div class="field" data-show="course study task">
            <label for="ef-subject">Matière</label>
            <select id="ef-subject" name="subjectId">${u.raw(subjOptions(ev.subjectId, 'Aucune'))}</select>
          </div>
          <div class="field" data-show="course">
            <label for="ef-ctype">Type de cours</label>
            <select id="ef-ctype" name="courseType">${u.raw(['CM', 'TD', 'TP', ''].map((t) => opt(t, t || 'Autre', ev.courseType || '')).join(''))}</select>
          </div>
          <div class="field" data-show="sport">
            <label for="ef-sport">Séance</label>
            <select id="ef-sport" name="sport">${u.raw(sports.map((s) => opt(s, ELA.data.sports[s].long, ev.sport || 'solo')).join(''))}</select>
          </div>
          <div class="field" data-show="routine">
            <label for="ef-routine">Routine</label>
            <select id="ef-routine" name="routine">${u.raw(routines.map((r) => opt(r, ELA.data.routines[r].label, ev.routine || 'other')).join(''))}</select>
          </div>
        </div>
        <div class="grid3">
          <div class="field"><label for="ef-date">Date</label><input type="date" id="ef-date" name="date" value="${ev.date}" required></div>
          <div class="field" data-timed><label for="ef-start">Début</label><input type="time" id="ef-start" name="start" step="300" value="${u.hm(ev.start || 0)}"></div>
          <div class="field" data-timed><label for="ef-end">Fin</label><input type="time" id="ef-end" name="end" step="300" value="${u.hm(ev.end || 60)}"></div>
        </div>
        <div class="nudges" data-timed>
          <span class="muted small">Décaler</span>
          <button type="button" class="chip-btn" data-nudge="-15">−15 min</button>
          <button type="button" class="chip-btn" data-nudge="15">+15 min</button>
          <span class="muted small nudge-sep">Durée</span>
          <button type="button" class="chip-btn" data-len="-15" aria-label="Raccourcir de 15 minutes">−</button>
          <output id="ef-len" class="len-out">${u.dur((ev.end || 60) - (ev.start || 0))}</output>
          <button type="button" class="chip-btn" data-len="15" aria-label="Allonger de 15 minutes">+</button>
        </div>
        <div class="checks">
          <label class="check"><input type="checkbox" name="allDay" ${ev.allDay ? u.raw('checked') : ''}><span>Toute la journée</span></label>
          <label class="check" data-show="study sport task rdv event"><input type="checkbox" name="done" ${ev.done ? u.raw('checked') : ''}><span>Fait</span></label>
        </div>
        <div class="field" data-show="course study task rdv event sport"><label for="ef-loc">Lieu</label><input id="ef-loc" name="location" value="${ev.location || ''}" placeholder="Salle, adresse…"></div>
        <div class="field"><label for="ef-notes">Notes</label><textarea id="ef-notes" name="notes" rows="2" placeholder="Chapitre, objectif, matériel…">${ev.notes || ''}</textarea></div>
        ${isNew
          ? u.html`<div class="field"><label for="ef-rep">Répéter</label><select id="ef-rep" name="repeat">
              ${u.raw([[0, 'Ne pas répéter'], [4, 'Chaque semaine, 4 semaines'], [8, 'Chaque semaine, 8 semaines'], [12, 'Chaque semaine, 12 semaines']].map(([v, l]) => opt(v, l, 0)).join(''))}
            </select></div>`
          : ''}
        ${ev.kind === 'course' && (ev.teacher || ev.groups)
          ? u.html`<p class="info-line">${u.ic('cap')}${[ev.teacher, ev.groups].filter(Boolean).join(' · ')}</p>`
          : ''}
        ${ev.tentative && ev.optKey
          ? u.html`<div class="note note-ask in-form"><p><b>Entraînement à confirmer.</b> Tu y vas cette semaine ?</p>
              <div class="note-acts"><button type="button" class="btn btn-sm btn-primary" data-opt="yes">Oui</button><button type="button" class="btn btn-sm btn-ghost" data-opt="no">Pas cette fois</button></div></div>`
          : ''}
        ${prog && prog.items.length
          ? u.html`<details class="prog-mini"><summary>${u.ic('dumbbell')}Séance ${prog.title} · ${prog.focus}</summary>
              <ol>${prog.items.map((it) => u.html`<li><span>${it[0]}</span><b>${it[1]}</b></li>`)}</ol><p class="hint">${prog.note}</p></details>`
          : ''}
        ${ev.auto && !isNew ? u.html`<p class="hint">${u.ic('wand')}Placé automatiquement. Si tu le modifies, il reste à sa nouvelle place quand la semaine est réadaptée.</p>` : ''}
        <p class="form-err" role="alert" hidden></p>
      </form>`;
    const foot = u.html`
      ${!isNew ? u.html`<button type="button" class="btn btn-ghost btn-danger-text" data-del>${u.ic('trash')}<span>Supprimer</span></button>
        <button type="button" class="btn btn-ghost" data-dup>${u.ic('copy')}<span>Dupliquer</span></button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" class="btn btn-primary" form="evf">${isNew ? 'Ajouter' : 'Enregistrer'}</button>`;

    ELA.ui.modal({
      title: isNew ? 'Nouveau' : C().titleOf(ev),
      eyebrow: isNew ? u.fmtDay(ev.date) : (ELA.data.kinds[ev.kind] || {}).label + ' · ' + u.fmtDay(ev.date),
      body: body,
      foot: foot,
      onMount: (sheet, api) => bindForm(sheet, api, ev, isNew),
    });
  };

  function bindForm(sheet, api, ev, isNew) {
    const f = sheet.querySelector('#evf');
    const err = f.querySelector('.form-err');
    const kindOf = () => (f.querySelector('input[name=kind]:checked') || {}).value || 'study';
    const sync = () => {
      const k = kindOf();
      f.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.getAttribute('data-show').split(' ').indexOf(k) < 0; });
      const allDay = f.allDay.checked;
      f.querySelectorAll('[data-timed]').forEach((el) => { el.hidden = allDay; });
      const ph = { study: 'Ex. Fiche chapitre 2', course: 'Intitulé du cours', sport: 'Séance', rdv: 'Ex. Kiné, banque…', event: 'Ex. Match, soirée…', task: 'Ex. Rendre le compte rendu', routine: 'Ex. Courses' };
      f.elements.title.placeholder = ph[k] || '';
      sheet.querySelector('.sheet-title').textContent = isNew ? 'Nouveau · ' + ELA.data.kinds[k].label.toLowerCase() : sheet.querySelector('.sheet-title').textContent;
      updLen();
    };
    const updLen = () => {
      const s = u.toMin(f.start.value || '0:00'), e = f.end.value ? u.toMin(f.end.value) || 1440 : s;
      const out = f.querySelector('#ef-len');
      if (out) out.textContent = e > s ? u.dur(e - s) : '—';
    };
    f.addEventListener('change', (e) => {
      if (e.target.name === 'kind' || e.target.name === 'allDay') sync();
      if (e.target.name === 'subjectId' && kindOf() === 'study' && (!f.elements.title.value || st().subjects.some((s) => s.name === f.elements.title.value))) {
        const s = store().subject(f.subjectId.value);
        f.elements.title.value = s ? s.name : '';
      }
      if (e.target.name === 'sport' && kindOf() === 'sport') {
        const names = Object.values(ELA.data.sports).map((x) => x.long);
        if (!f.elements.title.value || names.indexOf(f.elements.title.value) >= 0) f.elements.title.value = ELA.data.sports[f.sport.value].long;
      }
      if (e.target.name === 'start' || e.target.name === 'end') updLen();
    });
    f.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nudge]');
      const l = e.target.closest('[data-len]');
      const o = e.target.closest('[data-opt]');
      if (n || l) {
        let s = u.toMin(f.start.value || '0:00'), en = f.end.value ? u.toMin(f.end.value) || 1440 : s + 60;
        if (n) {
          const d = +n.dataset.nudge;
          if (s + d >= 0 && en + d <= 1440) { s += d; en += d; }
        } else {
          en = u.clamp(en + +l.dataset.len, s + 15, 1440);
        }
        f.start.value = u.hm(s);
        f.end.value = u.hm(en);
        updLen();
      }
      if (o) {
        api.close();
        ELA.planner.setOptional(ev.optKey, o.dataset.opt);
        ELA.ui.toast(o.dataset.opt === 'yes' ? 'Entraînement confirmé' : 'Entraînement retiré · semaine réadaptée');
      }
    });
    sync();

    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const k = kindOf();
      const allDay = f.allDay.checked;
      const date = f.date.value;
      const start = allDay ? 0 : u.toMin(f.start.value || '0:00');
      let end = allDay ? 1440 : f.end.value ? u.toMin(f.end.value) : 0;
      if (!allDay && end === 0 && f.end.value) end = 1440;
      const show = (msg) => { err.textContent = msg; err.hidden = false; };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return show('Choisis une date.');
      if (!allDay && end <= start) return show('La fin doit être après le début.');
      if ((k === 'study') && !f.subjectId.value) return show('Choisis la matière à réviser.');
      let title = f.elements.title.value.trim();
      if (!title) {
        if (k === 'study') title = store().subject(f.subjectId.value).name;
        else if (k === 'sport') title = ELA.data.sports[f.sport.value].long;
        else if (k === 'routine') title = ELA.data.routines[f.routine.value].label;
        else return show('Donne un titre.');
      }
      const fields = {
        kind: k,
        title: title,
        date: date,
        start: start,
        end: end,
        allDay: allDay || undefined,
        location: f.location.value.trim(),
        notes: f.notes.value.trim(),
        done: f.done.checked || undefined,
        subjectId: k === 'course' || k === 'study' || k === 'task' ? f.subjectId.value : '',
        courseType: k === 'course' ? f.courseType.value : undefined,
        sport: k === 'sport' ? f.sport.value : undefined,
        routine: k === 'routine' ? f.routine.value : undefined,
      };
      if (isNew) {
        const reps = Math.max(1, +(f.repeat ? f.repeat.value : 0) || 1);
        const series = reps > 1 ? u.uid('sr') : '';
        store().commit((x) => {
          for (let i = 0; i < reps; i++) {
            x.events.push(Object.assign({ id: u.uid('m'), source: 'manual' }, fields, { date: u.addDays(date, 7 * i), seriesId: series || undefined }));
          }
        }, { undo: 'Ajout' });
        api.close();
        ELA.ui.undoToast(reps > 1 ? 'Ajouté sur ' + reps + ' semaines' : 'Ajouté · ' + u.fmtDayShort(date) + (allDay ? '' : ' ' + u.hm(start)));
      } else {
        store().commit((x) => {
          const target = x.events.find((z) => z.id === ev.id);
          if (!target) return;
          const moved = target.date !== fields.date || target.start !== fields.start || target.end !== fields.end || target.kind !== fields.kind || target.sport !== fields.sport;
          Object.assign(target, fields);
          if (moved) { target.auto = false; target.tentative = false; }
          if (target.taskId) {
            const t = x.tasks.find((z) => z.id === target.taskId);
            if (t) t.done = !!fields.done;
          }
        }, { undo: 'Modification' });
        api.close();
        ELA.ui.undoToast('Enregistré');
      }
    });

    const del = sheet.querySelector('[data-del]');
    if (del) del.addEventListener('click', async () => {
      const cur = store().event(ev.id);
      if (!cur) return api.close();
      let scope = 'one';
      if (cur.seriesId && st().events.filter((x) => x.seriesId === cur.seriesId).length > 1) {
        scope = await ELA.ui.choose({
          title: 'Supprimer la série ?',
          text: 'Cet élément se répète chaque semaine.',
          choices: [{ value: 'one', label: 'Seulement celui-ci' }, { value: 'next', label: 'Celui-ci et les suivants', danger: true }],
        });
        if (!scope) return;
      }
      store().commit((x) => {
        x.events = x.events.filter((z) => {
          if (z.id === cur.id) return false;
          if (scope === 'next' && z.seriesId === cur.seriesId && z.date >= cur.date) return false;
          return true;
        });
        if (cur.taskId) {
          const t = x.tasks.find((z) => z.id === cur.taskId);
          if (t) t.eventId = '';
        }
      }, { undo: 'Suppression' });
      api.close();
      ELA.ui.undoToast('Supprimé');
    });
    const dup = sheet.querySelector('[data-dup]');
    if (dup) dup.addEventListener('click', () => {
      const cur = store().event(ev.id);
      if (!cur) return;
      const copy = Object.assign({}, cur, { id: u.uid('m'), auto: false, seriesId: undefined, taskId: undefined, source: 'manual' });
      const len = cur.end - cur.start;
      if (!cur.allDay && cur.end + len <= 1440) { copy.start = cur.end; copy.end = cur.end + len; }
      else copy.date = u.addDays(cur.date, 1);
      store().commit((x) => { x.events.push(copy); }, { undo: 'Duplication' });
      api.close();
      ELA.ui.undoToast('Dupliqué · ' + u.fmtDayShort(copy.date) + (copy.allDay ? '' : ' ' + u.hm(copy.start)));
    });
  }

  /* ---------- Poids ---------- */
  E.weight = function () {
    const p = st().profile;
    ELA.ui.modal({
      title: 'Poids',
      eyebrow: 'Profil',
      size: 'sm',
      body: u.html`<form id="wf" class="form"><div class="field"><label for="wf-kg">Poids actuel (kg)</label>
        <input id="wf-kg" name="kg" type="text" inputmode="decimal" autocomplete="off" value="${String(p.weight).replace('.', ',')}" autofocus></div>
        <p class="hint">Chaque pesée est ajoutée à ta courbe dans l’onglet Sport.</p><p class="form-err" role="alert" hidden></p></form>`,
      foot: u.html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="wf" class="btn btn-primary">Enregistrer</button>`,
      onMount: (sheet, api) => {
        const f = sheet.querySelector('#wf');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = Math.round(parseFloat(String(f.kg.value).replace(',', '.')) * 10) / 10;
          const err = f.querySelector('.form-err');
          if (!(v >= 35 && v <= 200)) { err.textContent = 'Entre un poids entre 35 et 200 kg.'; err.hidden = false; return; }
          E.setWeight(v, u.today());
          api.close();
          ELA.ui.toast('Poids mis à jour : ' + String(v).replace('.', ',') + ' kg');
        });
      },
    });
  };
  E.setWeight = function (v, date) {
    store().commit((x) => {
      const log = x.profile.weightLog;
      const ex = log.find((w) => w.date === date);
      if (ex) ex.kg = v; else log.push({ date: date, kg: v });
      log.sort((a, b) => (a.date < b.date ? -1 : 1));
      const last = log[log.length - 1];
      x.profile.weight = last ? last.kg : v;
    }, { undo: 'Poids' });
  };

  /* ---------- Tâche ---------- */
  E.task = function (id) {
    const t = id ? store().task(id) : null;
    const v = t || { title: '', due: '', prio: 2, subjectId: '', est: 30, notes: '' };
    ELA.ui.modal({
      title: t ? 'Modifier la tâche' : 'Nouvelle tâche',
      eyebrow: 'Tâches',
      body: u.html`<form id="tf" class="form" novalidate>
        <div class="field"><label for="tf-title">Tâche</label><input id="tf-title" name="title" value="${v.title}" maxlength="140" autofocus></div>
        <div class="grid2">
          <div class="field"><label for="tf-due">Échéance</label><input id="tf-due" type="date" name="due" value="${v.due || ''}"></div>
          <div class="field"><label for="tf-prio">Priorité</label><select id="tf-prio" name="prio">${u.raw([[1, 'Haute'], [2, 'Normale'], [3, 'Basse']].map(([a, b]) => opt(a, b, v.prio)).join(''))}</select></div>
          <div class="field"><label for="tf-subj">Matière</label><select id="tf-subj" name="subjectId">${u.raw(subjOptions(v.subjectId, 'Aucune'))}</select></div>
          <div class="field"><label for="tf-est">Durée estimée</label><select id="tf-est" name="est">${u.raw([15, 30, 45, 60, 90, 120, 180].map((m) => opt(m, u.dur(m), v.est)).join(''))}</select></div>
        </div>
        <div class="field"><label for="tf-notes">Notes</label><textarea id="tf-notes" name="notes" rows="2">${v.notes || ''}</textarea></div>
        <p class="form-err" role="alert" hidden></p></form>`,
      foot: u.html`${t ? u.html`<button type="button" class="btn btn-ghost btn-danger-text" data-del>${u.ic('trash')}<span>Supprimer</span></button>` : ''}
        <span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" form="tf" class="btn btn-primary">${t ? 'Enregistrer' : 'Ajouter'}</button>`,
      onMount: (sheet, api) => {
        const f = sheet.querySelector('#tf');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const title = f.elements.title.value.trim();
          if (!title) { const er = f.querySelector('.form-err'); er.textContent = 'Écris la tâche.'; er.hidden = false; return; }
          const data = { title: title, due: f.due.value, prio: +f.prio.value, subjectId: f.subjectId.value, est: +f.est.value, notes: f.notes.value.trim() };
          store().commit((x) => {
            if (t) {
              const cur = x.tasks.find((z) => z.id === t.id);
              Object.assign(cur, data, { example: false });
              const ev = cur.eventId && x.events.find((z) => z.id === cur.eventId);
              if (ev) { ev.title = title; ev.subjectId = data.subjectId; }
            } else x.tasks.push(Object.assign({ id: u.uid('t'), done: false, created: Date.now() }, data));
          }, { undo: t ? 'Modification de tâche' : 'Ajout de tâche' });
          api.close();
          ELA.ui.toast(t ? 'Tâche enregistrée' : 'Tâche ajoutée');
        });
        const del = sheet.querySelector('[data-del]');
        if (del) del.addEventListener('click', () => {
          E.deleteTask(t.id);
          api.close();
        });
      },
    });
  };
  E.deleteTask = function (id) {
    store().commit((x) => {
      const t = x.tasks.find((z) => z.id === id);
      x.tasks = x.tasks.filter((z) => z.id !== id);
      if (t && t.eventId) x.events = x.events.filter((z) => z.id !== t.eventId);
    }, { undo: 'Suppression de tâche' });
    ELA.ui.undoToast('Tâche supprimée');
  };

  /* ---------- Emploi du temps : import ---------- */
  E.importTimetable = function () {
    const g = st().settings.group;
    let rows = [];
    const body = u.html`
      <div class="tabs-mini" role="tablist">
        <button type="button" role="tab" class="tab-mini" aria-selected="true" data-pane="ics">${u.ic('file')}Fichier .ics</button>
        <button type="button" role="tab" class="tab-mini" aria-selected="false" data-pane="manual">${u.ic('plus')}Ajouter un cours</button>
        <button type="button" role="tab" class="tab-mini" aria-selected="false" data-pane="example">${u.ic('calendar')}Exemple sem. 42</button>
      </div>
      <div class="group-line">
        <span class="muted small">Ton groupe</span>
        <label class="mini-field">TP <input id="im-tp" value="${g.tp}" maxlength="2" aria-label="Groupe de TP"></label>
        <label class="mini-field">TD <input id="im-td" value="${g.td}" maxlength="2" aria-label="Groupe de TD"></label>
        <label class="mini-field">Parcours <input id="im-prog" value="${g.prog}" maxlength="6" aria-label="Parcours"></label>
        <label class="check sm"><input type="checkbox" id="im-cm" ${g.keepCM ? u.raw('checked') : ''}><span>Tous les CM</span></label>
      </div>
      <section class="pane" data-pane="ics">
        <ol class="steps">
          <li>Sur <b>planning.univ-lehavre.fr</b> (ADE), ouvre ton emploi du temps <b>ST-L2 Sciences de la vie</b>.</li>
          <li>Touche l’icône d’export (<i>Exporter l’agenda</i>), choisis les semaines voulues et télécharge le fichier <b>.ics</b>.</li>
          <li>Choisis-le ici : je garde le groupe C, le parcours BOE, le TD Gr2 et tous les CM.</li>
        </ol>
        <label class="drop" for="im-file">${u.ic('upload')}<span><b>Choisir un fichier .ics</b><small>ou glisse-le ici</small></span></label>
        <input type="file" id="im-file" accept=".ics,text/calendar" class="sr">
        <details class="paste"><summary>Ou coller le contenu du fichier</summary>
          <textarea id="im-text" rows="4" placeholder="BEGIN:VCALENDAR…"></textarea>
          <button type="button" class="btn btn-ghost btn-sm" id="im-parse">Analyser le texte</button>
        </details>
      </section>
      <section class="pane" data-pane="manual" hidden>
        <form id="im-manual" class="form" novalidate>
          <div class="grid2">
            <div class="field"><label for="im-subj">Matière</label><select id="im-subj" name="subjectId">${u.raw(subjOptions('', ''))}</select></div>
            <div class="field"><label for="im-type">Type</label><select id="im-type" name="type">${u.raw(['CM', 'TD', 'TP'].map((t) => opt(t, t, 'CM')).join(''))}</select></div>
          </div>
          <div class="field"><label for="im-title">Intitulé (facultatif)</label><input id="im-title" name="title" placeholder="Ex. Géomorphologie"></div>
          <div class="grid3">
            <div class="field"><label for="im-date">Premier jour</label><input type="date" id="im-date" name="date" value="${store().ui.date}"></div>
            <div class="field"><label for="im-start">Début</label><input type="time" id="im-start" name="start" step="300" value="08:00"></div>
            <div class="field"><label for="im-end">Fin</label><input type="time" id="im-end" name="end" step="300" value="10:00"></div>
          </div>
          <div class="grid2">
            <div class="field"><label for="im-room">Salle</label><input id="im-room" name="room" placeholder="B213 ST"></div>
            <div class="field"><label for="im-weeks">Chaque semaine pendant</label><select id="im-weeks" name="weeks">${u.raw([1, 2, 4, 6, 8, 10, 12].map((n) => opt(n, n === 1 ? 'Une seule fois' : n + ' semaines', 1)).join(''))}</select></div>
          </div>
          <p class="form-err" role="alert" hidden></p>
          <button type="submit" class="btn btn-primary">${u.ic('plus')}Ajouter ce cours</button>
        </form>
      </section>
      <section class="pane" data-pane="example" hidden>
        <p class="muted">Ta capture du 12 au 17 octobre 2026, avec tous les groupes. Le filtre ne garde que tes cours.</p>
        <button type="button" class="btn btn-ghost" id="im-example">${u.ic('refresh')}Analyser la semaine 42</button>
      </section>
      <section class="preview" id="im-preview" hidden></section>`;

    ELA.ui.modal({
      title: 'Emploi du temps',
      eyebrow: 'Import des cours',
      size: 'lg',
      body: body,
      foot: u.html`<label class="check sm"><input type="checkbox" id="im-replace" checked><span>Remplacer les cours déjà importés ces jours-là</span></label>
        <span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Fermer</button>
        <button type="button" class="btn btn-primary" id="im-go" disabled>Importer</button>`,
      onMount: (sheet, api) => {
        const $ = (s) => sheet.querySelector(s);
        const prev = $('#im-preview');
        const go = $('#im-go');
        const readGroup = () => ({ tp: $('#im-tp').value.trim().toUpperCase(), td: $('#im-td').value.trim(), prog: $('#im-prog').value.trim().toUpperCase(), keepCM: $('#im-cm').checked });

        sheet.querySelectorAll('.tab-mini').forEach((b) => b.addEventListener('click', () => {
          sheet.querySelectorAll('.tab-mini').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
          sheet.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.pane; });
        }));

        const renderPreview = () => {
          if (!rows.length) { prev.hidden = true; go.disabled = true; return; }
          const keep = rows.filter((r) => r.keep).length;
          const byDay = {};
          rows.forEach((r, i) => { (byDay[r.date] = byDay[r.date] || []).push([r, i]); });
          prev.hidden = false;
          prev.innerHTML = u.str(u.html`
            <div class="preview-head"><p><b>${keep}</b> cours pour toi sur ${rows.length}</p>
              <p class="muted small">Décoche ou coche pour corriger. La matière sert aux couleurs et aux statistiques.</p></div>
            ${Object.keys(byDay).sort().map((d) => u.html`<div class="pv-day"><p class="pv-date">${u.fmtDay(d)}</p>
              ${byDay[d].map(([r, i]) => u.html`<div class="pv-row ${r.keep ? '' : 'is-off'}">
                <label class="pv-check"><input type="checkbox" data-i="${i}" ${r.keep ? u.raw('checked') : ''}><span class="sr">Garder</span></label>
                <span class="pv-time">${u.hm(r.start)}–${u.hm(r.end)}</span>
                <span class="pv-main"><b>${r.title}</b><small>${[r.type, r.groups, r.room].filter(Boolean).join(' · ')}</small></span>
                <span class="pv-why ${r.keep ? 'ok' : ''}">${r.why}</span>
                <select data-s="${i}" aria-label="Matière">${u.raw(subjOptions(r.subjectId, 'Matière ?'))}</select>
              </div>`)}</div>`)}`);
          go.disabled = keep === 0;
          go.textContent = keep ? 'Importer ' + keep + ' cours' : 'Importer';
        };
        const load = (raw) => {
          store().commit((x) => { x.settings.group = readGroup(); }, { silent: true });
          rows = ELA.timetable.prepare(raw);
          if (!rows.length) { ELA.ui.toast('Aucun cours trouvé dans ce fichier'); }
          renderPreview();
          if (rows.length) prev.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        let source = null;
        const reload = () => { if (source) load(source()); };

        ['#im-tp', '#im-td', '#im-prog', '#im-cm'].forEach((s) => $(s).addEventListener('change', reload));
        prev.addEventListener('change', (e) => {
          const i = e.target.getAttribute('data-i');
          const si = e.target.getAttribute('data-s');
          if (i != null) { rows[+i].keep = e.target.checked; renderPreview(); }
          if (si != null) rows[+si].subjectId = e.target.value;
        });

        const file = $('#im-file');
        const handleFile = async (fl) => {
          if (!fl) return;
          try {
            const txt = await ELA.ui.readFile(fl);
            if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/.test(txt)) { ELA.ui.toast('Ce fichier n’est pas un .ics'); return; }
            const parsed = ELA.timetable.parseICS(txt);
            source = () => parsed;
            load(parsed);
          } catch (e) { ELA.ui.toast('Lecture du fichier impossible'); }
        };
        file.addEventListener('change', () => handleFile(file.files[0]));
        const drop = $('.drop');
        ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
        ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
        drop.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
        $('#im-parse').addEventListener('click', () => {
          const txt = $('#im-text').value;
          const parsed = ELA.timetable.parseICS(txt);
          source = () => parsed;
          load(parsed);
        });
        $('#im-example').addEventListener('click', () => {
          source = () => ELA.timetable.exampleRows();
          load(source());
        });

        $('#im-manual').addEventListener('submit', (e) => {
          e.preventDefault();
          const f = e.target;
          const er = f.querySelector('.form-err');
          const s = u.toMin(f.start.value || '0:00'), en = u.toMin(f.end.value || '0:00') || 1440;
          if (!f.date.value) { er.textContent = 'Choisis le premier jour.'; er.hidden = false; return; }
          if (en <= s) { er.textContent = 'La fin doit être après le début.'; er.hidden = false; return; }
          er.hidden = true;
          const subj = store().subject(f.subjectId.value);
          const title = f.elements.title.value.trim() || (subj ? subj.name : 'Cours');
          const n = +f.weeks.value || 1;
          const weeks = new Set();
          store().commit((x) => {
            for (let k = 0; k < n; k++) {
              const d = u.addDays(f.date.value, 7 * k);
              weeks.add(u.weekStart(d));
              x.events.push({ id: u.uid('c'), kind: 'course', source: 'import', date: d, start: s, end: en, title: title, courseType: f.type.value, subjectId: subj ? subj.id : '', location: f.room.value.trim() });
            }
          }, { undo: 'Ajout de cours', silent: true });
          if (st().settings.autoPlan) weeks.forEach((w) => ELA.planner.planWeek(w, { silent: true }));
          store().emit({});
          ELA.ui.undoToast(n > 1 ? 'Cours ajouté sur ' + n + ' semaines' : 'Cours ajouté');
          f.elements.title.value = '';
        });

        go.addEventListener('click', () => {
          const res = ELA.timetable.importRows(rows, { replaceDays: $('#im-replace').checked });
          api.close();
          if (res.weeks[0]) { store().ui.date = res.weeks[0] <= u.today() && u.today() <= u.addDays(res.weeks[0], 6) ? u.today() : res.weeks[0]; store().saveUi(); }
          ELA.cal.needScroll = true;
          ELA.app.go('planning');
          ELA.ui.undoToast(res.count + ' cours importés · ' + res.weeks.length + (res.weeks.length > 1 ? ' semaines réadaptées' : ' semaine réadaptée'));
        });
      },
    });
  };

  /* ---------- Copier les cours sur les semaines suivantes ---------- */
  E.copyWeek = function () {
    const monday = u.weekStart(store().ui.date);
    const n = store().eventsWeek(monday).filter((e) => e.kind === 'course').length;
    if (!n) { ELA.ui.toast('Aucun cours cette semaine'); return; }
    ELA.ui.choose({
      title: 'Copier les cours de la semaine',
      text: n + ' cours de la semaine ' + u.isoWeek(monday) + ' seront recopiés (les cours déjà présents ces semaines-là sont remplacés).',
      choices: [{ value: '1', label: 'Sur la semaine suivante', primary: true }, { value: '4', label: 'Sur les 4 semaines suivantes' }, { value: '8', label: 'Sur les 8 semaines suivantes' }],
    }).then((v) => {
      if (!v) return;
      const c = ELA.timetable.copyWeek(monday, +v);
      ELA.ui.undoToast(c + ' cours copiés');
    });
  };
})();
