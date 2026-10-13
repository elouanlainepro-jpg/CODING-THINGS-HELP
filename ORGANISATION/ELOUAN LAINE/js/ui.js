/* Composants d'interface : fenêtres, confirmations, notifications, téléchargements, copie. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  const UI = (ELA.ui = {});
  const stack = [];
  /* une chaîne passée telle quelle est du HTML déjà construit ; un gabarit u.html est déjà sûr */
  const asHTML = (v) => (v == null ? '' : typeof v === 'string' ? v : u.str(v));

  /* Fenêtre (feuille en bas sur téléphone, boîte centrée sur ordinateur) */
  UI.modal = function (opts) {
    const layer = document.getElementById('layer');
    const ov = document.createElement('div');
    ov.className = 'ov';
    const id = u.uid('m');
    ov.innerHTML =
      '<div class="sheet sheet-' + (opts.size || 'md') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
      '<header class="sheet-head"><div class="sheet-titles">' +
      (opts.eyebrow ? '<p class="eyebrow">' + u.esc(opts.eyebrow) + '</p>' : '') +
      '<h3 class="sheet-title" id="' + id + '">' + u.esc(opts.title || '') + '</h3></div>' +
      '<button type="button" class="iconbtn" data-close aria-label="Fermer">' + u.icon('x') + '</button></header>' +
      '<div class="sheet-body">' + asHTML(opts.body) + '</div>' +
      (opts.foot ? '<footer class="sheet-foot">' + asHTML(opts.foot) + '</footer>' : '') +
      '</div>';
    layer.appendChild(ov);
    const prevFocus = document.activeElement;
    const api = {
      el: ov,
      sheet: ov.querySelector('.sheet'),
      close: function (val) {
        if (api.closed) return;
        api.closed = true;
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        ov.classList.add('is-leaving');
        setTimeout(() => ov.remove(), 160);
        if (opts.onClose) opts.onClose(val);
        if (prevFocus && prevFocus.focus && document.body.contains(prevFocus)) {
          try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }
        document.body.classList.toggle('has-modal', stack.length > 0);
      },
    };
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) api.close(); });
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });
    stack.push(api);
    document.body.classList.add('has-modal');
    requestAnimationFrame(() => ov.classList.add('is-in'));
    if (opts.onMount) opts.onMount(ov.querySelector('.sheet'), api);
    const first = ov.querySelector('[autofocus]') || ov.querySelector('.sheet');
    if (first) {
      if (!first.hasAttribute('tabindex') && first.classList.contains('sheet')) first.setAttribute('tabindex', '-1');
      setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    }
    return api;
  };
  UI.top = () => stack[stack.length - 1];
  UI.closeAll = () => stack.slice().forEach((m) => m.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) {
      e.preventDefault();
      stack[stack.length - 1].close();
    }
  });

  /* Confirmation intégrée (pas de confirm() natif) */
  UI.confirm = function (o) {
    return new Promise((resolve) => {
      let answered = false;
      const m = UI.modal({
        title: o.title,
        size: 'sm',
        body: u.html`<p class="muted">${o.text || ''}</p>`,
        foot: u.html`<button type="button" class="btn btn-ghost" data-close>${o.cancel || 'Annuler'}</button>
          <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${o.ok || 'Confirmer'}</button>`,
        onMount: (el, api) => {
          el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); api.close(); });
        },
        onClose: () => { if (!answered) resolve(false); },
      });
      return m;
    });
  };

  /* Choix multiple intégré */
  UI.choose = function (o) {
    return new Promise((resolve) => {
      let done = false;
      UI.modal({
        title: o.title,
        size: 'sm',
        body: u.html`${o.text ? u.html`<p class="muted">${o.text}</p>` : ''}<div class="choice-list">${o.choices.map(
          (c) => u.html`<button type="button" class="btn ${c.danger ? 'btn-danger' : c.primary ? 'btn-primary' : 'btn-ghost'} btn-block" data-v="${c.value}">${c.label}</button>`
        )}</div>`,
        onMount: (el, api) => {
          el.querySelectorAll('[data-v]').forEach((b) =>
            b.addEventListener('click', () => { done = true; resolve(b.getAttribute('data-v')); api.close(); })
          );
        },
        onClose: () => { if (!done) resolve(null); },
      });
    });
  };

  /* Notifications */
  UI.toast = function (msg, o) {
    o = o || {};
    const root = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + u.esc(msg) + '</span>' + (o.action ? '<button type="button" class="toast-act">' + u.esc(o.action.label) + '</button>' : '');
    root.appendChild(t);
    while (root.children.length > 3) root.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('is-in'));
    const kill = () => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 200); };
    if (o.action) t.querySelector('.toast-act').addEventListener('click', () => { o.action.fn(); kill(); });
    setTimeout(kill, o.ms || (o.action ? 6000 : 2600));
  };
  /* Notification avec « Annuler » (dernier instantané) */
  UI.undoToast = function (msg) {
    UI.toast(msg, {
      action: {
        label: 'Annuler',
        fn: () => { const l = ELA.store.undo(); if (l) UI.toast('Annulé : ' + l); },
      },
    });
  };

  /* Copie dans le presse-papiers, avec repli sur sélection */
  UI.copy = function (text, input) {
    const fallback = () => {
      if (input) { input.focus(); input.select(); }
      UI.toast('Sélectionné : copie avec ⌘C / Ctrl+C');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => UI.toast('Copié'), fallback);
      } else fallback();
    } catch (e) { fallback(); }
  };

  /* Téléchargement : capacité « downloads » de l'artefact si présente, sinon lien classique */
  UI.download = async function (filename, data, mime) {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        const dl = await window.claude.use('downloads');
        if (dl && typeof dl.save === 'function') {
          await dl.save({ filename: filename, data: new Blob([data], { type: mime || 'text/plain' }) });
          return true;
        }
      }
    } catch (e) {
      if (e && e.code && e.code !== 'not_granted' && e.code !== 'unavailable') return false;
    }
    try {
      const blob = new Blob([data], { type: (mime || 'text/plain') + ';charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return true;
    } catch (e) {
      UI.toast('Téléchargement impossible ici : utilise « Copier »');
      return false;
    }
  };

  UI.readFile = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ''));
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });

  /* est-ce qu'on peut intégrer un lecteur YouTube ? (pas en file://, pas dans un artefact) */
  UI.canEmbed = () => /^https?:$/.test(location.protocol) && !(window.claude && typeof window.claude.use === 'function');
  UI.inArtifact = () => !!(window.claude && typeof window.claude.use === 'function');
})();
