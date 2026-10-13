/* Utilitaires : dates locales, DOM, couleurs, icônes. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = (ELA.u = {});

  const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const DAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  u.DAYS_SHORT = DAYS_SHORT;
  u.DAYS_LONG = DAYS_LONG;
  u.MONTHS = MONTHS;

  u.pad = (n) => String(n).padStart(2, '0');
  u.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  u.uid = (p) => (p || 'e') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---- Dates : 'YYYY-MM-DD' en heure locale, minutes depuis minuit ---- */
  u.ymd = (d) => d.getFullYear() + '-' + u.pad(d.getMonth() + 1) + '-' + u.pad(d.getDate());
  u.parse = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); // midi : évite les soucis de changement d'heure
  };
  u.today = () => u.ymd(new Date());
  u.addDays = (s, n) => {
    const d = u.parse(s);
    d.setDate(d.getDate() + n);
    return u.ymd(d);
  };
  u.dow = (s) => (u.parse(s).getDay() + 6) % 7; // lundi = 0
  u.weekStart = (s) => u.addDays(s, -u.dow(s));
  u.weekDays = (monday) => Array.from({ length: 7 }, (_, i) => u.addDays(monday, i));
  u.diffDays = (a, b) => Math.round((u.parse(b) - u.parse(a)) / 86400000);
  u.isoWeek = (s) => {
    const d = u.parse(s);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  };
  u.monthKey = (s) => s.slice(0, 7);
  u.toMin = (hm) => {
    if (typeof hm === 'number') return hm;
    const [h, m] = String(hm).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  u.hm = (min) => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    if (min >= 1440) return '00:00';
    return u.pad(Math.floor(m / 60)) + ':' + u.pad(m % 60);
  };
  u.hmShort = (min) => {
    const s = u.hm(min);
    return s.endsWith(':00') ? s.slice(0, 2).replace(/^0/, '') + 'h' : s.replace(/^0/, '').replace(':', 'h');
  };
  u.dur = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + 'h' + (m ? u.pad(m) : '');
  };
  u.hours = (min) => String(Math.round(min / 6) / 10).replace('.', ',');
  u.nowMin = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  u.fmtDay = (s) => {
    const d = u.parse(s);
    return DAYS_LONG[u.dow(s)] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  };
  u.fmtDayShort = (s) => {
    const d = u.parse(s);
    return DAYS_SHORT[u.dow(s)] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
  };
  u.fmtWeekRange = (monday) => {
    const a = u.parse(monday), b = u.parse(u.addDays(monday, 6));
    if (a.getMonth() === b.getMonth()) return a.getDate() + ' – ' + b.getDate() + ' ' + MONTHS_SHORT[b.getMonth()] + ' ' + b.getFullYear();
    return a.getDate() + ' ' + MONTHS_SHORT[a.getMonth()] + ' – ' + b.getDate() + ' ' + MONTHS_SHORT[b.getMonth()] + ' ' + b.getFullYear();
  };
  u.fmtMonth = (s) => {
    const d = u.parse(s);
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  };
  u.fmtDateFR = (s) => {
    const d = u.parse(s);
    return u.pad(d.getDate()) + '/' + u.pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
  };
  u.relDay = (s) => {
    const n = u.diffDays(u.today(), s);
    if (n === 0) return 'Aujourd’hui';
    if (n === 1) return 'Demain';
    if (n === -1) return 'Hier';
    if (n > 1 && n < 7) return DAYS_LONG[u.dow(s)].replace(/^./, (c) => c.toUpperCase());
    return u.fmtDayShort(s);
  };
  u.age = (birth) => {
    const b = u.parse(birth), t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
  };

  /* ---- Texte ---- */
  u.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  u.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  /* Gabarit HTML : les valeurs sont échappées sauf si elles viennent de u.raw() */
  function Raw(s) { this.s = s; }
  u.raw = (s) => new Raw(s);
  const val = (v) => {
    if (v == null || v === false) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(val).join('');
    return u.esc(v);
  };
  u.html = (strings, ...vals) => {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
    return new Raw(out);
  };
  u.str = (r) => (r instanceof Raw ? r.s : val(r));

  u.$ = (sel, root) => (root || document).querySelector(sel);
  u.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  u.debounce = (fn, ms) => {
    let t;
    const d = function () {
      clearTimeout(t);
      const args = arguments;
      t = setTimeout(() => fn.apply(null, args), ms);
    };
    d.flush = () => { clearTimeout(t); fn(); };
    return d;
  };

  /* ---- Couleurs ---- */
  u.rgb = (hex) => {
    let h = String(hex || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  u.rgba = (hex, a) => {
    const [r, g, b] = u.rgb(hex);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };
  /* mélange hex sur fond hex, opaque (évite color-mix pour les vieux Safari) */
  u.over = (hex, bg, a) => {
    const c = u.rgb(hex), b = u.rgb(bg);
    const m = c.map((v, i) => Math.round(v * a + b[i] * (1 - a)));
    return 'rgb(' + m.join(',') + ')';
  };
  u.hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  /* ---- Icônes (traits 24×24) ---- */
  const P = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    flame: '<path d="M12 3c1 4 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.4-3.9 2.5-5.5.4 1.5 1.3 2.3 2.4 2.5-.9-2.3-.9-4.9.6-7.5z"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.7 5.7c3 3 3 9.6 0 12.6M18.3 5.7c-3 3-3 9.6 0 12.6"/>',
    run: '<circle cx="14.5" cy="4.5" r="1.8"/><path d="M7 21l3.2-5.5 3 2.2.8 3.3M5.5 11.5l3.2-3.4 4.3.8 2 3 3 1.1M10.2 15.5l1.4-6"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
    cap: '<path d="M2 9.5l10-5 10 5-10 5z"/><path d="M6 11.5v4.5c3.5 2.2 8.5 2.2 12 0v-4.5M22 9.5v5"/>',
    utensils: '<path d="M7 3v7M5 3v4.5a2 2 0 0 0 4 0V3M7 10v11M17 21v-8.5c-2 0-3-1.6-3-4.5S15 3 17 3z"/>',
    drop: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    refresh: '<path d="M20 11A8 8 0 0 0 5.6 6.4L4 8M4 4v4h4M4 13a8 8 0 0 0 14.4 4.6L20 16M20 20v-4h-4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
    wand: '<path d="M4 20L15 9M13.5 7.5l3 3"/><path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M10 3v2M9 4h2"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6 6 0 0 1 3.5 5.8"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    file: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    scale: '<path d="M5 4h14l-1.5 16h-11z"/><path d="M9 9a3 3 0 0 1 6 0"/><path d="M12 9l1.5-2"/>',
  };
  u.icon = (name, cls) =>
    '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (P[name] || P.star) + '</svg>';
  u.ic = (name, cls) => u.raw(u.icon(name, cls));
})();
