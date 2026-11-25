#!/usr/bin/env bash
# AI Production Office - macOS launcher: installs dependencies on first run, then starts backend + frontend.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

command -v python3 >/dev/null || { echo "Python 3.10+ lazımdır: brew install python@3.12"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20+ lazımdır: brew install node"; exit 1; }

# --- backend
if [ ! -d backend/.venv ]; then
  echo "▶ Python virtual mühiti yaradılır..."
  python3 -m venv backend/.venv
fi
backend/.venv/bin/pip install -q -r backend/requirements.txt
[ -f backend/.env ] || { cp backend/.env.example backend/.env; echo "⚠ backend/.env yaradıldı - ANTHROPIC_API_KEY daxil edin."; }

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
