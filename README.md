# 🦄 LICORN·IA SWAP 3000

> **Clique** sur un objet dans ta vidéo → **décris** ce que tu veux à la place → la licorne
> **suit** l'objet, l'**efface**, **génère** le nouvel élément et l'**incruste** avec la bonne
> lumière, les bonnes ombres, le bon flou de bougé et le bon grain. *Such realism. Much wow.*

Application web locale (React + FastAPI + OpenCV + PyTorch) de **remplacement d'objets vidéo par
IA**, pensée pour tourner sur un **Mac** (Apple Silicon/MPS), avec une interface volontairement
**cartoon / meme / licorne** (confettis, licornes qui galopent, légendes en Impact) qui reste
ergonomique : un lecteur au centre, une barre de prompt, une galerie.

---

## ✨ Fonctionnalités

| | |
|---|---|
| 🎯 **Click** | Clic sur la vidéo (canvas superposé) → détourage instantané par **SAM2** (Segment Anything 2). Clics « inclure » / « exclure » (Shift ou clic droit) pour affiner. |
| 🧭 **Track** | Le masque est propagé dans **toute** la vidéo (SAM2 video predictor, en avant et en arrière) ; le mouvement de l'objet (translation/rotation/échelle) et celui de la **caméra** sont estimés puis lissés. |
| 🧽 **Erase** | L'objet d'origine **et son ombre portée** sont effacés : reconstruction temporelle du décor (pixels réellement visibles dans les autres images, recalés par homographies), **LaMa** pour le décor jamais visible, ou **ProPainter** (optionnel). |
| 🎨 **Replace** | L'élément est généré **dans la scène** par diffusion (SDXL inpainting) sur le décor nettoyé → perspective, lumière et colorimétrie cohérentes. Ou importe ta propre image PNG. |
| 💡 **Perfect conditions** | Ré-éclairage spatial frame par frame, **vraie ombre d'origine** re-ciblée sur le nouvel élément, occlusions (ce qui passe devant reste devant), flou de bougé directionnel, grain caméra, netteté appariée, light wrap. |
| 🌈 **Recolorer** | Mode sans IA générative : change la couleur/matière de l'objet (or, chrome, néon, arc-en-ciel…) en conservant son éclairage d'origine. |
| 📁 **YOUR DAIL CLIPS** | Chaque rendu (vidéo finale + tous les assets) est automatiquement sauvegardé dans `elements/YOUR DAIL CLIPS/`. |

---

## 🗂️ Arborescence

```
CODING-THINGS-HELP/
├── setup_mac.sh                 # installation macOS (venv ou conda, IA, ProPainter)
├── start.sh                     # lancement (dev / prod / api / test)
├── .env.example                 # configuration (copiée en .env)
├── elements/
│   └── YOUR DAIL CLIPS/         # ⬅️ toutes les vidéos traitées + assets finaux
├── backend/                     # Python · FastAPI · OpenCV · PyTorch
│   ├── requirements.txt         # socle (léger)
│   ├── requirements-ai.txt      # torch / diffusers / (SAM2 via setup)
│   ├── app/
│   │   ├── main.py              # API REST + fichiers statiques
│   │   ├── config.py            # réglages (variables d'env / .env)
│   │   ├── devices.py           # détection MPS / CUDA / moteurs disponibles
│   │   ├── jobs.py              # file de rendus en arrière-plan
│   │   ├── storage.py           # workspace + galerie YOUR DAIL CLIPS
│   │   ├── prefetch.py          # téléchargement anticipé des modèles
│   │   └── pipeline/
│   │       ├── video_io.py      # proxy H.264 CFR, memmap, encodage ffmpeg
│   │       ├── segmentation.py  # SAM2 image / repli GrabCut
│   │       ├── tracking.py      # SAM2 video / flux optique, mouvement objet & caméra
│   │       ├── inpainting.py    # effacement : ProPainter / temporel + LaMa
│   │       ├── generation.py    # diffusion SDXL, détourage, image importée, harmonisation
│   │       ├── compositing.py   # ombres, lumière, occlusions, flou, grain, light wrap
│   │       ├── restyle.py       # mode « Recolorer »
│   │       ├── replacer.py      # orchestrateur du pipeline complet
│   │       ├── models.py        # chargement paresseux des modèles
│   │       └── maskops.py       # outils masques / estimation de bruit & netteté
│   └── tests/                   # tests pytest (scène synthétique, API de bout en bout)
└── frontend/                    # React 19 + Vite
    └── src/
        ├── App.jsx
        ├── api.js · confetti.js · styles.css
        └── components/          # VideoStage (canvas de clic), PromptBar, OptionsPanel,
                                 # JobProgress, Gallery, CompareModal, FunLayer…
```

---

## 🍏 Installation sur macOS

### Prérequis

- macOS 13+ — **Apple Silicon (M1/M2/M3/M4) fortement recommandé** (accélération Metal/MPS)
- 16 Go de RAM minimum (32 Go conseillés pour SDXL + clips 1080p)
- ~15 Go d'espace disque (modèles : SDXL ≈ 7 Go, SAM2 ≈ 0,3 Go, LaMa ≈ 0,2 Go)
- [Homebrew](https://brew.sh)

### Installation en une commande

```bash
git clone <ce-repo> && cd CODING-THINGS-HELP
./setup_mac.sh                 # venv isolé .venv + IA + interface
```

Options :

| Option | Effet |
|---|---|
| `--conda` | utilise un environnement **Conda** `licornia` (Miniforge) au lieu d'un venv |
| `--no-ai` | socle seul (~200 Mo) : GrabCut, flux optique, effacement temporel, recolor, image importée |
| `--with-propainter` | installe **ProPainter** dans **son propre** environnement (`third_party/ProPainter/.venv`) |
| `--prefetch` | télécharge tous les modèles tout de suite (sinon : au premier usage) |

> 💡 **Pourquoi un environnement isolé ?** Les modèles vidéo (ProPainter, E2FGVI…) épinglent souvent
> des versions de torch/numpy différentes. Ici **tout** vit dans `.venv` (ou l'env conda
> `licornia`), et ProPainter a même son propre venv : il est appelé en sous-processus par le
> backend, donc **aucun conflit** avec tes autres projets ni entre modèles.

### Installation manuelle (si tu préfères)

```bash
brew install python@3.11 ffmpeg node
python3.11 -m venv .venv && source .venv/bin/activate      # ou : conda create -n licornia python=3.11
pip install -r backend/requirements-dev.txt
pip install -r backend/requirements-ai.txt
SAM2_BUILD_CUDA=0 pip install --no-build-isolation "git+https://github.com/facebookresearch/sam2.git"
cp .env.example .env
(cd frontend && npm install)
```

### Lancer

```bash
./start.sh          # API sur :8000 + interface sur http://localhost:5173 (s'ouvre toute seule)
./start.sh prod     # build de l'interface, tout servi sur http://localhost:8000
./start.sh test     # tests backend
```

La doc interactive de l'API est sur <http://localhost:8000/docs>.

---

## 🎬 Utilisation

1. **Importe** une vidéo (glisser-déposer). Idéal : 5 à 20 s. Elle est convertie en « proxy »
   H.264 à cadence fixe (lisible partout, index de frame identique côté navigateur et Python).
2. **Navigue** jusqu'à une image où l'objet est bien visible (`←`/`→` image par image, `Espace`).
3. **Clique** sur l'objet : le masque arc-en-ciel et les « fourmis » apparaissent.
   `Shift`+clic ou clic droit = exclure une zone. Ajoute des clics pour affiner.
4. Choisis le **mode** : 🦄 Remplacer · 🎨 Recolorer · 🧽 Effacer, et écris ta requête
   (ex. *« une licorne en peluche dorée »*). Optionnel : importe ton propre élément (PNG).
5. Choisis la qualité : ⚡ Rapide (720p) · ⚖️ Équilibré (1280p) · 💎 **Perfect Conditions**
   (pleine résolution, plus de candidats temporels, ProPainter si installé).
6. **✨ TRANSFORMER ✨** → confettis → comparateur **avant/après** + galerie.

### 📁 Ce qui est sauvegardé

Chaque rendu crée `elements/YOUR DAIL CLIPS/<date>_<prompt>_<id>/` :

| Fichier | Contenu |
|---|---|
| `final.mp4` | la vidéo modifiée (H.264 haute qualité + **son d'origine**) |
| `source.mp4` | la vidéo d'origine (proxy) pour la comparaison |
| `mask_track.mp4` | visualisation du suivi de l'objet |
| `clean_plate.mp4` | le décor sans l'objet (utile en post-prod) |
| `element.png` | l'élément incrusté, détouré (RGBA) |
| `preview.jpg` | vignette |
| `recipe.json` | prompt, réglages, moteurs utilisés, seed, temps de calcul |

---

## 🧠 Comment ça marche

```
proxy.mp4 + clic
   │
   ├─ 1. Segmentation au clic ─────────── SAM2 image predictor  (repli : GrabCut guidé)
   ├─ 2. Suivi du masque ──────────────── SAM2 video predictor, avant + arrière (repli : KLT + GrabCut)
   ├─ 3. Mouvements
   │      • objet  : similarité keyframe→t (KLT + RANSAC), correction de dérive, lissage gaussien
   │      • caméra : homographies frame→keyframe estimées sur le décor seulement
   ├─ 4. Effacement (objet + ombre portée détectée par invariance de chromaticité)
   │      • ProPainter (optionnel, sous-processus, env séparé)
   │      • sinon : chaque pixel caché est pris dans les autres frames où il est visible,
   │        recalé par homographie, exposition compensée, « le plus proche dans le temps »
   │        validé par une médiane robuste ; le décor JAMAIS visible est peint une seule fois
   │        par LaMa sur la keyframe puis propagé par la caméra → zéro scintillement
   ├─ 5. Nouvel élément (sur la keyframe nettoyée)
   │      • SDXL inpainting recadré autour de l'objet (résolution native du modèle),
   │        prompt enrichi « photoréaliste / lumière de la scène », seed reproductible
   │      • détourage SAM2 (ou matte par différence) + alpha affiné par filtre guidé
   │      • ou image importée : détourage auto, placement au sol, harmonisation couleurs
   └─ 6. Compositing frame par frame
          • warp de l'élément selon le mouvement de l'objet (option déformable : flux DIS)
          • OMBRE : la vraie ombre d'origine est mesurée (frame / décor nettoyé → forme, douceur,
            couleur exactes) puis re-ciblée à la taille du nouvel élément ; sinon ombre de contact
          • LUMIÈRE : gain spatial = illumination locale(t) / illumination(keyframe) + dérive
            de balance des blancs
          • OCCLUSIONS : ce qui cache l'objet d'origine cache aussi le nouvel élément
          • CAMÉRA : flou de bougé directionnel (obturateur 180°), grain mesuré sur la vidéo,
            netteté appariée, light wrap sur les bords, prémultiplication alpha (pas de liseré)
```

### Moteurs et replis

Tout fonctionne même sans GPU ni modèle : l'app choisit automatiquement le meilleur moteur
disponible (les badges en haut de l'interface indiquent ce qui est actif).

| Étape | Moteur IA | Repli sans IA |
|---|---|---|
| Segmentation | SAM2.1 (`facebook/sam2.1-hiera-base-plus`) | GrabCut initialisé par flood-fill |
| Suivi | SAM2 video predictor | KLT + raffinement GrabCut |
| Effacement | ProPainter · temporel + **LaMa** | temporel + Telea multi-échelle |
| Génération | SDXL inpainting (diffusers, MPS fp16) | bascule en « Recolorer » (ou image importée) |

### Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `CLIPS_DIR` | `elements/YOUR DAIL CLIPS` | dossier de sortie |
| `MAX_PROCESS_SIDE` | `1920` | résolution max de travail |
| `MAX_SECONDS` | `60` | durée max importée |
| `DEVICE` | `auto` | `mps`, `cuda` ou `cpu` |
| `SAM2_MODEL` | `facebook/sam2.1-hiera-base-plus` | `…-large` = meilleur, plus lent |
| `INPAINT_MODEL` | `diffusers/stable-diffusion-xl-1.0-inpainting-0.1` | `stable-diffusion-v1-5/stable-diffusion-inpainting` = plus léger (8 Go de RAM) |
| `PROPAINTER_DIR` / `PROPAINTER_PYTHON` | — | active ProPainter (rempli par `--with-propainter`) |
| `DISABLE_AI` | `0` | force les moteurs classiques |

---

## ⏱️ Performances & conseils (Mac M-series)

- Commence en **⚡ Rapide** pour valider le suivi, puis relance en **💎 Perfect Conditions**.
- Les clips **courts** (5–15 s) donnent les meilleurs résultats ; tout est en memmap disque, donc
  pas d'explosion de RAM, mais le temps de calcul est proportionnel au nombre d'images.
- Choisis comme keyframe une image où l'objet est **entier, net et bien éclairé** : c'est là
  que l'élément est généré.
- **Silhouette d'origine** (défaut) : l'élément reprend l'emprise de l'objet → suivi, ombre et
  occlusions parfaitement cohérents. **Forme libre** : plus de créativité, moins de garanties.
- **Suivi rigide** pour les objets solides (voiture, tasse, panneau) ; **déformable** pour ce qui
  se plie un peu (tissu, peluche). Pour un personnage qui marche, l'élément suit la silhouette
  mais n'est pas ré-animé image par image (voir limites).
- Premier lancement : les modèles se téléchargent (SDXL ≈ 7 Go) — ou `./setup_mac.sh --prefetch`.

## 🩹 Dépannage

| Problème | Solution |
|---|---|
| `NotImplementedError … MPS` | déjà géré par `PYTORCH_ENABLE_MPS_FALLBACK=1` (dans `start.sh`) ; sinon `DEVICE=cpu` |
| Images noires avec SDXL sur MPS | mets à jour torch/diffusers, ou `INPAINT_MODEL=stable-diffusion-v1-5/stable-diffusion-inpainting` |
| Mémoire saturée | preset ⚡/⚖️, `MAX_PROCESS_SIDE=1280`, ferme les autres apps, ou SD 1.5 |
| Installation SAM2 échoue | `pip install --upgrade torch` puis relance la commande SAM2 avec `SAM2_BUILD_CUDA=0 --no-build-isolation` |
| La vidéo ne se lit pas dans le navigateur | elle est ré-encodée en H.264 à l'import ; vérifie `ffmpeg -version` (sinon `imageio-ffmpeg` sert de repli) |
| Contours « fantômes » de l'objet d'origine | augmente la **marge du masque** (réglages avancés) ou ajoute un clic « inclure » sur la partie oubliée |
| Ombre d'origine pas effacée | ajoute un clic « inclure » dessus, ou choisis « Garder l'ombre d'origine » |
| Port déjà utilisé | `PORT=8010 ./start.sh` |

## ⚠️ Limites connues (honnêteté licorne)

- La génération est faite **sur une image clé** puis animée par le suivi (rigide ou déformable) :
  c'est ce qui garantit l'absence de scintillement, mais un élément qui devrait **changer de
  forme** (jambes qui marchent, visage qui parle) ne sera pas ré-animé. Pour cela il faudrait un
  modèle vidéo-génératif (VACE, Wan-Fun…), trop lourd pour un Mac aujourd'hui.
- Les ombres sont re-ciblées depuis l'ombre d'origine ; un éclairage très complexe (multiples
  sources, reflets sur l'eau) reste approximatif.
- ProPainter sur Mac est lent et encore expérimental en MPS : il est désactivé par défaut et
  n'est utilisé qu'en 💎 Perfect Conditions s'il est installé.

## 🧪 Tests

```bash
./start.sh test         # ou : cd backend && python -m pytest -q
```

Les tests génèrent une scène synthétique (décor texturé + caméra en panoramique + disque rouge
mobile avec ombre portée) et vérifient : précision du détourage, du suivi, du mouvement
objet/caméra, détection d'ombre, reconstruction du décor (erreur moyenne < 12/255), recoloration,
incrustation d'un élément au bon endroit à chaque image, et l'API de bout en bout
(import → clic → rendu → galerie `YOUR DAIL CLIPS`).

## 🔌 API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/health` | moteurs disponibles, dossier de sortie |
| `POST` | `/api/videos` | import (multipart) → proxy + métadonnées |
| `POST` | `/api/segment` | `{video_id, frame_index, points:[{x,y,label}]}` (coordonnées normalisées) → masque |
| `POST` | `/api/elements` | import d'une image d'élément |
| `POST` | `/api/replace` | `{video_id, mask_id, mode, prompt, options…}` → `job_id` |
| `GET` | `/api/jobs/{id}` | progression / résultat |
| `GET` | `/api/gallery` · `DELETE /api/gallery/{id}` | galerie YOUR DAIL CLIPS |

---

*Fait avec 💖, OpenCV, SAM2, diffusers et beaucoup de poudre de licorne.* 🦄🌈
