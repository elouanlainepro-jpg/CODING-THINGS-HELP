# Monter un edit Endzone FX dans DaVinci Resolve

Le principe : **le générateur fait la partie longue et mécanique, toi la partie créative.**

| Le générateur (`npm run davinci`) | Toi, dans DaVinci |
|---|---|
| Analyse la musique (tempo, beats, drop) | Effets : zoom punch, shake, RVB, transitions |
| Coupe chaque clip **sur les beats** | Étalonnage (noir et blanc, look punchy) |
| Place chaque impact **pile sur un beat** | Ajustements de goût |
| Ralentis, accélérés et arrêts sur image | Export |
| Recadrage vertical sur l'action | |
| Musique coupée au bon passage | |
| Marqueurs : beats, coupes, impacts, drop | |
| Calque titres, logo, outro et flashs | |
| Bruitages placés (si téléchargés) | |

Préparation unique : environ 45 minutes. Ensuite, environ **15 à 25 minutes par edit**.

---

## Partie 1 — Préparation unique

### 1.1 Le projet modèle « EFX TEMPLATE »

1. Dans le Project Manager, crée un projet **EFX TEMPLATE**.
2. **Avant d'importer quoi que ce soit** (la cadence se verrouille ensuite), ouvre
   Fichier > Paramètres du projet (*File > Project Settings*) > **Master Settings** :
   - *Timeline resolution* : **Custom 1080 × 1920**, et coche *Use vertical resolution* si l'option existe dans ta version.
   - *Timeline frame rate* : **60**. *Playback frame rate* : **60**.
3. Dans **Image Scaling** > *Mismatched resolution files* : **Scale full frame with crop**.
   Un clip 16:9 posé à la main remplira alors tout le cadre vertical.
4. Enregistre.

**Pour chaque nouvel edit**, ouvre EFX TEMPLATE puis *File > Save Project As…* « EFX Ray Lewis ».
Tous tes réglages et presets suivent.

### 1.2 Les Power Bins (bibliothèque partagée entre projets)

1. *View > Show Power Bins*.
2. Crée 4 Power Bins : **EFX Sons**, **EFX Overlays**, **EFX Logo**, **EFX Titres**.
3. Remplis-les :
   - **EFX Sons** : le contenu de `endzone-fx/assets/sfx/` (après `npm run sfx`) : whoosh, impact, boom, riser, shutter, crowd.
   - **EFX Overlays** : grain, light leaks, poussière (packs gratuits ou les tiens).
   - **EFX Logo** : `endzone-fx/brand/logo-badge.png` (fond transparent).

### 1.3 La timeline « PRESETS » (tes effets prêts à coller)

Dans EFX TEMPLATE, crée une timeline **PRESETS** et fabrique chaque effet une seule fois.
Comme chaque edit part du modèle, cette timeline sera dans tous tes projets. Pour utiliser
un effet : copie-le (Ctrl+C) dans PRESETS, puis colle-le (Ctrl+V) au marqueur voulu dans ta timeline d'edit.

Les effets reposent sur des **Adjustment Clips** (Bibliothèque d'effets > *Toolbox > Effects >
Adjustment Clip*). Un Adjustment Clip posé sur une piste au-dessus modifie tout ce qui est en dessous.

> Certains ResolveFX sont réservés à la version **Studio** : ils laissent un filigrane dans la
> version gratuite. Pour chaque effet, je donne une méthode qui marche dans la version gratuite.

#### FLASH (8 images)
1. *Toolbox > Generators > Solid Color* (blanc), longueur 8 images.
2. Inspector > *Composite* > *Opacity* : image-clé à **100** sur l'image 0, à **0** sur l'image 6.
3. Version plus violente : *Composite mode* sur **Add**.

> Le calque V2 du kit contient déjà les flashs des impacts. Ce preset sert aux flashs en plus.

#### ZOOM PUNCH (12 images)
1. Adjustment Clip de 12 images.
2. Inspector > *Transform* > *Zoom* : images-clés **1.00** (image 0) → **1.15** (image 3) → **1.04** (image 12).
3. Clic droit sur les images-clés > *Ease Out*.

#### SHAKE (15 images)
- **Studio** : sur un Adjustment Clip, *Open FX > ResolveFX Transform > Camera Shake*. Monte
  *Motion Scale* et *Speed*. Anime ensuite l'intensité pour qu'elle descende à 0 en 15 images.
- **Gratuit (Fusion)** :
  1. Sélectionne l'Adjustment Clip et passe sur la page **Fusion**.
  2. Ajoute un nœud **Transform** entre MediaIn et MediaOut.
  3. Clic droit sur *Center* > *Modify With* > **Shake**, *Smoothness* 0, déviation X/Y ≈ 0.02.
  4. Mets une image-clé sur la déviation pour qu'elle retombe à 0.

#### RVB / ABERRATION CHROMATIQUE (8 images, Fusion, gratuit)
1. Adjustment Clip > page **Fusion**.
2. MediaIn → 3 nœuds **Channel Booleans** : un ne garde que le rouge, un que le vert, un que le bleu.
3. **Transform** sur le rouge (*Center X* +0.008) et sur le bleu (−0.008).
4. Recombine les trois avec des **Merge** en mode *Screen* → MediaOut.
5. Anime les décalages pour qu'ils reviennent à 0 en 6 images.

#### ZOOM BLUR (transition, 8 images à cheval sur une coupe)
1. Adjustment Clip centré sur la coupe.
2. Page Fusion : nœud **Directional Blur**, *Type* **Zoom**, longueur animée 0.3 → 0.
3. Ajoute un Zoom (Inspector) **1.20 → 1.00** sur les 8 images.

#### WHIP (transition, 8 images)
1. Adjustment Clip à cheval sur la coupe.
2. Inspector > *Position X* : décalage rapide (+300 → 0).
3. Fusion : **Directional Blur** *Type* **Linear**, angle 0, longueur animée.

#### GRADE MONO (intro / acte 1)
1. Adjustment Clip > page **Color**.
2. *Saturation* **0**, *Contrast* **1.3**, Gain légèrement baissé.

#### GRADE PUNCHY (après le drop)
1. Adjustment Clip > page Color.
2. *Contrast* **1.2**, *Saturation* **65**, Lift un peu baissé.
3. Option : *Color Boost* vers 20.

#### GRAIN + VIGNETTE
- **Grain** : dans Fusion, nœud **Film Grain** sur un Adjustment Clip. Ou un overlay de grain
  en mode *Overlay* à 15 % (EFX Overlays).
- **Vignette** : page Color, fenêtre circulaire sur un nœud, puis assombris l'extérieur (*Gain* vers 0.8).

#### Transformer un effet Fusion en effet réutilisable (macro)
1. Dans la page Fusion, sélectionne les nœuds de l'effet (sans MediaIn ni MediaOut).
2. Clic droit > **Macro > Create Macro**, coche les réglages utiles, puis *Save* dans :
   - Windows : `%AppData%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Templates\Edit\Effects`
   - Mac : `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/Edit/Effects`
3. Redémarre Resolve. L'effet apparaît dans la Bibliothèque d'effets (*Fusion Effects*) et il
   suffit de le glisser sur un clip.

### 1.4 Le preset d'export « EFX Vertical 60 »

1. Page **Deliver** > *Custom Export*.
2. Réglages : *Format* MP4, *Codec* H.264 (ou H.265), *Resolution* **1080 × 1920**, *Frame rate* **60**,
   *Quality* restreinte à 30 000 Kb/s, audio AAC 320 kb/s.
3. Menu ••• > **Save as New Preset** > « EFX Vertical 60 ».

### 1.5 Raccourcis à connaître

| Action | Windows | Mac |
|---|---|---|
| Couper le clip à la tête de lecture | Ctrl+B | Cmd+B |
| Mode sélection / mode lame | A / B | A / B |
| Magnétisme (snapping) | N | N |
| Ajouter un marqueur | M | M |
| Marqueur suivant / précédent | Shift+↓ / Shift+↑ | Shift+↓ / Shift+↑ |
| Coupe suivante / précédente | ↓ / ↑ | ↓ / ↑ |
| Afficher les contrôles de vitesse | Ctrl+R | Cmd+R |
| Arrêt sur image | Shift+R | Shift+R |
| Coller les attributs (effets d'un clip à un autre) | Alt+V | Option+V |
| Remplacer le clip (garde la durée) | F11 | F11 |
| Point d'entrée / de sortie | I / O | I / O |

---

## Partie 2 — Chaque edit, étape par étape

### Étape 1 — Le kit (automatique, 3 à 5 min)

```bash
npm run new -- "Ray Lewis biggest hits"
# dépose les clips dans edits/ray-lewis-biggest-hits/clips/ et la musique dans edits/ray-lewis-biggest-hits/
npm run davinci -- ray-lewis-biggest-hits
```

Vérifie `edits/ray-lewis-biggest-hits/impacts.jpg` : c'est l'image de choc choisie pour chaque clip.
Si l'une est fausse, corrige `"impact"` dans `edit.json` et relance.

Options :
- `--smooth` : ralentis plus fluides (images intermédiaires calculées, plus long à fabriquer).
- `--full-frame` : garde le cadre 16:9 d'origine pour recadrer toi-même.
- `--no-graphics` : pas de calque titres/logo.

Le kit arrive dans `davinci/ray-lewis-biggest-hits/` :

| Fichier | Contenu |
|---|---|
| `timeline.xml` | La timeline à importer |
| `timeline.otio` | La même, au format OpenTimelineIO (DaVinci 18.5+) |
| `markers.edl` | Tous les marqueurs |
| `segments/` | Un fichier par plan, déjà coupé, vertical, ralentis inclus |
| `music.wav` | Le passage exact de la musique |
| `graphics.mov` | Titres, logo, outro et flashs, sur fond transparent |
| `sfx/` | Les bruitages |
| `PLAN.md` | La liste des plans, avec timecodes, clips d'origine et effets conseillés |

⚠️ Ne déplace pas ce dossier après l'import : la timeline pointe vers ces fichiers.

### Étape 2 — Import dans DaVinci (2 min)

1. Ouvre **EFX TEMPLATE** > *File > Save Project As…* « EFX Ray Lewis ».
2. *File > Import > Timeline…* (Ctrl+Shift+I) > `timeline.xml`. Dans la fenêtre d'options :
   - **décoche** *Automatically set project settings* (pour garder ton 1080 × 1920 / 60 i/s) ;
   - **coche** *Automatically import source clips into media pool*.
3. Dans le Media Pool : clic droit sur la nouvelle timeline > *Timelines > Import >
   Timeline Markers from EDL…* > `markers.edl`.
4. Lance la lecture. Tu dois avoir :

| Piste | Contenu |
|---|---|
| V1 | Les clips coupés sur les beats |
| V2 | Titres, logo, outro, flashs (transparent) |
| A1 | La musique |
| A2+ | Les bruitages (si tu as fait `npm run sfx`) |

| Couleur de marqueur | Signification |
|---|---|
| 🔴 Rouge | Drop |
| 🟡 Jaune | Impact (place tes effets ici) |
| 🟢 Vert | Coupe |
| 🟣 Violet | Arrêt sur image |
| Crème | Outro |
| Bleu ciel | Début de mesure |
| 🔵 Bleu | Beat |

### Étape 3 — Effets d'impact (5 à 10 min)

1. Active le magnétisme (**N**) et prépare **3 pistes vides au-dessus de V1**. Déplace V2
   (titres) tout en haut pour qu'il reste par-dessus les effets.
2. Place la tête de lecture au début, puis **Shift+↓** pour sauter de marqueur en marqueur.
3. Sur chaque marqueur **jaune**, colle depuis PRESETS : **ZOOM PUNCH** + **SHAKE**, plus **RVB**
   sur les plus gros impacts. `PLAN.md` indique quels plans en veulent et à quelle intensité
   (colonne « Effets conseillés »).
4. Sur les marqueurs **verts** (coupes), colle **ZOOM BLUR** ou **WHIP**, en variant.

### Étape 4 — Étalonnage (2 à 4 min)

1. Pose l'Adjustment Clip **GRADE MONO** du début jusqu'au marqueur **rouge** (le drop), si le
   style le demande : `PLAN.md` > colonne « Étalonnage » = `mono` ou `cold`.
2. Pose **GRADE PUNCHY** du drop jusqu'au marqueur **crème** (outro).
3. Pose le grain et la vignette sur toute la durée.
4. Tout ça va **sous** V2 (titres), pour que le logo et les textes gardent leurs vraies couleurs.

### Étape 5 — Son (2 min)

- **Bruitages déjà placés** (A2+) : ajuste juste les volumes.
- **Sinon**, depuis la Power Bin **EFX Sons** :
  - **whoosh** environ 6 images avant chaque marqueur vert ;
  - **impact** sur chaque marqueur jaune ;
  - **riser** qui **se termine** sur le marqueur rouge, et **boom** sur le marqueur rouge ;
  - **shutter** sur le marqueur violet.
- La musique doit rester la plus forte : bruitages autour de −8 à −12 dB.

### Étape 6 — Retouches de goût (optionnel)

- **Refaire un ralenti en plus fluide** : `PLAN.md` donne le clip d'origine de chaque plan.
  1. Pose le clip d'origine sur le segment et cale l'image du choc sur le marqueur jaune.
  2. **Ctrl+R**, puis ajoute des points de vitesse.
  3. Inspector > *Retime Process* : **Optical Flow** (gratuit). *Speed Warp* est encore plus propre (Studio).
- **Remplacer un plan** : sélectionne le segment, choisis ton nouveau clip dans le viewer source, puis **F11** (il garde la durée exacte).
- **Changer les titres** : désactive V2 et utilise tes propres titres Text+ (ta timeline PRESETS peut en contenir des modèles).

### Étape 7 — Export (1 min)

Page **Deliver** > preset **EFX Vertical 60** > nom du fichier > *Add to Render Queue* > *Render All*.

---

## Dépannage

| Problème | Solution |
|---|---|
| Clips « Media Offline » | Le dossier `davinci/<nom>/` a été déplacé : remets-le, ou clic droit sur les clips > *Relink Selected Clips*. |
| La timeline importée est en 1920 × 1080 | Clic droit sur la timeline > *Timelines > Timeline Settings* : décoche *Use Project Settings*, puis mets 1080 × 1920 / 60. |
| Les marqueurs n'apparaissent pas | La timeline doit commencer à **01:00:00:00** et être à 60 i/s. Sélectionne bien la timeline dans le Media Pool avant d'importer l'EDL. Dézoome la timeline. |
| L'import du XML échoue | Importe `timeline.otio` à la place (DaVinci 18.5 ou plus). |
| Lecture saccadée | *Playback > Render Cache > Smart*. Le calque `graphics.mov` (ProRes 4444) est lourd : laisse le cache le calculer une fois. |
| Filigrane sur un effet | C'est un effet Studio : utilise la version Fusion décrite plus haut. |
| Beats décalés sur une musique sans tempo fixe | Normal sur une musique lente ou jouée « live » : cale les coupes à l'oreille sur les marqueurs proches. |

---

## Sans le générateur

Avec des clips que tu as montés toi-même :
1. Pose la musique sur A1 au début de la timeline.
2. **Studio** : clic droit sur la musique > *Detect Music Beats*.
   **Gratuit** : lance la lecture et appuie sur **M** à chaque beat.
3. Coupe sur les marqueurs (magnétisme **N** + **Ctrl+B**), puis applique les étapes 3 à 7.
