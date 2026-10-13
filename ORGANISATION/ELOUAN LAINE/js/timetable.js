/* Emploi du temps : lecture .ics (export ADE), filtre de groupe, correspondance matières, import. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  const T = (ELA.timetable = {});

  /* ---------- Lecture ICS ---------- */
  function unfold(text) {
    const raw = String(text).replace(/\r\n?/g, '\n').split('\n');
    const lines = [];
    raw.forEach((l) => {
      if (/^[ \t]/.test(l) && lines.length) lines[lines.length - 1] += l.slice(1);
      else if (l.trim()) lines.push(l);
    });
    return lines;
  }
  const unescapeIcs = (v) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

  function icsDate(value) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    const [, y, mo, d, hh, mm, ss, z] = m;
    if (hh === undefined) return { date: new Date(+y, +mo - 1, +d, 12), allDay: true };
    if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0))), allDay: false };
    return { date: new Date(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)), allDay: false };
  }

  T.parseICS = function (text) {
    const out = [];
    let cur = null;
    unfold(text).forEach((line) => {
      if (line === 'BEGIN:VEVENT') { cur = {}; return; }
      if (line === 'END:VEVENT') {
        if (cur && cur.start) out.push(cur);
        cur = null;
        return;
      }
      if (!cur) return;
      const i = line.indexOf(':');
      if (i < 0) return;
      const left = line.slice(0, i), value = line.slice(i + 1);
      const name = left.split(';')[0].toUpperCase();
      if (name === 'SUMMARY') cur.summary = unescapeIcs(value);
      else if (name === 'DESCRIPTION') cur.description = unescapeIcs(value);
      else if (name === 'LOCATION') cur.location = unescapeIcs(value);
      else if (name === 'UID') cur.uid = value;
      else if (name === 'DTSTART') cur.start = icsDate(value);
      else if (name === 'DTEND') cur.end = icsDate(value);
    });
    return out
      .filter((e) => e.start && !e.start.allDay)
      .map((e) => {
        const s = e.start.date, en = e.end ? e.end.date : new Date(s.getTime() + 3600000);
        const desc = (e.description || '').replace(/\(Export[ée]? le[^)]*\)/gi, '').trim();
        const lines = desc.split('\n').map((x) => x.trim()).filter(Boolean);
        const groups = lines.filter((x) => /\bgr|\btp|\btd|\bL\d\b|\(/i.test(x)).join(' · ');
        const teacher = lines.filter((x) => /^(M\.|Mme|Mr|Mlle|Dr)\b/.test(x)).join(', ');
        return {
          uid: e.uid || '',
          date: u.ymd(s),
          start: s.getHours() * 60 + s.getMinutes(),
          end: u.ymd(en) === u.ymd(s) ? en.getHours() * 60 + en.getMinutes() || 1440 : 1440,
          title: (e.summary || 'Cours').trim(),
          groups: groups,
          teacher: teacher,
          room: (e.location || '').trim(),
          text: [e.summary, e.description, e.location].join(' \n '),
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start));
  };

  /* Lignes de l'exemple (semaine 42) au même format */
  T.exampleRows = function () {
    return ELA.data.exampleWeek.map((r, i) => ({
      uid: 'ex42-' + i,
      date: r.date,
      start: u.toMin(r.start),
      end: u.toMin(r.end),
      title: r.title,
      type: r.type,
      groups: r.groups,
      teacher: r.teacher,
      room: r.room,
      text: [r.title, r.groups, r.type, r.teacher, r.room].join(' \n '),
    }));
  };

  /* ---------- Type de cours ---------- */
  T.courseType = function (row) {
    if (row.type) return row.type;
    const t = ' ' + row.text + ' ';
    if (/\bCM\b|cours magistral|amphi/i.test(t) && !/\bTD\b|\bTP\b/.test(row.groups || '')) return 'CM';
    if (/\bTP\b/.test(t)) return 'TP';
    if (/\bTD\b/.test(t)) return 'TD';
    if (/\bCM\b/.test(t)) return 'CM';
    return '';
  };

  /* ---------- Filtre : groupe de TP (lettre), groupe de TD (numéro), parcours ---------- */
  const STOP = { CM: 1, TD: 1, TP: 1, ST: 1, SV: 1, DS: 1, CC: 1, TPE: 1, UE: 1, ECUE: 1, LV: 1, ET: 1 };
  T.tokens = function (row) {
    const t = (row.groups || '') + ' ' + (row.title || '') + ' ' + (row.text || '');
    const letters = new Set(), numbers = new Set(), progs = new Set();
    let m;
    const reL = /\bGr\.?\s*([A-H])\b/g; // GrC, Gr C (pas « Gr BOE »)
    while ((m = reL.exec(t))) letters.add(m[1]);
    const reN = /\bGr\.?\s*(\d{1,2})\b/gi;
    while ((m = reN.exec(t))) numbers.add(m[1]);
    const reP = /\bGr\.?\s+([A-Z]{2,5})\b/g;
    while ((m = reP.exec(t))) if (!STOP[m[1]]) progs.add(m[1]);
    const reParen = /\(([^)]{1,40})\)/g;
    while ((m = reParen.exec(t))) {
      m[1].split(/[^A-Za-z]+/).forEach((w) => {
        if (/^[A-Z]{2,5}$/.test(w) && !STOP[w]) progs.add(w);
      });
    }
    return { letters: [...letters], numbers: [...numbers], progs: [...progs] };
  };

  T.check = function (row, g) {
    const type = T.courseType(row);
    const tk = T.tokens(row);
    const tp = String(g.tp || '').toUpperCase(), td = String(g.td || ''), prog = String(g.prog || '').toUpperCase();
    const label = [];
    if (tk.letters.length) label.push('Gr ' + tk.letters.join('/'));
    if (tk.numbers.length) label.push('Gr ' + tk.numbers.join('/'));
    if (tk.progs.length) label.push(tk.progs.join(' + '));
    const tag = label.join(' · ');
    if (type === 'CM' && g.keepCM) return { keep: true, why: 'CM', type };
    if (tk.letters.length && tp && tk.letters.indexOf(tp) < 0) return { keep: false, why: 'Autre groupe (' + tag + ')', type };
    if (tk.numbers.length && td && tk.numbers.indexOf(td) < 0) return { keep: false, why: 'Autre groupe (' + tag + ')', type };
    if (tk.progs.length && prog && tk.progs.indexOf(prog) < 0) return { keep: false, why: 'Autre parcours (' + tag + ')', type };
    if (!tag) return { keep: true, why: 'Toute la promo', type };
    return { keep: true, why: 'Ton groupe · ' + tag, type };
  };

  /* ---------- Matière ---------- */
  T.subjectFor = function (title) {
    const st = ELA.store.state;
    const key = u.norm(title).trim();
    const mapped = st.settings.courseMap[key];
    if (mapped && ELA.store.subject(mapped)) return mapped;
    for (const [re, id] of ELA.data.subjectRules) if (re.test(key) && ELA.store.subject(id)) return id;
    const byName = st.subjects.find((s) => u.norm(s.name) === key);
    return byName ? byName.id : '';
  };

  /* ---------- Préparation + import ---------- */
  T.prepare = function (rows) {
    const g = ELA.store.state.settings.group;
    return rows.map((r) => {
      const c = T.check(r, g);
      return Object.assign({}, r, { type: c.type, keep: c.keep, why: c.why, subjectId: T.subjectFor(r.title) });
    });
  };

  /* rows préparées (avec .keep) → événements ; remplace les cours importés des mêmes jours */
  T.importRows = function (rows, opts) {
    opts = opts || {};
    const chosen = rows.filter((r) => r.keep);
    const dates = new Set(chosen.map((r) => r.date));
    if (opts.replaceDays) rows.forEach((r) => dates.add(r.date));
    const weeks = new Set([...dates].map((d) => u.weekStart(d)));
    ELA.store.commit(
      (st) => {
        if (opts.replaceDays !== false) {
          st.events = st.events.filter((e) => !(e.kind === 'course' && e.source === 'import' && dates.has(e.date)));
        }
        chosen.forEach((r) => {
          st.events.push({
            id: u.uid('c'),
            kind: 'course',
            source: 'import',
            uid: r.uid || '',
            date: r.date,
            start: r.start,
            end: r.end,
            title: r.title,
            courseType: r.type || '',
            subjectId: r.subjectId || '',
            location: r.room || '',
            teacher: r.teacher || '',
            groups: r.groups || '',
          });
        });
      },
      { undo: 'Import de l’emploi du temps', silent: true }
    );
    if (ELA.store.state.settings.autoPlan) weeks.forEach((w) => ELA.planner.planWeek(w, { silent: true }));
    ELA.store.emit({});
    return { count: chosen.length, weeks: [...weeks] };
  };

  /* applique une correspondance titre → matière à tous les cours du même nom */
  T.mapTitle = function (title, subjectId) {
    const key = u.norm(title).trim();
    ELA.store.commit((st) => {
      st.settings.courseMap[key] = subjectId;
      st.events.forEach((e) => {
        if (e.kind === 'course' && u.norm(e.title).trim() === key) e.subjectId = subjectId;
      });
    });
  };

  T.courseTitles = function () {
    const map = new Map();
    ELA.store.state.events.forEach((e) => {
      if (e.kind !== 'course') return;
      const k = u.norm(e.title).trim();
      if (!map.has(k)) map.set(k, { title: e.title, subjectId: e.subjectId, n: 0 });
      map.get(k).n++;
    });
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  };

  /* duplique les cours d'une semaine sur les N suivantes */
  T.copyWeek = function (monday, n) {
    const src = ELA.store.eventsWeek(monday).filter((e) => e.kind === 'course');
    if (!src.length) return 0;
    const weeks = [];
    ELA.store.commit(
      (st) => {
        for (let k = 1; k <= n; k++) {
          const target = u.addDays(monday, 7 * k);
          weeks.push(target);
          const days = new Set(u.weekDays(target));
          st.events = st.events.filter((e) => !(e.kind === 'course' && days.has(e.date)));
          src.forEach((e) => {
            st.events.push(Object.assign({}, e, { id: u.uid('c'), date: u.addDays(e.date, 7 * k), uid: '', source: 'import' }));
          });
        }
      },
      { undo: 'Copie des cours', silent: true }
    );
    if (ELA.store.state.settings.autoPlan) weeks.forEach((w) => ELA.planner.planWeek(w, { silent: true }));
    ELA.store.emit({});
    return src.length * n;
  };
})();
