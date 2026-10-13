# Plan : utiliser le studio sur iPhone

Deux voies. La première marche tout de suite ; la seconde donne une vraie app sur l'écran d'accueil, utilisable hors ligne.

## Voie 1 · tout de suite : le lien claude.ai

Lien privé : https://claude.ai/artifact/LTF4zdyAYQtXrqoCDiBjaZ

1. Sur l'iPhone, ouvre le lien dans Safari (connecté à ton compte Claude) ou dans l'app Claude.
2. Dans Safari : Partager → « Sur l'écran d'accueil ».

- **Avantage** : même planning sur le téléphone et l'ordinateur, synchronisé par ton compte Claude.
- **Limites** : il faut une connexion internet et être connecté à Claude ; les vidéos s'ouvrent dans YouTube ; l'app s'affiche dans le cadre de claude.ai.

## Voie 2 · recommandée : app installée (GitHub Pages)

Le dépôt est public, donc GitHub Pages est gratuit. Le studio est en HTML/CSS/JS simple : il n'y a rien à compiler.

| Étape | Qui | Durée | Ce qui se passe |
|---|---|---|---|
| 1. Mettre le studio sur `main` | Claude ouvre la pull request, tu la fusionnes | 2 min | Le dossier `ORGANISATION/ELOUAN LAINE` arrive sur la branche principale. |
| 2. Rendre le studio installable | Claude | ~20 min | Fichier manifeste, icône « EL » pour l'écran d'accueil, ouverture en plein écran, cache hors ligne (service worker), fichier `.nojekyll`. |
| 3. Activer GitHub Pages | Toi | 1 min | Sur GitHub : Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save. |
| 4. Installer sur l'iPhone | Toi | 1 min | Safari → `https://elouanlainepro-jpg.github.io/CODING-THINGS-HELP/ORGANISATION/ELOUAN%20LAINE/` → Partager → « Sur l'écran d'accueil ». |
| 5. Vérifier | Toi | 5 min | Voir la liste ci-dessous. |

Ce que tu obtiens : une icône sur l'écran d'accueil, le studio en plein écran sans la barre Safari, l'utilisation sans réseau (sauf vidéos et liens musique), les vidéos YouTube lues dans la page.

**À savoir :**
- **Tes données restent sur le téléphone**, pas dans le dépôt. Pour les copier vers l'ordinateur : Réglages → Données & partage → *Code de transfert*.
- **Sauvegarde** : exporte un fichier JSON une fois par semaine (Réglages → Sauvegarde) et range-le dans Fichiers ou iCloud.
- **Effacement Safari** : Safari peut effacer les données d'un site non visité depuis 7 jours. Une app ajoutée à l'écran d'accueil a son propre compteur : si tu l'ouvres régulièrement, tes données restent. La sauvegarde JSON reste ta sécurité.
- **Ce qui est public** : le dépôt est public, donc le code l'est aussi, y compris l'exemple de la semaine 42 et le profil par défaut (nom, date de naissance, taille, poids). Ce que tu saisis ensuite dans l'app n'est pas publié.

## Vérifications sur le téléphone (étape 5)

- [ ] L'icône « EL » apparaît et l'app s'ouvre en plein écran.
- [ ] La vue Jour s'affiche, le bandeau des jours reste visible en faisant défiler.
- [ ] Toucher une matière puis un créneau la place ; un appui long sur un bloc permet de le déplacer.
- [ ] Mode avion : l'app s'ouvre toujours et garde ton planning.
- [ ] Import `.ics` : sur ADE dans Safari, *Exporter l'agenda*, enregistre le fichier dans Fichiers, puis Emploi du temps → *Choisir un fichier .ics*.
- [ ] Le poids modifié en haut reste après avoir fermé puis rouvert l'app.

## Pour aller plus loin (optionnel)

- **Rappels** : ajouter une alerte 10 min avant chaque cours et chaque entraînement dans l'export `.ics`. Tu importes ensuite le fichier dans l'app Calendrier de l'iPhone, qui t'envoie les notifications.
- **Adresse plus courte** : une page à la racine qui redirige vers le studio (`…github.io/CODING-THINGS-HELP/`).
- **Synchronisation automatique** sans claude.ai entre téléphone et ordinateur : demande un service de stockage, à étudier si le code de transfert ne suffit pas.
