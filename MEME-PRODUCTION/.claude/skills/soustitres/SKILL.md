---
name: soustitres
description: Génère des sous-titres automatiques (Whisper local) pour une vidéo et peut les incruster. Utiliser pour "/soustitres" ou quand un clip parlé a besoin de sous-titres.
argument-hint: "[vidéo] [--burn] [--lang fr]"
---

1. Cible : `$ARGUMENTS` si donné, sinon la vidéo la plus récente de `sortie/`.
2. Lance `python scripts/subtitles.py <vidéo> [--lang fr|en] [--burn]` (modèle `base` par défaut ; `--model small` si la transcription est mauvaise).
   Si `faster-whisper` manque : `pip install faster-whisper`.
3. Relis le `.srt` produit, corrige les erreurs évidentes (noms propres, mots mal compris) puis, si `--burn` était demandé, relance l'incrustation.
4. Extrais une image pour vérifier que les sous-titres tombent dans la zone noire du bas, lisibles et non coupés.
5. Donne les chemins du `.srt` et de la vidéo sous-titrée (`*_sub.mp4`). Ne remplace jamais la vidéo d'origine.
