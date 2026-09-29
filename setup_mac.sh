#!/usr/bin/env bash
# =====================================================================================
#  🦄 LICORN·IA SWAP 3000 — installation macOS (Apple Silicon recommandé, Intel OK)
#
#  Usage :  ./setup_mac.sh [options]
#     --conda             environnement Conda "licornia" au lieu d'un venv .venv
#     --no-ai             socle seulement (pas de torch/SAM2/diffusion) : ~200 Mo
#     --with-propainter   installe aussi ProPainter (video inpainting SOTA) dans SON PROPRE
#                         environnement (third_party/ProPainter/.venv) -> zéro conflit
#     --prefetch          télécharge les modèles tout de suite (~8 Go) plutôt qu'au 1er usage
#
#  Tout est isolé : rien n'est installé dans le Python système ni dans tes autres projets.
# =====================================================================================
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

USE_CONDA=0
WITH_AI=1
WITH_PROPAINTER=0
PREFETCH=0
PY_VERSION="3.11"
CONDA_ENV="licornia"

for arg in "$@"; do
  case "$arg" in
    --conda) USE_CONDA=1 ;;
    --no-ai) WITH_AI=0 ;;
    --with-propainter) WITH_PROPAINTER=1 ;;
    --prefetch) PREFETCH=1 ;;
    -h | --help)
      sed -n '3,13p' "$0"
      exit 0
      ;;
    *)
      echo "Option inconnue : $arg (voir --help)"
      exit 1
      ;;
  esac
done

say() { printf '\n\033[1;35m🦄 %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m   ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m   ⚠ %s\033[0m\n' "$*"; }
die() {
  printf '\033[1;31m   ✖ %s\033[0m\n' "$*"
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || warn "Ce script vise macOS ; on continue quand même (Linux devrait marcher)."
if [[ "$(uname -m)" == "arm64" ]]; then ok "Apple Silicon détecté : accélération MPS (Metal) disponible"; else warn "Mac Intel : tout fonctionne, mais l'IA tournera sur CPU (lent)"; fi

# ------------------------------------------------------------------------------------
say "1/6 Outils système (Homebrew : ffmpeg, node, git)"
if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew est requis : installe-le via https://brew.sh puis relance ce script."
fi
for pkg in ffmpeg node git; do
  if command -v "$pkg" >/dev/null 2>&1; then ok "$pkg déjà présent"; else brew install "$pkg"; fi
done

# ------------------------------------------------------------------------------------
say "2/6 Environnement Python isolé"
if [[ $USE_CONDA -eq 1 ]]; then
  command -v conda >/dev/null 2>&1 || die "Conda introuvable (installe Miniforge : brew install --cask miniforge)"
  eval "$(conda shell.bash hook)"
  if ! conda env list | grep -qE "^${CONDA_ENV}\s"; then
    conda create -y -n "$CONDA_ENV" "python=${PY_VERSION}"
  fi
  conda activate "$CONDA_ENV"
  ok "Conda env « ${CONDA_ENV} » actif"
else
  if ! command -v "python${PY_VERSION}" >/dev/null 2>&1; then brew install "python@${PY_VERSION}"; fi
  PYBIN="$(command -v "python${PY_VERSION}" || echo "$(brew --prefix)/bin/python${PY_VERSION}")"
  [[ -d .venv ]] || "$PYBIN" -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  ok "venv .venv actif ($(python --version))"
fi
python -m pip install --upgrade pip wheel setuptools >/dev/null

# ------------------------------------------------------------------------------------
say "3/6 Dépendances Python (socle)"
pip install -r backend/requirements-dev.txt
ok "FastAPI + OpenCV + ffmpeg embarqué installés"

if [[ $WITH_AI -eq 1 ]]; then
  say "4/6 Dépendances IA (PyTorch MPS, diffusers, SAM2) — patience, c'est gros"
  pip install -r backend/requirements-ai.txt
  # SAM2 : pas de CUDA sur Mac, et pas d'isolation de build (sinon torch est retéléchargé)
  SAM2_BUILD_CUDA=0 pip install --no-build-isolation "git+https://github.com/facebookresearch/sam2.git"
  python - <<'PY'
import torch
print(f"   ✔ torch {torch.__version__} — MPS disponible : {torch.backends.mps.is_available()}")
import sam2, diffusers
print(f"   ✔ SAM2 OK — diffusers {diffusers.__version__}")
PY
else
  say "4/6 IA ignorée (--no-ai) : moteurs classiques OpenCV uniquement"
fi

# ------------------------------------------------------------------------------------
[[ -f .env ]] || cp .env.example .env
set_env() { # set_env KEY VALUE  -> remplace ou ajoute dans .env
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i '' "s|^${key}=.*|${key}=${value}|" .env 2>/dev/null || sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >>.env
  fi
}
if [[ $USE_CONDA -eq 1 ]]; then set_env LICORNIA_CONDA_ENV "$CONDA_ENV"; fi

if [[ $WITH_PROPAINTER -eq 1 ]]; then
  say "5/6 ProPainter (environnement séparé pour éviter tout conflit de versions)"
  mkdir -p third_party
  [[ -d third_party/ProPainter ]] || git clone --depth 1 https://github.com/sczhou/ProPainter.git third_party/ProPainter
  PPY="python${PY_VERSION}"
  command -v "$PPY" >/dev/null 2>&1 || PPY="python3"
  [[ -d third_party/ProPainter/.venv ]] || "$PPY" -m venv third_party/ProPainter/.venv
  third_party/ProPainter/.venv/bin/pip install --upgrade pip >/dev/null
  third_party/ProPainter/.venv/bin/pip install torch torchvision
  third_party/ProPainter/.venv/bin/pip install -r third_party/ProPainter/requirements.txt
  set_env PROPAINTER_DIR "$ROOT/third_party/ProPainter"
  set_env PROPAINTER_PYTHON "$ROOT/third_party/ProPainter/.venv/bin/python"
  ok "ProPainter prêt (ses poids se téléchargent au premier rendu « Perfect Conditions »)"
else
  say "5/6 ProPainter ignoré (optionnel : ./setup_mac.sh --with-propainter)"
fi

# ------------------------------------------------------------------------------------
say "6/6 Interface (React + Vite)"
(cd frontend && npm install --no-audit --no-fund)
ok "frontend prêt"

mkdir -p "elements/YOUR DAIL CLIPS"
ok "Dossier de sortie : elements/YOUR DAIL CLIPS"

if [[ $PREFETCH -eq 1 && $WITH_AI -eq 1 ]]; then
  say "Téléchargement anticipé des modèles"
  (cd backend && python -m app.prefetch)
fi

cat <<'EOF'

  ╔══════════════════════════════════════════════════════════╗
  ║  🌈  Installation terminée ! Much wow.                    ║
  ║                                                          ║
  ║  Lancer :   ./start.sh          (http://localhost:5173)  ║
  ║  Tests  :   ./start.sh test                              ║
  ╚══════════════════════════════════════════════════════════╝
EOF
