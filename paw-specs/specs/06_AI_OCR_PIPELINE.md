# 06 - AI OCR Pipeline (Gemini Vision)

## Overview
The heart of PAW is the automated extraction of medical data from photos.

## The WebSocket Flow
1. Client opens WS connection to `/ws/upload`.
2. Client sends `START` metadata (animalId, documentType).
3. Client sends binary chunks of images (supports multi-page).
4. Server saves files and triggers `Gemini Service`.
5. Server streams status updates: `UPLOADING` -> `ANALYZING` -> `COMPLETED`.

## Gemini Integration
- **Model**: `gemini-1.5-flash-lite` (optimized for speed/cost).
- **Prompting**: Structured prompts requiring JSON output. 
- **Extracted Fields**:
  - Vaccination Name/Type.
  - Date of administration.
  - Validity date.
  - Batch/Lot number.
  - Vet/Clinic name (from stamps).

## Verification Loop
- AI results are marked as `pending_verification`.
- The User or a Vet must confirm the AI-extracted data before it becomes a formal record.
- Feedback loop: Corrections are logged to improve future prompt engineering.
