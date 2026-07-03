#!/bin/bash
# Erstes Deployment: Configs + App hochladen, dann Server-Setup starten
set -e

SERVER="root@167.233.99.119"
APP_DIR="/opt/bandkalender"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> App bauen..."
cd "$PROJECT_DIR"
dotnet publish -c Release -r linux-x64 --self-contained true -o "$PROJECT_DIR/publish" -p:PublishSingleFile=false

echo "==> Config-Dateien hochladen..."
scp "$PROJECT_DIR/deploy/bandkalender.service" "$SERVER:/tmp/bandkalender.service"
scp "$PROJECT_DIR/deploy/nginx-bandkalender.conf" "$SERVER:/tmp/nginx-bandkalender.conf"
scp "$PROJECT_DIR/deploy/setup-server.sh" "$SERVER:/tmp/setup-server.sh"

echo "==> App-Dateien hochladen..."
ssh "$SERVER" "mkdir -p $APP_DIR"
rsync -avz --progress "$PROJECT_DIR/publish/" "$SERVER:$APP_DIR/"

echo "==> Server-Setup starten..."
ssh "$SERVER" "bash /tmp/setup-server.sh"

echo ""
echo "==> Fertig! Jetzt SSL einrichten:"
echo "    ssh $SERVER"
echo "    certbot --nginx -d DEINE-DOMAIN"
