---
name: indexer
description: Indexe la bibliothèque de clips B — regarde chaque clip et écrit des tags (saut, chute, réaction choquée, danse…) dans bibliotheque/index.json. Utiliser pour "/indexer" ou quand il faut retrouver un clip B pour une actu.
argument-hint: "[recherche optionnelle, ex. 'réaction choquée']"
---

1. Lance `python scripts/index_library.py` : il ajoute les nouveaux clips à `bibliotheque/index.json` (durée, résolution)
   et crée une planche-contact `bibliotheque/.vignettes/*.jpg` par clip.
2. Pour chaque entrée dont `tags` est vide (`python scripts/index_library.py --list`), **regarde la planche-contact** (outil Read sur l'image)
   et complète dans `index.json` :
   - `tags` : 4 à 8 mots-clés en français, minuscules, concrets (ex. `["réaction","choc","bouche ouverte","homme","film"]`) :
     ce qu'on voit (action, émotion, personnage, lieu) et le ton (drôle, dramatique, absurde).
   - `description` : une phrase factuelle de ce qui se passe.
   Ne devine pas le nom d'un film ou d'un acteur si tu n'es pas sûr : décris seulement l'image.
3. Si `$ARGUMENTS` contient une recherche : après indexation, classe les clips les plus pertinents (tags + description)
   et donne le top 3 avec chemin, durée et pourquoi ça colle.
4. Termine par un bilan : nombre de clips indexés, nombre de thèmes, clips ignorés (illisibles, filigrane d'un autre créateur visible → à signaler).
