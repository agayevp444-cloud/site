#!/usr/bin/env bash
# AI Production Office - macOS launcher: installs dependencies on first run, then starts backend + frontend.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# macOS-un öz Python-u (3.9) köhnədir; ən yeni uyğun versiyanı seçirik.
PY=""
for c in python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.12 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
[ -n "$PY" ] || { echo "Python 3.10+ lazımdır: brew install python@3.12"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ lazımdır: brew install node"; exit 1; }

# --- backend
# Köhnə Python ilə yaradılmış mühit varsa, onu yenidən qururuq.
if [ -d backend/.venv ] && ! backend/.venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
  rm -rf backend/.venv
fi
if [ ! -d backend/.venv ]; then
  echo "▶ Python virtual mühiti yaradılır ($("$PY" --version))..."
  "$PY" -m venv backend/.venv
fi
backend/.venv/bin/pip install -q -r backend/requirements.txt
[ -f backend/.env ] || cp backend/.env.example backend/.env

# API açarı yoxdursa, onu ekranda göstərmədən soruşub .env faylına yazırıq.
if ! grep -qE '^ANTHROPIC_API_KEY=.+' backend/.env; then
  echo ""
  echo "🔑 Anthropic API açarınızı yapışdırın (https://console.anthropic.com → API Keys)."
  echo "   Yazdığınız simvollar ekranda görünməyəcək. Sonra Enter basın:"
  read -rs KEY
  echo ""
  KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
  if [ -z "$KEY" ]; then
    echo "Açar daxil edilmədi. Yenidən ./start.sh işə salın."; exit 1
  fi
  grep -vE '^ANTHROPIC_API_KEY=' backend/.env > backend/.env.tmp || true
  { echo "ANTHROPIC_API_KEY=$KEY"; cat backend/.env.tmp; } > backend/.env
  rm -f backend/.env.tmp
  chmod 600 backend/.env
  unset KEY
  echo "✓ Açar backend/.env faylına yazıldı."
fi

# --- frontend
if [ ! -d frontend/node_modules ]; then
  echo "▶ Frontend paketləri quraşdırılır..."
  (cd frontend && npm install --no-audit --no-fund)
fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "▶ Backend: http://localhost:8000"
(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) &

if [ "${1:-}" = "--prod" ]; then
  (cd frontend && npm run build && npm run start) &
else
  (cd frontend && npm run dev) &
fi

sleep 4
echo "▶ Ofis: http://localhost:3000"
command -v open >/dev/null && open "http://localhost:3000" || true
wait
