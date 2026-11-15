#!/usr/bin/env bash
# Deploys (or updates) the FloodGuard API on the server. Run as root after setup.sh:
#   bash deploy.sh                      # deploys branch main
#   bash deploy.sh feat/backend-api     # deploys another branch
# Idempotent: clones on first run, then fast-forwards to the branch tip.
set -euo pipefail

BRANCH=${1:-main}
REPO=https://github.com/Dave-tab/floodguard.git
APP_USER=floodguard
APP_DIR=/opt/floodguard/app
ENV_FILE=/etc/floodguard/backend.env
PORT=$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
PORT=${PORT:-8080}

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

echo "==> Code: $REPO ($BRANCH)"
if [ ! -d "$APP_DIR/.git" ]; then
  as_app git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  as_app git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  as_app git -C "$APP_DIR" reset --hard FETCH_HEAD
fi
as_app git -C "$APP_DIR" log -1 --format='    commit %h %s'

echo "==> Dependencies"
cd "$APP_DIR/backend"
as_app npm ci --omit=dev --no-audit --no-fund
# The risk engine has no runtime dependencies; tsx (in backend) runs its TypeScript directly.

echo "==> Configuration check"
for v in SUPABASE_URL SUPABASE_SECRET_KEY; do
  if ! grep -qE "^$v=.+" "$ENV_FILE"; then
    echo "!! $v is empty in $ENV_FILE. Fill it in (nano $ENV_FILE), then run: systemctl restart floodguard-api"
    exit 1
  fi
done

echo "==> Restart"
systemctl restart floodguard-api
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:$PORT/health"; echo
    echo "==> Deployed. Logs: journalctl -u floodguard-api -f"
    exit 0
  fi
  sleep 1
done
echo "!! The API did not answer on port $PORT. Last log lines:"
journalctl -u floodguard-api -n 30 --no-pager
exit 1
