#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_UVICORN="$ROOT_DIR/backend/.venv/bin/uvicorn"

if [ ! -x "$BACKEND_UVICORN" ]; then
  echo "Backendens virtuella miljö saknas: $BACKEND_UVICORN"
  echo "Skapa den med: python3 -m venv backend/.venv && backend/.venv/bin/python -m pip install -e backend"
  exit 1
fi

mkdir -p "$ROOT_DIR/data/noxer"

cleanup() {
  trap - INT TERM EXIT
  kill "$BACKEND_PID" "$WEB_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(
  cd "$ROOT_DIR"
  NOXER_DATA_DIR="$ROOT_DIR/data/noxer" \
  NOXER_WORKSPACE_GROUP_PREFIX="noxer-workspace-" \
  "$BACKEND_UVICORN" app.main:app --reload --app-dir "$ROOT_DIR/backend" --port 8001
) &
BACKEND_PID=$!

(
  cd "$ROOT_DIR"
  AGENT_API_URL="http://127.0.0.1:8001" \
  NOXER_LOCAL_DEV_USERNAME="${NOXER_LOCAL_DEV_USERNAME:-rik-local}" \
  NOXER_LOCAL_DEV_GROUP="${NOXER_LOCAL_DEV_GROUP:-noxer-workspace-local}" \
  npm run dev
) &
WEB_PID=$!

echo "Noxer kör lokalt: http://localhost:3000"
echo "Backend: http://127.0.0.1:8001/health"
echo "Avsluta båda med Ctrl+C."
wait "$BACKEND_PID" "$WEB_PID"
