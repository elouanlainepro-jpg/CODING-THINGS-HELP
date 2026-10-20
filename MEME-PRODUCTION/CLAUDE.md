# MEME PRODUCTION — mémoire du studio

Studio de fabrication de memes vidéo verticaux (TikTok, YouTube Shorts, Reels).
Claude fabrique les vidéos lui-même avec FFmpeg + Python : il ne se contente pas de donner des idées.
Parle-moi en français, réponses courtes, va droit au but.

## Le format « meme » (référence : le POV « Me at 6 AM staring at absolutely nothing… »)

Vidéo 1080×1920 (9:16), 30 fps, H.264 + AAC, 6 à 15 secondes.

```
 y=0      ┌────────────────┐
          │ noir (96 px)   │
 y=96     ├────────────────┤
          │ BANDE BLANCHE  │  fond #FCFCFC, texte #111111, centré, gras,
          │ texte du meme  │  police Inter SemiBold ~70 px, 2 à 4 lignes
 y=660    ├────────────────┤
          │ CLIP A puis B  │  plein largeur, recadré 1080×864 (5:4)
          │ (son d'origine)│
 y=1524   ├────────────────┤
          │ noir (396 px)  │  zone libre (sous-titres éventuels)
 y=1920   └────────────────┘
```

Tous ces réglages vivent dans `config.json` — on les change là, jamais en dur dans le code.

- **Clip A** = le clip principal (déposé dans `inbox/`), **clip B** = le clip de chute/réaction (souvent tiré de `bibliotheque/`).
  Ils s'enchaînent à la suite, sans transition fantaisiste (coupe sèche). On peut aller jusqu'à C et D.
- Le **son des clips** est conservé. Musique de fond seulement si demandée (`--music`, volume 15 %).
- Le texte du meme est écrit **dans la langue du clip / de l'audience** (par défaut : anglais, style « POV: Me … »).
  Pas d'emoji dans la bande (la police ne les rend pas).

## Dossiers

| Dossier | Rôle |
|---|---|
| `inbox/` | clips bruts téléchargés (entrée) |
| `bibliotheque/` | clips B réutilisables, rangés par thème : `reactions/`, `gaming/`, `films/`… + `index.json` (tags) |
| `templates/` | logos, intro « Coffee Story », musiques |
| `idees/` | idées de memes du jour (`AAAA-MM-JJ.md`), numérotées 1, 2, 3… |
| `sortie/` | vidéos finies + leur `.txt` de description |
| `scripts/` | `meme.py` (montage), `index_library.py`, `subtitles.py`, `setup_check.py` |
| `fonts/` | Inter, Montserrat, Anton, Bebas Neue |

## Commandes (skills)

- `/meme` — fabrique la vidéo finie (2 clips + texte, ou `/meme 1` pour l'idée n°1 du jour).
- `/description` — titre, description et hashtags YouTube + TikTok.
- `/indexer` — décrit et tague les clips de la bibliothèque pour les retrouver seul.
- `/soustitres` — sous-titres automatiques (Whisper local).

Commande de base si besoin direct :
`python scripts/meme.py --text "…" --a inbox/a.mp4 --b bibliotheque/reactions/x.mp4 [--a-start 2 --a-dur 4 --b-dur 2 --music templates/x.mp3]`

## Ton

Humour d'internet : relatable, sec, auto-dérision, formulations courtes (« POV: … », « Me when … », « Nobody: … »).
Jamais méchant envers un individu réel, jamais de politique partisane, pas de contenu haineux.

## Règles

- **Pas de filigrane d'autres créateurs** : si un clip en a un (TikTok, Instagram…), le signaler et ne pas l'utiliser.
- **Pas de reposts** : toujours un montage original (texte + enchaînement A/B à nous). Ne jamais republier une vidéo telle quelle.
- Ne jamais écraser un fichier de `sortie/` sans le dire ; ne jamais supprimer de clips de `inbox/` ou `bibliotheque/`.
- Après chaque vidéo : extraire une image (`ffmpeg -ss 1 -i sortie/x.mp4 -frames:v 1 /tmp/x.png`), la regarder, et vérifier
  que le texte n'est pas coupé et que le clip est bien cadré avant de dire « c'est fini ».
- Les vidéos sont **vérifiées par l'humain avant publication** : ne jamais publier de ton propre chef.
- Bibliothèque : si un clip B manque, le dire et proposer ce qu'il faudrait télécharger, ne pas inventer.
