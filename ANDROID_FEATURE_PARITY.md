# Android App - Feature Parity Analyse vs PWA

## 🔴 KRITISCHE FEATURES (FEHLEN KOMPLETT)

### 1. **Dokument Scanning & Analyse** ⭐⭐⭐⭐⭐
**PWA:** DocumentScanPage.tsx (542 Zeilen)
- Camera Integration (qrcode.js Scanner)
- Multi-page document capture
- Gemini Vision API integration für OCR
- Document Type Detection (Impfung, Medikament, etc.)
- Extracted JSON mit Vaccinations/Medications Details
- Real-time status messages während upload

**Android:** ❌ NICHT IMPLEMENTIERT
- Braucht: Camera Integration, WebSocket Upload, Gemini Integration

---

### 2. **Tierbild (Avatar)** ⭐⭐⭐⭐
**PWA:** AnimalPage.tsx (406 Zeilen)
- Avatar anzeigen (wenn vorhanden)
- Avatar ändern/hochladen
- Image compression vor upload
- Avatar als Profilbild in Listen

**Android:** ❌ NICHT IMPLEMENTIERT
- Braucht: Image Picker, Compression, Upload API

---

### 3. **Dokument Details Seite** ⭐⭐⭐⭐
**PWA:** DocumentDetailPage.tsx (409 Zeilen)
- Dokument anzeigen mit Metadaten
- Tags verwalten
- Reminder erstellen (ICS Export)
- Email Reminder senden
- Extracted JSON anzeigen (Impfdetails, Medikamente, etc.)
- Visibility/Sharing Info
- Edit Mode für Dokumenttyp & Tags
- Delete Document

**Android:** ❌ NICHT IMPLEMENTIERT
- Braucht: Vollständige DetailPage, ICS Export, Email Integration

---

### 4. **Profil - Gemini API Key** ⭐⭐⭐
**PWA:** ProfilePage.tsx (242 Zeilen)
- Profil anzeigen (Name, Email, Role)
- Name ändern
- Gemini API Key eingeben/aktualisieren
- Verifizierungsstatus anzeigen
- Verifikation anfordern
- Konto löschen
- Logout Button

**Android:** ❌ TEILWEISE
- ✅ Profile laden & Name ändern
- ❌ Gemini Key Input/Update fehlt
- ❌ Verifizierung anfordern fehlt
- ✅ Delete Account / Logout vorhanden

---

## 🟡 TEILS IMPLEMENTIERTE FEATURES

### 5. **Scan Page (Tier per Tag)** ⭐⭐⭐
**PWA:** ScanPage.tsx (229 Zeilen)
- Barcode Scanner (QR-Code)
- NFC Reader
- Manuelle ID-Eingabe
- Tier-Liste mit Live-Suche
- Neue Tiere schnell erstellen

**Android:** ⚠️ TEILWEISE
- ✅ Tierliste anzeigen
- ✅ Manuelle ID-Eingabe
- ✅ NFC-Placeholder
- ❌ **Barcode Scanner funktioniert NICHT** (Code existiert aber nicht aktiv)
- ❌ Live-Suche fehlt

---

### 6. **Tag Management** ⭐⭐⭐
**PWA:** TagManagementPage.tsx (132 Zeilen)
- Tags dem Tier zuordnen
- Barcode Scanner für Tag-ID
- Tag aktivieren/deaktivieren
- Tag-Status anzeigen

**Android:** ⚠️ TEILWEISE
- ❌ Barcode Scanner nicht funktionsfähig
- ✅ Add Tag API vorhanden
- ❌ UI für Tag Management fehlt

---

## 🟢 IMPLEMENTIERTE FEATURES

### 7. **Authentifizierung** ✅
- ✅ Login/Register
- ✅ JWT Token Management
- ✅ Token Storage
- ✅ Logout & Token Blacklist

### 8. **Tier Management** ✅
- ✅ Tierliste anzeigen
- ✅ Tier Details anzeigen
- ✅ Tier erstellen
- ✅ Tier bearbeiten (Name, Rasse, Geburtsdatum)
- ✅ Tier löschen

### 9. **Navigation & UI** ✅
- ✅ Tab-basierte Navigation
- ✅ Menu (Profile, Organizations, Admin)
- ✅ Back Navigation
- ✅ Material Design 3

### 10. **Freigabe Settings** ✅
- ✅ Sharing Settings Seite
- ✅ Rollen-basierte Freigabe

### 11. **Organisationen** ✅
- ✅ Organisationen anzeigen
- ✅ Organisationen erstellen
- ✅ Mitglieder verwalten
- ✅ Einladungen versenden

### 12. **Admin Features** ✅
- ✅ Admin Dashboard
- ✅ Account Management
- ✅ Audit Log Viewer
- ✅ Rollen ändern

---

## 📋 FEATURE PRIORITÄTS-ROADMAP

### **PHASE 1 - KRITISCH (Woche 1-2)** 🔴
1. **Barcode Scanner aktivieren** - Core Feature
   - Zeige Camera View in ScanScreen
   - ML Kit Barcode Detection
   - QR-Code parsing

2. **Dokument Scanning & Upload**
   - Camera Integration für Fotos
   - Multi-page support
   - WebSocket Upload mit Status
   - Gemini API Integration für OCR

3. **Tierbild Upload** 
   - Image Picker Integration
   - Image Compression
   - Avatar Display in Listen & Details
   - Avatar ändern

### **PHASE 2 - WICHTIG (Woche 2-3)** 🟡
1. **Dokument Details Page**
   - Detail View für Dokumente
   - Tags anzeigen/bearbeiten
   - Extracted JSON Anzeige
   - Document Type Selector

2. **Gemini Key Management**
   - Input Field in Profile
   - Speichern/Aktualisieren
   - Encryption handling

3. **Tag Management UI**
   - Barcode Scanner für Tag-IDs
   - Add/Remove Tags UI
   - Tag-Status anzeigen

### **PHASE 3 - OPTIONAL (Woche 3+)** 🟢
1. Reminder Erstellen (ICS Export)
2. Email Reminders
3. Live Suche in Listen
4. Dark Mode Improvements
5. Performance Optimizations

---

## 🎯 EMPFOHLENE IMPLEMENTIERUNGS-REIHENFOLGE

```
1. Fix Barcode Scanner (1-2h)
2. Implement Tierbild/Avatar (2-3h)
3. Add Dokument Details Page (3-4h)
4. Implement Dokument Scanning (4-5h)
5. Add Gemini Key to Profile (1h)
6. Tag Management UI (2-3h)
```

**Gesamtaufwand für MVP: ~16-20 Stunden**

---

## 📊 FEATURE COVERAGE

| Feature | PWA | Android | % | Priorität |
|---------|-----|---------|---|-----------|
| Login/Auth | ✅ | ✅ | 100% | ✅ |
| Tier Liste | ✅ | ✅ | 100% | ✅ |
| Tier Details | ✅ | ✅ | 100% | ✅ |
| Tier Bild | ✅ | ❌ | 0% | 🔴 |
| Dokument Scanning | ✅ | ❌ | 0% | 🔴 |
| Dokument Details | ✅ | ❌ | 0% | 🔴 |
| Barcode Scanner | ✅ | ⚠️ | 20% | 🔴 |
| Tag Management | ✅ | ⚠️ | 30% | 🟡 |
| Profil | ✅ | ⚠️ | 70% | 🟡 |
| Gemini Key | ✅ | ❌ | 0% | 🟡 |
| Organisationen | ✅ | ✅ | 100% | ✅ |
| Admin | ✅ | ✅ | 100% | ✅ |
| **GESAMT** | - | - | **60%** | - |

---

## 🔧 TECHNISCHE ABHÄNGIGKEITEN

### Für Dokumenten Scanning:
- CameraX (bereits im Projekt)
- Google ML Kit Barcode Detection
- WebSocket für Upload (ws.ts)
- Gemini Vision API Integration

### Für Tierbild:
- Android Image Picker
- Image Compression (Canvas ähnlich PWA)
- Sharp/Image Processing

### Für Details:
- Detailed Navigation mit Parametern
- Dialog/Bottom Sheet für Reminder
- ICS Library für Export
