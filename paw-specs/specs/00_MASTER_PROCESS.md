# 00 - Master Spec-Driven Process

Every new feature, bug fix, or system modification MUST follow this exact sequence to ensure consistency, security, and architectural integrity. **Do not skip phases.**

## Phase 1: Architecture & Enterprise Planning (Agents: SYSTEM_ARCHITECT, ENTERPRISE_STRATEGY)
1. **Analyze & Spec Alignment:** (SYSTEM_ARCHITECT) Read the request and ensure alignment with all specs (01-12).
2. **Scalability & Compliance Check:** (ENTERPRISE_STRATEGY) Verify the plan handles errors, scales well, and complies with GDPR.
3. **Draft Plan:** Create a technical implementation plan.
4. **Validation:** **STOP and ask the user for approval.**

## Phase 2: Backend Implementation (Agent: BACKEND_ENGINEER)
*Prerequisite: Phase 1 Approved.*
1. **Database:** Update the database schema (`server/src/db/schema.sql` or migrations).
2. **Routing:** Implement Fastify routes in `server/src/routes/`.
3. **Logic:** Implement business logic in `server/src/services/`.
   - *CRITICAL:* Ensure `logAudit` is called for any data mutations or sensitive access.
4. **Testing:** Write unit/integration tests in `server/tests/`.
5. **Validation:** Run tests (`npm test` in `server/`) and resolve all failures.

## Phase 3: Frontend Implementation (Agent: FRONTEND_ENGINEER)
*Prerequisite: Phase 2 Backend API is defined/mocked.*
1. **Typing:** Create/Update TypeScript interfaces in `pwa/src/types/`.
2. **Networking:** Update API clients in `pwa/src/api/`.
3. **UI Construction:** Build UI components in `pwa/src/components/` strictly using Shadcn UI primitives and Tailwind CSS.
4. **Integration:** Wire components in `pwa/src/pages/`.
5. **Localization:** Add required text keys to `pwa/src/locales/de.json` and `en.json`. Do not hardcode strings.

## Phase 4: QA, Security & Testing (Agents: QA_ENGINEER, SECURITY_SPECIALIST, TEST_AUTOMATION_ENGINEER)
1. **Security Audit:** (SECURITY_SPECIALIST) Verify RBAC, Audit Logs, and **Network Isolation (Firewall/Ports)**.
2. **Test Suite:** (TEST_AUTOMATION_ENGINEER) Ensure all tests pass and coverage is high.
3. **Build Check:** (QA_ENGINEER) Verify production builds.

## Phase 5: Deployment & Knowledge Management (Agents: DEVOPS_INFRA_ENGINEER, DOCUMENTATION_KNOWLEDGE_AGENT, CONTENT_I18N_AGENT)
1. **Infrastructure:** (DEVOPS_INFRA_ENGINEER) Update Quadlets, Environment templates, and setup scripts.
2. **Documentation:** (DOCUMENTATION_KNOWLEDGE_AGENT) Update User Guides, Admin Manuals, and Technical docs in `documentation/`.
3. **Localization & Content:** (CONTENT_I18N_AGENT) Finalize i18n strings and public-facing content.
