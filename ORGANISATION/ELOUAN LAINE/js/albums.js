/* Onglet Albums : idées d'albums pour la salle, pioche actualisable, ta sélection. */
(function () {
  const ELA = (window.ELA = window.ELA || {});
  const u = ELA.u;
  ELA.pages = ELA.pages || {};
  ELA.actions = ELA.actions || {};
  const store = () => ELA.store;
  const st = () => ELA.store.state;
  const N = 6;

  const byId = (id) => ELA.data.albums.find((a) => a.id === id);
  const GENRE_INK = { rapfr: ['#2a1630', '#d65ce0'], rapus: ['#2b1a10', '#ff8a3d'], uk: ['#0f2422', '#4fd6a0'], rock: ['#2a0f12', '#f2556a'], electro: ['#0e1a2e', '#5fb2f5'], ost: ['#2a2412', '#e8c15a'] };

  function cover(a) {
    const ink = GENRE_INK[a.genre] || ['#1b1a20', '#c9cdd6'];
    const h = u.hash(a.artist + a.title);
    const ang = 20 + (h % 140);
    const variant = h % 3;
    return '<div class="cover cover-v' + variant + '" style="--a:' + ink[0] + ';--b:' + ink[1] + ';--ang:' + ang + 'deg" aria-hidden="true">' +
      '<span class="cover-artist">' + u.esc(a.artist) + '</span><span class="cover-title">' + u.esc(a.title) + '</span><span class="cover-year">' + a.year + '</span></div>';
  }

  const links = (a) => {
    const q = encodeURIComponent(a.artist + ' ' + a.title);
    return [
      ['Spotify', 'https://open.spotify.com/search/' + q],
      ['Apple Music', 'https://music.apple.com/fr/search?term=' + q],
      ['Deezer', 'https://www.deezer.com/search/' + q],
      ['YouTube', 'https://www.youtube.com/results?search_query=' + encodeURIComponent(a.artist + ' ' + a.title + ' album')],
    ];
  };
  const genreLabel = (g) => (ELA.data.genres.find((x) => x[0] === g) || [0, ''])[1];

  /* tirage pondéré : les genres que tu aimes reviennent plus souvent */
  function draw(x, keep) {
    const A = x.albums;
    const genre = store().ui.genre || 'all';
    const keepIds = keep || [];
    const banned = new Set(A.hidden.concat(keepIds).concat(A.deck));
    let pool = ELA.data.albums.filter((a) => (genre === 'all' || a.genre === genre) && !banned.has(a.id));
    const fresh = pool.filter((a) => A.heard.indexOf(a.id) < 0 && A.liked.indexOf(a.id) < 0);
    let base = fresh.length >= N - keepIds.length ? fresh : pool;
    if (base.length < N - keepIds.length) {
      base = ELA.data.albums.filter((a) => (genre === 'all' || a.genre === genre) && A.hidden.indexOf(a.id) < 0 && keepIds.indexOf(a.id) < 0);
    }
    const likedGenres = {};
    A.liked.forEach((id) => { const a = byId(id); if (a) likedGenres[a.genre] = (likedGenres[a.genre] || 0) + 1; });
    const picks = [];
    const bag = base.slice();
    while (picks.length < N - keepIds.length && bag.length) {
      const w = bag.map((a) => 1 + 0.8 * (likedGenres[a.genre] || 0) + (a.energy >= 4 ? 0.3 : 0));
      const total = w.reduce((s, v) => s + v, 0);
      let r = Math.random() * total, k = 0;
      while (k < bag.length - 1 && r > w[k]) { r -= w[k]; k++; }
      picks.push(bag[k].id);
      bag.splice(k, 1);
    }
    A.deck = keepIds.concat(picks);
    A.deckGenre = genre;
    A.draw = (A.draw || 0) + 1;
  }

  function card(a) {
    const A = st().albums;
    const liked = A.liked.indexOf(a.id) >= 0, heard = A.heard.indexOf(a.id) >= 0;
    const energy = '<span class="energy" aria-label="Énergie ' + a.energy + ' sur 5">' + [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= a.energy ? 'on' : '') + '"></i>').join('') + '</span>';
    return '<article class="alb">' + cover(a) + '<div class="alb-body">' +
      '<p class="alb-artist">' + u.esc(a.artist) + '</p><h4 class="alb-title">' + u.esc(a.title) + '</h4>' +
      '<p class="alb-meta">' + a.year + ' · ' + u.esc(genreLabel(a.genre)) + ' · ' + energy + '</p>' +
      '<p class="alb-why">' + u.esc(a.why) + '</p>' +
      (a.track ? '<p class="alb-track">' + u.icon('music') + 'À lancer : <b>' + u.esc(a.track) + '</b></p>' : '') +
      '<p class="alb-links">' + links(a).map(([l, h]) => '<a class="link" href="' + u.esc(h) + '" target="_blank" rel="noopener noreferrer">' + l + '</a>').join('') + '</p>' +
      '<div class="alb-acts">' +
      '<button type="button" class="act-btn" data-act="alb-like" data-id="' + a.id + '" aria-pressed="' + liked + '">' + u.icon('heart') + (liked ? 'Dans ma sélection' : 'J’aime') + '</button>' +
      '<button type="button" class="act-btn" data-act="alb-heard" data-id="' + a.id + '" aria-pressed="' + heard + '">' + u.icon('check') + (heard ? 'Écouté' : 'Déjà écouté') + '</button>' +
      '<button type="button" class="act-btn act-x" data-act="alb-hide" data-id="' + a.id + '" aria-label="Pas pour moi, en proposer un autre">' + u.icon('x') + '</button>' +
      '</div></div></article>';
  }

  ELA.pages.albums = {
    render(root) {
      const A = st().albums;
      const genre = store().ui.genre || 'all';
      if (!A.deck.length || A.deckGenre !== genre || A.deck.some((id) => !byId(id))) {
        store().commit((x) => { x.albums.deck = []; draw(x); }, { silent: true });
      }
      const deck = A.deck.map(byId).filter(Boolean);
      const liked = A.liked.map(byId).filter(Boolean);
      root.innerHTML =
        '<section class="page albums">' +
        '<div class="hero hero-albums"><img src="' + ELA.data.images.wolves5.src + '" alt="' + u.esc(ELA.data.images.wolves5.alt) + '">' +
        '<div class="hero-txt"><p class="eyebrow">Salle · pioche n°' + (A.draw || 1) + '</p><h2 class="h-hero">Albums</h2>' +
        '<p class="hero-sub">' + N + ' albums à découvrir pendant tes séances. Note ce que tu aimes : les prochaines pioches s’adaptent.</p>' +
        '<button type="button" class="btn btn-primary" data-act="alb-refresh">' + u.icon('refresh') + 'Actualiser les recommandations</button></div></div>' +
        '<div class="chips" role="group" aria-label="Genres">' + ELA.data.genres.map(([k, l]) =>
          '<button type="button" class="fchip" data-act="genre" data-g="' + k + '" aria-pressed="' + (genre === k) + '">' + l + '</button>').join('') + '</div>' +
        '<div class="albs">' + deck.map(card).join('') + '</div>' +
        '<section class="card picks"><header class="card-head"><h3 class="h-sub">Ma sélection salle</h3><span class="muted small">' + liked.length + ' album' + (liked.length > 1 ? 's' : '') + '</span></header>' +
        (liked.length
          ? '<ul class="picklist">' + liked.map((a) => '<li><span class="pick-dot" style="background:' + (GENRE_INK[a.genre] || ['', '#ccc'])[1] + '"></span><span class="pick-main"><b>' + u.esc(a.title) + '</b><small>' + u.esc(a.artist) + ' · ' + a.year + (a.track ? ' · ' + u.esc(a.track) : '') + '</small></span>' +
              '<a class="link" href="' + u.esc(links(a)[0][1]) + '" target="_blank" rel="noopener noreferrer">Spotify</a><button type="button" class="iconbtn sm" data-act="alb-like" data-id="' + a.id + '" aria-label="Retirer de ma sélection">' + u.icon('x') + '</button></li>').join('') + '</ul>'
          : '<p class="muted">Touche « J’aime » sur un album pour le garder ici.</p>') +
        '<p class="hint">' + A.heard.length + ' écouté' + (A.heard.length > 1 ? 's' : '') + ' · ' + A.hidden.length + ' écarté' + (A.hidden.length > 1 ? 's' : '') + ' sur ' + ELA.data.albums.length + ' albums.' +
        (A.heard.length + A.hidden.length ? ' <button type="button" class="link" data-act="alb-reset">Tout reproposer</button>' : '') + '</p></section>' +
        '</section>';
    },
  };

  ELA.actions['alb-refresh'] = () => {
    store().commit((x) => { draw(x); });
    ELA.ui.toast('Nouvelle pioche');
  };
  ELA.actions.genre = (el) => {
    store().ui.genre = el.dataset.g;
    store().saveUi();
    store().commit((x) => { x.albums.deck = []; draw(x); });
  };
  const toggle = (list, id) => { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id); return i < 0; };
  ELA.actions['alb-like'] = (el) => {
    let on = false;
    store().commit((x) => { on = toggle(x.albums.liked, el.dataset.id); });
    if (on) ELA.ui.toast('Ajouté à ta sélection');
  };
  ELA.actions['alb-heard'] = (el) => store().commit((x) => { toggle(x.albums.heard, el.dataset.id); });
  ELA.actions['alb-hide'] = (el) => {
    const id = el.dataset.id;
    store().commit((x) => {
      if (x.albums.hidden.indexOf(id) < 0) x.albums.hidden.push(id);
      x.albums.liked = x.albums.liked.filter((z) => z !== id);
      const keep = x.albums.deck.filter((z) => z !== id);
      x.albums.deck = keep;
      const before = x.albums.draw;
      draw(x, keep);
      x.albums.draw = before;
    }, { undo: 'Album écarté' });
    ELA.ui.undoToast('Écarté, un autre album le remplace');
  };
  ELA.actions['alb-reset'] = () => {
    store().commit((x) => { x.albums.heard = []; x.albums.hidden = []; }, { undo: 'Réinitialisation des albums' });
    ELA.ui.undoToast('Tous les albums peuvent revenir');
  };
})();
