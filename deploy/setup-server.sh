#!/bin/bash
# Einmalig auf dem Server ausführen (als root)
set -e

echo "==> .NET 8 installieren..."
wget -q https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb
dpkg -i /tmp/packages-microsoft-prod.deb
apt-get update -q
apt-get install -y aspnetcore-runtime-8.0

echo "==> nginx + certbot installieren..."
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> App-User und Verzeichnisse anlegen..."
useradd -r -s /bin/false bandkalender 2>/dev/null || true
mkdir -p /opt/bandkalender/wwwroot/uploads/songs
chown -R bandkalender:bandkalender /opt/bandkalender

echo "==> systemd-Service einrichten..."
cp /tmp/bandkalender.service /etc/systemd/system/bandkalender.service
systemctl daemon-reload
systemctl enable bandkalender

echo "==> nginx konfigurieren..."
cp /tmp/nginx-bandkalender.conf /etc/nginx/sites-available/bandkalender
ln -sf /etc/nginx/sites-available/bandkalender /etc/nginx/sites-enabled/bandkalender
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "==> Setup fertig!"
echo "    Jetzt deploy.sh lokal ausführen, dann SSL einrichten:"
echo "    certbot --nginx -d DEINE-DOMAIN"
