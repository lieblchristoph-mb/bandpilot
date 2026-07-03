#!/bin/bash
# Lokal auf dem Mac ausführen um die App zu bauen und hochzuladen
set -e

SERVER="root@167.233.99.119"
APP_DIR="/opt/bandkalender"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> App bauen..."
cd "$PROJECT_DIR"
rm -rf "$PROJECT_DIR/publish"
dotnet publish -c Release -r linux-x64 --self-contained true -o "$PROJECT_DIR/publish" -p:PublishSingleFile=false

echo "==> Cache-Busting einbauen..."
BUILD=$(date +%Y%m%d%H%M%S)
# Quelldateien frisch kopieren damit __BUILD__ sicher vorhanden ist
for f in "$PROJECT_DIR/wwwroot/"*.html; do
  cp "$f" "$PROJECT_DIR/publish/wwwroot/$(basename "$f")"
done
cp "$PROJECT_DIR/wwwroot/sw.js" "$PROJECT_DIR/publish/wwwroot/sw.js"
for f in "$PROJECT_DIR/publish/wwwroot/"*.html "$PROJECT_DIR/publish/wwwroot/sw.js"; do
  sed -i '' "s/__BUILD__/$BUILD/g" "$f"
done
echo "$BUILD" > "$PROJECT_DIR/publish/wwwroot/version.txt"

echo "==> Hochladen (DB und Uploads bleiben erhalten)..."
rsync -avz --progress \
  --exclude 'bandkalender.db' \
  --exclude 'uploads/' \
  --exclude 'publish/' \
  "$PROJECT_DIR/publish/" \
  "$SERVER:$APP_DIR/"

echo "==> Service neustarten..."
ssh "$SERVER" "
chown -R bandkalender:bandkalender $APP_DIR
# sw.js darf nie gecacht werden
grep -q 'location = /sw.js' /etc/nginx/sites-enabled/bandkalender || sed -i 's|location ~\* \\\.html\$ {|location = /sw.js {\n        add_header Cache-Control \"no-store, no-cache, must-revalidate\";\n        add_header Pragma \"no-cache\";\n        try_files \$uri =404;\n    }\n\n    location ~* \.html\$ {|' /etc/nginx/sites-enabled/bandkalender
nginx -t && systemctl reload nginx
systemctl restart bandkalender && systemctl status bandkalender --no-pager
"

echo ""
echo "==> Fertig! App läuft auf dem Server."
