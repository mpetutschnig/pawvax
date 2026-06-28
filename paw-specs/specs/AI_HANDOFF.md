# AI System Handoff Document

**Welcome, AI Orchestrator (Claude / Gemini / GPT).** 
You have been handed control of the **PAW (Digitaler Tierimpfpass)** workspace. 

This repository is fully configured for autonomous, multi-agent **Spec-Driven Development**. You have everything you need to build features from end to end without requiring the human to write a single line of code.

## 🏁 How to Start Working

When the human gives you a task or feature request, execute the following sequence:

1. **Initialize Your Context:**
   - Read `CLAUDE.md` (or `GEMINI.md`) for your global constraints.
   - Read `specs/00_MASTER_PROCESS.md` to understand your workflow.

2. **Assume the SYSTEM_ARCHITECT & ENTERPRISE_STRATEGY Personas:**
   - Read `specs/agents/01_SYSTEM_ARCHITECT.md` and `specs/agents/09_ENTERPRISE_STRATEGY.md`.
   - Analyze the specs in `specs/` (especially 09-12 for Enterprise readiness).
   - Output the Architecture Plan.
   - **Ask the human:** *"Do you approve this plan?"*


3. **Assume the BACKEND_ENGINEER Persona:**
   - Read `specs/agents/02_BACKEND_ENGINEER.md`.
   - Implement logic exactly as planned.
   - Run tests. Fix any errors autonomously.

4. **Assume the FRONTEND_ENGINEER Persona:**
   - Read `specs/agents/03_FRONTEND_ENGINEER.md`.
   - Implement the React/PWA UI.
   - Run build. Fix any TypeScript errors autonomously.

5. **Assume the SECURITY & TEST Personas:**
   - Read `specs/agents/05_SECURITY_SPECIALIST.md` and `specs/agents/06_TEST_AUTOMATION_ENGINEER.md`.
   - Perform deep security audit and write integration tests.

6. **Assume the QA, DEVOPS, DOCUMENTATION & CONTENT Personas:**
   - Read `specs/agents/04_QA_ENGINEER.md`, `specs/agents/07_DEVOPS_INFRA_ENGINEER.md`, `specs/agents/10_DOCUMENTATION_KNOWLEDGE_AGENT.md`, and `specs/agents/08_CONTENT_I18N_AGENT.md`.
   - Perform final verification, update infrastructure, write User/Admin guides, and finalize localization.

## 🛠️ Internal "Skills" and Agent Sync

You do not need external MCPs or plugins. The system's intelligence is built into the **Agent Handshakes**:

- **Design Sync**: The `DOCUMENTATION_AGENT` and `FRONTEND_ENGINEER` work together by sharing the `pwa/src/index.css` as their single source of truth for styles. This ensures in-app documentation looks exactly like the rest of the app.
- **Spec Sync**: All agents refer to the `specs/` directory as their "Global Memory".
- **Validation Sync**: The `QA_ENGINEER` audits the work of ALL other agents.
