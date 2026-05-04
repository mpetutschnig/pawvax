export function normalizeVaccinationRecord(record: any) {
  const raw = record && typeof record === 'object' ? record : {}
  const veterinarian = raw.veterinarian && typeof raw.veterinarian === 'object' ? raw.veterinarian : {}

  return {
    vaccineName: raw.vaccine_name ?? raw.vaccine ?? '',
    administrationDate: raw.vaccination_date ?? raw.administration_date ?? raw.date ?? '',
    validUntil: raw.valid_until ?? raw.nextDue ?? '',
    expiryDate: raw.expiry_date ?? raw.expiry_date_of_vial ?? '',
    batchNumber: raw.batch_number ?? raw.batch ?? '',
    manufacturer: raw.manufacturer ?? '',
    targetDisease: raw.target_disease ?? raw.group ?? '',
    purpose: raw.purpose ?? '',
    components: Array.isArray(raw.components) ? raw.components : [],
    veterinarianName: veterinarian.name ?? raw.vet_name ?? '',
    veterinarianClinic: veterinarian.clinic ?? veterinarian.practice ?? '',
    veterinarianAddress: veterinarian.address ?? '',
    veterinarianContact: veterinarian.contact ?? ''
  }
}