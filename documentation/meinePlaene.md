/plan kürze die tabellen ansicht in der mobile version auf drrei spalten, in der laptop ansicht ists mir egal. wichtig ist nur das ich nie horizontal scrollen muss
------------
ergänze oder vervollständige die doku um alle features.
Kommplette feature liste mit kuzer beschreibung, bei klick detailierte infos zu den features.
pass die willkommenseite an wenn was fehlt.
kürzlich gecannte tiere ist zu nah bei den buttons
der dokument hinzuf+gen button sollte über den tabellen und dokumenten sein, unten findet ihn keiner
--------------
die tenant URL muss überall dynamisch ausgetauscht werden zum Beispiel in der Doku
------------------
ergänze die Login token admin site um links zu den jeweiligen providern, wie kann ein user in der admin oberfläche die supabase anbindung herstellen oder einrichten.
könnnen die eingegebenen secrets kontrolliert werden auf gültigkeit.
--------------------------
beim dokumenten typ bei dem geburtsdatum, name und so weiter steht, frag nach ob diese werte im profil ergänzt werden sollten.
füg bei den tieren den züchternamen/stammbaumnamen hinzu, der andere name ist der von den besitzern, also wie die besitzer den hund nennen. 
Beispil unser Hund ist laut stammbaum "Out of Control" und wir sagen Olli dazu.
------------------------




ID-Card das aktuelle löschen sollte deaktivieren heißen.
wenn eine ID-Card deaktiviert wurde, sollten die buttons löschen und aktivieren angezeigt werden, beim löschen sicherheitsabfrage.
in der detailansicht müssen die id-cards nicht aufgelistet werden.

------------------------

wenn ich im browser auf den zurückbutton klick passieren sachen die ich so nicht vorhersehen kann, gerade bei untermenüs in der admin oberfläche.

sichtbarkeit für die rollen bei allen dokumenttypen soll erst bei klick auf den jeweiligen eintrag im ausgeklappten detailsansicht erscheinen 

mir ist erst jetzt aufgefallen, dass es beim klick auf den titel ein anderes verhaltet gibt als wenn ich irgendwo in der zeile klick.
als klick titel ist das dokument mit bild etc, klick irgendwo anders öffnet details.

kann man das besser darstellen?
--------------------------------

rate-limit soll anders auf der seite dargestellt werden.
nicht nur einen error block ohne sonstige details.
wenn möglich lass das layout erhalten.

wie komm ich wieder zu den tests zurück wenn ich auf einen test details klick, der aktuelle selektiere flowrun ist dann nicht mehr ersichtlich und ich muss mich von anfang an wieder durchhangeln
test darstellung stelle ich mir so ähnlich vor wie bei den audit-logs

bei den sharinglinks, stelle auch die links der bereits generierten links aus.
kann man bei den links auch berechtigungen wie bei den rollen vergeben?

zuletzt gescannte Tiere, gleiche tiere nur einmal darstellen. 

https://pawapi.oxs.at nicht verfügbar err_ssl_protokol_error

in der accout-verwaltung wird der verfiziert status nciht angezeigt.

sharing link als vet öffnen öffnet public ansicht, wenn ein user schon angemeldet ist, soll er nach soll die dokumetnen daten sehen.
ein user soll nur guest dokumente sehen. und so weiter

--------------------------------

ich bin als verifizeriter user angemeldet mit der rolle tierarzt, oben rechts auf der site sehe ich user, beim shareing link steht berechtigugn user, aber in meinem profil steht du bis verifizierter tierarzt
Dokumenten werden mir anscheinend auch nach der rolle user angezeigt, also gastzugang


--------------

header menü steht ein badge mit der aktuellen rolle des users, ich bin mit einem tierarzt account angemet sehe aber trotzdem user. und ich glaub die dokumente werden auch für die user angezeigt, wobei ein vet auch per sharing link alle dokumente die ein tierarzt sehen soll, sehen sollte. aber nur wenn der tierarzt angemeldet ist, ansonsten ists ja ein guestzuang. also wenn es eine aktuelle session gibt, nimm die rolle des angemeldeten users für den sharing link und alle anderen teilen optionen wie nfc/barcode 

-----------------------

in der webapp bekomm ihc die nachricht keine tokens hinterlegt, mobile keinen zugriff


-------------------

https://pawapi.oxs.at/documentation

err_ssl_protocol_error

dns ist eingetragen


-------------------------------------------

ist in den tests wirklich alles verhanden was wir mit tests für einen problemlosen lauf testen können?


------------------------------------------------


kannst du für die sharing funktionalität auch einen QR Code der mit dem barcodescanner funktioniert erstellen. wenn ja dann will ich einen qr code generieren lassen, der aber auch in der hostroy der sharing links angezeigt wird.
----------------

bei der analyse oder während der analyse werden die sekunden nicht hochgezählt und ich bekomm sicher einen fehler, weil ncihts passiert am handy.

-----------------------------

loginscreen ?register fehlt ein whitespace oder nächste zeile
advanced mittig, und statt advanced "Change Server" oder so

--
mail kommt noch immer keines an, loggin im adminportal unter audit logs mit smtp response etc 
--
sharing link ich find keine barcode
---
das verhalten muss bei der reanalyse auch genau gleich sein. bei der reanalyse weil der erste scna nicht funktioniert hat, wäre auch das bild die seiten verteilung und der ausgewählte documenttyp interessant, das soll alles angezeigt werden und dann soll der user nochmals auf analysieren klicken. eventuelll soll er falsche einträge noch korrigieren können, also ers er falsch klassifiziert hat



-------------------

für eine spätere verrechnung wär ein protokoll pro user interessant wieviele seiten er mit welchem modell analysiern hat lassen und ob es sein modell war oder das system fallback.
bau einen menüpunkt abrechnung oder so, und liste dort alles auf was man so protokollieren kann. aber nur der system-fall back ist kostenpflichtig. dieser muss separat ausgewiesen werden. also pauschal rechnung würde ich pro seite 0,5€ verrechnen. aber der admin soll den preis festlegen können. der user oder auch der tierarzt muss darüber aber bescheid wissen wann welches modell benützt wird. und explizit zustimmen, dass er die kosten übernehmen wird


--------------------------

"nochmals analysieren" neuer workflow
Seite(n) anzeigen, definierte Documenttypen darstellen, User kann DocType jetzt noch korrigieren. Bestätigen dann Modell auswahl und analyse
wie ein neues Dokument, jedoch sind die Seiten und DOctypes schon bekannt


---------------------------------

für die abrechnung dürfen aber nur erfolgreich analysierte dokumente gezählt werden
und wann und wo wird der fallback bei AI verwendet, bzw. wo kann das der user aktivieren deaktivieren?
beim Dokumentenupload bilder sofort zu dem animal speichern, dann erst analysieren. dann ist der fü rspäter speichern button sinnlos, aber ein hinweis sollte angezeigt werden.

----------------------------------

im top menü zwischen dem profil und exit könnte man eine language auswahl hineingeben
wo kann der user oder tierarzt den AI fallback aktivieren oder deaktivieren, die user sollten auch ein budget-limit einstellen können. nach dem erreichen des limits kann er dokumenten noch scannen/hochladen, diese dokumente werden aber unter nicht analysiert dargestellt.
nicht analysierte bilder sollte man auch für tierärzte freigeben können, falls es einen notfall gibt hätte der arzt halt zugriff auf das bild anstatt den analysierten tabellen.

----------------------------------

billing in € einstellen nicht pro seite

beim mail link verwend die aktuelle domain, also in dem fal vetsucht.oxs.at
mit localhost kann man hier nichts anfagnen

orphand check auf alles, also animal, documents, link, settings, user 


------------------------------------

- wenn fallback, keinki token oder sonstiges gesetzt ist, dann kannst du die ki analyse gleich überspringen und das dokument in nicht analysiert speichern
- system fall back ai api im portal auswählen und konfigurieren.
voll flexibilität, user soll entscheiden ob er seine token oder fallbac und in welcher reihenfolge diese verwendet werden.

-------------------------------------

FAIL tests/api.test.js (11.944 s)
  PAWvax API Tests
    1. Authentication (Auth)
      ✓ 1a. Register — Neuen Account erstellen (170 ms)
      ✓ 1b. Login vor E-Mail-Bestätigung — 403 Forbidden (110 ms)
      ✓ 1c. Verify Email — Bestätigungslink einlösen (28 ms)
      ✓ 1d. Login — Mit Credentials anmelden (neuer Token) (94 ms)
      ✓ 1e. Get Profile — Eigenes Profil abrufen (23 ms)
      ✓ 1f. Patch Profile — Profildaten aktualisieren (21 ms)
      ✓ 1g. Request Verification — Als Tierarzt anmelden (27 ms)
      ✓ 1h. Logout — Abmelden (JWT blacklist) (131 ms)
      ✓ 1i. Forgot Password + Reset Password — Tokenbasierter Passwort-Reset (196 ms)
    2. Animals
      ✓ 2a. Create Animal — Neues Tier hinzufügen (26 ms)
      ✓ 2b. Get All Animals — Alle Tiere abrufen (13 ms)
      ✓ 2c. Get Animal Detail — Tier im Detail abrufen (10 ms)
      ✓ 2d. Update Animal — Tier aktualisieren (22 ms)
      ✓ 2e. Archive Animal — Tier archivieren (16 ms)
      ✓ 2f. Get Archived Animal — Archiviertes Tier sollte sichtbar sein mit is_archived=true (21 ms)
      ✓ 2g. Create Second Animal — Zweites Tier für weitere Tests (26 ms)
      ✓ 2h. Delete Animal with Cascade — Tier mit Dokumenten/Tags löschen (Cascade) (78 ms)
    3. Tags & NFC
      ✓ 3a. Add NFC Tag — NFC-Chip mit Tier verbinden (20 ms)
      ✓ 3b. Get Animal Tags — Alle Tags eines Tieres (13 ms)
      ✓ 3c. Add Barcode Tag — Barcode mit Tier verbinden (16 ms)
      ✓ 3d. Deactivate Tag — Tag deaktivieren (16 ms)
    4. Documents Authorization
      ✓ 4a. Document with guest access should be visible to authenticated users (19 ms)
      ✕ 4b. Existing document without access returns 403 on PATCH (18 ms)
      ✕ 4c. Existing document without access returns 403 on DELETE (37 ms)
      ✓ 4d. Missing document still returns 404 (13 ms)
      ✓ 4e. Vet-only document returns 403 for regular user (41 ms)
    5. Public Scan
      ✓ 5a. Known active tag returns public animal profile (23 ms)
      ✕ 5b. Guest-visible document appears in public scan result (32 ms)
      ✓ 5c. Vet-only document is hidden in public scan result (32 ms)
    6. Sharing
      ✓ 6a. Get Sharing Settings — Freigabe-Settings abrufen (22 ms)
      ✓ 6b. Create Sharing Link — Temporären Link erstellen (18 ms)
      ✓ 6c. Get Active Sharing Links — Liste enthält Link mit Namen (11 ms)
      ✓ 6d. Public: Get Shared Animal — Tier über Link abrufen (OHNE JWT) (19 ms)
      ✓ 6e. Delete Sharing Link — Link löschen (15 ms)
    7. Admin (Nur wenn Admin)
      ✓ 7a. Get Admin Stats — System-Statistiken (8 ms)
      ✓ 7b. Get Audit Log — Audit-Log abrufen (7 ms)
      ✓ 7c. Get Admin Test Results — Letzten Deploy-Teststatus abrufen (7 ms)
    6. DSGVO (Data Protection)
      ✓ 6a. Export Data (Takeout) — Daten als ZIP exportieren (180 ms)
    7. Error Handling
      ✓ 7a. Invalid JWT Token — 401 Unauthorized (29 ms)
      ✓ 7b. Missing Required Field — 400 / 422 Bad Request (25 ms)
      ✓ 7c. Non-existent Animal — 404 Not Found (10 ms)
      ✓ 7d. Invalid Email on Register — 400 Bad Request (9 ms)
      ✓ 7e. Duplicate Email on Register — 409 Conflict (100 ms)
      ✓ 7f. Register mit abweichender Passwort-Bestätigung — 400 Bad Request (9 ms)
    8. Endpoint Smoke Coverage
      ✓ 8a. GET /settings reachable (9 ms)
      ✓ 8b. PATCH /admin/settings returns guarded status (11 ms)
      ✓ 8c. Organizations routes are reachable and guarded (79 ms)
      ✓ 8d. Document pending/retry endpoints are reachable (23 ms)
      ✓ 8e. Transfer and avatar endpoints are reachable (56 ms)
      ✓ 8f. AI models endpoint is reachable (9 ms)
      ✓ 8g. Admin API key endpoints are guarded (18 ms)
      ✓ 8h. Vet API endpoints reject missing API key (34 ms)
    9. Integration Tests (Full Journey)
      ✓ 8a. Journey: Register → Create Animal → Add Tag → Get Animal (242 ms)
  API Health Checks
    ✓ Health Check – API läuft? (8 ms)
    ✓ Health Check – API Proxy Route läuft? (7 ms)
  9. Extended Regression Tests
    ✓ 9a. Archive with valid reason succeeds (17 ms)
    ✓ 9b. Archive with invalid reason returns 400 (24 ms)
    ✓ 9c. Archive requires reason when is_archived=true (28 ms)
    ✓ 9d. Un-archive animal (is_archived=false) requires no reason (57 ms)
    ✓ 9e. Admin stats returns nested animals object (8 ms)
    ✕ 9g. Document PATCH normalizes legacy doc_type medication → medical_product (46 ms)
    ✕ 9h. Document PATCH normalizes legacy doc_type other → general (48 ms)
    ✓ 9i. Document PATCH accepts all 5 canonical doc_types (161 ms)
    ✓ 9j. GET /admin/test-results returns expected shape (11 ms)
    ✓ 9l. Non-admin cannot update secure mail settings (9 ms)
    ✓ 9n. GET /documents/:id returns all stored document pages (53 ms)
    ✓ 9l. Retry analysis uses stored pages instead of empty document image_path (54 ms)
    ✓ 10a. User can request vet verification with notes (24 ms)
    ✓ 10b. User cannot request duplicate vet verification (12 ms)
    ✓ 10c. Verification request stored in database (9 ms)
    ✓ 10d. Admin can approve verification (via database) (17 ms)
  Suite 11: Animal Scan Tracking
    ✓ 11a. GET /animals/recently-scanned returns list (auth required) (15 ms)
    ✓ 11b. POST /animals/:id/track-scan records a scan (21 ms)
    ✓ 11c. GET /animals/recently-scanned shows the tracked animal (13 ms)
    ✓ 11d. GET /animals/:id/recent-scans accessible by owner (11 ms)
    ✓ 11e. POST /animals/:id/unarchive reactivates an archived animal (33 ms)
  Suite 12: Reminders
    ✓ 12a. POST /reminders — Erinnerung erstellen (20 ms)
    ✕ 12b. POST /reminders — Mit document_id (14 ms)
    ✓ 12c. GET /reminders — Aktive Erinnerungen laden (12 ms)
    ✓ 12d. GET /reminders — Sortiert nach due_date aufsteigend (11 ms)
    ✓ 12e. POST /reminders — Fehlendes due_date liefert 400 (9 ms)
    ✓ 12f. POST /reminders — Falsches Datumsformat liefert 400 (10 ms)
    ✓ 12g. PATCH /reminders/:id/dismiss — Erinnerung als erledigt markieren (11 ms)
    ✓ 12h. GET /reminders — Erledigte Erinnerung nicht mehr in Liste (11 ms)
    ✓ 12k. GET /reminders — Unauthenticated gives 401 (8 ms)
  Suite 13: Content-Hash Deduplication
    ✓ 13a. computeRecordHash — vaccination hash is deterministic and 16 chars (2 ms)
    ✓ 13b. computeRecordHash — different batch numbers produce different hashes (2 ms)
    ✓ 13c. computeRecordHash — singleton uses title + document_date + issuer (1 ms)
    ✓ 13d. computeRecordHash — treatment hash uses substance + administered_at (1 ms)
    ✓ 13f. flagDuplicates — second doc with identical record is flagged as duplicate (4 ms)
  Suite 14: Re-Analysis (Phase 4)
    ✓ 14a. POST /documents/:id/re-analyze re-analyzes vaccination tables into structured records (32 ms)
    ✓ 14b. POST /documents/:id/re-analyze re-analyzes treatment tables into structured records (24 ms)
    ✓ 14c. GET /documents/:id/history returns previous analyses in descending version order (14 ms)
    ✓ 14d. Re-analyze endpoint requires authentication (401 for unauth) (15 ms)
    ✓ 14e. Re-analyze requires analysis_status = completed (400) (18 ms)
  Suite 15: Multilingual OCR Prompts
    ✓ 15a. DE vaccination prompt contains German keywords (2 ms)
    ✓ 15b. EN vaccination prompt contains English keywords (1 ms)
    ✓ 15c. DE and EN vaccination prompts are different strings (1 ms)
    ✓ 15d. Unknown language falls back to German prompt (1 ms)
    ✓ 15e. null/undefined language falls back to German prompt (1 ms)
    ✓ 15f. All document types have both DE and EN prompts (1 ms)
    ✓ 15g. DE classification prompt contains German document type names (2 ms)
    ✓ 15h. EN classification prompt contains English document type names (1 ms)
    ✓ 15i. retry-analysis accepts language=de and returns 200 (252 ms)
    ✓ 15j. retry-analysis accepts language=en and returns 200 (255 ms)
    ✓ 15j2. retry-analysis honors requestedDocumentType override (233 ms)
    ✓ 15k. re-analyze accepts language parameter (245 ms)
    ✓ 15k2. re-analyze honors requestedDocumentType override (252 ms)
    ✓ 15k3. retry-analysis rejects unsupported model for selected provider (238 ms)
    ✓ 15l. normalizeDocumentType handles all supported aliases (1 ms)
    ✓ 15m. buildExtractedDocumentData upgrades general OCR payloads with extracted_text vaccinations (3 ms)
    ✓ 15n. parseStructuredModelResponse accepts fenced JSON with surrounding text (3 ms)
    ✓ 15n2. parseStructuredModelResponse normalizes confidence values (1 ms)
    ✓ 15o. buildExtractedDocumentData upgrades vaccination-like general payloads without structured rows (2 ms)
    ✓ 15p. buildExtractedDocumentData exposes confidence and stable quality for structured vaccination rows (1 ms)
  Suite 16: EU Pet Passport + Chip Tag Type
    ✓ 16a. normalizeDocumentType maps passport aliases to pet_passport (1 ms)
    ✓ 16b. DE pet_passport prompt contains passport-specific keywords (1 ms)
    ✓ 16c. EN pet_passport prompt contains passport-specific keywords (1 ms)
    ✓ 16d. PROMPTS contain pet_passport in both languages (1 ms)
    ✓ 16e. create animal accepts chip as tag type (198 ms)
    ✓ 16f. database accepts documents with doc_type pet_passport (25 ms)
    17. Admin: Test Run History
      ✓ 17a. GET /api/admin/test-runs returns 401 without auth (8 ms)
      ✓ 17b. GET /api/admin/test-runs returns 403 for non-admin (181 ms)
      ✓ 17c. GET /api/admin/test-runs returns empty list when no runs exist (297 ms)
      ✓ 17d. GET /api/admin/test-runs/:id returns 404 for unknown run (278 ms)
      ✓ 17e. GET /api/admin/test-runs/:id returns 401 without auth (9 ms)
    18. Database Persistence
      ✓ 18a. Animal data persists across simulated restarts (32 ms)
      ✓ 18b. Schema migrations are idempotent (re-running init does not break data) (50 ms)
  Suite 19: JWT Refresh
    ✓ 19a. POST /auth/refresh — issues new token with valid old token (12 ms)
    ✓ 19b. Refreshed token can be used for authenticated requests (19 ms)
    ✓ 19c. Refresh without token returns 401 (8 ms)
    ✓ 19d. Refresh with invalid token returns 401 (9 ms)
    ✓ 19e. Refreshed token reflects current role from DB (38 ms)
  Suite 20: Account Deletion + Cascade
    ✓ 20a. DELETE /accounts/me — removes account and returns 204 (211 ms)
    ✓ 20b. Token is invalid after account deletion (207 ms)
    ✓ 20c. Cascade — animals owned by deleted account are removed (244 ms)
    ✓ 20d. Last admin cannot delete their account (878 ms)
  Suite 21: Mail Settings Endpoints
    ✓ 21a. GET /admin/settings/mail-status — returns configured: false when mail not set up (8 ms)
    ✓ 21b. GET /admin/settings/mail-status — requires admin role (201 ms)
    ✓ 21c. GET /admin/settings/mail-status — requires auth (10 ms)
    ✓ 21d. POST /admin/settings/test-mail — returns 400 when mail not configured (12 ms)
    ✓ 21e. POST /admin/settings/test-mail — requires admin role (203 ms)
    ✓ 21f. PATCH /admin/settings — saves public settings (app_name) (17 ms)
    ✓ 21g. GET /settings (public) — returns public settings without secrets (9 ms)
  Suite 22: Billing Endpoints
    ✓ 22a. GET /billing/me — returns correct structure (17 ms)
    ✓ 22b. GET /billing/me — totals and cost are correct (12 ms)
    ✓ 22c. GET /billing/me — consentAcceptedAt is null before consent (10 ms)
    ✓ 22d. GET /billing/me — 401 without token (6 ms)
    ✓ 22e. POST /billing/consent — returns { ok: true } (16 ms)
    ✓ 22f. GET /billing/me — consentAcceptedAt is set after consent (12 ms)
    ✓ 22g. POST /billing/consent — 401 without token (8 ms)
    ✓ 22h. GET /admin/billing — 200 as admin, correct structure (17 ms)
    ✓ 22i. GET /admin/billing — per-account aggregates are correct (11 ms)
    ✓ 22j. GET /admin/billing — 403 for regular user (12 ms)
    ✓ 22k. GET /admin/billing — 401 without token (7 ms)
    ✓ 22l. GET /billing/me — entries contain expected fields (15 ms)

  ● PAWvax API Tests › 4. Documents Authorization › 4b. Existing document without access returns 403 on PATCH

    expect(received).toBe(expected) // Object.is equality

    Expected: 403
    Received: 404

      537 |         doc_type: 'vaccination'
      538 |       })
    > 539 |       expect(status).toBe(403)
          |                      ^
      540 |     })
      541 |
      542 |     test('4c. Existing document without access returns 403 on DELETE', async () => {

      at Object.toBe (tests/api.test.js:539:22)

  ● PAWvax API Tests › 4. Documents Authorization › 4c. Existing document without access returns 403 on DELETE

    expect(received).toBe(expected) // Object.is equality

    Expected: 403
    Received: 404

      544 |
      545 |       const { status } = await apiCallWithToken(foreignToken, 'DELETE', `/documents/${anotherDocId}`)
    > 546 |       expect(status).toBe(403)
          |                      ^
      547 |     })
      548 |
      549 |     test('4d. Missing document still returns 404', async () => {

      at Object.toBe (tests/api.test.js:546:22)

  ● PAWvax API Tests › 5. Public Scan › 5b. Guest-visible document appears in public scan result

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      599 |       expect(response.status).toBe(200)
      600 |       expect(Array.isArray(data.documents)).toBe(true)
    > 601 |       expect(data.documents.some(d => d.id === visibleDocId)).toBe(true)
          |                                                               ^
      602 |     })
      603 |
      604 |     test('5c. Vet-only document is hidden in public scan result', async () => {

      at Object.toBe (tests/api.test.js:601:63)

  ● 9. Extended Regression Tests › 9g. Document PATCH normalizes legacy doc_type medication → medical_product

    expect(received).toBe(expected) // Object.is equality

    Expected: 200
    Received: 404

      1124 |     // Verify normalization via GET
      1125 |     const { status: getStatus, data: getDoc } = await apiCallWithToken(token9, 'GET', `/documents/${docId}`)
    > 1126 |     expect(getStatus).toBe(200)
           |                       ^
      1127 |     expect(getDoc.doc_type).toBe('medical_product')
      1128 |   })
      1129 |

      at Object.toBe (tests/api.test.js:1126:23)

  ● 9. Extended Regression Tests › 9h. Document PATCH normalizes legacy doc_type other → general

    expect(received).toBe(expected) // Object.is equality

    Expected: 200
    Received: 404

      1136 |     // Verify normalization via GET
      1137 |     const { status: getStatus, data: getDoc } = await apiCallWithToken(token9, 'GET', `/documents/${docId}`)
    > 1138 |     expect(getStatus).toBe(200)
           |                       ^
      1139 |     expect(getDoc.doc_type).toBe('general')
      1140 |   })
      1141 |

      at Object.toBe (tests/api.test.js:1138:23)

  ● Suite 12: Reminders › 12b. POST /reminders — Mit document_id

    expect(received).toBe(expected) // Object.is equality

    Expected: 201
    Received: 400

      1465 |       due_date: '2027-06-01'
      1466 |     })
    > 1467 |     expect(status).toBe(201)
           |                    ^
      1468 |     expect(data.document_id).toBe(documentId12)
      1469 |   })
      1470 |

      at Object.toBe (tests/api.test.js:1467:20)

Test Suites: 1 failed, 1 total
Tests:       6 failed, 150 passed, 156 total
Snapshots:   0 total
Time:        12.056 s
Ran all test suites.
Test results written to: ../pawvax-api-tests-INEblC/jest-results.json

Jest has detected the following 1 open handle potentially keeping Jest from exiting:

  ●  TCPWRAP

      59 | async function getTestDb() {
      60 |   const client = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax_test' })
    > 61 |   await client.connect()
         |                ^
      62 |   return client
      63 | }
      64 |

      at Connection.connect (node_modules/pg/lib/connection.js:42:17)
      at Client._connect (node_modules/pg/lib/client.js:161:11)
      at node_modules/pg/lib/client.js:215:12
      at Client.connect (node_modules/pg/lib/client.js:214:12)
      at connect (tests/api.test.js:61:16)
      at Object.getTestDb (tests/api.test.js:1618:18)

[test-runner] Results saved: 150/156 passed
Persisted deploy test results (failed, 150/156 passed)
[root@alma pawvax]# dddööööäääüü


---------------------------

