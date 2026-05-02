# Lokales Testen & Debugging (PAW)

Dieser Leitfaden hilft dir, das PAW-System lokal vollständig zu testen, bevor du es auf den Server deployst.

## 1. Automatisierte API-Tests (E2E)
Wir haben ein Skript vorbereitet, das reale HTTP-Aufrufe gegen das Backend macht und den gesamten Lebenszyklus eines Tieres (Erstellen, Taggen, Freigeben, Löschen) testet.

**Ausführung:**
```bash
cd server
node test-api.js
```
*Voraussetzung:* Der lokale Server muss parallel in einem anderen Terminal (`npm run dev`) laufen.

## 2. Swagger UI (Interaktives Testen)
Fastify generiert automatisch eine interaktive Dokumentation. Das ist die beste Methode, um Endpoints manuell zu debuggen.

**Zugriff:**
Öffne `http://localhost:3000/documentation` im Browser.

**Authentifizierung im Swagger:**
1. Registriere dich oder logge dich über die PWA (`http://localhost:5173/login`) ein.
2. Öffne die Entwicklertools (F12) -> Tab "Anwendung/Application" -> "Lokaler Speicher/Local Storage".
3. Kopiere den Wert des Schlüssels `token`.
4. Klicke im Swagger UI oben rechts auf den grünen Button **"Authorize"** und füge den Token ein.
5. Jetzt kannst du jeden Endpoint mit `Try it out` testen!

## 3. Datenbank Inspecting (SQLite)
Da wir SQLite nutzen, kannst du die Datenbank live auslesen und verändern, ohne den Server stoppen zu müssen.

Öffne im Terminal (im Ordner `server`):
```bash
sqlite3 paw.db
```

**Nützliche Debug-Befehle:**
- Zeige alle Nutzer und ihre Rollen: `SELECT email, role, verified FROM accounts;`
- Mache einen lokalen Nutzer zum Admin: `UPDATE accounts SET role='admin', verified=1 WHERE email='dein@test.com';`
- Zeige das Audit-Log der letzten Änderungen: `SELECT action, resource, created_at FROM audit_log ORDER BY created_at DESC LIMIT 5;`
- Beenden mit: `.quit`

## 4. WebSocket (Dokumenten-Upload & OCR) Debugging
Der Foto-Upload verwendet WebSockets. Um dies lokal tiefgehend zu debuggen:

1. Öffne die PWA in Chrome (`http://localhost:5173`).
2. Drücke F12 für die DevTools.
3. Wechsle auf den Tab **Network (Netzwerk)**.
4. Wähle im Filter `WS` (WebSocket) aus.
5. Starte in der App einen Foto-Upload.
6. Klicke in den DevTools auf die entstandene WebSocket-Verbindung (`ws?token=...`).
7. Im Unter-Tab **"Messages" (Nachrichten)** siehst du nun in Echtzeit den gesamten Datenaustausch:
   - Du siehst den initialen JSON-Startframe.
   - Du siehst die gesendeten Binärpakete (Bild-Chunks).
   - Du siehst den `upload_end` Text-Frame.
   - Du siehst live die Statusmeldungen (`Tesseract liest Text... 45%`) und das fertige JSON, die vom Server zurückkommen.

Sollte die OCR fehlschlagen, findest du im Server-Terminal (`npm run dev`) zudem immer den exakten Stacktrace des Fehlers.
