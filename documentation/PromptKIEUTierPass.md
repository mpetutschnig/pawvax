Um eine KI dazu zu bringen, ein Bild präzise zu klassifizieren und die Daten in einem der acht von dir bereitgestellten JSON-Formate zu extrahieren, muss der Prompt als **„One-Shot“ oder „Few-Shot“ Klassifizierungs- und Extraktions-Prompt** aufgebaut sein.

Hier ist ein optimierter Prompt, den du zusammen mit dem Bild absenden kannst:

---

### Der Prompt

**Rolle:** Du bist ein spezialisierter Dokumenten-Extraktor für EU-Heimtierausweise.

**Aufgabe:**
1. Analysiere das hochgeladene Bild eines Heimtierausweises.
2. Identifiziere, welche Sektion des Ausweises (z. B. Besitzerdetails, Kennzeichnung, Impfungen, Parasitenbehandlung) abgebildet ist.
3. Wähle aus den unten stehenden 8 JSON-Schemata das exakt passende Schema für diesen Dokumenttyp aus.
4. Extrahiere alle sichtbaren Daten präzise und fülle das gewählte JSON-Schema aus.

**Regeln:**
*   **Nur JSON:** Antworte ausschließlich im validen JSON-Format. Kein Fließtext davor oder danach.
*   **Sprache:** Übernehme Namen und Adressen genau so, wie sie auf dem Bild stehen (z. B. Großschreibung).
*   **Null-Werte:** Wenn ein Feld im Schema vorhanden, aber auf dem Bild nicht lesbar oder leer ist, verwende `null`.
*   **Datumsformat:** Verwende nach Möglichkeit `YYYY-MM-DD`.

**Verfügbare Schemata (Referenzen):**
*   **Typ 1 (Besitzer/Züchter):** Fokus auf "Breeder" und "Ownership Details" (Seite 5)[cite: 1].
*   **Typ 2 (Besitzer Basis):** Fokus auf "Details of Ownership" (Seite 6)[cite: 2].
*   **Typ 3 (Tierbeschreibung):** Fokus auf "Description of Animal" und "Identification"[cite: 3].
*   **Typ 4 (Transponder):** Fokus auf "Animal Identification" (Transponder/Tattoo)[cite: 4].
*   **Typ 5 (Ausweis-Ausstellung):** Fokus auf die ausstellende Behörde/Tierarztpraxis[cite: 5].
*   **Typ 6 (Tollwutimpfung):** Fokus auf die Sektion "Vaccination against rabies"[cite: 6].
*   **Typ 7 (Echinococcus):** Fokus auf "Anti-echinococcus treatments"[cite: 7].
*   **Typ 8 (Sonstige Impfungen):** Fokus auf allgemeine Impfdatensätze (SHPPi, L4, etc.)[cite: 8].

**Extrahiere nun die Daten des Bildes in das zutreffende Format.**

---

### Warum dieser Prompt funktioniert:

*   **Klassifizierung durch Kontext:** Da du der KI alle 8 Varianten als Referenz gibst, kann sie durch Musterabgleich (z. B. Überschriften wie "IV. Ausstellung" oder "VII. Echinococcus") entscheiden, welches Schema[cite: 5, 7] am besten passt.
*   **Strukturvorgabe:** Durch die explizite Nennung der Seitenzahlen und Sektions-Titel aus deinen Quellen[cite: 1, 2, 6] erhöhst du die Erkennungsrate massiv.
*   **Präzision:** Die Anweisung zu `null`-Werten verhindert, dass die KI Daten "erfindet" (Halluzinationen), wenn Felder auf dem Foto handschriftlich nicht ausgefüllt wurden.

**Tipp für die Praxis:** Wenn du die KI über eine API (wie GPT-4o oder Gemini 1.5 Pro) ansprichst, solltest du die 8 JSON-Beispiele aus deiner Quelle als "System Instruction" oder in einem separaten Textblock mitliefern, damit das Kontextfenster sauber getrennt bleibt.

Welchen dieser Dokumenttypen hast du am häufigsten als Bildquelle vorliegen?