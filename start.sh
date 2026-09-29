#!/usr/bin/env bash
# 🦄 Lance LICORN·IA SWAP 3000
#   ./start.sh         mode dev : API (8000) + interface Vite (5173, ouverte automatiquement)
#   ./start.sh prod    build de l'interface puis tout servi par FastAPI sur http://localhost:8000
#   ./start.sh api     API seule
#   ./start.sh test    tests backend (pytest)
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Active l'environnement Python isolé (venv ou conda)
if [[ -n "${LICORNIA_CONDA_ENV:-}" ]] && command -v conda >/dev/null 2>&1; then
  eval "$(conda shell.bash hook)"
  conda activate "$LICORNIA_CONDA_ENV"
elif [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
else
  echo "⚠ Aucun environnement trouvé : lance d'abord ./setup_mac.sh" >&2
  exit 1
fi

export PYTORCH_ENABLE_MPS_FALLBACK=1 # opérateurs non supportés par Metal -> CPU au lieu de planter
export TOKENIZERS_PARALLELISM=false
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

case "${1:-dev}" in
  prod)
    (cd frontend && npm run build)
    echo "🦄 http://localhost:${PORT}"
    cd backend && exec uvicorn app.main:app --host "$HOST" --port "$PORT"
    ;;
  api)
    cd backend && exec uvicorn app.main:app --host "$HOST" --port "$PORT"
    ;;
  test)
    cd backend && exec python -m pytest -q
    ;;
  dev)
    (cd backend && uvicorn app.main:app --host "$HOST" --port "$PORT") &
    API_PID=$!
    (cd frontend && BACKEND_URL="http://${HOST}:${PORT}" npm run dev -- --open) &
    UI_PID=$!
    trap 'kill $API_PID $UI_PID 2>/dev/null || true' EXIT INT TERM
    echo "🦄 Interface : http://localhost:5173  (API : http://${HOST}:${PORT}/docs)"
    wait
    ;;
  *)
    sed -n '2,6p' "$0"
    exit 1
    ;;
esac
