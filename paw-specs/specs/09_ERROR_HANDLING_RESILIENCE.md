# 09 - Enterprise Error Handling & Resilience

## Core Philosophy
Every error must be caught, categorized, and logged. The UI must never crash or show a "white screen of death".

## Backend Error Handling
1. **Global Error Handler**: Every route must be wrapped in a centralized Fastify error handler.
2. **Error Codes**: Use standard internal error codes (e.g., `ERR_AUTH_EXPIRED`, `ERR_OCR_TIMEOUT`, `ERR_INSUFFICIENT_PERMISSIONS`).
3. **Graceful Degradation**: If the Gemini AI is down, the system must allow manual entry immediately without blocking the user.

## Frontend Resilience
1. **React Error Boundaries**: Wrap every major page and complex component in an `ErrorBoundary`.
2. **Offline Mode**: Since this is a PWA, use Service Workers to cache critical assets. Show a "Working Offline" banner.
3. **Toast Notifications**: Use non-blocking, accessible toast notifications for all background actions.

## Retry Policies
- Implement exponential backoff for failed AI analysis and file uploads.
