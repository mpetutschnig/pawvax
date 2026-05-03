# DESIGN BRIEF: PAWvax — Veterinary & Animal Passport Platform

> **Für Claude Design Agent:** Dieses Dokument ist ein vollständiger Prompt.
> Entwirf ein **hochgradig professionelles, medizinisches Business-Design** für eine Veterinär- und Tierpass-App.
> **KEINE Kindergarten-Optik.** Das Design muss für Tierärzte, Behörden und Franchisenehmer geeignet sein — seriös, vertrauenswürdig, klinisch-professionell mit warmer Note.

---

## 1. Produkt & Zielgruppe

**PAWvax** ist eine SaaS-Plattform für digitale Tierimpfpässe und Veterinär-Dokumentenverwaltung.

**Nutzergruppen:**
- **Tierbesitzer (User):** Verwalten Tierprofile, Dokumente, Sharing
- **Tierärzte (Vet):** Verifizierte Nutzer, laden offizielle Dokumente hoch, nutzen die externe VET-API
- **Behörden (Authority):** Offizielle Stellen, laden amtliche Dokumente hoch (z.B. Hundeführerschein)
- **Franchisenehmer / Kliniken:** Betreiben eigene Instanzen via Subdomain, branden die App mit ihrer Primärfarbe
- **Admin:** Systemverwaltung (kein Zugriff auf Tierdaten)

**Tonalität:** Medizinisch seriös, vertrauenswürdig, modern — aber nicht kalt. Wie ein gut geführtes Privatspital, das trotzdem zugänglich wirkt. Kein Neon, kein Comic, keine Pastellfarben.

---

## 2. Aktuelle CSS-Variablen (Bestehend — NICHT ändern, ausbauen)

```css
/* Primärfarbe — Indigo Blue (OKLCH) */
--primary-50:   oklch(97%   0.03  250);
--primary-100:  oklch(92%   0.06  250);
--primary-200:  oklch(84%   0.10  250);
--primary-300:  oklch(72%   0.14  250);
--primary-400:  oklch(60%   0.18  250);
--primary-500:  oklch(50%   0.20  250);   /* Hauptfarbe */
--primary-600:  oklch(42%   0.18  250);
--primary-700:  oklch(35%   0.16  250);
--primary-800:  oklch(26%   0.12  250);
--primary-900:  oklch(18%   0.08  250);

/* Semantische Farben */
--success-500:  oklch(52%   0.18  145);   /* Grün — Impfung aktuell */
--warning-500:  oklch(68%   0.20   80);   /* Orange — bald fällig */
--danger-500:   oklch(56%   0.22   25);   /* Rot — überfällig/Fehler */
--info-500:     oklch(58%   0.18  220);   /* Hellblau — Info */

/* Surface (Light Mode) */
--bg:            oklch(97.5% 0.007 240);
--bg-elevated:   oklch(100%  0     0);
--surface:       oklch(95%   0.010 240);
--border:        oklch(87%   0.014 240);
--border-subtle: oklch(92%   0.010 240);
--text-primary:  oklch(16%   0.025 240);
--text-secondary:oklch(46%   0.025 240);
--text-tertiary: oklch(66%   0.018 240);

/* Shadows */
--shadow-sm:  0 1px 3px   oklch(0% 0 0 / 0.07), 0 1px 2px  oklch(0% 0 0 / 0.05);
--shadow-md:  0 4px 12px  oklch(0% 0 0 / 0.09), 0 2px 4px  oklch(0% 0 0 / 0.05);
--shadow-lg:  0 8px 24px  oklch(0% 0 0 / 0.11), 0 4px 8px  oklch(0% 0 0 / 0.06);

/* Spacing (4px Base) */
--space-1: 4px;  --space-2: 8px;   --space-3: 12px;
--space-4: 16px; --space-5: 20px;  --space-6: 24px;
--space-8: 32px; --space-10: 40px; --space-12: 48px;

/* Border Radii */
--radius-xs:   4px;   --radius-sm:   8px;
--radius-md:  12px;   --radius-lg:  16px;
--radius-xl:  20px;   --radius-full: 9999px;

/* Typography */
--font-display: 'Outfit', system-ui, sans-serif;
--font-body:    'DM Sans', system-ui, sans-serif;
--font-mono:    'DM Mono', monospace;

/* Layout */
--max-content:       600px;   /* Mobile */
--sidebar-width:     220px;   /* Desktop SideNav */
--bottom-nav-height: 64px;
```

---

## 3. Komponenten-Spezifikation (Was entworfen werden soll)

### 3.1 SideNav (Desktop ≥ 1024px)
- Breite: `220px`, volle Viewport-Höhe, `position: fixed`
- Hintergrund: `var(--bg-elevated)` mit `1px solid var(--border-subtle)` rechts
- Brand-Bereich oben: Logo + App-Name (von Franchisenehmer anpassbar)
- Nav-Items: Icon (20px) + Label, Padding `12px 20px`
- Active-State: `background: var(--primary-50)`, `color: var(--primary-600)`, `border-right: 3px solid var(--primary-500)`
- Hover: `background: var(--primary-50)`, sanfter Übergang 120ms
- **Franchise-Override:** `--admin-sidebar-bg` Variable für Admin-Panel-Farbe

### 3.2 PetCard (Tierliste)
- Kompakte Card mit Avatar (44×44px, `border-radius: var(--radius-md)`)
- Name in `--font-display`, Rasse + Alter in `--text-tertiary`
- Status-Badges: `badge-success/warning/danger` mit dot-Indikator
- NFC-Badge: `badge-primary` mit Radio-Icon
- Archived: `opacity: 0.6`, `filter: grayscale(0.4)`, ✝-Symbol vor Name
- Hover: subtile Elevation-Erhöhung via `--shadow-md`

### 3.3 FilterChips (Dokumentenfilter)
- Horizontal scrollende Chip-Zeile (`.chip-row`) auf Mobile
- Chip: `border-radius: var(--radius-full)`, `padding: 4px 12px`, `font-size: var(--font-size-sm)`
- Inactive: `background: var(--surface)`, `border: 1px solid var(--border)`
- Active: `background: var(--primary-500)`, `color: white`, kein Border
- Icons optional links im Chip

### 3.4 DocumentCard (Dokumentenliste)
- Kompakte Zeile: Icon-Avatar (36×36px) + Typ-Label + Datum + Chevron
- Aufklappbar: zeigt extracted_json Felder (Impfstoff, Datum, Tierarzt etc.)
- `added_by_role === 'vet'`: Verified-Badge (CheckCircle, `--success-500`)
- `added_by_role === 'authority'`: Behörden-Badge (Landmark-Icon, `--info-500`)
- Pending OCR: Orange Border, AlertTriangle-Icon, Retry-Button
- Desktop: Tabellen-ähnliches Layout (flexbox mit definierten Spaltenbreiten)

### 3.5 AdminTable (Admin-Panel)
- Vollbreite Tabelle mit `thead` in `var(--surface)`, sticky Header
- Zeilen: hover `background: var(--primary-50)`
- Status-Chips in Zellen (verified, pending, rejected)
- Aktions-Buttons rechts: kompakte Icon-Buttons (`32×32px`)
- Sortierbare Spalten mit Up/Down-Pfeilen
- Paginierung: Previous/Next + Seitennummer unten rechts

### 3.6 Forms (Login, Profil, Tier anlegen)
- Input: `height: 44px`, `border-radius: var(--radius-md)`, `border: 1.5px solid var(--border)`
- Focus: `border-color: var(--primary-400)`, `box-shadow: 0 0 0 3px oklch(from var(--primary-400) l c h / 0.15)`
- Error-State: `border-color: var(--danger-500)`, Error-Text darunter in `--danger-500`
- Label: `font-size: var(--font-size-sm)`, `font-weight: 600`, `color: var(--text-secondary)`
- Submit-Button: `btn-primary` — `background: var(--primary-500)`, Hover `var(--primary-600)`, `border-radius: var(--radius-md)`, `height: 44px`

### 3.7 Badges & Status-Indikatoren
```
badge-success:   bg oklch(95% 0.06 145), text oklch(43% 0.16 145), border oklch(80% 0.10 145)
badge-warning:   bg oklch(96% 0.06  80), text oklch(57% 0.18  80), border oklch(80% 0.12  80)
badge-danger:    bg oklch(96% 0.05  25), text oklch(46% 0.20  25), border oklch(80% 0.14  25)
badge-info:      bg oklch(95% 0.05 220), text oklch(46% 0.16 220), border oklch(82% 0.10 220)
badge-primary:   bg var(--primary-50),   text var(--primary-600),   border var(--primary-200)
```
Alle Badges: `border-radius: var(--radius-full)`, `padding: 2px 8px`, `font-size: 11px`, `font-weight: 600`

### 3.8 BottomNav (Mobile < 1024px)
- Höhe: `64px`, `position: fixed`, `bottom: 0`
- Hintergrund: `var(--bg-elevated)` + `blur(20px)` + obere Border
- 4 Einträge: Scan, Tiere, Profil, Admin (nur wenn Admin)
- Icon + Label, Active: `color: var(--primary-500)`, Icon-Wrap mit `background: var(--primary-50)`, `border-radius: var(--radius-sm)`

---

## 4. Franchise-Farbgebung (Admin-Panel)

Jeder Franchisenehmer kann die Primärfarbe des Admin-Panels über CSS-Variablen anpassen:

```css
/* Default — überschreibbar via JS/Settings-API */
--admin-sidebar-bg:       oklch(16% 0.025 240);  /* Dunkel-Blau */
--admin-sidebar-text:     oklch(95% 0.010 240);
--admin-sidebar-active:   var(--primary-500);
--admin-accent:           var(--primary-500);

/* Beispiel Franchise "Klinik Wien" — Grün */
/* --admin-sidebar-bg:    oklch(22% 0.08 145); */
/* --admin-accent:        oklch(52% 0.18 145); */
```

Das System liest `settings.theme_color` via `GET /api/settings` und setzt die Variable dynamisch:
```js
document.documentElement.style.setProperty('--admin-accent', settings.theme_color)
```

---

## 5. Breakpoints

| Breakpoint | Wert | Verhalten |
|---|---|---|
| Mobile (default) | < 1024px | BottomNav, Container max 600px, Cards gestapelt |
| Desktop | ≥ 1024px | SideNav 220px, Container max 1100px, `.content-grid` 2-spaltig |

```css
/* Desktop Override */
@media (min-width: 1024px) {
  .container { max-width: 1100px; }
  .page.has-sidenav { padding-left: calc(220px + 24px); }
  .content-grid { grid-template-columns: 360px 1fr; }
}
```

---

## 6. Typografie-Hierarchie

| Element | Font | Weight | Size | Color |
|---|---|---|---|---|
| Page Title | Outfit | 700 | 1.5rem | `--text-primary` |
| Card Title | Outfit | 600 | 1rem | `--text-primary` |
| Body Text | DM Sans | 400 | 1rem | `--text-primary` |
| Label | DM Sans | 600 | 0.875rem | `--text-secondary` |
| Helper / Meta | DM Sans | 400 | 0.75rem | `--text-tertiary` |
| Disclaimer | DM Sans | 400 | 11px | `--text-tertiary` |
| Code / Hash | DM Mono | 400 | 0.875rem | `--text-secondary` |

---

## 7. Illustrationen & Iconography

- Icon-Library: **Lucide React** (bereits installiert), `strokeWidth: 1.8`
- Tier-Spezies-Icons: `PawPrint` (Hund), `Cat` (Katze), `HelpCircle` (Andere)
- Keine bunten Illustrationen — stattdessen monochromatische Icon-Avatare
- Avatar-Fallback: Farbiger Kreis (Primary-500) mit weißem Icon
- Veterinär-Badge: `CheckCircle` in `--success-500`
- Behörden-Badge: `Landmark` in `--info-500`

---

## 8. Kritische Design-Entscheidungen

1. **Kein Gamification.** Keine Sterne, keine Streaks, keine Achievements.
2. **Kein Dark-Pattern beim Löschen.** Account-Löschung hat mehrere Bestätigungsschritte + Takeout-Angebot.
3. **OCR-Disclaimer immer sichtbar** unterhalb jeder Dokumentenliste (11px, `--text-tertiary`).
4. **Archivierte Tiere** (verstorben): `opacity: 0.6`, `filter: grayscale(0.4)`, ✝-Symbol — nicht aus der Liste entfernen.
5. **Read-Only-Modus** für archivierte Tiere: Alle Mutations-Buttons ausgeblendet.
6. **Vet-Dokumente** haben ein visuelles Siegel (Verified-Badge), das sie von User-Dokumenten unterscheidet.
7. **Temporäre Sharing-Links** zeigen ein `Clock`-Icon + Ablaufdatum prominent.

---

## 9. Was Claude Design liefern soll

1. **Vollständiges CSS-File** (`pwa/src/index.css`) mit allen Tokens und Komponenten-Stilen
2. **Dark Mode** — alle `:root` Variablen für `@media (prefers-color-scheme: dark)` 
3. **Verfeinerte Komponenten-Stile** für: `.card`, `.btn`, `.badge`, `.bottom-nav`, `.side-nav`, `.admin-layout`, `.admin-table`, `.form-group`, `.input`, `.chip-row`
4. **Animations** — Subtle micro-interactions: Card-Hover (translateY -2px), Button-Press (scale 0.98), Badge-Erscheinen (scale + opacity)
5. **Print-Styles** — `@media print` für Dokumenten-Ausdrucke (Tierpass)