# BandKalender

Ein einfacher Verfügbarkeits-Kalender für Bands. Jedes Mitglied trägt pro Tag
ein, ob es **frei**, **vielleicht** oder **keine Zeit** hat. Tage, an denen
**alle frei** sind, werden automatisch als „perfekter Termin" markiert.

- **Backend:** ASP.NET Core 8 (Minimal API)
- **Datenbank:** SQLite (eine einzige Datei `bandkalender.db`, keine Einrichtung nötig)
- **Frontend:** statisches HTML/CSS/JS (wird von der App mit ausgeliefert)

---

## 1. Lokal testen

Voraussetzung: **.NET 8 SDK** (https://dotnet.microsoft.com/download/dotnet/8.0)

```bash
cd BandKalender
dotnet run
```

Dann im Browser öffnen: die in der Konsole angezeigte Adresse, z. B.
`http://localhost:5000`.

Beim ersten Start wird die Datenbankdatei automatisch angelegt. Mitglieder fügst
du oben rechts über **„+ Mitglied"** hinzu.

### Optional: Band-Passwort

Damit nicht jeder Fremde Einträge ändern kann, kannst du in `appsettings.json`
ein gemeinsames Passwort setzen:

```json
"Band": {
  "Password": "unserGeheimesBandPasswort"
}
```

Ist das Feld leer, läuft die App ohne Passwort. Mit Passwort fragt die Seite
beim ersten Besuch danach und merkt es sich im Browser.

---

## 2. Auf Hostinger deployen (VPS)

**Wichtig:** .NET läuft **nicht** auf dem normalen Webhosting von Hostinger
(das ist nur PHP/MySQL). Du brauchst einen **Hostinger VPS**. Hostinger bietet
dafür eine fertige Vorlage „Ubuntu 22.04 mit ASP.NET" an.

### a) VPS einrichten
1. Hostinger VPS bestellen.
2. Beim Betriebssystem die Vorlage **Ubuntu 22.04 + ASP.NET** wählen (installiert
   die .NET-Runtime und Nginx vor). Alternativ ein normales Ubuntu und .NET 8
   manuell installieren.
3. Per SSH verbinden: `ssh root@DEINE-SERVER-IP`

### b) App veröffentlichen (auf deinem PC)
```bash
cd BandKalender
dotnet publish -c Release -o publish
```
Den Inhalt des Ordners `publish/` auf den Server kopieren, z. B.:
```bash
scp -r publish/* root@DEINE-SERVER-IP:/var/www/bandkalender/
```

### c) Als Dienst laufen lassen (systemd)
Datei `/etc/systemd/system/bandkalender.service` anlegen:
```ini
[Unit]
Description=BandKalender
After=network.target

[Service]
WorkingDirectory=/var/www/bandkalender
ExecStart=/usr/bin/dotnet /var/www/bandkalender/BandKalender.dll
Restart=always
Environment=ASPNETCORE_URLS=http://localhost:5000
Environment=ASPNETCORE_ENVIRONMENT=Production

[Install]
WantedBy=multi-user.target
```
Starten:
```bash
systemctl daemon-reload
systemctl enable --now bandkalender
```

### d) Nginx als Reverse Proxy
In den Nginx-Server-Block (z. B. `/etc/nginx/sites-available/default`):
```nginx
location / {
    proxy_pass         http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```
Danach: `systemctl restart nginx`

### e) HTTPS (kostenlos, empfohlen)
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d deine-domain.de
```

Fertig – die App ist dann unter deiner Domain erreichbar. Die Datei
`bandkalender.db` im WorkingDirectory enthält alle Daten; einfach regelmäßig
sichern.

---

## Bedienung

- Oben **„Ich bin"** auswählen, wer du bist (oder Mitglied anlegen).
- Auf einen Tag tippen schaltet deinen Status weiter:
  leer → **frei** → **vielleicht** → **keine Zeit** → leer.
- Farbige Kästchen zeigen den Status jedes Mitglieds; dein eigener ist umrandet.
- Tage, an denen **alle frei** sind, leuchten auf und werden oben als perfekter
  Termin angezeigt.
# bandpilot
