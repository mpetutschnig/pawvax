# 08 - Development Workflows

## Code Quality
- **Linting**: ESLint + Prettier (Standard configuration).
- **Typing**: Strict TypeScript in `pwa/`. JSDoc in `server/`.
- **Commits**: Semantic commit messages (feat, fix, docs, chore).

## Testing Strategy
1. **API Tests**: Jest + Supertest for endpoint validation (`server/tests/`).
2. **Frontend Tests**: React Testing Library for critical components.
3. **Manual Verification**: Use the provided `test.http` or `documentation/API_TESTS_MASTER.md`.

## Feature Implementation Flow (Spec-Driven)
1. **Analyze Specs**: Read the relevant `specs/` file.
2. **Update Schema**: Apply DB changes if needed.
3. **Implement Logic**: Backend first (Routes -> Services).
4. **UI Integration**: Frontend components -> API wiring.
5. **Verify**: Run tests and check Audit Logs.

## Environment Management
- `.env` files for local dev.
- `.env.podman` for containerized environments.
- NEVER commit secrets.
