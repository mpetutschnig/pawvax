# 16 - Documentation Standards

## Documentation Categories

### 1. User Documentation (End-User / In-App)
- **Format**: Markdown in `pwa/src/assets/docs/`.
- **Target**: Pet owners and Veterinarians.
- **Integration**: The Frontend dynamically renders these files via a dedicated `DocumentationPage.tsx` using a Markdown-to-React parser.
- **Style**: MUST strictly follow the design system defined in `specs/07_UX_UI_STANDARDS.md` and shared via `handoff/`.

### 2. Admin Documentation (System Operator)
- **Format**: Markdown in `documentation/admin-guide/`.
- **Target**: System administrators and IT operators.

### 3. Technical & API Documentation (Developer)
- **Format**: OpenAPI (Swagger) for REST and Markdown for Architecture.

## Cross-Agent Sync Protocol (Design Consistency)
1. **The Handshake**: Before creating UI components or documentation sites, the `DOCUMENTATION_AGENT` and `FRONTEND_ENGINEER` must verify the current CSS variables and Tailwind theme in `pwa/src/index.css`.
2. **Shared Components**: Documentation pages must use the same Shadcn UI primitives (`Card`, `Button`, `Badge`) as the main application to ensure a seamless look and feel.
3. **Visual Integrity**: If the `FRONTEND_ENGINEER` changes the primary color or border radius, the `DOCUMENTATION_AGENT` must re-verify the docs site rendering.

## Language & Accessibility
- Primary documentation language is **English**.
- Critical user-facing guides must be translated to **German**.
