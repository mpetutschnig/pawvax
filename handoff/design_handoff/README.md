# Design Handoff: Vax.pet Premium PWA Redesign

## Overview

This package contains the complete design system and implementation spec for transforming
the **Vax.pet** PWA from a functional dev-centric UI into a premium Med-Tech application.
The target feel: trustworthy, modern, and high-end — similar to Revolut or Oscar Health.

**Repository:** https://github.com/mpetutschnig/pawvax  
**PWA directory:** `pwa/`  
**Tech stack:** Vite · React 18 · TypeScript · Lucide-React · Axios

---

## About the Design Files

The files in this bundle are **HTML design references** — high-fidelity prototypes showing
the intended look, color system, components, and screen layouts. They are NOT production
code to copy directly.

Your task is to **recreate these designs in the existing React/TypeScript codebase** at
`pwa/src/`, using its established patterns (React components, CSS classes, Lucide-React
icons). Do not ship the HTML prototypes directly.

## Fidelity

**High-fidelity.** The prototypes use final colors, typography, spacing, shadows,
border-radii, and interaction states. Recreate the UI pixel-accurately using the design
tokens defined below.

---

## Step-by-Step Implementation Plan

Work through these in order. Each step is independently verifiable.

### Step 1 — Replace `pwa/src/index.css`

Replace the entire file with the contents of `index.css` in this bundle.
This is the **complete CSS foundation** — all tokens, components, dark mode, and utilities.

Also add Google Fonts to `pwa/index.html` inside `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Verify:** Run the dev server. The app background should be a very subtle blue-tinted white
(`oklch(97.5% 0.007 240)`), body text should render in DM Sans, headings in Outfit.

---

### Step 2 — Replace all emoji icons with Lucide-React

Lucide-React is already installed. Find every emoji string used as an icon and replace with
the appropriate `<Icon />` component. Common mappings:

| Emoji | Lucide component | Import |
|-------|-----------------|--------|
| 💉    | `<Syringe />`   | `lucide-react` |
| 🐶    | `<PawPrint />`  | `lucide-react` |
| 🐱    | `<Cat />`       | `lucide-react` |
| 🔍    | `<Search />`    | `lucide-react` |
| ➕    | `<Plus />`      | `lucide-react` |
| ✏️    | `<Pencil />`    | `lucide-react` |
| 🗑️    | `<Trash2 />`    | `lucide-react` |
| 📄    | `<FileText />`  | `lucide-react` |
| 📷    | `<Camera />`    | `lucide-react` |
| 🏷️    | `<Tag />`       | `lucide-react` |
| ✅    | `<CheckCircle2 />` | `lucide-react` |
| ⚠️    | `<AlertCircle />` | `lucide-react` |
| 🔗    | `<Link />`      | `lucide-react` |
| 👤    | `<User />`      | `lucide-react` |
| 🏠    | `<Home />`      | `lucide-react` |
| ⚙️    | `<Settings />`  | `lucide-react` |
| 📱    | `<Smartphone />` | `lucide-react` |

Default icon size: `size={20}` or `size={18}` for inline. Use `strokeWidth={1.8}` for a
refined look (not the default 2).

**Verify:** No emoji characters visible anywhere in the UI.

---

### Step 3 — Refine `src/App.tsx` — BottomNav & Layout

The bottom navigation should use glassmorphism and Lucide icons.

**Target BottomNav structure:**

```tsx
import { PawPrint, Bell, ScanLine, FileText, User } from 'lucide-react';

// The .bottom-nav CSS class now handles glassmorphism automatically.
// Wrap icon + label in a .nav-icon-wrap div for the active indicator.

<nav className="bottom-nav">
  <NavLink to="/animals" className={({ isActive }) => isActive ? 'active' : ''}>
    <div className="nav-icon-wrap">
      <PawPrint size={22} strokeWidth={1.8} />
    </div>
    <span>Animals</span>
  </NavLink>
  <NavLink to="/alerts" className={({ isActive }) => isActive ? 'active' : ''}>
    <div className="nav-icon-wrap">
      <Bell size={22} strokeWidth={1.8} />
    </div>
    <span>Alerts</span>
  </NavLink>
  <NavLink to="/scan" className={({ isActive }) => isActive ? 'active' : ''}>
    <div className="nav-icon-wrap">
      <ScanLine size={22} strokeWidth={1.8} />
    </div>
    <span>Scan</span>
  </NavLink>
  <NavLink to="/documents" className={({ isActive }) => isActive ? 'active' : ''}>
    <div className="nav-icon-wrap">
      <FileText size={22} strokeWidth={1.8} />
    </div>
    <span>Docs</span>
  </NavLink>
  <NavLink to="/profile" className={({ isActive }) => isActive ? 'active' : ''}>
    <div className="nav-icon-wrap">
      <User size={22} strokeWidth={1.8} />
    </div>
    <span>Profile</span>
  </NavLink>
</nav>
```

**Page wrapper:** All page components should use `<div className="container page">` as the
outer wrapper (not raw divs with inline styles). This provides the 480px max-width,
centered layout, and correct bottom padding above the nav.

---

### Step 4 — AnimalsPage.tsx — Pet List

**Target layout:**

```
┌─────────────────────────────────────┐
│ [TopBar]  My Animals (3) · 1 alert  │
│ [Search input with Search icon]     │
│ ─────────────────────────────────── │
│ [PetCard] Max · Border Collie       │
│   [Badges: Up to Date] [NFC]        │
│ [PetCard] Luna · British Shorthair  │
│   [Badges: Due Soon]                │
└─────────────────────────────────────┘
```

**PetCard component** — create `src/components/PetCard.tsx`:

```tsx
import { ChevronRight, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PetCardProps {
  id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  age?: string;
  vaccinationStatus: 'current' | 'due_soon' | 'overdue';
  hasNfcTag?: boolean;
  isVetVerified?: boolean;
}

export function PetCard({ id, name, species, breed, age, vaccinationStatus, hasNfcTag, isVetVerified }: PetCardProps) {
  const statusBadge = {
    current:   { className: 'badge badge-success', label: 'Up to Date' },
    due_soon:  { className: 'badge badge-warning', label: 'Due Soon' },
    overdue:   { className: 'badge badge-danger',  label: 'Overdue' },
  }[vaccinationStatus];

  return (
    <Link to={`/animals/${id}`} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', textDecoration: 'none', marginBottom: 'var(--space-3)', cursor: 'pointer' }}>
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
        background: 'var(--primary-500)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {species === 'cat' ? <Cat size={22} color="white" strokeWidth={1.8} /> : <PawPrint size={22} color="white" strokeWidth={1.8} />}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)' }}>{breed}{age ? ` · ${age}` : ''}</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className={statusBadge.className}>
            <span className="badge-dot"></span>
            {statusBadge.label}
          </span>
          {hasNfcTag && (
            <span className="badge badge-primary">
              <Radio size={10} strokeWidth={2.5} />
              NFC
            </span>
          )}
          {isVetVerified && (
            <span className="badge badge-info">
              <CheckCircle2 size={10} strokeWidth={2.5} />
              Verified
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={18} color="var(--text-tertiary)" />
    </Link>
  );
}
```

**Search field:**
```tsx
<div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
  <input
    className="form-input"
    style={{ paddingLeft: 38 }}
    placeholder="Search animals…"
    value={search}
    onChange={e => setSearch(e.target.value)}
  />
</div>
```

---

### Step 5 — AnimalPage.tsx — Pet Profile

**Target layout:**

```
┌──────────────────────────────────┐
│ [Gradient Hero Card]             │
│   [Avatar] Name · Breed · Age    │
│   [Badges: Vet Verified | NFC]   │
│ [Stats row: Vaccinations | Tags] │
│ ────────────────────────────────  │
│ VACCINATION RECORDS              │
│ [VaxItem] Rabies       [Valid]   │
│ [VaxItem] DHPP         [Valid]   │
│ [VaxItem] Bordetella   [Renew]   │
└──────────────────────────────────┘
```

**Hero card:**
```tsx
<div style={{
  borderRadius: 'var(--radius-xl)',
  background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
  padding: 'var(--space-5)',
  marginBottom: 'var(--space-4)',
  boxShadow: 'var(--shadow-lg)',
}}>
  <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
    <div style={{
      width: 56, height: 56, borderRadius: 'var(--radius-lg)',
      background: 'oklch(100% 0 0 / 0.18)',
      border: '1.5px solid oklch(100% 0 0 / 0.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <PawPrint size={28} color="white" strokeWidth={1.6} />
    </div>
    <div>
      <h2 style={{ color: 'white', margin: 0, fontFamily: 'var(--font-display)' }}>{animal.name}</h2>
      <p style={{ color: 'oklch(100% 0 0 / 0.70)', margin: 0, fontSize: 'var(--font-size-sm)' }}>
        {animal.breed} · {animal.age} · {animal.weight}kg
      </p>
    </div>
  </div>
  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
    {animal.isVetVerified && (
      <span style={{ background: 'oklch(100% 0 0 / 0.15)', border: '1px solid oklch(100% 0 0 / 0.22)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'white' }}>
        Vet Verified
      </span>
    )}
    {animal.hasNfcTag && (
      <span style={{ background: 'oklch(100% 0 0 / 0.15)', border: '1px solid oklch(100% 0 0 / 0.22)', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: 'white' }}>
        NFC Active
      </span>
    )}
  </div>
</div>
```

**Vaccination list item:**
```tsx
// For each vaccination record
<div className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
  <div style={{
    width: 36, height: 36, borderRadius: 'var(--radius-sm)', flexShrink: 0,
    background: isValid ? 'var(--success-50)' : 'var(--warning-50)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <Syringe size={16} color={isValid ? 'var(--success-600)' : 'var(--warning-600)'} strokeWidth={2} />
  </div>
  <div style={{ flex: 1 }}>
    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{vax.name}</div>
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
      {vax.date} · due {vax.nextDue}
    </div>
  </div>
  <span className={isValid ? 'badge badge-success' : 'badge badge-warning'}>
    {isValid ? 'Valid' : 'Renew'}
  </span>
</div>
```

---

### Step 6 — ScanPage.tsx & DocumentScanPage.tsx

**Camera viewfinder** — replace the plain `<video>` wrapper with a styled container:

```tsx
<div style={{
  position: 'relative',
  background: 'oklch(8% 0.02 250)',
  borderRadius: 'var(--radius-xl)',
  overflow: 'hidden',
  aspectRatio: '4/3',
  marginBottom: 'var(--space-4)',
}}>
  <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  
  {/* Corner markers */}
  {['tl','tr','bl','br'].map(pos => (
    <div key={pos} style={{
      position: 'absolute',
      width: 24, height: 24,
      borderColor: 'var(--accent-400)',
      borderStyle: 'solid',
      ...(pos === 'tl' ? { top: 16, left: 16, borderWidth: '3px 0 0 3px', borderRadius: '4px 0 0 0' } : {}),
      ...(pos === 'tr' ? { top: 16, right: 16, borderWidth: '3px 3px 0 0', borderRadius: '0 4px 0 0' } : {}),
      ...(pos === 'bl' ? { bottom: 16, left: 16, borderWidth: '0 0 3px 3px', borderRadius: '0 0 0 4px' } : {}),
      ...(pos === 'br' ? { bottom: 16, right: 16, borderWidth: '0 3px 3px 0', borderRadius: '0 0 4px 0' } : {}),
    }} />
  ))}
  
  {/* Scan line animation (CSS class) */}
  <div className="scan-line" />
</div>
```

Add this to `index.css` (already in the bundle):
```css
.scan-line {
  position: absolute;
  left: 20px; right: 20px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent-400), transparent);
  animation: scanline 1.8s ease-in-out infinite;
  border-radius: 1px;
}
@keyframes scanline {
  0%, 100% { top: 20%; opacity: 0.6; }
  50%       { top: 80%; opacity: 1; }
}
```

**Document type selector** — replace the radio buttons with pill-style option cards:

```tsx
const docTypes = [
  { id: 'vaccination', label: 'Vaccination', icon: <Syringe size={14} /> },
  { id: 'report',      label: 'Vet Report',  icon: <FileText size={14} /> },
  { id: 'microchip',   label: 'Microchip',   icon: <Cpu size={14} /> },
  { id: 'passport',    label: 'Passport',    icon: <BookOpen size={14} /> },
];

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
  {docTypes.map(type => (
    <button
      key={type.id}
      onClick={() => setDocType(type.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: docType === type.id ? 'var(--primary-50)' : 'var(--bg-elevated)',
        border: `1.5px solid ${docType === type.id ? 'var(--primary-400)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--t-fast) var(--ease-out)',
        color: docType === type.id ? 'var(--primary-600)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--font-size-sm)',
      }}
    >
      {type.icon} {type.label}
    </button>
  ))}
</div>
```

---

### Step 7 — AdminPage.tsx

**Admin header:**
```tsx
<header className="admin-header">
  <div className="admin-header-brand">
    <PawPrint size={20} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 8 }} />
    Vax.pet Admin
  </div>
  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
    <span style={{ fontSize: 'var(--font-size-sm)', color: 'oklch(80% 0.04 240)' }}>
      {authority.name}
    </span>
    <button className="btn btn-ghost btn-icon" onClick={logout} title="Logout">
      <LogOut size={18} />
    </button>
  </div>
</header>
```

**Admin sidebar items:**
```tsx
<nav className="admin-sidebar">
  {sidebarItems.map(item => (
    <a
      key={item.id}
      className="admin-sidebar-item"
      aria-current={activeTab === item.id ? 'page' : undefined}
      onClick={() => setActiveTab(item.id)}
    >
      {item.icon} {/* Lucide icon component */}
      <span>{item.label}</span>
    </a>
  ))}
</nav>
```

**Stats overview cards** (add above the table):
```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
  {[
    { label: 'Registered Animals', value: stats.total, trend: '+12%', up: true },
    { label: 'Pending Review',     value: stats.pending, trend: '-5', up: false },
    { label: 'Compliance Rate',    value: `${stats.compliance}%`, trend: '+2%', up: true },
  ].map(stat => (
    <div key={stat.label} className="card card-sm" style={{ marginBottom: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1 }}>
        {stat.value}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
        {stat.label}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: stat.up ? 'var(--success-600)' : 'var(--danger-500)', marginTop: 6 }}>
        {stat.up ? '↑' : '↓'} {stat.trend}
      </div>
    </div>
  ))}
</div>
```

**Table badges** — replace inline colors with badge classes:
```tsx
// In the admin table status column:
<span className={
  animal.status === 'verified' ? 'badge badge-success' :
  animal.status === 'pending'  ? 'badge badge-warning' :
  'badge badge-danger'
}>
  {animal.status}
</span>
```

---

## Design Tokens Quick Reference

All tokens are defined in `index.css` `:root {}`. Reference them in inline styles or TSX
as CSS variables.

### Colors

| Token | Value | Use |
|-------|-------|-----|
| `--primary-500` | `oklch(44% 0.22 240)` | Buttons, links, active states |
| `--primary-600` | `oklch(38% 0.20 240)` | Button hover |
| `--primary-50`  | `oklch(96% 0.04 240)` | Badge backgrounds, input tints |
| `--accent-400`  | `oklch(68% 0.15 195)` | Secondary accent (teal) |
| `--success-500` | `oklch(52% 0.18 145)` | Valid vaccination |
| `--warning-500` | `oklch(68% 0.20 80)`  | Due soon |
| `--danger-500`  | `oklch(56% 0.22 25)`  | Overdue / errors |
| `--bg`          | `oklch(97.5% 0.007 240)` | Page background |
| `--bg-elevated` | `oklch(100% 0 0)`     | Card backgrounds |
| `--surface`     | `oklch(95% 0.010 240)` | Input backgrounds |
| `--border`      | `oklch(87% 0.014 240)` | Card/input borders |
| `--text-primary`| `oklch(16% 0.025 240)` | Main text |
| `--text-secondary`| `oklch(46% 0.025 240)` | Supporting text |
| `--text-tertiary` | `oklch(66% 0.018 240)` | Placeholder, labels |

### Typography

| Token | Value |
|-------|-------|
| `--font-display` | `'Outfit', system-ui, sans-serif` |
| `--font-body`    | `'DM Sans', system-ui, sans-serif` |
| `--font-mono`    | `'DM Mono', 'Courier New', monospace` |

Use `font-family: var(--font-display)` for headings, pet names, stat numbers.
Use `font-family: var(--font-body)` (body default) for all other text.

### Spacing

`--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` · `--space-4: 16px` ·
`--space-5: 20px` · `--space-6: 24px` · `--space-8: 32px` · `--space-12: 48px`

### Border Radii

`--radius-sm: 8px` · `--radius-md: 12px` · `--radius-lg: 16px` ·
`--radius-xl: 20px` · `--radius-2xl: 24px` · `--radius-full: 9999px`

### Shadows

| Token | Use |
|-------|-----|
| `--shadow-sm` | Cards at rest |
| `--shadow-md` | Raised cards, dropdowns |
| `--shadow-lg` | Modals, detail panels |
| `--shadow-xl` | Full-screen overlays |

---

## CSS Classes Reference

### Layout
- `.container` — 480px max-width, centered, `padding: 16px`
- `.page` — adds correct bottom padding above nav bar

### Cards
- `.card` — white, rounded-lg, shadow-md, 20px padding
- `.card-sm` — same, 16px padding, rounded-md

### Buttons
- `.btn .btn-primary` — filled blue, with shadow and hover lift
- `.btn .btn-secondary` — tinted background, primary color text
- `.btn .btn-ghost` — transparent with border
- `.btn .btn-danger` — red filled
- `.btn .btn-outline` — transparent, primary border
- `.btn .btn-icon` — 40×40px square icon button

### Badges
- `.badge .badge-success` — green tint, animated dot available
- `.badge .badge-warning` — amber tint
- `.badge .badge-danger` — red tint
- `.badge .badge-primary` — blue tint (NFC, tags)
- `.badge .badge-info` — info blue tint
- `.badge-dot` — animated pulse dot inside badge

### Forms
- `.form-input` · `.form-select` · `.form-textarea` — styled inputs
- `.form-label` — 12px semibold label above input
- `.form-group` — wrapper with bottom margin
- `.form-hint` — helper text below input
- `.form-error` — error text in red
- `.is-valid` / `.is-invalid` — validation state modifiers on inputs

### Animations
- `.skeleton` — shimmer loading placeholder
- `.spinner` · `.spinner-lg` — loading spinner
- `.pulse` — opacity pulse
- `.animate-fade-in` — fade in from below on mount

### Utilities
- `.text-muted` · `.text-danger` · `.text-success`
- `.mt-2/4/6` · `.mb-2/4/6`
- `.divider` — horizontal rule

---

## Dark Mode

Implemented via `@media (prefers-color-scheme: dark)` — no class toggling needed.
All color tokens automatically switch. Test by switching OS appearance.

---

## Components NOT Yet Refactored

These may need manual attention if they use heavily custom inline styles:
- **NFC tag linking flow** — should use `.card` + `.btn-primary`
- **Login / auth pages** — apply `.form-group`, `.form-label`, `.form-input`, `.btn-primary`
- **QR code scanner overlay** — wrap in the scan container style from Step 6
- **Document preview / PDF viewer** — wrap in `.card` with `--shadow-lg`

---

## Files in This Bundle

| File | Description |
|------|-------------|
| `README.md` | This document — full implementation spec |
| `index.css` | Drop-in replacement for `pwa/src/index.css` |
| `Design System.html` | Interactive visual reference (open in browser) |

---

## Visual Reference

Open `Design System.html` in a browser to see:
- All color swatches with token names
- Typography scale
- Every component (buttons, badges, inputs, cards, nav)
- All four screen mockups (Animals, Profile, Scan, Admin) in phone frames
- Use the top-right controls to switch color variants and dark/light mode

---

*Designed April 2026 · Outfit + DM Sans · Lucide-React icons · oklch color space*
