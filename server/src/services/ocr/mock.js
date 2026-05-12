import { basename } from 'path'

export function analyzeWithMockOcr(imagePath, onProgress, language = 'de', forcedDocumentType = null) {
  if (onProgress) onProgress(`Using mock OCR... (language: ${language.toUpperCase()})`)

  const file = basename(imagePath).toLowerCase()
  const mockResult = (data) => ({
    provider: 'mock-ocr',
    data: forcedDocumentType ? { ...data, type: forcedDocumentType } : data
  })

  if (file.includes('passport') || file.includes('heimtierausweis') || file.includes('transponder')) {
    return Promise.resolve(mockResult({
      type: 'pet_passport',
      title: language === 'en' ? 'EU Pet Passport - Identification' : 'EU-Heimtierausweis - Identifikation',
      document_date: '2021-08-30',
      summary: language === 'en' ? 'Microchip and passport data extracted.' : 'Mikrochip- und Ausweisdaten erkannt.',
      passport_number: '040-0708638',
      section_type: 'identification',
      animal: { name: 'Funny Russell Ranch OUT OF CONTROL', species: 'dog', breed: 'Parson Russell Terrier', sex: 'Male', birthdate: '2021-07-16', color: 'brown & white', notable_features: null },
      identification: { chip_code: '040097200000276', chip_date: '2021-08-30', chip_location: 'linke Halsseite', tattoo_code: null, tattoo_date: null, tattoo_location: null },
      issuing_authority: null, breeder: null, owner: null,
      suggested_tags: ['EU Pet Passport', 'Microchip', '040097200000276']
    }))
  }

  if (file.includes('treatment') || file.includes('behandlung') || file.includes('wurm')) {
    return Promise.resolve(mockResult({
      type: 'treatment',
      title: 'Treatment Protocol - Deworming',
      document_date: '2024-03-15',
      summary: '2 treatment entries detected',
      animal: { name: 'Mocky', species: 'dog', breed: 'Mixed', birthdate: '2020-01-10' },
      treatments: [
        { substance: 'Milbemax', administered_at: '2024-03-15', dosage: '1 Tablet', vet_name: 'Dr. Mock', veterinarian: { name: 'Dr. Mock', practice: 'Kleintierpraxis Mock', address: 'Mockstadt', phone: '0000/123456' }, active_ingredient: 'Milbemycin oxime / Praziquantel', treatment_subtype: 'echinococcus', next_due: '2024-06-15', notes: 'Table row 1' },
        { substance: 'Droncit', administered_at: '2024-03-15', dosage: '0.5 Tablet', vet_name: 'Dr. Mock', veterinarian: { name: 'Dr. Mock', practice: 'Kleintierpraxis Mock', address: 'Mockstadt', phone: '0000/123456' }, active_ingredient: 'Praziquantel', treatment_subtype: 'parasite', next_due: null, notes: 'Table row 2' }
      ],
      suggested_tags: ['Deworming', 'Milbemax']
    }))
  }

  if (file.includes('vaccination') || file.includes('impf') || file.includes('vax')) {
    return Promise.resolve(mockResult({
      type: 'vaccination',
      title: 'Vaccination Record - Mocky',
      document_date: '2021-09-06',
      summary: '2 vaccinations detected',
      animal: { name: 'Mocky', species: 'dog', breed: 'Mixed', birthdate: '2020-01-10' },
      vaccinations: [
        { vaccine_name: 'DHLPPi', administration_date: '2021-09-06', valid_from: '2021-09-06', valid_until: '2024-09-06', batch_number: 'BATCH-001', expiry_date_of_vial: '2022-11-30', manufacturer: 'Boehringer', components: ['D', 'H', 'L', 'P', 'Pi'], active_substances: ['Distemper', 'Parvovirus'], vet_name: 'Dr. Mock', veterinarian: { name: 'Dr. Mock', practice: 'Mock Vet Clinic', address: 'Mock Street 1', phone: '0000/123456' }, target_disease: 'Distemper, Parvo', purpose: 'Distemper, Hepatitis, Leptospirosis, Parvovirus, Parainfluenza' },
        { vaccine_name: 'Tollwut', administration_date: '2021-09-06', valid_from: '2021-09-28', valid_until: '2024-09-06', batch_number: 'BATCH-002', expiry_date_of_vial: '2022-10-31', manufacturer: 'MSD', components: ['Rabies'], active_substances: ['Rabies virus'], vet_name: 'Dr. Mock', veterinarian: { name: 'Dr. Mock', practice: 'Mock Vet Clinic', address: 'Mock Street 1', phone: '0000/123456' }, target_disease: 'Rabies', purpose: 'Rabies' }
      ],
      suggested_tags: ['DHLPPi', 'Rabies']
    }))
  }

  return Promise.resolve(mockResult({
    type: 'general',
    title: 'Mock Document',
    document_date: '2024-01-01',
    summary: 'Mock OCR result',
    raw_text: 'Mock OCR text',
    suggested_tags: ['Mock']
  }))
}
