# 03 - Architecture Design

## System Overview
The system follows a **Modular Monolith** pattern on the backend and a **Single Page Application (SPA)** architecture on the frontend.

## Communication Patterns
1. **REST API**: Used for standard CRUD operations (Pets, Vaccinations, User Profile).
2. **WebSockets**: Crucial for the **Document Upload & AI Pipeline**. 
   - Handles multi-page binary image uploads.
   - Provides real-time status updates from the OCR process.
3. **Public Access Routes**: Specialized unauthenticated routes for QR/NFC scanning (`/s/:shareToken`).

## Backend Structure (`server/src/`)
- `/routes`: Endpoint definitions grouped by domain (auth, pets, documents, admin).
- `/services`: Business logic (Audit logging, OCR, Email - if applicable).
- `/ws`: WebSocket handlers for real-time features.
- `/db`: Database schemas, migrations, and connection logic.
- `/hooks`: Fastify hooks for authentication and audit pre-processing.

## Frontend Structure (`pwa/src/`)
- `/api`: API clients (REST and WS).
- `/components`: Reusable UI components (Shadcn + Custom).
- `/pages`: View components mapped to routes.
- `/hooks`: Custom React hooks (NFC, Barcode, Global state).
- `/locales`: Translation JSON files.
- `/utils`: Helper functions for date formatting, validation, and AI result processing.
