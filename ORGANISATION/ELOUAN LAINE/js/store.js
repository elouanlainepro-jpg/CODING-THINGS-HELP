/* État de l'application, sauvegarde locale, annulation et synchronisation (artefact Claude). */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  const KEY = 'ela-studio-v1';
  const UI_KEY = 'ela-studio-ui';

  const clone = (o) => JSON.parse(JSON.stringify(o));

  function defaults() {
    const today = u.today();
    return {
      v: 1,
      meta: { updatedAt: 0, created: Date.now(), seeded: false, onboarding: true },
      profile: {
        name: 'ELOUAN LAINE',
        birth: '2005-03-14',
        height: 190,
        weight: 82,
        weightLog: [{ date: today, kg: 82 }],
      },
      settings: {
        wake: 360,
        sleep: 1440,
        toilette: 15,
        breakfast: 15,
        lunch: { on: true, dur: 30 },
        dinner: { dur: 30, target: 1170 },
        autoPlan: true,
        group: { tp: 'C', td: '2', prog: 'BOE', keepCM: true },
        trainings: [
          { id: 'tr-lun', day: 0, start: 1140, end: 1230, optional: false },
          { id: 'tr-mar', day: 1, start: 1140, end: 1230, optional: false },
          { id: 'tr-mer', day: 2, start: 1230, end: 1350, optional: false },
          { id: 'tr-jeu', day: 3, start: 1110, end: 1200, optional: true },
        ],
        gym: { sessions: { push: true, pull: true, legsA: true, legsB: true }, start: 1080, dur: 75, afternoon: true },
        solo: { perWeek: 3, dur: 60, start: 420, weekendStart: 570 },
        footing: { perWeek: 1, dur: 60 },
        tomholland: { perWeek: 2, dur: 20 },
        courseMap: {},
      },
      subjects: clone(ELA.data.subjects),
      events: [],
      tasks: [],
      planned: {},
      optional: {},
      th: [],
      albums: { liked: [], heard: [], hidden: [], deck: [], draw: 0 },
      videos: [],
    };
  }

  /* fusion profonde : complète un état chargé avec les champs par défaut manquants */
  function fill(target, def) {
    Object.keys(def).forEach((k) => {
      if (target[k] === undefined) target[k] = clone(def[k]);
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && typeof target[k] === 'object' && !Array.isArray(target[k])) fill(target[k], def[k]);
    });
    return target;
  }

  function sanitize(st) {
    fill(st, defaults());
    st.events = (st.events || []).filter((e) => e && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
    st.events.forEach((e) => {
      e.start = u.clamp(Math.round(+e.start || 0), 0, 1439);
      e.end = u.clamp(Math.round(+e.end || e.start + 60), e.start + 5, 1440);
    });
    st.tasks = (st.tasks || []).filter((t) => t && t.id);
    return st;
  }

  const S = (ELA.store = {
    state: null,
    ui: { tab: 'planning', view: null, date: u.today(), videoCat: 'all', genre: 'all', showFree: false, dismissed: {} },
    listeners: [],
    undoStack: [],
    sync: 'local',
    _idx: null,
  });

  /* ---- chargement ---- */
  S.load = function () {
    let st = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) st = JSON.parse(raw);
    } catch (e) { st = null; }
    S.state = st ? sanitize(st) : defaults();
    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      if (ui) Object.assign(S.ui, ui, { date: u.today() });
    } catch (e) { /* stockage indisponible */ }
    S._idx = null;
  };

  S.saveUi = u.debounce(function () {
    try { localStorage.setItem(UI_KEY, JSON.stringify(S.ui)); } catch (e) { /* ignore */ }
  }, 250);

  const writeLocal = u.debounce(function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(S.state));
    } catch (e) {
      console.warn('Sauvegarde locale impossible', e);
    }
    Remote.push();
  }, 300);
  S.flush = () => writeLocal.flush();
  window.addEventListener('pagehide', () => writeLocal.flush());

  S.on = (fn) => S.listeners.push(fn);
  S.emit = (info) => S.listeners.forEach((fn) => fn(info || {}));

  /* ---- mutations ---- */
  S.commit = function (mutator, opts) {
    opts = opts || {};
    if (opts.undo) S.pushUndo(opts.undo);
    mutator(S.state);
    if (!opts.auto) S.state.meta.updatedAt = Date.now(); // les calculs automatiques ne comptent pas comme une modification
    S._idx = null;
    writeLocal();
    if (!opts.silent) S.emit(opts);
  };
  S.pushUndo = function (label) {
    S.undoStack.push({ label: label, json: JSON.stringify(S.state) });
    if (S.undoStack.length > 15) S.undoStack.shift();
  };
  S.undo = function () {
    const last = S.undoStack.pop();
    if (!last) return false;
    S.state = sanitize(JSON.parse(last.json));
    S.state.meta.updatedAt = Date.now();
    S._idx = null;
    writeLocal();
    S.emit({ undo: true });
    return last.label;
  };
  S.replace = function (st, opts) {
    S.state = sanitize(st);
    if (!(opts && opts.keepTime)) S.state.meta.updatedAt = Date.now();
    S._idx = null;
    writeLocal();
    S.emit(opts || {});
  };

  /* ---- lecture ---- */
  S.index = function () {
    if (S._idx) return S._idx;
    const m = new Map();
    S.state.events.forEach((e) => {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date).push(e);
    });
    m.forEach((list) => list.sort((a, b) => (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || a.start - b.start || a.end - b.end));
    S._idx = m;
    return m;
  };
  S.on_ = (date) => S.index().get(date) || [];
  S.eventsOn = (date) => S.on_(date);
  S.eventsWeek = (monday) => u.weekDays(monday).flatMap((d) => S.on_(d));
  S.event = (id) => S.state.events.find((e) => e.id === id);
  S.task = (id) => S.state.tasks.find((t) => t.id === id);
  S.subject = (id) => S.state.subjects.find((s) => s.id === id);

  /* ---- export / transfert ---- */
  S.exportJSON = () => JSON.stringify(S.state);

  async function pipe(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const b64u = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64u = (s) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  /* Code compact (deflate + base64url) — même principe que Hash Calendar */
  S.encode = async function (obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try { return 'z' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* repli */ }
    }
    return 'j' + b64u(bytes);
  };
  S.decode = async function (code) {
    code = String(code || '').trim().replace(/^ELA1:/, '').replace(/^#?s=/, '');
    const kind = code[0], body = code.slice(1);
    let bytes = unb64u(body);
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('Navigateur trop ancien pour ce code');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (kind !== 'j') throw new Error('Code illisible');
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  /* ---- Synchronisation via le stockage de l'artefact Claude (si disponible) ---- */
  const Remote = (S.remote = {
    db: null,
    base: null,
    written: {},
    queue: Promise.resolve(),
    busy: false,
  });

  function split(st) {
    const core = Object.assign({}, st, { events: [] });
    const shards = {};
    st.events.forEach((e) => {
      const k = 'ev-' + u.monthKey(e.date);
      (shards[k] = shards[k] || []).push(e);
    });
    const out = {};
    Object.keys(shards).forEach((k) => { out[k] = { month: k.slice(3), json: JSON.stringify(shards[k]) }; });
    return { core: { updatedAt: st.meta.updatedAt || 0, json: JSON.stringify(core) }, shards: out };
  }

  function setSync(s) {
    S.sync = s;
    S.emit({ sync: true, silentView: true });
  }

  Remote.init = async function () {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const res = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      const db = res[0], user = res[1];
      if (!db || !user || typeof user.id !== 'function') return;
      const id = await user.id();
      if (!id) return;
      Remote.db = db;
      Remote.base = 'data/users/' + id;
      await Remote.pull(true);
      setSync('cloud');
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') Remote.pull(false).catch(() => {});
      });
    } catch (e) {
      console.warn('Synchronisation indisponible', e);
      Remote.db = null;
    }
  };

  Remote.pull = async function (initial) {
    if (!Remote.db) return;
    const snap = await Remote.db.collection(Remote.base).get();
    let core = null;
    const shards = [];
    snap.docs.forEach((d) => {
      if (!d.exists) return;
      const data = d.data();
      if (d.id === 'core') core = data;
      else if (d.id.indexOf('ev-') === 0) shards.push([d.id, data]);
    });
    const remoteAt = core ? +core.updatedAt || 0 : 0;
    const localAt = S.state.meta.updatedAt || 0;
    if (core && remoteAt > localAt) {
      const st = JSON.parse(core.json);
      st.events = [];
      Remote.written = { core: core.json };
      shards.forEach(([k, s]) => {
        Remote.written[k] = s.json;
        try { st.events.push.apply(st.events, JSON.parse(s.json)); } catch (e) { /* ignore */ }
      });
      st.meta = Object.assign({}, st.meta, { updatedAt: remoteAt });
      S.state = sanitize(st);
      S._idx = null;
      try { localStorage.setItem(KEY, JSON.stringify(S.state)); } catch (e) { /* ignore */ }
      S.emit({ remote: true });
    } else if (initial) {
      if (core) {
        Remote.written = { core: core.json };
        shards.forEach(([k, s]) => { Remote.written[k] = s.json; });
      }
      if (!core || remoteAt < localAt) Remote.push();
    }
  };

  Remote.push = function () {
    if (!Remote.db) return;
    Remote.queue = Remote.queue
      .then(() => Remote._push())
      .catch((e) => {
        console.warn('Synchronisation échouée', e);
        if (e && (e.code === 'revoked' || e.code === 'not_granted' || e.code === 'invalid_argument')) {
          Remote.db = null;
          setSync('local');
        }
      });
  };
  Remote._push = async function () {
    const parts = split(S.state);
    const col = Remote.db.collection(Remote.base);
    const writes = [];
    Object.keys(parts.shards).forEach((k) => {
      if (Remote.written[k] !== parts.shards[k].json) writes.push([k, parts.shards[k]]);
    });
    Object.keys(Remote.written).forEach((k) => {
      if (k !== 'core' && !parts.shards[k] && Remote.written[k] !== '[]') writes.push([k, { month: k.slice(3), json: '[]' }]);
    });
    if (Remote.written.core !== parts.core.json) writes.push(['core', parts.core]); // le noyau en dernier
    for (const [k, body] of writes) {
      await col.doc(k).set(body);
      Remote.written[k] = body.json;
    }
  };

  S.defaults = defaults;
})();
