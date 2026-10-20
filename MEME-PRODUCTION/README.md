# MEME PRODUCTION

Ton studio de memes vidéo (format 9:16, bande blanche + clips A/B) piloté par Claude Code.

## 1. Installer (une seule fois)

**Windows** (PowerShell) :
```powershell
winget install Python.Python.3.12
winget install Gyan.FFmpeg
pip install pillow faster-whisper
```
**Mac** : `brew install python ffmpeg` puis `pip3 install pillow faster-whisper`.

Puis, dans le dossier du studio :
```bash
python scripts/setup_check.py     # doit afficher [OK] partout
```
(`faster-whisper` ne sert qu'aux sous-titres ; il peut attendre.)

Les polices Inter, Montserrat, Anton et Bebas Neue sont déjà dans `fonts/`.
Pour changer la police de la bande : modifie `band.font` dans `config.json`
(ex. `"fonts/Montserrat-Variable.ttf"` avec `"font_weight": 700`, ou `"fonts/Anton-Regular.ttf"` avec `"uppercase": true`).

## 2. Utiliser avec Claude Code

```bash
cd MEME-PRODUCTION
claude
```
Claude lit `CLAUDE.md` tout seul. Ensuite :

| Commande | Ce que ça fait |
|---|---|
| `/meme 1` | monte l'idée n°1 de `idees/` avec les clips de `inbox/` |
| `/meme inbox/a.mp4 bibliotheque/reactions/x.mp4 "POV: …"` | monte avec tes clips et ton texte |
| `/description` | titre + description + hashtags YouTube/TikTok |
| `/indexer` | décrit et tague ta bibliothèque de clips B |
| `/soustitres` | sous-titres automatiques (Whisper) |

Sans Claude, le montage marche aussi en ligne de commande :
```bash
python scripts/meme.py --text "POV: Me at 6 AM staring at absolutely nothing instead of getting ready" \
  --a inbox/clipA.mp4 --b bibliotheque/reactions/clipB.mp4
```
Options : `--a-start/--a-dur`, `--b-start/--b-dur`, `--c`, `--d`, `--music`, `--music-volume`, `--mute`, `--out`.
La vidéo arrive dans `sortie/`.

## 3. Dossiers

`inbox/` clips bruts · `bibliotheque/` clips B par thème · `templates/` logos, intro « Coffee Story », musiques ·
`idees/` idées du jour · `sortie/` vidéos finies · `scripts/` programmes de montage · `fonts/` polices.

Les vidéos que tu déposes dans `inbox/`, `bibliotheque/`, `sortie/` ne sont pas suivies par git (voir `.gitignore`).
