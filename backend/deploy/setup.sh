#!/usr/bin/env bash
# FloodGuard AI - one-time setup for the Vultr API server (Ubuntu 22.04 / 24.04).
#
# Installs Node.js 22, Nginx (reverse proxy to the TypeScript API on 127.0.0.1:8080),
# UFW firewall (SSH, HTTP, HTTPS), a locked-down service user, the systemd unit and an
# owner-only environment file. Safe to run again.
#
# Run as root:  bash setup.sh
set -euo pipefail

APP_USER=floodguard
APP_DIR=/opt/floodguard
ENV_FILE=/etc/floodguard/backend.env
PORT=8080

log() { printf '\n==> %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

log "System packages"
apt-get update -y
apt-get install -y nginx ufw git curl ca-certificates gnupg

log "Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
node -v

log "Service user and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$APP_DIR/cache"
install -d -m 0750 -o root -g "$APP_USER" /etc/floodguard

log "Environment file (secrets are typed in on the server, never committed)"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENV
PORT=$PORT
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_PUBLISHABLE_KEY=
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_MODEL=
OPEN_METEO_API_KEY=
CORS_ORIGINS=
ENABLE_SCHEDULER=true
CACHE_DIR=$APP_DIR/cache
ENV
fi
chown root:"$APP_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

log "systemd unit: floodguard-api"
cat > /etc/systemd/system/floodguard-api.service <<UNIT
[Unit]
Description=FloodGuard API (TypeScript)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/app/backend
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --import tsx src/server.ts
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/cache

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable floodguard-api >/dev/null

log "Nginx reverse proxy"
cat > /etc/nginx/sites-available/floodguard <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/floodguard /etc/nginx/sites-enabled/floodguard
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/dev/null
systemctl reload nginx

log "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable
ufw status

log "Done. Deploy the code with deploy.sh."
