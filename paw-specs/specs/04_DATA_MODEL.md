# 04 - Data Model & Persistence

## Primary Entities

### User
- `id` (UUID), `email`, `password_hash`, `role`, `name`, `created_at`.
- Roles: `guest`, `user`, `vet`, `authority`, `admin`.

### Animal (Pet)
- `id` (UUID), `owner_id`, `name`, `species`, `breed`, `gender`, `birth_date`, `microchip_id`, `image_url`.

### Vaccination
- `id` (UUID), `animal_id`, `type` (e.g., Rabies), `date`, `valid_until`, `batch_number`, `vet_id` (optional), `is_verified` (boolean).

### Document
- `id` (UUID), `animal_id`, `file_path`, `document_type` (e.g., Passport, Lab Result), `ocr_result` (JSONB), `status` (pending, processed, error).

### Audit Log
- `id` (Serial), `user_id`, `action`, `entity_type`, `entity_id`, `payload` (JSON), `ip_address`, `timestamp`.

### Share Token
- `id` (UUID), `animal_id`, `token`, `expiry`, `access_level` (basic, full, medical).

## Storage Strategy
- **Relational Data**: PostgreSQL.
- **Images/Files**: Local storage mapped via Docker volumes (moving to S3-compatible in future).
- **AI Metadata**: Extracted JSON is stored directly in the `documents` table for quick retrieval and UI mapping.
