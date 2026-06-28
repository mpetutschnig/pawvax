# 07 - UX/UI Standards

## Design Language
- **Theme**: Clean, clinical yet friendly (Animal health focus).
- **Colors**: Primary: `Emerald-600` (Safety/Health), Secondary: `Slate-900`.
- **Typography**: Inter (Sans-serif).

## Components (Shadcn UI)
- Use standard components: `Button`, `Input`, `Card`, `Dialog` (Modal), `Badge`.
- Custom components: `PetCard`, `VaccinationTimeline`, `ScannerOverlay`.

## Mobile-First Requirements
- All interactive elements must be touch-friendly (min 44px height).
- Bottom navigation for primary actions on mobile.
- Responsive grids that stack on small screens.

## Internationalization (i18n)
- **No hardcoded strings** in components.
- Use `useTranslation` hook.
- Keys must follow domain nesting: `pages.home.title`, `common.buttons.save`.

## PWA Experience
- Immediate feedback for offline state.
- "Add to Home Screen" prompts.
- Optimistic UI updates for pet/vaccination edits.
