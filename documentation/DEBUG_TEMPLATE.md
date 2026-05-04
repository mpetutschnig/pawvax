# 🐛 PAWvax Debug-Report Template

**Nutze dieses Format, um mir Bugs präzise zu melden.**

---

## Bug-Report Template

```
### [Screen-Name] [Button/Form-Name]: [Problem in einer Zeile]

**Route/URL:** 
z.B. https://paw.oxs.at/animals

**Component/Page:** 
z.B. AnimalsPage, ProfilePage, AnimalPage

**Element (eindeutig):**
z.B. "Button 'Neues Tier hinzufügen' unten rechts"
     oder "Input-Feld 'Tiername' im Form"
     oder "Card #1 in der Tierliste (Katze 'Fluffy')"

**Was ist passiert (aktuelles Verhalten):**
z.B. "Button verschwindet nach Klick, es passiert nichts"
     oder "Fehlermeldung im roten Banner: 'Network Error'"
     oder "Seite wird leer / zeigt 'Loading...' dauerhaft"

**Was sollte passieren (erwartetes Verhalten):**
z.B. "Modal-Dialog 'Neues Tier' sollte öffnen"
     oder "Tier sollte zur Liste hinzugefügt werden"
     oder "Bestätigung 'Partner verlinkt' sollte angezeigt werden"

**Konsolenfehlér (Browser DevTools → F12 → Console):**
z.B. "Keine Fehler sichtbar"
     oder "GET /api/animals 404 Not Found"
     oder "TypeError: Cannot read property 'name' of undefined"

**Screenshot / Beschreibung:**
[Beschreibe was du siehst: Welche Buttons, Text, Farben, Icons sichtbar?]
```

---

## Beispiele (Kopiere die Vorlage oben!)

### Beispiel 1: Tiere nicht sichtbar

```
### AnimalsPage: Tierliste ist leer

**Route/URL:** 
https://paw.oxs.at/animals

**Component/Page:** 
AnimalsPage

**Element (eindeutig):**
Die Hauptseite mit der Liste aller Tiere (sollte mehrere grüne Cards zeigen)

**Was ist passiert (aktuelles Verhalten):**
Seite ist komplett leer, keine Tiere werden angezeigt. Oben steht möglicherweise "Loading..." oder es wird gar nichts angezeigt.

**Was sollte passieren (erwartetes Verhalten):**
Alle meine angelegten Tiere sollten als grüne Cards mit Bild + Name + Rasse angezeigt werden (z.B. "Fluffy, Britisch Kurzhaar").

**Konsolenfehlér (Browser DevTools → F12 → Console):**
GET /api/animals 500 Internal Server Error
oder: TypeError: Cannot read property 'map' of undefined

**Screenshot / Beschreibung:**
Seite zeigt nur den Header "Meine Tiere" und eine leere weiße Fläche darunter.
```

---

### Beispiel 2: Tier hinzufügen funktioniert nicht

```
### AnimalAddPage: Form wird abgelehnt

**Route/URL:** 
https://paw.oxs.at/animals/add
(oder Modal-Dialog beim "+" Button)

**Component/Page:** 
AnimalAddPage oder AddAnimalForm (im Modal)

**Element (eindeutig):**
Das Form-Feld "Tiername" (TextInput mit Placeholder "z.B. Fluffy")
Der rote Button "Tier hinzufügen" unten im Dialog

**Was ist passiert (aktuelles Verhalten):**
Nach Eingabe von Name, Rasse, etc. und Klick auf "Tier hinzufügen" erscheint eine Fehlermeldung im roten Banner oben: "Fehler beim Hinzufügen des Tieres"

**Was sollte passieren (erwartetes Verhalten):**
Der Dialog schließt, das neue Tier erscheint in der Liste mit den Daten, die ich eingegeben habe.

**Konsolenfehlér (Browser DevTools → F12 → Console):**
POST /api/animals 422 Unprocessable Entity
{"message": "Missing required field: species"}

**Screenshot / Beschreibung:**
Das Form zeigt alle Input-Felder (Name, Rasse, Geburtsdatum). Es gibt einen roten Button "Tier hinzufügen" unten rechts im Dialog.
```

---

### Beispiel 3: Partner verifizieren Fehler

```
### ProfilePage: Verifizierungs-Button zeigt Fehler

**Route/URL:** 
https://paw.oxs.at/profile

**Component/Page:** 
ProfilePage

**Element (eindeutig):**
Der Button "Partner verifizieren" oder "Link prüfen" im Profil-Bereich unter "Tierarzt-Verifizierung"
Das Input-Feld daneben, das eine Partner-ID/Code erwartet

**Was ist passiert (aktuelles Verhalten):**
Nach Eingabe eines Vet-Codes (z.B. "ABC123") und Klick auf "Verifizieren" zeigt sich 3 Sekunden eine Ladeanimation, dann wird ein Fehler angezeigt: "Verifizierung fehlgeschlagen"

**Was sollte passieren (erwartetes Verhalten):**
Ein grüner Haken sollte erscheinen, und unter dem Input sollte "Verifiziert als Tierarzt am 03.05.2026" stehen.

**Konsolenfehlér (Browser DevTools → F12 → Console):**
POST /api/accounts/verify-partner 401 Unauthorized
{"error": "Invalid token"}

**Screenshot / Beschreibung:**
Das Profil-Form zeigt einen Input mit Placeholder "Vet-Code eingeben" und einen blauen Button daneben "Verifizieren". Es gibt auch einen roten Warning-Text, der sagt "Noch nicht verifiziert".
```

---

### Beispiel 4: Daten-Export fehlt / funktioniert nicht

```
### ProfilePage: Daten-Export-Button ist nicht sichtbar oder funktioniert nicht

**Route/URL:** 
https://paw.oxs.at/profile

**Component/Page:** 
ProfilePage

**Element (eindeutig):**
Der Button "Daten exportieren" oder "Takeout" im Profil-Bereich unter "Datenschutz" (DSGVO)

**Was ist passiert (aktuelles Verhalten):**
Der Button ist nicht sichtbar ODER nach Klick passiert nichts / Fehler wird angezeigt.

**Was sollte passieren (erwartetes Verhalten):**
Ein ZIP-Download startet, das alle meine Daten + Bilder enthält. Eine Bestätigung "Download gestartet" sollte angezeigt werden.

**Konsolenfehlér (Browser DevTools → F12 → Console):**
GET /api/accounts/me/export 404 Not Found
oder: No error, aber download startet nicht

**Screenshot / Beschreibung:**
Der Profil-Screen zeigt mehrere Sections: Account, Verifizierung, Datenschutz. Im Datenschutz-Bereich sollte ein Button "Daten exportieren" sein, eventuell mit einem Warning "Wichtig: Dies beinhaltet alle deine Tierdaten".
```

---

## Browser DevTools öffnen

1. **F12** drücken oder **Rechtsklick → Inspect**
2. **Console-Tab** anklicken
3. Nach rot/gelben Meldungen suchen
4. Text rauskopieren und in den Report einfügen

---

## Checklist für Prod-Test

- [ ] **Anmelden** → Mit eigenem Account einloggen
- [ ] **AnimalsPage** → Alle Tiere anzeigen? (oder leer?)
- [ ] **Tier hinzufügen** → + Button → Form → Speichern → Taucht auf?
- [ ] **Tierdetail** → Ein Tier anklicken → Details anzeigen?
- [ ] **Dokument hochladen** → Foto/PDF auswählen → Upload funktioniert?
- [ ] **ProfilePage** → Alle Felder sichtbar?
- [ ] **Partner verifizieren** → Code eingeben → Verifizierung funktioniert?
- [ ] **Daten exportieren** → Button sichtbar? → Download starten?
- [ ] **Logout** → Logout-Button funktioniert?

---

## Schnelle Terminal-Logs (Server)

Wenn nötig, SSH auf Hetzner und **Live-Logs** anschauen:

```bash
# Terminal auf dem Server
journalctl --user-instance -u paw-api.service -f

# In anderem Terminal testen, in diesem Logs beobachten
# Fehlermeldungen werden realtime angezeigt
```

---

**Viel Erfolg beim Testen! 🚀**
