# PAW — Die digitale Infrastruktur für Tiergesundheit

PAW ist ein digitales Ökosystem, das den klassischen Tierimpfpass durch eine intelligente, KI-gestützte Plattform ersetzt. Es verbindet Tierhalter, Tierärzte und Behörden über ein fälschungssicheres Rollenmodell.

## Kernfunktionen
- **Echtzeit-KI-Analyse (Gemini Vision AI):** Automatisierte Extraktion von medizinischen Daten aus Fotos.
- **NFC/QR-Integration:** Physische Anbindung von Tieren über Halsband-Tags.
- **Granulares Rollenkonzept:** Spezifische Zugriffsrechte für Besitzer, Vets, Behörden und Finder.
- **Verifizierte Historie:** Tierarzt-Uploads sind für Besitzer unveränderlich (Trust Anchor).
- **PWA-Technologie:** Installierbar auf jedem Smartphone ohne App-Store-Hürden.

## Rollenmodell
1. **Besitzer:** Volle Verwaltung, Steuerung der Freigaben.
2. **Tierarzt (Vet):** Sieht medizinische Historie aller Kollegen, lädt verifizierte Dokumente hoch.
3. **Behörde:** Zugriff auf gesetzlich relevante Nachweise (z.B. Tollwut).
4. **Finder (Guest):** Sieht nur Notfallkontakte bei Scan eines Tags.

## Technischer Stack
- **Frontend:** React 18, TypeScript, Tailwind CSS.
- **Backend:** Node.js (Fastify), PostgreSQL/SQLite.
- **AI:** Google Gemini 1.5 Flash-Lite (Multimodal).
- **Sicherheit:** AES-256 Verschlüsselung, Audit-Logs, Blacklisting.
