#!/usr/bin/env bash
set -eu

if [ "$(id -un)" != "server" ]; then
  echo "Detta skript ska köras som macOS-användaren server."
  echo "Exempel: ssh server@<mac-mini> 'cd /Users/server/server/stacks/noxer && npm run deploy:server'"
  exit 1
fi

DEPLOY_BRANCH="${NOXER_DEPLOY_BRANCH:-main}"
DEPLOY_PATH="${NOXER_DEPLOY_PATH:-/Users/server/server/stacks/noxer}"

cd "$DEPLOY_PATH"
git fetch origin
if git show-ref --verify --quiet "refs/heads/$DEPLOY_BRANCH"; then
  git switch "$DEPLOY_BRANCH"
else
  git switch --track -c "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
fi
git pull --ff-only origin "$DEPLOY_BRANCH"

chown -R 10001:10001 data
docker compose up -d --build
docker compose ps
docker compose logs --tail=100

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:8081/api/health; then
    echo
    exit 0
  fi
  if [ "$attempt" -lt 30 ]; then sleep 2; fi
done

echo "Noxer svarar inte på /api/health efter 60 sekunder." >&2
exit 1
