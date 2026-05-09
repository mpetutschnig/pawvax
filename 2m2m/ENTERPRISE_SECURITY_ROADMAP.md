# 🛡️ Enterprise Readiness & Partner Security Roadmap

Dieses Dokument beschreibt die technischen Härtungsmaßnahmen, um PAW für die Integration mit globalen Partnern (z.B. Tractive, Fressnapf, Versicherungen) vorzubereiten. Es dient als technischer Fahrplan für den Übergang vom Startup-MVP zum Enterprise-Grade-Protokoll.

---

## 1. Partner-Authentifizierung (OAuth2)
**Status:** In Planung  
**Ziel:** Weg von statischen API-Keys, hin zu industriestandardmäßigen Token-Systemen.
*   **Maßnahme:** Implementierung des OAuth2 *Client Credentials Flow*.
*   **Vorteil:** Partner authentifizieren sich über `Client_ID` und `Client_Secret`. Zugriffstoken sind kurzlebig (z.B. 1 Stunde), was das Risiko bei Kompromittierung massiv senkt.

## 2. Globales API Rate-Limiting & Quotas
**Status:** Teilweise implementiert (WS)  
**Ziel:** Schutz der Infrastruktur vor Überlastung durch Partner-Systeme.
*   **Maßnahme:** Einführung eines abgestuften Rate-Limitings (Tiered Throttling) auf API-Ebene.
*   **Konfiguration:** 
    *   Tier 1 (Standard): 10 req/sec
    *   Tier 2 (Partner): 100+ req/sec (vertraglich geregelt)
*   **Technik:** Nutzung von Redis-basierten Counters für verteilte Instanzen.

## 3. Webhook Security & HMAC-Signing
**Status:** In Planung  
**Ziel:** Sicherstellung der Integrität bei ausgehenden Notifikationen an Partner.
*   **Maßnahme:** Jedes Event, das PAW an ein Partner-System sendet (z.B. "Tier wurde gescannt"), wird mit einem geheimen Schlüssel signiert (**HMAC-SHA256**).
*   **Vorteil:** Der Partner kann kryptografisch verifizieren, dass die Daten unverfälscht von PAW stammen.

## 4. Strikte API-Kontrakte (Design-by-Contract)
**Status:** Implementiert (Basic) -> Upgrade auf Strikte Validierung  
**Ziel:** Zero-Trust gegenüber externem Input.
*   **Maßnahme:** Umstellung aller Partner-Endpunkte auf strikte JSON-Schema-Validierung mittels *Ajv* oder *Zod*.
*   **Regel:** Anfragen mit unbekannten Feldern oder falschen Datentypen werden auf Gateway-Ebene verworfen, bevor sie die Datenbank berühren.

## 5. Isolierte Partner-Scopes (Data Privacy)
**Status:** Teilweise implementiert (Rollenmodell)  
**Ziel:** Granulare Datenfreigabe auf Feldebene.
*   **Maßnahme:** Partner erhalten nur Zugriff auf freigegebene Scopes (z.B. `scope:health_read`, `scope:emergency_contact`).
*   **Vorteil:** Ein GPS-Tracker-Partner sieht keine medizinischen Details, außer der User hat dies explizit für den "Partner-Kanal" freigeschaltet.

---

## Zeitplan & Aufwand
*   **Aufwand:** ca. 3–5 PT (Personentage) für die Implementierung der Kern-Features (OAuth2 & HMAC).
*   **Ergebnis:** 100% Konformität mit den Sicherheitsanforderungen europäischer Großkonzerne und Versicherer.

**PAW ist im Kern "Secure-by-Design". Die oben genannten Schritte sind die logische Evolution zur Marktführerschaft.**
