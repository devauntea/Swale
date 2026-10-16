#!/bin/bash
# Swale on one Amazon Linux 2023 instance: FastAPI + embedded SurrealDB behind nginx, frontend served as static files.
# Runs as EC2 user data (root). Secrets are not in this file: write /opt/swale/backend/.env separately, then restart swale.
set -euxo pipefail
exec > >(tee -a /var/log/swale-bootstrap.log) 2>&1

REPO="${SWALE_REPO:-https://github.com/devauntea/Swale.git}"
BRANCH="${SWALE_BRANCH:-main}"
APP=/opt/swale

dnf install -y git nginx tar xz
id swale || useradd --system --create-home --home-dir /home/swale swale

# Node 22 (the frontend needs >= 22.12) from nodejs.org.
NODE_FILE=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '/linux-x64.tar.xz$/ {print $2}')
curl -fsSL "https://nodejs.org/dist/latest-v22.x/${NODE_FILE}" | tar -xJ -C /usr/local --strip-components=1

# uv (installs Python 3.12 for the backend).
curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

rm -rf "$APP" && git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
chown -R swale:swale "$APP"

sudo -u swale bash -lc "cd $APP/frontend && npm ci --no-audit --no-fund && npm run build"
sudo -u swale bash -lc "cd $APP/backend && uv sync --frozen && uv run swale ingest --from-snapshot sample_data/bk0601"

SRC="${SWALE_DEPLOY_DIR:-$APP/deploy/aws}"
cp "$SRC/swale.service" /etc/systemd/system/swale.service
cp "$SRC/nginx.conf" /etc/nginx/conf.d/swale.conf
# A minimal main config: the stock one has its own port-80 server that would compete with ours.
cat > /etc/nginx/nginx.conf <<'NGINX'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;
include /usr/share/nginx/modules/*.conf;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    access_log /var/log/nginx/access.log;
    sendfile on;
    gzip on;
    gzip_types application/json application/geo+json application/javascript text/css image/svg+xml;
    include /etc/nginx/conf.d/*.conf;
}
NGINX
nginx -t
touch "$APP/backend/.env" && chown swale:swale "$APP/backend/.env" && chmod 600 "$APP/backend/.env"
systemctl daemon-reload
systemctl enable --now swale nginx
echo "swale bootstrap done"
