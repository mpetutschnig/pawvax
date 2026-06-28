# 12 - Compliance & Data Privacy (GDPR/DSGVO)

## GDPR Principles
1. **Right to Erasure**: Implement a "Delete My Account" flow that scrubs all PII from the DB and filesystem.
2. **Data Portability**: Allow users to export their pet health records as a structured JSON or PDF.
3. **Purpose Limitation**: Only store data necessary for the pet health record.

## Security Standards
- **Encryption at Rest**: Ensure DB and file volumes are encrypted (Infrastructure level).
- **Encryption in Transit**: TLS 1.3 mandatory for all connections.

## Legal Transparency
- Integrated Terms of Service (ToS) and Privacy Policy templates.
- Explicit consent for AI processing of medical documents.
