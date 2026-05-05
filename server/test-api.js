/**
 * PAW Local E2E API Tests
 * 
 * Ausführung: 
 * 1. Server starten (npm run dev)
 * 2. Neues Terminal öffnen und dieses Skript ausführen: node test-api.js
 */

const BASE_URL = 'http://localhost:3000';
let token = '';
let animalId = '';
let tagId = `TEST-TAG-${Date.now()}`;

async function request(endpoint, method = 'GET', body = null, useAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (useAuth && token) headers['Authorization'] = `Bearer ${token}`;
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FEHLER: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ERFOLG: ${message}`);
}

async function runTests() {
  console.log('🚀 Starte automatisierte PAW API Tests auf localhost:3000...\n');

  // 1. Health & Settings
  let res = await request('/health', 'GET', null, false);
  assert(res.status === 200, 'Server Healthcheck läuft');

  res = await request('/api/health', 'GET', null, false);
  assert(res.status === 200, 'Proxy-kompatibler API-Healthcheck läuft');
  
  res = await request('/api/settings', 'GET', null, false);
  assert(res.status === 200 && res.data.app_name, 'Public Settings Route erreichbar');

  // 2. Auth (Registrierung & Login)
  const testEmail = `testuser_${Date.now()}@example.com`;
  res = await request('/api/auth/register', 'POST', {
    name: 'Test User',
    email: testEmail,
    password: 'password123'
  }, false);
  assert(res.status === 201 && res.data.token, 'Benutzerregistrierung erfolgreich');
  token = res.data.token;

  // 3. Tier anlegen
  res = await request('/api/animals', 'POST', {
    name: 'TestHund',
    species: 'dog',
    breed: 'Pudel',
    tagId: tagId,
    tagType: 'barcode'
  });
  assert(res.status === 201 && res.data.id, 'Neues Tier erfolgreich angelegt');
  animalId = res.data.id;

  // 4. Tierliste abrufen
  res = await request('/api/animals', 'GET');
  assert(res.status === 200 && Array.isArray(res.data) && res.data.length > 0, 'Tierliste des Benutzers erfolgreich abgerufen');

  // 5. Tier bearbeiten
  res = await request(`/api/animals/${animalId}`, 'PATCH', {
    breed: 'Zwergpudel'
  });
  assert(res.status === 200 && res.data.breed === 'Zwergpudel', 'Tierdaten erfolgreich aktualisiert');

  // 6. NFC/Barcode Tag prüfen
  res = await request(`/api/animals/${animalId}/tags`, 'GET');
  assert(res.status === 200 && res.data.some(t => t.tag_id === tagId), 'Tag ist dem Tier korrekt zugeordnet');

  // 7. Freigabe (Sharing) setzen
  res = await request(`/api/animals/${animalId}/sharing`, 'PUT', {
    role: 'readonly',
    share_vaccination: 1,
    share_contact: 1
  });
  assert(res.status === 200 && res.data.share_contact === 1, 'Freigabe-Einstellungen aktualisiert');

  // 8. Öffentlichen Scan simulieren (ohne Token)
  res = await request(`/api/public/tag/${tagId}`, 'GET', null, false);
  assert(res.status === 200 && res.data.is_public === true, 'Öffentlicher Scan erfolgreich (Tier gefunden)');
  assert(res.data.contact && res.data.contact.name === 'Test User', 'Freigegebene Kontaktdaten sind im Public Scan sichtbar');

  // 9. Dokument-Analyse (Mock/Check)
  // Echter Upload braucht Multipart/WS, wir testen hier nur den Pending-Abruf
  res = await request(`/api/animals/${animalId}/documents/pending`, 'GET');
  assert(res.status === 200 && Array.isArray(res.data), 'Pending-Documents Endpunkt läuft');

  // 10. Tier löschen (Clean Up)
  res = await request(`/api/animals/${animalId}`, 'DELETE');
  assert(res.status === 204, 'Tier erfolgreich gelöscht (Clean Up)');

  // 11. Tier ist wirklich weg
  res = await request(`/api/public/tag/${tagId}`, 'GET', null, false);
  assert(res.status === 404, 'Tag ist nach dem Löschen des Tiers nicht mehr findbar');

  console.log('\n🎉 Alle lokalen API-Tests wurden erfolgreich abgeschlossen!');
}

runTests().catch(err => {
  console.error('Test-Ausführung fehlgeschlagen:', err);
});
