---
name: description
description: Écrit titre, description et hashtags YouTube Shorts + TikTok pour une vidéo de sortie/. Utiliser pour "/description" ou après la fabrication d'un meme.
argument-hint: "[fichier dans sortie/]"
---

Prépare le texte de publication d'une vidéo de MEME PRODUCTION.

1. Cible : `$ARGUMENTS` si donné, sinon la vidéo la plus récente de `sortie/`. Regarde une image de la vidéo (extrait avec ffmpeg)
   et relis le texte de la bande pour bien comprendre le meme. Si un `.txt` du même nom existe déjà, ne l'écrase pas sans le dire.
2. Écris, dans la langue du meme (anglais par défaut), ton « humour d'internet » du `CLAUDE.md` :
   - **YouTube Shorts** : titre ≤ 60 caractères (accrocheur, sans clickbait mensonger, finir par `#shorts` n'est pas obligatoire),
     description 1–2 lignes, 3 à 5 hashtags (dont `#shorts`).
   - **TikTok** : légende courte ≤ 150 caractères + 4 à 6 hashtags (mix large + niche).
   - **Texte d'accroche** optionnel (commentaire épinglé) pour relancer l'engagement.
3. Pas de mention trompeuse, pas de nom de créateur tiers sans raison, pas de hashtags sans rapport.
4. Enregistre dans `sortie/<même-nom>.txt` et affiche-le aussi dans ta réponse, prêt à copier-coller.
