import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function TosPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const [appName, setAppName] = useState('')
  const isDe = i18n.language.startsWith('de')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setAppName(d.app_name || ''))
      .catch(() => {})
  }, [])

  const name = appName || 'App'

  return (
    <div style={{ maxWidth: 720, width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: 'var(--space-4)', paddingBottom: 'var(--space-8)' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <ArrowLeft size={18} /> {isDe ? 'Zurück' : 'Back'}
        </button>
      </div>

      {isDe ? <TosDe name={name} /> : <TosEn name={name} />}
    </div>
  )
}

function TosDe({ name }: { name: string }) {
  return (
    <div className="tos-content">
      <h1>Allgemeine Geschäftsbedingungen (AGB) — {name}</h1>
      <p className="text-muted"><strong>Stand:</strong> Mai 2026</p>

      <h2>1. Geltungsbereich</h2>
      <p>Diese Nutzungsbedingungen regeln die Nutzung der {name}-Plattform (Progressive Web App und API, im Folgenden „Dienst"). Mit der Registrierung eines Kontos oder der Nutzung des Dienstes erklären Sie sich mit diesen Bedingungen einverstanden.</p>

      <h2>2. Leistungsbeschreibung</h2>
      <p>{name} ist eine digitale Plattform zur Verwaltung von Tiergesundheitsdaten. Der Dienst ermöglicht:</p>
      <ul>
        <li>das Hochladen und Verwalten von Impfpässen, Tierarztberichten und sonstigen Dokumenten</li>
        <li>die KI-gestützte Analyse hochgeladener Dokumente</li>
        <li>die rollenbasierte Freigabe von Daten an Tierärzte, Behörden und Dritte</li>
        <li>die Erstellung von Sprach-Notizen mit KI-Transkription</li>
        <li>den Zugriff auf öffentliche Tierprofile via NFC/QR-Code ohne Anmeldung</li>
      </ul>

      <h2>3. Registrierung und Konto</h2>
      <ul>
        <li>Die Nutzung erfordert ein Nutzerkonto (Mindestalter: 18 Jahre).</li>
        <li>Sie sind verpflichtet, wahrheitsgemäße Angaben zu machen und Ihre Zugangsdaten geheim zu halten.</li>
        <li>Sie sind für alle Aktivitäten verantwortlich, die über Ihr Konto stattfinden.</li>
        <li>{name} behält sich vor, Konten bei Verdacht auf Missbrauch zu sperren oder zu löschen.</li>
      </ul>

      <h2>4. Pflichten der Nutzenden</h2>
      <p>Sie verpflichten sich:</p>
      <ul>
        <li>den Dienst nicht für rechtswidrige Zwecke zu nutzen;</li>
        <li>keine falschen, irreführenden oder gefälschten Dokumente hochzuladen;</li>
        <li>keine Daten Dritter ohne deren Einwilligung einzutragen;</li>
        <li>die Rechte anderer Nutzer und Tierbesitzer zu respektieren;</li>
        <li>keine automatisierten Zugriffe (Scraping, Bots) ohne vorherige schriftliche Genehmigung durchzuführen.</li>
      </ul>

      <h2>5. KI-Analyse und medizinischer Haftungsausschluss</h2>
      <p><strong>Die KI-gestützte Dokumentenanalyse dient ausschließlich der informativen Darstellung und ersetzt keine tierärztliche Diagnose oder Behandlungsempfehlung.</strong></p>
      <ul>
        <li>Analyseergebnisse können unvollständig, fehlerhaft oder ungenau sein.</li>
        <li>{name} übernimmt keine Haftung für Entscheidungen, die auf Basis von KI-Analyseergebnissen getroffen werden.</li>
        <li>Im Zweifelsfall ist stets ein zugelassener Tierarzt zu konsultieren.</li>
        <li>{name} ist kein zertifiziertes Medizinprodukt nach EU-MDR oder vergleichbaren Regelwerken.</li>
      </ul>
      <p>Externe KI-Anbieter (Google Gemini, Anthropic Claude, OpenAI) unterliegen deren eigenen Nutzungsbedingungen und Datenschutzrichtlinien.</p>

      <h2>6. Tierärztliche Verifikation</h2>
      <ul>
        <li>Die Rollenzuweisung „Tierarzt" oder „Behörde" erfolgt durch manuelle Überprüfung durch {name}-Administratoren.</li>
        <li>{name} übernimmt keine Gewähr für die Echtheit der von Nutzern eingereichten Nachweise.</li>
        <li>Die Verifikation begründet keinen Anspruch auf dauerhafte Beibehaltung der Rolle.</li>
        <li>{name} behält sich vor, Verifikationen zu widerrufen, wenn die Voraussetzungen nicht mehr erfüllt sind.</li>
      </ul>

      <h2>7. Inhalt und Urheberrecht</h2>
      <ul>
        <li>Sie behalten das Eigentum an den Inhalten, die Sie hochladen (Dokumente, Fotos, Sprachaufnahmen).</li>
        <li>Sie räumen {name} eine beschränkte, nicht-exklusive Lizenz ein, diese Inhalte zum Zweck der Leistungserbringung zu verarbeiten und zu speichern.</li>
        <li>Sie versichern, dass Sie berechtigt sind, die hochgeladenen Inhalte zu teilen, und keine Rechte Dritter verletzen.</li>
      </ul>

      <h2>8. Freigabe und Datenweitergabe</h2>
      <ul>
        <li>Sie entscheiden selbst, welche Daten Sie für welche Rollen sichtbar machen.</li>
        <li>{name} gibt Ihre Daten nicht ohne Ihre Einwilligung an Dritte weiter, außer dies ist gesetzlich vorgeschrieben.</li>
        <li>Öffentlich freigegebene Daten (Gastrolle, öffentliche Links) sind für jeden abrufbar, der den entsprechenden Link oder NFC-Tag besitzt.</li>
      </ul>

      <h2>9. Datenschutz (DSGVO)</h2>
      <p>{name} verarbeitet personenbezogene Daten gemäß der Datenschutz-Grundverordnung (DSGVO/EU 2016/679).</p>
      <p>Ihre Rechte als betroffene Person:</p>
      <ul>
        <li><strong>Auskunft (Art. 15 DSGVO):</strong> Einsicht in Ihre gespeicherten Daten</li>
        <li><strong>Berichtigung (Art. 16 DSGVO):</strong> Korrektur falscher Daten</li>
        <li><strong>Löschung (Art. 17 DSGVO):</strong> Kontolöschung inklusive aller zugehörigen Daten</li>
        <li><strong>Datenübertragbarkeit (Art. 20 DSGVO):</strong> Export aller Daten als ZIP-Datei (Profil → Daten exportieren)</li>
        <li><strong>Widerspruch (Art. 21 DSGVO):</strong> Widerspruch gegen bestimmte Verarbeitungsvorgänge</li>
      </ul>

      <h2>10. Abrechnung und KI-Kosten</h2>
      <ul>
        <li>Die Nutzung eigener API-Schlüssel (Gemini, Claude, OpenAI) ist für {name} kostenneutral.</li>
        <li>Die Nutzung des System-KI-Fallbacks ist kostenpflichtig (Preis pro Seite, einsehbar unter Admin → Einstellungen).</li>
        <li>Die Abrechnung des System-Fallbacks erfordert Ihre ausdrückliche Zustimmung.</li>
        <li>Sie können ein Budgetlimit festlegen; bei Überschreitung wird die automatische Analyse pausiert.</li>
      </ul>

      <h2>11. Verfügbarkeit und Gewährleistung</h2>
      <p>{name} wird „wie besehen" (as-is) bereitgestellt. Es wird keine garantierte Verfügbarkeit zugesichert. Für Datenverluste durch technische Fehler haftet {name} nur bei grober Fahrlässigkeit oder Vorsatz.</p>

      <h2>12. Haftungsbeschränkung</h2>
      <p>Im gesetzlich zulässigen Rahmen haftet {name} nicht für mittelbare Schäden, entgangenen Gewinn, Datenverlust, Handlungen Dritter mit Zugriff auf freigegebene Daten oder Fehler in KI-generierten Analyseergebnissen.</p>

      <h2>13. Laufzeit und Kündigung</h2>
      <ul>
        <li>Das Nutzungsverhältnis ist auf unbestimmte Zeit geschlossen.</li>
        <li>Sie können Ihr Konto jederzeit unter Profil → Konto löschen beenden.</li>
        <li>{name} kann das Nutzungsverhältnis bei schwerwiegenden Verstößen fristlos kündigen.</li>
        <li>Bei Kündigung werden alle Ihre Daten nach 30 Tagen gelöscht.</li>
      </ul>

      <h2>14. Änderungen dieser Bedingungen</h2>
      <p>{name} behält sich vor, diese Bedingungen anzupassen. Wesentliche Änderungen werden per E-Mail oder In-App-Benachrichtigung mitgeteilt. Die weitere Nutzung gilt als Zustimmung.</p>

      <h2>15. Anwendbares Recht und Gerichtsstand</h2>
      <p>Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand ist, soweit gesetzlich zulässig, Graz, Österreich.</p>
    </div>
  )
}

function TosEn({ name }: { name: string }) {
  return (
    <div className="tos-content">
      <h1>Terms and Conditions — {name}</h1>
      <p className="text-muted"><strong>Effective date:</strong> May 2026</p>

      <h2>1. Scope</h2>
      <p>These Terms and Conditions govern your use of the {name} platform (Progressive Web App and API, hereinafter "Service"). By creating an account or using the Service you agree to these terms.</p>

      <h2>2. Service Description</h2>
      <p>{name} is a digital platform for managing animal health records. The Service provides:</p>
      <ul>
        <li>Uploading and managing vaccination certificates, veterinary reports, and other documents</li>
        <li>AI-powered analysis of uploaded documents</li>
        <li>Role-based sharing of data with veterinarians, authorities, and third parties</li>
        <li>Voice memos with AI transcription and structuring</li>
        <li>Public animal profile access via NFC/QR code without login</li>
      </ul>

      <h2>3. Account Registration</h2>
      <ul>
        <li>Use of the Service requires a user account (minimum age: 18 years).</li>
        <li>You must provide accurate information and keep your credentials confidential.</li>
        <li>You are responsible for all activity under your account.</li>
        <li>{name} reserves the right to suspend or delete accounts in cases of suspected misuse.</li>
      </ul>

      <h2>4. User Obligations</h2>
      <p>You agree:</p>
      <ul>
        <li>not to use the Service for any unlawful purpose;</li>
        <li>not to upload false, misleading, or forged documents;</li>
        <li>not to enter data about third parties without their consent;</li>
        <li>to respect the rights of other users and animal owners;</li>
        <li>not to conduct automated access (scraping, bots) without prior written authorization.</li>
      </ul>

      <h2>5. AI Analysis &amp; Medical Disclaimer</h2>
      <p><strong>AI-powered document analysis is provided for informational purposes only and does not replace professional veterinary diagnosis or treatment advice.</strong></p>
      <ul>
        <li>Analysis results may be incomplete, incorrect, or inaccurate.</li>
        <li>{name} accepts no liability for decisions made based on AI-generated analysis.</li>
        <li>When in doubt, always consult a licensed veterinarian.</li>
        <li>{name} is not a certified medical device under EU-MDR or equivalent regulations.</li>
      </ul>
      <p>External AI providers (Google Gemini, Anthropic Claude, OpenAI) are subject to their own terms of service and privacy policies.</p>

      <h2>6. Veterinary Verification</h2>
      <ul>
        <li>The "vet" and "authority" roles are granted through manual review by {name} administrators.</li>
        <li>{name} does not guarantee the authenticity of documents submitted for verification.</li>
        <li>Verification does not create an entitlement to permanent role status.</li>
        <li>{name} reserves the right to revoke verification if conditions are no longer met.</li>
      </ul>

      <h2>7. Content &amp; Intellectual Property</h2>
      <ul>
        <li>You retain ownership of content you upload (documents, photos, voice recordings).</li>
        <li>You grant {name} a limited, non-exclusive license to process and store this content for the purpose of providing the Service.</li>
        <li>You warrant that you have the right to share the uploaded content and that it does not infringe third-party rights.</li>
      </ul>

      <h2>8. Sharing &amp; Data Disclosure</h2>
      <ul>
        <li>You control which data is visible to which roles.</li>
        <li>{name} does not share your data with third parties without your consent, unless required by law.</li>
        <li>Data made publicly available (guest role, public share links) is accessible to anyone who holds the corresponding link or NFC tag.</li>
      </ul>

      <h2>9. Data Protection (GDPR)</h2>
      <p>{name} processes personal data in accordance with the General Data Protection Regulation (GDPR/EU 2016/679).</p>
      <p>Your rights as a data subject:</p>
      <ul>
        <li><strong>Access (Art. 15 GDPR):</strong> View your stored data</li>
        <li><strong>Rectification (Art. 16 GDPR):</strong> Correct inaccurate data</li>
        <li><strong>Erasure (Art. 17 GDPR):</strong> Delete your account and all associated data</li>
        <li><strong>Data portability (Art. 20 GDPR):</strong> Export all data as a ZIP file (Profile → Export data)</li>
        <li><strong>Objection (Art. 21 GDPR):</strong> Object to specific processing activities</li>
      </ul>

      <h2>10. Billing &amp; AI Costs</h2>
      <ul>
        <li>Using your own API keys (Gemini, Claude, OpenAI) incurs no charge from {name}.</li>
        <li>Using the system AI fallback is a paid feature, billed per analyzed page (current price in Admin → Settings).</li>
        <li>System fallback billing requires your explicit consent.</li>
        <li>You may set a budget cap; automatic analysis pauses when the limit is reached.</li>
      </ul>

      <h2>11. Availability &amp; Warranties</h2>
      <p>{name} is provided "as is" without guaranteed uptime or availability. {name} is liable for data loss only in cases of gross negligence or willful misconduct.</p>

      <h2>12. Limitation of Liability</h2>
      <p>To the extent permitted by law, {name} is not liable for indirect damages, lost profits, data loss, actions of third parties with access to shared data, or errors in AI-generated analysis results.</p>

      <h2>13. Term &amp; Termination</h2>
      <ul>
        <li>The agreement is for an indefinite term.</li>
        <li>You may terminate your account at any time under Profile → Delete account.</li>
        <li>{name} may terminate the agreement immediately for serious breaches of these terms.</li>
        <li>Upon termination, all your data will be deleted after a 30-day transition period.</li>
      </ul>

      <h2>14. Changes to These Terms</h2>
      <p>{name} reserves the right to update these Terms and Conditions. Material changes will be communicated by email or in-app notification. Continued use of the Service after changes take effect constitutes acceptance.</p>

      <h2>15. Governing Law &amp; Jurisdiction</h2>
      <p>These terms are governed by Austrian law, excluding the UN Convention on Contracts for the International Sale of Goods (CISG). Jurisdiction is, to the extent permitted by law, Graz, Austria.</p>
    </div>
  )
}
