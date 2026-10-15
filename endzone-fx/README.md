# Endzone FX — générateur d'edits NFL (HyperFrames)

Tu donnes **une demande**, **tes clips** et **une musique**. Le projet sort un edit vertical
1080×1920 à 60 i/s, monté sur le beat, avec ralentis, arrêt sur image, flash, zoom,
secousse, séparation RVB, textes, logo Endzone FX et outro.

```
npm run new -- "Ray Lewis biggest hits"     → crée edits/ray-lewis-biggest-hits/
(dépose clips + musique dans ce dossier)
npm run edit -- ray-lewis-biggest-hits      → renders/ray-lewis-biggest-hits.mp4
```

## 1. Installation (une seule fois, sur ton PC)

1. Installe **Node.js 22+** (nodejs.org), **FFmpeg** (ffmpeg.org, ajoute-le au PATH sous Windows)
   et **Python 3.10+** (python.org).
2. Dans le dossier `endzone-fx/` :

```bash
npm install        # HyperFrames, GSAP, polices
npm run setup      # librosa, numpy… (analyse de la musique et des clips)
```

Le rendu HyperFrames tourne en local : pas de compte HeyGen nécessaire.

## 2. Faire un edit

```bash
npm run new -- "la renaissance de Tom Brady"
```

La demande est comprise automatiquement :

| Demande | Style | Joueur | Titre affiché |
|---|---|---|---|
| la renaissance de Tom Brady | `story` | Tom Brady | THE RENAISSANCE |
| Patrick Mahomes best throws | `highlights` | Patrick Mahomes | BEST THROWS |
| Ray Lewis biggest hits | `hits` | Ray Lewis | BIGGEST HITS |

Options : `--duration 20` (10 à 30 s, sinon « auto » selon le nombre de clips),
`--style hits|highlights|story`, `--name mon-dossier`.

Ensuite :

1. Dépose tes clips dans `edits/<nom>/clips/`, **dans l'ordre** (`01-…`, `02-…`). Le dernier
   clip sert de final (arrêt sur image + titre). Des clips courts (2 à 6 s) autour de l'action
   marchent le mieux, en **60 i/s** si possible (les ralentis sont plus fluides).
2. Dépose la musique (`.mp3` ou `.wav`) dans `edits/<nom>/`.
3. Lance `npm run edit -- <nom>` (ou `--draft` pour un rendu brouillon rapide).

Le programme :
- détecte le tempo, les beats et le **drop** de la musique, puis choisit le passage pour que
  le drop tombe au bon moment ;
- trouve le **moment de l'impact** dans chaque clip et le place **pile sur un beat** ;
- coupe chaque plan sur un beat, accélère avant le choc et ralentit après ;
- recadre chaque clip 16:9 en vertical autour de l'action.

Vérifie `edits/<nom>/impacts.jpg` : c'est l'image d'impact choisie pour chaque clip (le trait
rouge montre le cadrage). Si un impact est faux, corrige-le dans `edit.json` (voir plus bas).

## 3. Le fichier `edit.json`

```json
{
  "request": "la renaissance de Tom Brady",
  "style": "story",
  "player": "Tom Brady",
  "title": "THE RENAISSANCE",
  "duration": 25,
  "format": "vertical",
  "music": { "file": null },
  "story_lines": ["199TH PICK IN 2000", "6 RINGS IN NEW ENGLAND", "THEY SAID HE WAS DONE"],
  "outro": true,
  "clips": [
    { "file": "clips/01-pats.mp4", "impact": 1.8, "focus": 0.4, "label": "SUPER BOWL LI" },
    { "file": "clips/02-tampa.mp4", "hero": true }
  ]
}
```

| Champ | Rôle |
|---|---|
| `style` | `hits` (impacts violents), `highlights` (velocity, best plays), `story` (2 actes : passé calme en noir et blanc, puis le drop) |
| `player`, `title` | Textes affichés (titre d'intro et tampon final) |
| `duration` | 10 à 30 s, ou `"auto"` |
| `music.file` | Nom du fichier musique (sinon le premier `.mp3`/`.wav` du dossier) |
| `story_lines` | Style `story` : une phrase par plan de l'acte 1 |
| `outro` | Logo + « FOLLOW FOR MORE » à la fin (`false` pour l'enlever) |
| `clips` | Facultatif. Vide = tous les clips de `clips/` par ordre alphabétique |
| `clips[].impact` | Force l'instant du choc (en secondes dans le clip) |
| `clips[].focus` | Force le cadrage vertical : 0 = gauche, 0,5 = centre, 1 = droite |
| `clips[].label` | Petit texte sur le plan (année, match…) |
| `clips[].hero` | Ce clip devient le final |

## 4. Les 3 styles

| Style | Durée par défaut | Montage |
|---|---|---|
| `hits` | 15 s | Intro au ralenti : l'impact du 1er clip tombe **sur le drop**. Ensuite, un plan par impact avec flash, zoom punch, secousse et RVB. |
| `highlights` | 20 s | Même intro, puis « velocity » : accéléré ×1,35 → ralenti ×0,32 sur le geste → reprise, avec transitions whip. |
| `story` | 25 s | Acte 1 (avant le drop) lent, noir et blanc, phrases d'histoire. Acte 2 (drop) en couleur, rapide, avec impacts. Final figé avec le titre. |

Réglages fins dans `styles/*.json` (vitesses, force des effets, étalonnage, durée des plans).

## 5. Bruitages (Freesound)

Les bruitages viennent de **Freesound**, en **licence CC0 uniquement** : utilisables sur une
chaîne monétisée, sans obligation de créditer.

1. Crée un compte sur freesound.org, puis une clé API : https://freesound.org/apiv2/apply
2. `FREESOUND_API_KEY=ta_cle npm run sfx` (Windows PowerShell : `$env:FREESOUND_API_KEY="ta_cle"; npm run sfx`)

Les sons arrivent dans `assets/sfx/<catégorie>/` (whoosh, impact, swish, boom, riser, shutter,
crowd), avec la liste dans `assets/sfx/CREDITS.md`. Ils sont placés automatiquement :
whoosh sur les coupes, impact sur les chocs, riser qui monte jusqu'au drop, boom sur le drop,
déclic photo sur l'arrêt sur image, foule sur le final. Sans bruitages, l'edit se fait quand
même (musique seule).

## 6. Musiques

Ce qui revient le plus dans les edits NFL / foot sur TikTok en ce moment (aperçu, pas un classement) :

| Style | Pistes qui reviennent souvent |
|---|---|
| `hits` | Phonk brésilien / « montagem » : *Passo Bem Solto* (ATLXS), *Invocado* (Chaxzer & DJ FKU), *Montagem Blah Blah Wooble*, *FUNK DO NUH* |
| `highlights` | Rap / mixtape : *North Pole* (Boohavinn), *I Don't Like* (Chief Keef), *Can't Hold Us* (Macklemore) |
| `story` | Montée émotionnelle puis drop : *Sailor Song* (Gigi Perez), remixes « slowed » |

Ce qui marche le mieux avec le moteur : un **tempo net (130-160 BPM)** et un **vrai drop**
après 8 à 15 s de montée. Le drop est détecté automatiquement.

⚠️ Droits : ces morceaux sont protégés. Sur **TikTok**, ajoute le son depuis la bibliothèque
TikTok. Sur **YouTube**, attends-toi à des réclamations Content ID : les revenus vont à
l'ayant droit, mais ce n'est pas un avertissement (strike). Pour une musique sans risque :
la bibliothèque audio YouTube (gratuite), NCS (gratuit, crédit obligatoire) ou Epidemic Sound
(payant).

## 7. Aperçu et retouches à la main

```bash
npm run build -- <nom>      # prépare la composition sans rendre
npm run preview -- <nom>    # ouvre HyperFrames Studio dans le navigateur
```

Dans Studio, tu peux cliquer sur un texte ou décaler un plan. La composition générée est
dans `build/<nom>/index.html`, et le plan de montage détaillé dans `build/<nom>/plan.json`.

## 7 bis. Finir le montage dans DaVinci Resolve

```bash
npm run davinci -- <nom>
```

Le générateur prépare un **kit DaVinci** dans `davinci/<nom>/` : la timeline déjà coupée sur les
beats (ralentis et arrêts sur image inclus), la musique au bon passage, les marqueurs (beats,
coupes, impacts, drop) et un calque transparent avec titres, logo, outro et flashs.
Tu l'importes dans DaVinci et tu n'as plus qu'à ajouter tes effets.

Procédure complète, de la préparation du projet modèle à l'export : **[DAVINCI.md](DAVINCI.md)**.

## 8. Formats

- **Vertical 1080×1920, 60 i/s** : format actif (TikTok, Shorts, Reels).
- **16:9 1920×1080** : prévu. Il fonctionne déjà (`npm run edit -- <nom> --format landscape`),
  mais il n'a pas encore été validé sur de vrais clips.

## 9. Tester sans vrais clips

```bash
npm run test-assets                                  # clips + musique de test dans edits/demo-test/
npm run edit -- demo-test --draft --debug-timing     # rendu sans effets
node scripts/py.mjs tests/verify_sync.py build/demo-test/plan.json renders/demo-test-draft.mp4
npm test                                             # tests du moteur
```

Les clips de test affichent « IMPACT » sur l'image exacte du choc. `verify_sync.py` vérifie
que chaque impact tombe sur son beat (résultat actuel : à 1 image près sur 60 i/s).

## Structure

```
brand/        logo, badge détouré, couleurs et polices (brand.json)
formats/      vertical.json (actif), landscape.json (16:9 prévu)
styles/       hits.json, highlights.json, story.json
lib/          request.mjs (demande → réglages), plan.mjs (montage), compose.mjs (HTML HyperFrames)
scripts/      new-edit, make-edit, preview, davinci, fetch-sfx, analyse musique/clips, assets de test
edits/<nom>/  edit.json + clips/ + musique (les médias ne vont pas sur GitHub)
build/        compositions HyperFrames générées
davinci/      kits DaVinci Resolve (npm run davinci)
renders/      vidéos finales
```

## Limites connues

- L'impact automatique est une **estimation** (pic de mouvement). Vérifie toujours `impacts.jpg`.
- Avec une source à 30 i/s, les ralentis répètent des images : préfère des clips à 60 i/s.
- Rendu : environ 2 minutes pour 15 s en brouillon sur une machine modeste. Plus rapide sur un bon PC.
- `hyperframes lint` affiche 3 avertissements `nested_structure_needs_subcomposition` : ils
  concernent seulement l'affichage dans Studio, pas le rendu.
