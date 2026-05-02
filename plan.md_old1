# System-Spezifikation: PWA & AI Integration

## 1. Scan-Logik (Caveman Style)
* **Scan egal wo:** Scanner an, Dokumente da. Rolle bestimmt, was Auge sieht (Readonly).
* **Anonym + Unbekannt:** Scan sagt: "Nix da. Kein Tier, kein System."
* **Anonym + Bekannt:** Zeige nur Dokumente für Gast-Rolle.
* **Login + Fremdes Tier:** Zeige nur Dokumente für User-Rolle.
* **Login + Mein Tier:** Volle Power. Profil öffnen. Alle Details zeigen.

---

## 2. AI Modell-Steuerung
* **User-Priorität:** User legt Reihenfolge fest (z.B. erst Google, dann Anthropic).
* **Kein Futter (Tokens):** Wenn Key fehlt -> Meldung: "Analyse nicht möglich. Keine Tokens hinterlegt."
* **Re-Analyse:** User muss Anbieter und Modell erneut wählen.
* **Spar-Automatik:** System wählt standardmäßig das günstigste Modell.
* **Preis-Check:** [Hier aktuelle Abrechnung & Preise prüfen](https://artificialanalysis.ai/models)

---

## 3. PWA Dokumentation

### Enduser
**DE:** Nahtloser Zugriff via NFC/Barcode. Die Ansicht passt sich automatisch Ihrer Rolle an. Eigene Tiere zeigen das vollständige Profil; fremde Tags zeigen nur freigegebene Dokumente.
**EN:** Seamless access via NFC/Barcode. The interface adapts to your role. Own animals display full profiles; third-party tags show shared documents only.

### Developer (API Endpoints)
**Endpoints:**
* `GET /scan/{id}`: Verarbeitet Tag/Barcode. Gibt Dokumente (Readonly) oder Profil-URL zurück.
* `GET /user/ai-settings`: Ruft die definierte Anbieter-Reihenfolge des Nutzers ab.
* `POST /analyze`: Führt Analyse aus. Prüft vorab `API_KEY` Präsenz.

---

## 4. Maintenance & Deployment
* **Deployment-Watch:** Halte immer die `DEPLOY.md` im Auge. Aktualisiere diese sofort bei Änderungen an Infrastruktur, Umgebungsvariablen oder Build-Prozessen.

---

## 5. Anbieter-Übersicht (AI Provider)

| Anbieter (Provider) | Modell (Standard) | Status |
| :--- | :--- | :--- |
| **Google** | Gemini 1.5 Flash | Günstigster Standard |
| **Anthropic** | Claude 3.5 Sonnet | Optional |
| **OpenAI** | GPT-4o mini | Optional |

---

## 6. Lokalisierung (Multilanguage)
Das System unterstützt nativ **Deutsch (DE)** und **Englisch (EN)** für alle Systemmeldungen und die Benutzeroberfläche.