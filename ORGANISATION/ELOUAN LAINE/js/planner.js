/* Planification automatique d'une semaine autour des cours :
   routine (réveil, repas), basket univ, salle PPL (legs ×2 loin du basket), footing, basket solo, Tom Holland. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  const P = (ELA.planner = {});
  const SP = () => ELA.data.sports;

  const overlaps = (a1, b1, a2, b2) => a1 < b2 && a2 < b1;

  /* premier départ libre dans [from, to] pour une durée dur, avec une marge gap autour des créneaux occupés */
  function findFree(list, from, to, dur, gap) {
    gap = gap || 0;
    const iv = list.map((x) => [x[0] - gap, x[1] + gap]).sort((a, b) => a[0] - b[0]);
    let s = from;
    for (const [a, b] of iv) {
      if (b <= s) continue;
      if (a >= s + dur) break;
      s = Math.max(s, b);
    }
    return s + dur <= to ? s : -1;
  }
  P.findFree = findFree;

  function combos(arr, k) {
    const out = [];
    const rec = (start, acc) => {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
    };
    if (k <= 0) return [[]];
    rec(0, []);
    return out;
  }

  P.planWeek = function (monday, opts) {
    opts = opts || {};
    const store = ELA.store;
    const days = u.weekDays(monday);
    const daySet = new Set(days);

    store.commit(
      (st) => {
        const S = st.settings;
        st.events = st.events.filter((e) => !(daySet.has(e.date) && e.auto && !e.done));
        const kept = st.events.filter((e) => daySet.has(e.date) && !e.allDay);
        const busy = days.map((d) => kept.filter((e) => e.date === d).map((e) => [e.start, e.end, e]));
        const has = (i, pred) => busy[i].some((x) => pred(x[2]));
        const isFree = (i, s, e) => !busy[i].some((x) => overlaps(s, e, x[0], x[1]));
        const add = (i, ev) => {
          const e = Object.assign({ id: u.uid('a'), auto: true, date: days[i] }, ev);
          st.events.push(e);
          busy[i].push([e.start, e.end, e]);
          return e;
        };
        const sportEv = (i, type, start, dur, extra) =>
          add(i, Object.assign({ kind: 'sport', sport: type, title: SP()[type].long, start: start, end: Math.min(1440, start + dur) }, extra || {}));
        const countKept = (type) => kept.filter((e) => e.kind === 'sport' && e.sport === type).length;

        /* 1. Routine du matin */
        const wake = S.wake;
        days.forEach((d, i) => {
          if (!has(i, (e) => e.kind === 'routine' && e.routine === 'toilette'))
            add(i, { kind: 'routine', routine: 'toilette', title: 'Toilette', start: wake, end: wake + S.toilette });
          if (!has(i, (e) => e.kind === 'routine' && e.routine === 'breakfast'))
            add(i, { kind: 'routine', routine: 'breakfast', title: 'Petit-déj', start: wake + S.toilette, end: wake + S.toilette + S.breakfast });
        });
        const morningEnd = wake + S.toilette + S.breakfast;

        /* 2. Basket univ (créneaux fixes, jeudi à confirmer) */
        const teamLevel = new Array(8).fill(0); // 0 rien, 1 à confirmer, 2 sûr ; index 7 = lundi suivant
        days.forEach((d, i) => {
          S.trainings.filter((t) => t.day === i).forEach((t) => {
            const key = d + '#' + t.id;
            const answer = t.optional ? st.optional[key] || 'maybe' : 'yes';
            if (answer === 'no') return;
            const existing = busy[i].find((x) => x[2].kind === 'sport' && x[2].sport === 'team' && overlaps(t.start, t.end, x[0], x[1]));
            if (existing) {
              teamLevel[i] = Math.max(teamLevel[i], existing[2].tentative ? 1 : 2);
              return;
            }
            sportEv(i, 'team', t.start, t.end - t.start, {
              trainingId: t.id,
              optKey: t.optional ? key : '',
              tentative: answer === 'maybe',
              title: answer === 'maybe' ? 'Basket univ (à confirmer)' : SP().team.long,
            });
            teamLevel[i] = Math.max(teamLevel[i], answer === 'maybe' ? 1 : 2);
          });
          if (has(i, (e) => e.kind === 'sport' && e.sport === 'team')) teamLevel[i] = Math.max(teamLevel[i], 1);
        });
        S.trainings.filter((t) => t.day === 0).forEach((t) => { teamLevel[7] = Math.max(teamLevel[7], t.optional ? 1 : 2); });
        const team = (i) => (i < 0 ? 0 : teamLevel[Math.min(i, 7)]);
        const teamEvening = (i) => busy[i].some((x) => x[2].kind === 'sport' && x[2].sport === 'team' && x[1] > 17 * 60);

        /* 3. Déjeuner */
        if (S.lunch.on) {
          days.forEach((d, i) => {
            if (has(i, (e) => e.kind === 'routine' && e.routine === 'lunch')) return;
            let s = findFree(busy[i], 720, 840, S.lunch.dur);
            if (s < 0) s = findFree(busy[i], 675, 720, S.lunch.dur);
            if (s >= 0) add(i, { kind: 'routine', routine: 'lunch', title: 'Déjeuner', start: s, end: s + S.lunch.dur });
          });
        }

        /* 4. Salle : Push / Pull / Legs ×2, legs placés loin du basket */
        const gymTypes = ['push', 'pull', 'legsA', 'legsB'].filter((t) => S.gym.sessions[t] && !countKept(t));
        const legsLabels = ['legsA', 'legsB'].filter((t) => gymTypes.indexOf(t) >= 0);
        const generic = gymTypes.map((t) => (t === 'legsA' || t === 'legsB' ? 'legs' : t));
        const priority = ['legs', 'push', 'pull', 'legs'];
        const want = [];
        const pool = generic.slice();
        priority.forEach((p) => {
          const k = pool.indexOf(p);
          if (k >= 0) { want.push(p); pool.splice(k, 1); }
        });
        const gymDur = S.gym.dur;
        const cand = [];
        days.forEach((d, i) => {
          if (has(i, (e) => e.kind === 'sport' && /^(push|pull|legsA|legsB)$/.test(e.sport))) return;
          if (!teamEvening(i)) {
            const s = findFree(busy[i], S.gym.start, 21 * 60 + 45, gymDur, 15);
            if (s >= 0 && s <= 20 * 60 + 30) { cand.push({ i: i, s: s, pen: 0, pm: false }); return; }
          }
          if (S.gym.afternoon) {
            const s = findFree(busy[i], 13 * 60 + 30, 18 * 60, gymDur, 15);
            if (s >= 0) cand.push({ i: i, s: s, pen: 1.5, pm: true });
          }
        });
        let best = null;
        const n = Math.min(want.length, cand.length);
        const types = want.slice(0, n);
        const score = (assign) => {
          let p = 0;
          const legsDays = [];
          assign.forEach((c, k) => {
            p += c.pen;
            if (types[k] === 'legs') {
              legsDays.push(c.i);
              p += team(c.i) === 2 ? 6 : team(c.i) === 1 ? 3.5 : 0;
              p += team(c.i + 1) === 2 ? 3 : team(c.i + 1) === 1 ? 1 : 0;
              p += team(c.i - 1) === 2 ? 0.5 : 0;
            } else if (team(c.i)) p += 1;
          });
          legsDays.sort((a, b) => a - b);
          for (let k = 1; k < legsDays.length; k++) if (legsDays[k] - legsDays[k - 1] <= 1) p += 5;
          const ds = assign.map((c) => c.i).sort((a, b) => a - b);
          for (let k = 1; k < ds.length; k++) if (ds[k] - ds[k - 1] === 1) p += 0.3;
          return p;
        };
        const rec = (k, used, acc) => {
          if (k === n) {
            const sc = score(acc);
            if (!best || sc < best.sc - 1e-9) best = { sc: sc, assign: acc.slice() };
            return;
          }
          cand.forEach((c) => {
            if (used.has(c.i)) return;
            used.add(c.i); acc.push(c);
            rec(k + 1, used, acc);
            acc.pop(); used.delete(c.i);
          });
        };
        if (n > 0) rec(0, new Set(), []);
        const gymDay = {};
        if (best) {
          const placed = best.assign.map((c, k) => ({ c: c, t: types[k] })).sort((a, b) => a.c.i - b.c.i);
          let li = 0;
          placed.forEach((p) => {
            const type = p.t === 'legs' ? legsLabels[li++] : p.t;
            if (!type) return;
            sportEv(p.c.i, type, p.c.s, gymDur);
            gymDay[p.c.i] = type;
          });
        }
        kept.forEach((e) => {
          if (e.kind === 'sport' && /^(push|pull|legsA|legsB)$/.test(e.sport)) gymDay[days.indexOf(e.date)] = e.sport;
        });
        const isLegs = (i) => /^legs/.test(gymDay[i] || '');
        const isUpper = (i) => gymDay[i] === 'push' || gymDay[i] === 'pull';
        const sportOn = (i, type) => has(i, (e) => e.kind === 'sport' && e.sport === type);

        /* 5. Footing (1 h), plutôt le week-end matin */
        const footNeed = Math.max(0, S.footing.perWeek - countKept('footing'));
        if (footNeed) {
          const fc = [];
          days.forEach((d, i) => {
            if (sportOn(i, 'footing')) return;
            let s = -1, pen = 0;
            if (i >= 5) { s = findFree(busy[i], 570, 720, S.footing.dur, 0); pen -= 0.5; }
            else if (!teamEvening(i) && !gymDay[i]) s = findFree(busy[i], 17 * 60 + 30, 21 * 60, S.footing.dur, 15);
            if (s < 0) return;
            pen += isLegs(i) ? 3 : 0;
            pen += isLegs(i - 1) ? 1.5 : 0;
            pen += team(i) ? 2 : 0;
            pen += team(i + 1) === 2 ? 0.5 : 0;
            pen += isUpper(i) ? 1 : 0;
            fc.push({ i: i, s: s, pen: pen });
          });
          const pick = combos(fc, Math.min(footNeed, fc.length))
            .map((c) => ({ c: c, sc: c.reduce((a, x) => a + x.pen, 0) + c.reduce((a, x, k) => a + (k && x.i - c[k - 1].i === 1 ? 2 : 0), 0) }))
            .sort((a, b) => a.sc - b.sc)[0];
          if (pick) pick.c.forEach((x) => sportEv(x.i, 'footing', x.s, S.footing.dur));
        }

        /* 6. Basket solo le matin */
        const soloNeed = Math.max(0, S.solo.perWeek - countKept('solo'));
        if (soloNeed) {
          const sc = [];
          days.forEach((d, i) => {
            if (sportOn(i, 'solo')) return;
            let s;
            if (i >= 5) s = findFree(busy[i], Math.max(S.solo.weekendStart, morningEnd), 12 * 60, S.solo.dur, 0);
            else {
              const firsts = busy[i].filter((x) => x[2].kind !== 'routine' && x[0] >= morningEnd).map((x) => x[0]);
              const first = firsts.length ? Math.min.apply(null, firsts) : 12 * 60 + 45;
              s = findFree(busy[i], Math.max(S.solo.start, morningEnd + 15), Math.min(first - 45, 12 * 60), S.solo.dur, 0);
            }
            if (s < 0) return;
            let pen = 0;
            pen += isLegs(i) ? 3 : 0;
            pen += isLegs(i - 1) ? 2 : 0;
            pen += team(i) ? 1 : 0;
            pen += sportOn(i, 'footing') ? 2 : 0;
            pen += isUpper(i) ? 0.5 : 0;
            pen += i >= 5 ? 0.5 : 0;
            sc.push({ i: i, s: s, pen: pen });
          });
          const pick = combos(sc, Math.min(soloNeed, sc.length))
            .map((c) => ({ c: c, sc: c.reduce((a, x) => a + x.pen, 0) + c.reduce((a, x, k) => a + (k && x.i - c[k - 1].i === 1 ? 1.5 : 0), 0) }))
            .sort((a, b) => a.sc - b.sc)[0];
          if (pick) pick.c.forEach((x) => sportEv(x.i, 'solo', x.s, S.solo.dur));
        }

        /* 7. Tom Holland challenge (20 min) */
        const thNeed = Math.max(0, S.tomholland.perWeek - countKept('tomholland'));
        if (thNeed) {
          const tc = [];
          days.forEach((d, i) => {
            if (sportOn(i, 'tomholland')) return;
            let s = findFree(busy[i], morningEnd, morningEnd + 60, S.tomholland.dur, 10);
            if (s < 0) s = findFree(busy[i], 17 * 60, 22 * 60, S.tomholland.dur, 10);
            if (s < 0) return;
            let pen = 0;
            pen += isUpper(i) ? 3 : 0;
            pen += isLegs(i) ? 1.5 : 0;
            pen += team(i) ? 0.5 : 0;
            pen += sportOn(i, 'solo') ? 0.5 : 0;
            pen += sportOn(i, 'footing') ? 0.5 : 0;
            tc.push({ i: i, s: s, pen: pen });
          });
          const pick = combos(tc, Math.min(thNeed, tc.length))
            .map((c) => ({ c: c, sc: c.reduce((a, x) => a + x.pen, 0) + c.reduce((a, x, k) => a + (k && x.i - c[k - 1].i <= 1 ? 2 : 0), 0) }))
            .sort((a, b) => a.sc - b.sc)[0];
          if (pick) pick.c.forEach((x) => sportEv(x.i, 'tomholland', x.s, S.tomholland.dur));
        }

        /* 8. Dîner (30 min) : avant un entraînement tardif, sinon 19h30 ou juste après le sport */
        const dd = S.dinner.dur;
        days.forEach((d, i) => {
          if (has(i, (e) => e.kind === 'routine' && e.routine === 'dinner')) return;
          const acts = busy[i].filter((x) => x[2].kind === 'sport' && x[1] > 17 * 60).sort((a, b) => a[0] - b[0]);
          const late = acts.find((x) => x[0] >= 19 * 60 && x[1] > 21 * 60);
          const tries = [];
          const okBeforeAct = (s) => !acts.some((x) => x[0] >= s + dd && x[0] < s + dd + 60 && x[2].sport === 'team');
          if (late) tries.push(late[0] - 90);
          tries.push(S.dinner.target);
          acts.forEach((x) => { if (x[1] <= 22 * 60 + 30) tries.push(x[1] + 15); });
          let s = -1;
          for (const t of tries) {
            if (t >= 17 * 60 + 30 && t + dd <= 23 * 60 + 30 && isFree(i, t, t + dd) && okBeforeAct(t)) { s = t; break; }
          }
          if (s < 0) s = findFree(busy[i], 18 * 60, 23 * 60, dd, 0);
          if (s >= 0) add(i, { kind: 'routine', routine: 'dinner', title: 'Dîner', start: s, end: s + dd });
        });

        st.planned[monday] = Date.now();
      },
      { undo: opts.undo ? 'Réadaptation de la semaine' : null, silent: !!opts.silent, auto: !!opts.auto }
    );
  };

  /* planifie la semaine si elle ne l'a jamais été (et n'est pas passée) */
  P.ensureWeek = function (monday) {
    const st = ELA.store.state;
    if (!st.settings.autoPlan || st.planned[monday]) return false;
    if (u.addDays(monday, 6) < u.today()) return false;
    P.planWeek(monday, { silent: true, auto: true });
    return true;
  };

  /* après un changement de réglages : réadapte la semaine en cours et les suivantes déjà planifiées */
  P.replanFuture = function () {
    const st = ELA.store.state;
    const cur = u.weekStart(u.today());
    const weeks = Object.keys(st.planned).filter((m) => m >= cur);
    if (weeks.indexOf(cur) < 0 && st.settings.autoPlan) weeks.push(cur);
    weeks.forEach((m) => P.planWeek(m, { silent: true }));
    ELA.store.emit({});
    return weeks.length;
  };

  P.setOptional = function (key, answer) {
    const date = key.split('#')[0];
    ELA.store.commit((st) => {
      if (answer === 'maybe') delete st.optional[key];
      else st.optional[key] = answer;
    }, { silent: true });
    P.planWeek(u.weekStart(date), { silent: true });
    ELA.store.emit({});
  };

  /* créneaux libres d'une journée (pour l'aide au placement) */
  P.freeSlots = function (date, minDur) {
    const S = ELA.store.state.settings;
    const list = ELA.store.eventsOn(date).filter((e) => !e.allDay).map((e) => [e.start, e.end]);
    const out = [];
    let s = S.wake;
    const end = S.sleep;
    list.sort((a, b) => a[0] - b[0]).forEach(([a, b]) => {
      if (a > s && a - s >= minDur) out.push([s, a]);
      s = Math.max(s, b);
    });
    if (end - s >= minDur) out.push([s, end]);
    return out;
  };

  /* prochain créneau libre pour une tâche (à partir de maintenant, 14 jours) */
  P.nextFree = function (dur, fromDate) {
    let d = fromDate || u.today();
    for (let k = 0; k < 21; k++) {
      const list = ELA.store.eventsOn(d).filter((e) => !e.allDay).map((e) => [e.start, e.end]);
      let from = 8 * 60;
      if (d === u.today()) from = Math.max(from, Math.ceil((u.nowMin() + 10) / 15) * 15);
      const s = findFree(list, from, 23 * 60, dur, 10);
      if (s >= 0) return { date: d, start: s };
      d = u.addDays(d, 1);
    }
    return null;
  };
})();
