# 10 - Monitoring, Observability & Analytics

## Logging Strategy
1. **Application Logs**: Standardized JSON logs for easy ingestion (e.g., by ELK or Grafana Loki).
2. **Audit Logs vs. App Logs**: 
   - *Audit Logs*: Business critical (Who changed what?). Stored in Database.
   - *App Logs*: Technical (Performance, Stack traces). Stored in stdout/files.

## Metrics
- **Performance**: Track API response times and Gemini AI processing durations.
- **Health Checks**: `/health` endpoint must check DB connectivity and filesystem write permissions.

## Analytics (Privacy-First)
- No tracking of PII (Personally Identifiable Information).
- Track feature usage (e.g., "How many vaccinations were verified today?") to guide product development.
