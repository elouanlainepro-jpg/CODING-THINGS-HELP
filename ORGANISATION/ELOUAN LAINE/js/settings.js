/* Onglet Réglages : profil, journée type, basket, salle, emploi du temps, matières, données & partage. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  ELA.pages = ELA.pages || {};
  ELA.actions = ELA.actions || {};
  const store = () => ELA.store;
  const st = () => ELA.store.state;

  const replanSoon = u.debounce(() => {
    const n = ELA.planner.replanFuture();
    if (n) ELA.ui.toast('Planning réadapté (' + n + ' semaine' + (n > 1 ? 's' : '') + ')');
  }, 700);

  const opt = (v, label, sel) => '<option value="' + u.esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + u.esc(label) + '</option>';
  const timeVal = (m) => (m >= 1440 ? '00:00' : u.hm(m));
  const num = (id, label, val, min, max, step, suffix, attrs) =>
    '<div class="field"><label for="' + id + '">' + label + '</label><div class="with-suffix"><input id="' + id + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + val + '" ' + (attrs || '') + '><span>' + suffix + '</span></div></div>';
  const time = (id, label, val, attrs) => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="time" step="300" value="' + timeVal(val) + '" ' + (attrs || '') + '></div>';
  const check = (id, label, on, attrs) => '<label class="check"><input type="checkbox" id="' + id + '" ' + (on ? 'checked ' : '') + (attrs || '') + '><span>' + label + '</span></label>';

  /* ---------- Export .ics (pour l'app Calendrier de l'iPhone) ---------- */
  function icsText(events) {
    const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const dt = (d, m) => d.replace(/-/g, '') + 'T' + u.pad(Math.floor(m / 60)) + u.pad(m % 60) + '00';
    const fold = (l) => {
      const out = [];
      while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); }
      out.push(l);
      return out.join('\r\n');
    };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elouan Laine//Studio//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:ELOUAN LAINE'];
    events.forEach((e) => {
      lines.push('BEGIN:VEVENT', 'UID:' + e.id + '@elouan-laine-studio', 'DTSTAMP:' + stamp);
      if (e.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + u.addDays(e.date, 1).replace(/-/g, ''));
      } else {
        lines.push('DTSTART:' + dt(e.date, e.start));
        lines.push('DTEND:' + (e.end >= 1440 ? dt(u.addDays(e.date, 1), 0) : dt(e.date, e.end)));
      }
      lines.push(fold('SUMMARY:' + esc(ELA.cal.titleOf(e) + (e.kind === 'course' && e.courseType ? ' (' + e.courseType + ')' : ''))));
      if (e.location) lines.push(fold('LOCATION:' + esc(e.location)));
      if (e.notes) lines.push(fold('DESCRIPTION:' + esc(e.notes)));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  ELA.icsText = icsText;

  ELA.pages.reglages = {
    render(root) {
      const S = st().settings, p = st().profile, g = S.group;
      const titles = ELA.timetable.courseTitles();
      const subjSel = (sel) => '<option value="">Aucune</option>' + st().subjects.map((s) => opt(s.id, s.name, sel)).join('');
      const artifact = ELA.ui.inArtifact();

      root.innerHTML =
        '<section class="page settings">' +
        '<header class="page-head"><div><p class="eyebrow">Réglages</p><h2 class="h-page">Ton studio</h2></div>' +
        '<p class="page-stats"><span class="sync sync-' + store().sync + '">' + (store().sync === 'cloud' ? 'Synchronisé avec ton compte Claude' : 'Enregistré sur cet appareil') + '</span></p></header>' +
        '<nav class="toc" aria-label="Sections">' + [['set-profil', 'Profil'], ['set-day', 'Journée'], ['set-basket', 'Basket'], ['set-sport', 'Salle'], ['set-edt', 'Emploi du temps'], ['set-subj', 'Matières'], ['set-data', 'Données']].map(([a, l]) =>
          '<a href="#' + a + '" data-act="toc" data-anchor="' + a + '">' + l + '</a>').join('') + '</nav>' +

        '<section class="card" id="set-profil"><h3 class="h-sub">Profil</h3><div class="grid4">' +
        '<div class="field"><label for="p-name">Nom affiché</label><input id="p-name" data-k="profile.name" value="' + u.esc(p.name) + '" maxlength="40"></div>' +
        '<div class="field"><label for="p-birth">Naissance</label><input id="p-birth" type="date" data-k="profile.birth" value="' + p.birth + '"></div>' +
        num('p-height', 'Taille', p.height, 120, 230, 1, 'cm', 'data-k="profile.height"') +
        '<div class="field"><label for="p-weight">Poids</label><div class="with-suffix"><input id="p-weight" type="text" inputmode="decimal" autocomplete="off" value="' + String(p.weight).replace('.', ',') + '" data-k="weight" data-t="kg"><span>kg</span></div></div>' +
        '</div></section>' +

        '<section class="card" id="set-day"><h3 class="h-sub">Journée type</h3><p class="muted small">Réveil, coucher et repas sont placés automatiquement chaque jour.</p><div class="grid4">' +
        time('d-wake', 'Réveil', S.wake, 'data-k="settings.wake" data-t="time" data-plan') +
        time('d-sleep', 'Coucher', S.sleep, 'data-k="settings.sleep" data-t="sleep" data-plan') +
        num('d-toil', 'Toilette', S.toilette, 5, 60, 5, 'min', 'data-k="settings.toilette" data-plan') +
        num('d-bf', 'Petit-déj', S.breakfast, 5, 60, 5, 'min', 'data-k="settings.breakfast" data-plan') +
        num('d-din', 'Dîner', S.dinner.dur, 10, 90, 5, 'min', 'data-k="settings.dinner.dur" data-plan') +
        time('d-dint', 'Dîner idéal à', S.dinner.target, 'data-k="settings.dinner.target" data-t="time" data-plan') +
        num('d-lun', 'Déjeuner', S.lunch.dur, 10, 90, 5, 'min', 'data-k="settings.lunch.dur" data-plan') +
        '<div class="field field-check">' + check('d-lunon', 'Placer le déjeuner', S.lunch.on, 'data-k="settings.lunch.on" data-t="bool" data-plan') + '</div>' +
        '</div></section>' +

        '<section class="card" id="set-basket"><h3 class="h-sub">Basket univ</h3><p class="muted small">Tes entraînements d’équipe. « Parfois » = à confirmer chaque semaine (comme le jeudi).</p>' +
        '<ul class="trlist">' + S.trainings.map((t, i) =>
          '<li class="trrow" data-i="' + i + '"><label class="sr" for="tr-d' + i + '">Jour</label><select id="tr-d' + i + '" data-tr="day">' + u.DAYS_LONG.map((d, k) => opt(k, d, t.day)).join('') + '</select>' +
          '<label class="sr" for="tr-s' + i + '">Début</label><input id="tr-s' + i + '" type="time" step="300" data-tr="start" value="' + u.hm(t.start) + '">' +
          '<span class="muted">→</span><label class="sr" for="tr-e' + i + '">Fin</label><input id="tr-e' + i + '" type="time" step="300" data-tr="end" value="' + timeVal(t.end) + '">' +
          check('tr-o' + i, 'Parfois', t.optional, 'data-tr="optional"') +
          '<button type="button" class="iconbtn sm" data-act="tr-del" data-i="' + i + '" aria-label="Supprimer ce créneau">' + u.icon('trash') + '</button></li>').join('') + '</ul>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="tr-add">' + u.icon('plus') + 'Ajouter un créneau</button></section>' +

        '<section class="card" id="set-sport"><h3 class="h-sub">Salle & entraînements perso</h3>' +
        '<div class="checks">' + [['push', 'Push'], ['pull', 'Pull'], ['legsA', 'Legs A (force)'], ['legsB', 'Legs B (explosivité)']].map(([k, l]) =>
          check('g-' + k, l, S.gym.sessions[k], 'data-k="settings.gym.sessions.' + k + '" data-t="bool" data-plan')).join('') + '</div>' +
        '<div class="grid4">' +
        time('g-start', 'Salle à partir de', S.gym.start, 'data-k="settings.gym.start" data-t="time" data-plan') +
        num('g-dur', 'Durée salle', S.gym.dur, 30, 150, 5, 'min', 'data-k="settings.gym.dur" data-plan') +
        num('s-n', 'Basket solo', S.solo.perWeek, 0, 7, 1, '/ sem.', 'data-k="settings.solo.perWeek" data-plan') +
        time('s-start', 'Solo en semaine', S.solo.start, 'data-k="settings.solo.start" data-t="time" data-plan') +
        time('s-we', 'Solo le week-end', S.solo.weekendStart, 'data-k="settings.solo.weekendStart" data-t="time" data-plan') +
        num('f-n', 'Footing 1 h', S.footing.perWeek, 0, 4, 1, '/ sem.', 'data-k="settings.footing.perWeek" data-plan') +
        num('th-n', 'Tom Holland', S.tomholland.perWeek, 0, 7, 1, '/ sem.', 'data-k="settings.tomholland.perWeek" data-plan') +
        '<div class="field field-check">' + check('g-pm', 'Salle l’après-midi si besoin', S.gym.afternoon, 'data-k="settings.gym.afternoon" data-t="bool" data-plan') + '</div>' +
        '</div></section>' +

        '<section class="card" id="set-edt"><h3 class="h-sub">Emploi du temps</h3>' +
        '<div class="grid4">' +
        '<div class="field"><label for="e-tp">Groupe de TP</label><input id="e-tp" data-k="settings.group.tp" data-t="upper" value="' + u.esc(g.tp) + '" maxlength="2"></div>' +
        '<div class="field"><label for="e-td">Groupe de TD</label><input id="e-td" data-k="settings.group.td" value="' + u.esc(g.td) + '" maxlength="2"></div>' +
        '<div class="field"><label for="e-prog">Parcours</label><input id="e-prog" data-k="settings.group.prog" data-t="upper" value="' + u.esc(g.prog) + '" maxlength="6"></div>' +
        '<div class="field field-check">' + check('e-cm', 'Garder tous les CM', g.keepCM, 'data-k="settings.group.keepCM" data-t="bool"') + '</div></div>' +
        '<div class="btn-row"><button type="button" class="btn btn-primary btn-sm" data-act="import">' + u.icon('upload') + 'Importer / ajouter des cours</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="copy-week">' + u.icon('copy') + 'Copier les cours de la semaine affichée</button></div>' +
        (titles.length
          ? '<h4 class="h-mini">Cours → matière</h4><ul class="maplist">' + titles.map((t, i) =>
              '<li><label for="map-' + i + '"><b>' + u.esc(t.title) + '</b><small>' + t.n + ' créneau' + (t.n > 1 ? 'x' : '') + '</small></label><select id="map-' + i + '" data-map="' + u.esc(t.title) + '">' + subjSel(t.subjectId) + '</select></li>').join('') + '</ul>'
          : '') +
        '</section>' +

        '<section class="card" id="set-subj"><h3 class="h-sub">Matières</h3><p class="muted small">Objectif de révision par semaine, couleur et nom court (affiché dans le planning).</p>' +
        '<ul class="subjlist">' + st().subjects.map((s, i) =>
          '<li data-i="' + i + '"><label class="sr" for="sc-' + i + '">Couleur</label><input type="color" id="sc-' + i + '" data-sub="color" value="' + s.color + '">' +
          '<label class="sr" for="sn-' + i + '">Nom</label><input id="sn-' + i + '" data-sub="name" value="' + u.esc(s.name) + '" maxlength="40">' +
          '<label class="sr" for="ss-' + i + '">Nom court</label><input id="ss-' + i + '" data-sub="short" value="' + u.esc(s.short) + '" maxlength="12" class="short">' +
          '<div class="with-suffix tgt"><label class="sr" for="st-' + i + '">Objectif</label><input id="st-' + i + '" type="number" min="0" max="20" step="0.5" data-sub="target" value="' + (s.target || 0) + '"><span>h</span></div>' +
          '<button type="button" class="iconbtn sm" data-act="subj-del" data-i="' + i + '" aria-label="Supprimer ' + u.esc(s.name) + '">' + u.icon('trash') + '</button></li>').join('') + '</ul>' +
        '<form class="inline-form" id="subj-add" novalidate><label for="sa-name" class="sr">Nouvelle matière</label><input id="sa-name" name="sname" placeholder="Nouvelle matière" maxlength="40"><button type="submit" class="btn btn-ghost btn-sm">' + u.icon('plus') + 'Ajouter</button></form>' +
        '</section>' +

        '<section class="card" id="set-plan"><h3 class="h-sub">Planification automatique</h3>' +
        check('a-auto', 'Planifier automatiquement chaque nouvelle semaine (routine + sport)', S.autoPlan, 'data-k="settings.autoPlan" data-t="bool"') +
        '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-act="replan-all">' + u.icon('wand') + 'Réadapter cette semaine et les suivantes</button></div>' +
        '<p class="hint">Tes cours, rendez-vous, révisions et tout ce que tu as déplacé à la main ne bougent jamais.</p></section>' +

        '<section class="card" id="set-data"><h3 class="h-sub">Données & partage</h3>' +
        '<div class="data-grid">' +
        '<div><h4 class="h-mini">Vers le Calendrier de l’iPhone</h4><p class="muted small">Fichier .ics des 8 prochaines semaines (cours, sport, révisions, rendez-vous).</p>' +
        check('x-rout', 'Inclure la routine (repas, toilette)', false) +
        '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-act="ics-dl">' + u.icon('download') + 'Télécharger .ics</button><button type="button" class="btn btn-ghost btn-sm" data-act="ics-copy">' + u.icon('copy') + 'Copier</button></div></div>' +
        '<div><h4 class="h-mini">Sauvegarde</h4><p class="muted small">Tout ton studio dans un fichier JSON.</p>' +
        '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-act="json-dl">' + u.icon('download') + 'Exporter</button>' +
        '<label class="btn btn-ghost btn-sm" for="json-file">' + u.icon('upload') + 'Importer</label><input type="file" id="json-file" accept=".json,application/json" class="sr"></div></div>' +
        '<div><h4 class="h-mini">Code de transfert</h4><p class="muted small">Un code compact (même principe que Hash Calendar) pour copier ton studio sur un autre appareil.</p>' +
        '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-act="code-make">' + u.icon('share') + 'Créer le code</button>' +
        (!artifact ? '<button type="button" class="btn btn-ghost btn-sm" data-act="link-make">' + u.icon('link') + 'Lien de partage</button>' : '') + '</div>' +
        '<textarea id="code-box" rows="3" placeholder="Colle ici un code reçu, puis « Charger le code »" spellcheck="false"></textarea>' +
        '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-act="code-copy">' + u.icon('copy') + 'Copier</button><button type="button" class="btn btn-ghost btn-sm" data-act="code-load">' + u.icon('upload') + 'Charger le code</button></div></div>' +
        '<div><h4 class="h-mini">Repartir de zéro</h4><p class="muted small">Efface tout et recharge l’exemple de la semaine 42.</p>' +
        '<button type="button" class="btn btn-danger btn-sm" data-act="reset">' + u.icon('trash') + 'Réinitialiser le studio</button></div>' +
        '</div></section>' +

        '<p class="credits">ELOUAN LAINE · studio d’organisation. Partage par code et import .ics inspirés de <a class="link" href="https://github.com/supunlakmal/hash-calendar" target="_blank" rel="noopener noreferrer">Hash Calendar</a> (licence MIT).</p>' +
        '</section>';

      bind(root);
    },
  };

  function setPath(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
  }

  function bind(root) {
    const sec = root.querySelector('.page.settings');
    sec.addEventListener('change', (e) => {
      const el = e.target;
      const k = el.getAttribute('data-k');
      if (k) {
        const t = el.getAttribute('data-t');
        let v;
        if (t === 'bool') v = el.checked;
        else if (t === 'time') { if (!el.value) return; v = u.toMin(el.value); }
        else if (t === 'sleep') {
          if (!el.value) return;
          v = u.toMin(el.value);
          if (v < 12 * 60) { if (v) ELA.ui.toast('Coucher après minuit : le planning s’arrête à 00:00'); v = 1440; el.value = '00:00'; }
        }
        else if (t === 'upper') v = el.value.trim().toUpperCase();
        else if (t === 'kg') {
          v = parseFloat(String(el.value).replace(',', '.'));
          if (!(v >= 35 && v <= 200)) { ELA.ui.toast('Entre un poids entre 35 et 200 kg'); el.value = String(st().profile.weight).replace('.', ','); return; }
        }
        else if (el.type === 'number') {
          v = parseFloat(String(el.value).replace(',', '.'));
          const mn = parseFloat(el.min), mx = parseFloat(el.max);
          if (isNaN(v)) { ELA.ui.toast('Valeur invalide'); return; }
          v = u.clamp(v, isNaN(mn) ? v : mn, isNaN(mx) ? v : mx);
          el.value = v;
        } else v = el.value.trim();
        if (k === 'weight') { ELA.editor.setWeight(Math.round(v * 10) / 10, u.today()); ELA.ui.toast('Poids enregistré'); return; }
        if (k === 'profile.name' && !v) { el.value = st().profile.name; return; }
        if (k === 'settings.wake' && v >= st().settings.sleep - 6 * 60) { ELA.ui.toast('Le réveil doit être bien avant le coucher'); el.value = u.hm(st().settings.wake); return; }
        store().commit((x) => setPath(x, k, v), { silent: true, undo: 'Réglage' });
        ELA.app.renderChrome();
        if (el.hasAttribute('data-plan')) replanSoon();
        else ELA.ui.toast('Enregistré');
        return;
      }
      const tr = el.getAttribute('data-tr');
      if (tr) {
        const i = +el.closest('.trrow').dataset.i;
        let v = tr === 'optional' ? el.checked : tr === 'day' ? +el.value : u.toMin(el.value || '0:00');
        if (tr === 'end' && v === 0) v = 1440;
        const cur = st().settings.trainings[i];
        if ((tr === 'start' && v >= cur.end) || (tr === 'end' && v <= cur.start)) { ELA.ui.toast('La fin doit être après le début'); ELA.app.render(); return; }
        store().commit((x) => { x.settings.trainings[i][tr] = v; }, { silent: true, undo: 'Basket' });
        replanSoon();
        return;
      }
      const map = el.getAttribute('data-map');
      if (map) { ELA.timetable.mapTitle(map, el.value); ELA.ui.toast('Matière associée'); return; }
      const sub = el.getAttribute('data-sub');
      if (sub) {
        const i = +el.closest('li').dataset.i;
        let v = el.value;
        if (sub === 'target') v = u.clamp(parseFloat(v) || 0, 0, 20);
        if ((sub === 'name' || sub === 'short') && !String(v).trim()) { ELA.app.render(); return; }
        store().commit((x) => { x.subjects[i][sub] = typeof v === 'string' ? v.trim() : v; }, { silent: true, undo: 'Matière' });
        ELA.ui.toast('Matière mise à jour');
        return;
      }
      if (el.id === 'json-file' && el.files[0]) importJSONFile(el.files[0]);
    });
    const add = root.querySelector('#subj-add');
    add.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = add.elements.sname.value.trim();
      if (!name) return;
      const palette = ['#f2a65a', '#7fd1ff', '#c7a0ff', '#ff8fa3', '#9be7a1', '#ffd36e'];
      store().commit((x) => {
        x.subjects.push({ id: u.uid('sub'), name: name, short: name.slice(0, 10), color: palette[x.subjects.length % palette.length], target: 1 });
      }, { undo: 'Ajout de matière' });
      ELA.ui.toast('Matière ajoutée');
    });
  }

  async function importJSONFile(file) {
    try {
      const txt = await ELA.ui.readFile(file);
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.events) || !data.settings) throw new Error('format');
      const ok = await ELA.ui.confirm({ title: 'Remplacer ton studio ?', text: 'Le fichier contient ' + data.events.length + ' éléments et ' + (data.tasks || []).length + ' tâches. Ton planning actuel sera remplacé (tu pourras annuler).', ok: 'Remplacer' });
      if (!ok) return;
      store().pushUndo('Import JSON');
      store().replace(data);
      ELA.ui.undoToast('Studio importé');
    } catch (e) {
      ELA.ui.toast('Fichier illisible : choisis une sauvegarde exportée depuis le studio');
    }
  }

  const exportEvents = () => {
    const inclRoutine = (document.getElementById('x-rout') || {}).checked;
    const from = u.weekStart(u.today()), to = u.addDays(from, 7 * 8);
    return st().events.filter((e) => e.date >= from && e.date < to && !e.tentative && (inclRoutine || e.kind !== 'routine')).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start));
  };

  ELA.actions['tr-add'] = () => {
    store().commit((x) => { x.settings.trainings.push({ id: u.uid('tr'), day: 4, start: 19 * 60, end: 20 * 60 + 30, optional: false }); }, { undo: 'Basket' });
    replanSoon();
  };
  ELA.actions['tr-del'] = (el) => {
    store().commit((x) => { x.settings.trainings.splice(+el.dataset.i, 1); }, { undo: 'Suppression d’entraînement' });
    replanSoon();
  };
  ELA.actions['subj-del'] = async (el) => {
    const s = st().subjects[+el.dataset.i];
    if (!s) return;
    const used = st().events.filter((e) => e.subjectId === s.id).length;
    const ok = await ELA.ui.confirm({ title: 'Supprimer ' + s.name + ' ?', text: used ? used + ' éléments du planning utilisent cette matière : ils resteront, sans couleur de matière.' : 'Elle n’est utilisée nulle part.', ok: 'Supprimer', danger: true });
    if (!ok) return;
    store().commit((x) => {
      x.subjects = x.subjects.filter((z) => z.id !== s.id);
      x.events.forEach((e) => { if (e.subjectId === s.id) e.subjectId = ''; });
      x.tasks.forEach((t) => { if (t.subjectId === s.id) t.subjectId = ''; });
    }, { undo: 'Suppression de matière' });
    ELA.ui.undoToast(s.name + ' supprimée');
  };
  ELA.actions['replan-all'] = () => {
    store().pushUndo('Réadaptation');
    const n = ELA.planner.replanFuture();
    ELA.ui.undoToast(n + ' semaine' + (n > 1 ? 's' : '') + ' réadaptée' + (n > 1 ? 's' : ''));
  };
  ELA.actions['copy-week'] = () => ELA.editor.copyWeek();
  ELA.actions['ics-dl'] = async () => {
    const evs = exportEvents();
    const ok = await ELA.ui.download('elouan-laine-planning.ics', icsText(evs), 'text/calendar');
    if (ok) ELA.ui.toast(evs.length + ' éléments exportés');
  };
  ELA.actions['ics-copy'] = () => {
    const txt = icsText(exportEvents());
    const box = document.getElementById('code-box');
    if (box) box.value = txt;
    ELA.ui.copy(txt, box);
  };
  ELA.actions['json-dl'] = () => ELA.ui.download('elouan-laine-studio-' + u.today() + '.json', JSON.stringify(st(), null, 1), 'application/json');
  ELA.actions['code-make'] = async () => {
    const box = document.getElementById('code-box');
    const code = 'ELA1:' + (await store().encode(st()));
    box.value = code;
    ELA.ui.copy(code, box);
  };
  ELA.actions['code-copy'] = () => {
    const box = document.getElementById('code-box');
    if (!box.value) { ELA.ui.toast('Crée d’abord un code'); return; }
    ELA.ui.copy(box.value, box);
  };
  ELA.actions['link-make'] = async () => {
    const box = document.getElementById('code-box');
    const link = location.href.split('#')[0] + '#s=' + (await store().encode(st()));
    box.value = link;
    ELA.ui.copy(link, box);
  };
  ELA.actions['code-load'] = async () => {
    const box = document.getElementById('code-box');
    const raw = (box.value || '').trim();
    if (!raw) { ELA.ui.toast('Colle un code d’abord'); return; }
    try {
      const data = await store().decode(raw.indexOf('#s=') >= 0 ? raw.slice(raw.indexOf('#s=') + 3) : raw);
      if (!data || !Array.isArray(data.events)) throw new Error('format');
      const ok = await ELA.ui.confirm({ title: 'Charger ce studio ?', text: data.events.length + ' éléments et ' + (data.tasks || []).length + ' tâches. Ton planning actuel sera remplacé (tu pourras annuler).', ok: 'Charger' });
      if (!ok) return;
      store().pushUndo('Chargement du code');
      store().replace(data);
      ELA.ui.undoToast('Studio chargé');
    } catch (e) {
      ELA.ui.toast('Code illisible : vérifie qu’il est complet');
    }
  };
  ELA.actions.reset = async () => {
    const ok = await ELA.ui.confirm({ title: 'Réinitialiser le studio ?', text: 'Tout ton planning, tes tâches et tes réglages seront effacés, puis l’exemple de la semaine 42 sera rechargé.', ok: 'Tout effacer', danger: true });
    if (!ok) return;
    store().pushUndo('Réinitialisation');
    store().replace(store().defaults());
    ELA.app.seed();
    store().commit(() => {}, { silent: true }); // la réinitialisation est un vrai choix : elle passe devant la copie distante
    ELA.ui.undoToast('Studio réinitialisé');
  };
  ELA.actions.toc = (el, e) => {
    e.preventDefault();
    const t = document.getElementById(el.dataset.anchor);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();
