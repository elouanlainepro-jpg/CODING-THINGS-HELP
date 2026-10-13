# ELOUAN LAINE · studio d'organisation

Studio d'organisation de la semaine, du lundi au dimanche : cours, révisions, basket, salle, tâches, rendez-vous, motivation et albums pour la salle. Thème noir, fait pour l'iPhone comme pour l'ordinateur.

## Ouvrir le studio

- **Le plus simple** : ouvre `index.html` dans un navigateur (double-clic). Tout fonctionne, sauf la lecture des vidéos directement dans la page : elles s'ouvrent alors sur YouTube.
- **Avec les vidéos intégrées** : sers le dossier en local, puis ouvre `http://localhost:8000`.
  ```sh
  cd "ORGANISATION/ELOUAN LAINE"
  python3 -m http.server 8000
  ```
- **Sur iPhone** : publie le dossier (GitHub Pages, Netlify…) ou utilise le lien du studio hébergé sur claude.ai. Dans Safari : Partager → « Sur l'écran d'accueil » pour l'avoir comme une app.

Aucune installation, aucune dépendance : HTML, CSS et JavaScript simples. Les polices viennent de Google Fonts, avec des polices de secours si tu es hors ligne.

## Ce qu'il y a dedans

| Onglet | Rôle |
|---|---|
| **Planning** | Vues Jour / Semaine / Mois. Palette des 10 matières à glisser dans la grille (ou touche une matière puis un créneau). Déplacer un bloc : glisser à la souris, appui long au doigt. Redimensionner : bord du bas. Créneaux libres, réadaptation automatique, résumé de la semaine (heures de cours, révisions par matière, séances de sport). |
| **Tâches** | Ajout rapide, échéance, matière, priorité, durée. « Planifier » place la tâche dans le prochain créneau libre du planning. |
| **Sport** | Séances de la semaine à cocher, programme Push / Pull / Legs A / Legs B adapté au basket, basket solo, footing, Tom Holland challenge (tours notés, record), courbe de poids. |
| **Motivation** | Tes images avec des citations, vidéos YouTube (catégories, ajoute les tiennes), ta semaine en chiffres. |
| **Albums** | 6 idées d'albums pour la salle, bouton « Actualiser », J'aime / Déjà écouté / Pas pour moi : les pioches suivantes s'adaptent à tes goûts. |
| **Réglages** | Profil (poids modifiable aussi en haut à gauche), journée type, créneaux basket, salle, groupe d'emploi du temps, matières, export / import, code de transfert. |

## Emploi du temps : comment il s'adapte

C'est une fonctionnalité du planning (bouton **Emploi du temps**), pas tout le planning :

1. **Fichier .ics** : sur `planning.univ-lehavre.fr` (ADE), exporte l'agenda en `.ics` et choisis-le. Le studio garde seulement **le groupe C** (TP), **le parcours BOE**, **le TD Gr2** et **tous les CM**. L'aperçu montre ce qui est gardé ou écarté, et pourquoi ; tu peux corriger avant d'importer.
2. **Ajout manuel** : un cours, répété sur plusieurs semaines si besoin.
3. **Exemple semaine 42** : ta capture du 12 au 17 octobre 2026 (16 créneaux, 9 pour toi). Elle est chargée au premier lancement.

Après chaque import, la semaine est **réadaptée** : la routine et le sport se recalent autour des cours. Tes révisions, rendez-vous et tout ce que tu as déplacé à la main ne bougent jamais.

`Géomorphologie` est rangée par défaut en **GEO 1** et `Microbiologie - Immunologie` en **Microbiologie** : change-le dans Réglages → Emploi du temps → « Cours → matière ».

## Planification automatique

- **Journée** : réveil 6h00, toilette 15 min, petit-déj 15 min, déjeuner 30 min (désactivable), dîner 30 min, coucher 00h00.
- **Basket univ** : lundi et mardi 19h00–20h30, mercredi 20h30–22h30, jeudi 18h30–20h00 « à confirmer » chaque semaine (Oui / Pas cette fois). Ces jours sont réglables.
- **Salle le soir** les jours sans entraînement (l'après-midi si besoin) : Push, Pull, Legs A (force, prévention), Legs B (explosivité, appuis).
- **Legs ×2** jamais le même jour qu'un entraînement basket, le moins possible la veille, jamais deux jours de suite.
- **Basket solo le matin** (3 par semaine, au moins 45 min avant le premier cours), loin des jours de legs.
- **Footing 1 h** en zone 2, plutôt le week-end matin.
- **Tom Holland challenge ×2** (5 tractions, 10 pompes, 15 squats, un maximum de tours en 20 min) les jours sans push ni pull.

## Tes données

- Tout est enregistré dans ton navigateur. Dans la version hébergée sur claude.ai, le studio se synchronise aussi avec ton compte : même planning sur ton téléphone et ton ordinateur.
- **Réglages → Données & partage** : export `.ics` pour le Calendrier de l'iPhone, sauvegarde JSON, code de transfert compact (et lien de partage `#s=…` quand le studio est servi en http).

## Fichiers

```
index.html          page de l'application
css/styles.css      thème noir
js/data.js          matières, programme sport, vidéos, citations, albums, exemple semaine 42
js/store.js         état, sauvegarde, annulation, synchronisation
js/timetable.js     lecture .ics, filtre de groupe, import
js/planner.js       planification automatique de la semaine
js/calendar.js      vues et glisser-déposer
js/editor.js        fenêtres d'édition et d'import
js/*.js             onglets (tâches, sport, motivation, albums, réglages)
assets/img/         images de motivation
```

Le principe de partage par lien compressé et l'import `.ics` s'inspirent de [Hash Calendar](https://github.com/supunlakmal/hash-calendar) (licence MIT) ; le code ici est écrit pour ce studio.
