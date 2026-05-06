# OAuth & Supabase — Setup-Anleitung

## Wie es funktioniert

Der Server prüft beim Start, ob die nötigen Umgebungsvariablen gesetzt sind.  
Die PWA ruft `GET /api/auth/oauth/providers` auf und zeigt nur jene Buttons an, deren Provider tatsächlich konfiguriert ist.  
Nicht konfigurierte Provider sind **unsichtbar** — es gibt keinen Button und keine Fehlermeldung.

---

## Google OAuth

### 1. Google Cloud Console

1. Öffne [console.cloud.google.com](https://console.cloud.google.com)
2. Projekt anlegen (oder bestehendes auswählen)
3. Menü → **APIs & Dienste → OAuth-Zustimmungsbildschirm**
   - Typ: **Extern**
   - App-Name, Support-E-Mail ausfüllen
   - Scopes: `email`, `profile`, `openid` hinzufügen
4. Menü → **APIs & Dienste → Anmeldedaten → OAuth 2.0-Client-IDs erstellen**
   - Typ: **Webanwendung**
   - Autorisierte Weiterleitungs-URIs:
     ```
     https://DEINE-DOMAIN/api/auth/oauth/google/callback
     ```
5. Client-ID und Client-Secret kopieren

### 2. `.env` auf dem Server

```env
OAUTH_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
```

---

## GitHub OAuth

### 1. GitHub Developer Settings

1. Öffne [github.com/settings/developers](https://github.com/settings/developers)
2. **New OAuth App**
   - Application name: `PAW Tierimpfpass`
   - Homepage URL: `https://DEINE-DOMAIN`
   - Authorization callback URL:
     ```
     https://DEINE-DOMAIN/api/auth/oauth/github/callback
     ```
3. **Generate a new client secret**
4. Client-ID und Client-Secret kopieren

### 2. `.env` auf dem Server

```env
OAUTH_GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
OAUTH_GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Microsoft / Azure AD

### 1. Azure Portal

1. Öffne [portal.azure.com](https://portal.azure.com)
2. **Azure Active Directory → App-Registrierungen → Neue Registrierung**
   - Name: `PAW Tierimpfpass`
   - Unterstützte Kontotypen: **Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten**
   - Umleitungs-URI: `Web` →
     ```
     https://DEINE-DOMAIN/api/auth/oauth/microsoft/callback
     ```
3. Nach der Registrierung:
   - **Übersicht** → `Anwendungs-ID (Client-ID)` kopieren
   - **Zertifikate & Geheimnisse → Neuen geheimen Clientschlüssel** erstellen → Wert kopieren
4. **API-Berechtigungen** → Folgende delegierte Berechtigungen hinzufügen:
   - `openid`, `email`, `profile`, `User.Read`

### 2. `.env` auf dem Server

```env
OAUTH_MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OAUTH_MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Supabase Auth Handshake

Gedacht für Szenarien, wo ein externer Dienst (z.B. eine andere App, die Supabase nutzt) den User bereits authentifiziert hat und ihn nahtlos in PAW einloggen will.

### Flow

```
Externe App  →  User besucht https://DEINE-DOMAIN?token=<supabase_jwt>
PWA          →  erkennt ?token=, sendet POST /api/auth/supabase { token }
Server       →  verifiziert JWT mit SUPABASE_JWT_SECRET, erstellt Account falls neu
Server       →  gibt PAW-JWT zurück
PWA          →  speichert PAW-JWT, leitet zu /reminders weiter
```

### 1. Supabase JWT Secret holen

1. Öffne [app.supabase.com](https://app.supabase.com) → Dein Projekt
2. **Settings → API → JWT Settings**
3. `JWT Secret` kopieren

### 2. `.env` auf dem Server

```env
SUPABASE_JWT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Aufruf von extern

Der externe Dienst leitet den User zu folgender URL weiter, nachdem er ihn mit Supabase authentifiziert hat:

```
https://DEINE-DOMAIN?token=<supabase_access_token>
```

Kein weiteres Setup nötig — der Account wird automatisch angelegt oder der bestehende wird verwendet (Matching per E-Mail).

---

## BASE_URL und PWA_URL

Damit die OAuth-Callbacks korrekt funktionieren, muss der Server wissen, unter welcher Domain er läuft:

```env
BASE_URL=https://vetsucht.oxs.at    # Server-Domain für Callback-URLs
PWA_URL=https://vetsucht.oxs.at     # Wohin nach OAuth weitergeleitet wird
```

Ohne `BASE_URL` versucht der Server, die Domain aus dem eingehenden Request zu ermitteln (funktioniert, wenn kein Reverse-Proxy den Host-Header ändert).

---

## Vollständiges `.env`-Beispiel

```env
# Pflichtfeld
JWT_SECRET=ein-sehr-langer-zufaelliger-string

# Server-Konfiguration
PORT=3000
BASE_URL=https://vetsucht.oxs.at
PWA_URL=https://vetsucht.oxs.at

# Google OAuth (optional — Button erscheint nur wenn gesetzt)
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=

# GitHub OAuth (optional)
OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=

# Microsoft OAuth (optional)
OAUTH_MICROSOFT_CLIENT_ID=
OAUTH_MICROSOFT_CLIENT_SECRET=

# Supabase (optional — Handshake nur wenn gesetzt)
SUPABASE_JWT_SECRET=
```

---

## Verhalten bei nicht-konfigurierten Providern

| Provider-Variable gesetzt? | Verhalten |
|---|---|
| Nein | Button unsichtbar, Route gibt 503 zurück |
| Ja | Button erscheint, OAuth-Flow funktioniert |

Der Endpoint `GET /api/auth/oauth/providers` gibt den aktuellen Status zurück:

```json
{
  "google": true,
  "github": false,
  "microsoft": false,
  "supabase": true
}
```
