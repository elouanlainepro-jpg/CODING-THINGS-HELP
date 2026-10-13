/* Onglet Motivation : images + citations, vidéos YouTube, ta semaine en chiffres. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  ELA.pages = ELA.pages || {};
  ELA.actions = ELA.actions || {};
  ELA.submits = ELA.submits || {};
  const store = () => ELA.store;
  const st = () => ELA.store.state;

  const SLIDES = ['roar', 'antman', 'wolves5', 'celebration'];
  let timer = null, slide = 0;

  const dayIndex = () => Math.floor(u.parse(u.today()).getTime() / 86400000);
  const quoteFor = (k) => ELA.data.quotes[(dayIndex() + k) % ELA.data.quotes.length];

  ELA.ytId = function (url) {
    const s = String(url || '').trim();
    const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/.exec(s);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
  };
  const ytUrl = (v) => (v.yt ? 'https://www.youtube.com/watch?v=' + v.yt : v.url ? v.url : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(v.q));
  const allVideos = () => ELA.data.videos.concat(st().videos.map((v) => Object.assign({ cat: 'mine', mine: true }, v)));

  function videoCard(v, i) {
    const href = ytUrl(v);
    const thumb = v.yt ? 'background-image:url(https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg)' : '';
    const hue = u.hash(v.title) % 360;
    const posterInner = '<span class="vid-fallback" style="--h:' + hue + '">' + u.esc(v.title) + '</span><span class="vid-img" style="' + thumb + '"></span>' +
      '<span class="vid-play">' + u.icon(v.yt ? 'play' : 'external') + '</span>' + (v.yt ? '' : '<span class="vid-badge">Recherche</span>');
    const poster = ELA.ui.canEmbed() && v.yt
      ? '<button type="button" class="vid-poster" data-act="vplay" data-yt="' + u.esc(v.yt) + '" data-title="' + u.esc(v.title) + '" aria-label="Lire ' + u.esc(v.title) + '">' + posterInner + '</button>'
      : '<a class="vid-poster" href="' + u.esc(href) + '" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir ' + u.esc(v.title) + ' sur YouTube">' + posterInner + '</a>';
    const catLabel = (ELA.data.videoCats.find((c) => c[0] === v.cat) || [0, ''])[1];
    return '<article class="vid">' + poster + '<div class="vid-body"><p class="vid-cat">' + u.esc(catLabel) + '</p><h4 class="vid-title">' + u.esc(v.title) + '</h4>' +
      '<p class="vid-by">' + u.esc(v.by || '') + '</p><div class="vid-acts"><a class="link" href="' + u.esc(href) + '" target="_blank" rel="noopener noreferrer">' + u.icon('external') + 'YouTube</a>' +
      (v.mine ? '<button type="button" class="link link-danger" data-act="vdel" data-id="' + u.esc(v.id) + '">' + u.icon('trash') + 'Retirer</button>' : '') + '</div></div></article>';
  }

  ELA.pages.motivation = {
    render(root) {
      if (timer) { clearInterval(timer); timer = null; }
      const cat = store().ui.videoCat || 'all';
      const vids = allVideos().filter((v) => cat === 'all' || v.cat === cat);
      const monday = u.weekStart(u.today());
      ELA.planner.ensureWeek(monday);
      const ws = ELA.cal.weekStats(monday);
      const sp = Object.values(ws.sport).reduce((a, x) => ({ n: a.n + x.n, done: a.done + x.done }), { n: 0, done: 0 });
      const studyPlan = Object.values(ws.study).reduce((a, x) => a + x.plan, 0);
      const studyDone = Object.values(ws.study).reduce((a, x) => a + x.done, 0);
      const tasksDone = st().tasks.filter((t) => t.done && t.doneAt && u.ymd(new Date(t.doneAt)) >= monday).length;

      const slides = SLIDES.map((k, i) => {
        const img = ELA.data.images[k];
        const q = quoteFor(i);
        return '<figure class="mslide' + (i === slide ? ' is-on' : '') + '" data-i="' + i + '" aria-hidden="' + (i !== slide) + '"><img src="' + img.src + '" alt="' + u.esc(img.alt) + '"' + (i ? ' loading="lazy"' : '') + '>' +
          '<figcaption><blockquote>« ' + u.esc(q.t) + ' »</blockquote>' + (q.a ? '<cite>' + u.esc(q.a) + '</cite>' : '') + '</figcaption></figure>';
      }).join('');

      root.innerHTML =
        '<section class="page motiv">' +
        '<div class="mhero" aria-roledescription="carrousel" aria-label="Images et citations">' + slides +
        '<div class="mhero-ctrl"><button type="button" class="iconbtn" data-act="slide" data-d="-1" aria-label="Image précédente">' + u.icon('left') + '</button>' +
        '<span class="mdots">' + SLIDES.map((_, i) => '<button type="button" class="mdot' + (i === slide ? ' is-on' : '') + '" data-act="slide-to" data-i="' + i + '" aria-label="Image ' + (i + 1) + '"></button>').join('') + '</span>' +
        '<button type="button" class="iconbtn" data-act="slide" data-d="1" aria-label="Image suivante">' + u.icon('right') + '</button></div></div>' +
        '<section class="mstats" aria-label="Ta semaine">' +
        '<div class="mstat"><p class="eyebrow">Sport</p><p class="big-num">' + sp.done + '<small>/' + sp.n + '</small></p><p class="muted small">séances faites</p></div>' +
        '<div class="mstat"><p class="eyebrow">Révisions</p><p class="big-num">' + u.hours(studyDone) + '<small>/' + u.hours(studyPlan) + ' h</small></p><p class="muted small">heures faites / prévues</p></div>' +
        '<div class="mstat"><p class="eyebrow">Tâches</p><p class="big-num">' + tasksDone + '</p><p class="muted small">bouclées cette semaine</p></div>' +
        '</section>' +
        '<header class="sec-head"><div><p class="eyebrow">Vidéos</p><h3 class="h-sec">De quoi te lancer</h3></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="vadd">' + u.icon('plus') + 'Ajouter une vidéo</button></header>' +
        '<div class="chips" role="group" aria-label="Catégories">' + ELA.data.videoCats.map(([k, l]) =>
          '<button type="button" class="fchip" data-act="vcat" data-cat="' + k + '" aria-pressed="' + (cat === k) + '">' + l + '</button>').join('') + '</div>' +
        (vids.length ? '<div class="vids">' + vids.map(videoCard).join('') + '</div>' : '<p class="muted">Aucune vidéo ici. Ajoute un lien YouTube avec « Ajouter une vidéo ».</p>') +
        (!ELA.ui.canEmbed() ? '<p class="hint">Les vidéos s’ouvrent sur YouTube.</p>' : '') +
        '<header class="sec-head"><div><p class="eyebrow">Citations</p><h3 class="h-sec">À relire avant un match ou un partiel</h3></div></header>' +
        '<ul class="quotes">' + ELA.data.quotes.map((q) => '<li><blockquote>« ' + u.esc(q.t) + ' »</blockquote>' + (q.a ? '<cite>' + u.esc(q.a) + '</cite>' : '') + '</li>').join('') + '</ul>' +
        '</section>';

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) {
        const hero = root.querySelector('.mhero');
        let paused = false;
        hero.addEventListener('pointerenter', () => { paused = true; });
        hero.addEventListener('pointerleave', () => { paused = false; });
        hero.addEventListener('focusin', () => { paused = true; });
        hero.addEventListener('focusout', () => { paused = false; });
        timer = setInterval(() => {
          if (paused || document.hidden || store().ui.tab !== 'motivation') return;
          go(slide + 1);
        }, 8000);
      }
    },
    leave() { if (timer) { clearInterval(timer); timer = null; } },
  };

  function go(i) {
    slide = (i + SLIDES.length) % SLIDES.length;
    document.querySelectorAll('.mslide').forEach((f) => {
      const on = +f.dataset.i === slide;
      f.classList.toggle('is-on', on);
      f.setAttribute('aria-hidden', String(!on));
    });
    document.querySelectorAll('.mdot').forEach((d) => d.classList.toggle('is-on', +d.dataset.i === slide));
  }
  ELA.actions.slide = (el) => go(slide + +el.dataset.d);
  ELA.actions['slide-to'] = (el) => go(+el.dataset.i);
  ELA.actions.vcat = (el) => { store().ui.videoCat = el.dataset.cat; store().saveUi(); ELA.app.render(); };
  ELA.actions.vplay = (el) => {
    const id = el.dataset.yt;
    ELA.ui.modal({
      title: el.dataset.title,
      eyebrow: 'Vidéo',
      size: 'video',
      body: '<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0" title="' + u.esc(el.dataset.title) +
        '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
        '<p class="hint">La vidéo ne se lance pas ? <a class="link" href="https://www.youtube.com/watch?v=' + encodeURIComponent(id) + '" target="_blank" rel="noopener noreferrer">Ouvre-la sur YouTube</a>.</p>',
    });
  };
  ELA.actions.vdel = (el) => {
    store().commit((x) => { x.videos = x.videos.filter((v) => v.id !== el.dataset.id); }, { undo: 'Suppression de vidéo' });
    ELA.ui.undoToast('Vidéo retirée');
  };
  ELA.actions.vadd = () => {
    ELA.ui.modal({
      title: 'Ajouter une vidéo',
      eyebrow: 'Motivation',
      size: 'sm',
      body: u.html`<form id="vf" class="form" novalidate>
        <div class="field"><label for="vf-url">Lien YouTube</label><input id="vf-url" name="url" type="url" inputmode="url" placeholder="https://youtu.be/…" autofocus></div>
        <div class="field"><label for="vf-title">Titre</label><input id="vf-title" name="vtitle" maxlength="100" placeholder="Ex. Kobe, discours Mamba"></div>
        <div class="field"><label for="vf-by">Auteur / chaîne (facultatif)</label><input id="vf-by" name="by" maxlength="80"></div>
        <p class="form-err" role="alert" hidden></p></form>`,
      foot: u.html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="vf" class="btn btn-primary">Ajouter</button>`,
      onMount: (sheet, api) => {
        const f = sheet.querySelector('#vf');
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const url = f.elements.url.value.trim();
          const yt = ELA.ytId(url);
          const er = f.querySelector('.form-err');
          if (!yt && !/^https?:\/\//.test(url)) { er.textContent = 'Colle un lien YouTube (youtube.com ou youtu.be).'; er.hidden = false; return; }
          const title = f.elements.vtitle.value.trim() || (yt ? 'Vidéo YouTube' : 'Lien');
          store().commit((x) => {
            x.videos.push({ id: u.uid('v'), yt: yt || undefined, url: yt ? undefined : url, title: title, by: f.elements.by.value.trim() });
          }, { undo: 'Ajout de vidéo' });
          store().ui.videoCat = 'mine';
          store().saveUi();
          api.close();
          ELA.app.render();
          ELA.ui.toast('Vidéo ajoutée dans « Mes vidéos »');
        });
      },
    });
  };
})();
