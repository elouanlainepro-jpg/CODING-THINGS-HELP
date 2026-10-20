---
name: meme
description: Fabrique un meme vidéo vertical MEME PRODUCTION (bande blanche + clips A/B 1080x1920). Utiliser pour "/meme", "/meme 1", ou quand l'utilisateur donne des clips et un texte de meme.
argument-hint: "[numéro d'idée] ou [clipA clipB \"texte\"]"
---

Tu fabriques un meme fini dans le format défini dans `CLAUDE.md` et `config.json`.

## 1. Comprendre l'entrée (`$ARGUMENTS`)

- **Un numéro** (`/meme 1`) : ouvre le fichier le plus récent de `idees/` (`AAAA-MM-JJ.md`), prends l'idée portant ce numéro
  (texte du meme + description du clip A / clip B attendus). Si `idees/` est vide, dis-le et demande le texte.
- **Des chemins + un texte** : ex. `/meme inbox/a.mp4 bibliotheque/reactions/choc.mp4 "POV: ..."`.
- **Rien** : liste le contenu de `inbox/` et demande le texte du meme.

## 2. Trouver les clips

- Clip A : dans `inbox/` (par nom donné, sinon le plus récent / celui qui correspond à l'idée).
- Clip B : celui donné, sinon cherche dans `bibliotheque/index.json` le clip dont les `tags`/`description` collent à la chute.
  Si l'index est vide, lance d'abord `python scripts/index_library.py` et applique la procédure de `/indexer` sur les clips nécessaires.
  Aucun clip B convenable → dis-le, propose ce qu'il faudrait trouver, et ne fabrique pas à moitié.
- Vérifie avec `ffprobe` que les fichiers existent et regarde une image de chaque clip : refuse un clip avec filigrane d'un autre créateur.

## 3. Choisir le découpage

Regarde les durées. Vise 6–15 s au total. Par défaut A ≈ 3–6 s puis B ≈ 2–4 s. Utilise `--a-start/--a-dur/--b-start/--b-dur`
pour garder le meilleur moment. Texte : ≤ 80 caractères idéalement, style « POV: … », sans emoji.

## 4. Monter

```bash
python scripts/meme.py --text "…" --a <clipA> --b <clipB> [--a-start S --a-dur D --b-dur D] [--music templates/x.mp3] --out sortie/<slug>.mp4
```

Si `python`/`ffmpeg` manquent, lance `python scripts/setup_check.py` et explique quoi installer.

## 5. Vérifier

Extrais une image à 1 s et une à la moitié de la vidéo, regarde-les : texte lisible et non coupé, clip bien cadré, pas de bande noire parasite.
Corrige (`config.json`, découpage) et refais si besoin.

## 6. Finir

Donne : le chemin du fichier, la durée, le texte utilisé, les clips utilisés. Propose `/description` ensuite.
Ne publie rien.
