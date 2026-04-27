# Kotlin / Jetpack Compose Design Handoff
## paw.oxs.at — Premium Med-Tech PWA → Android App

This package contains everything needed to implement the **Vax.pet Design System v1.0**
in a native Android application using **Kotlin + Jetpack Compose + Material 3**.

The visual target is the HTML design reference `Design System.html` (open in browser).
Open it to see colors, typography, components, and all four screen layouts side by side.

---

## Files in This Bundle

| File | Purpose |
|------|---------|
| `README.md` | This document — full implementation spec |
| `Color.kt` | All color tokens as `Color(0xFF…)` constants |
| `Theme.kt` | M3 `lightColorScheme` + `darkColorScheme` + `PawTheme{}` |
| `Type.kt` | `PawTypography` — full M3 type scale with Outfit + DM Sans |
| `Shape.kt` | `PawShapes` + convenience `RadiusXxx` values |
| `Spacing.kt` | `Spacing` object — all spacing tokens as `Dp` |
| `Components.kt` | Ready-to-use Composables for every UI component |
| `Design System.html` | Interactive visual reference |

---

## Setup

### 1. Copy Kotlin files

Place all `.kt` files into your theme package:

```
app/src/main/java/at/oxs/paw/ui/theme/
  Color.kt
  Theme.kt
  Type.kt
  Shape.kt
  Spacing.kt

app/src/main/java/at/oxs/paw/ui/components/
  Components.kt
```

### 2. Add Google Fonts

Download from [fonts.google.com](https://fonts.google.com) and place in `res/font/`:

```
res/font/
  outfit_regular.ttf
  outfit_medium.ttf
  outfit_semibold.ttf
  outfit_bold.ttf
  dmsans_regular.ttf
  dmsans_medium.ttf
  dmsans_semibold.ttf
  dmsans_italic.ttf
  dmmono_regular.ttf
  dmmono_medium.ttf
```

**Or** use the [Google Fonts Compose library](https://developers.google.com/fonts/docs/android) 
and replace `Font(R.font.xxx)` with `GoogleFont` providers in `Type.kt`.

### 3. Wrap your app in PawTheme

```kotlin
// MainActivity.kt or your root composable
setContent {
    PawTheme {
        // your NavHost / Scaffold here
    }
}
```

### 4. Edge-to-edge

`PawTheme` already calls `WindowCompat.setDecorFitsSystemWindows(window, false)`.
Add this to your root Scaffold to let content extend behind system bars:

```kotlin
Scaffold(
    modifier = Modifier.fillMaxSize(),
    bottomBar = { PawBottomNavigation(currentRoute, onNavigate) },
    containerColor = MaterialTheme.colorScheme.background,
) { paddingValues ->
    Box(Modifier.padding(paddingValues)) {
        NavHost(...)
    }
}
```

---

## Color System

All colors are defined in `Color.kt`. They map 1:1 to the CSS design tokens.

### Primary palette (Trust Blue)

| Kotlin constant | Hex | CSS token | Use |
|-----------------|-----|-----------|-----|
| `Primary500` | `#2E5FD9` | `--primary-500` | Buttons, links, active states |
| `Primary600` | `#2450BA` | `--primary-600` | Hover / pressed |
| `Primary50`  | `#EDF2FF` | `--primary-50`  | Badge backgrounds, tints |
| `Primary400` | `#5580F5` | `--primary-400` | Focus rings, outlines |

### Semantic colors

| Constant | Hex | Use |
|----------|-----|-----|
| `Success500` | `#22A64A` | Valid vaccination, active status |
| `Success600` | `#198039` | Success text |
| `Success50`  | `#EBF0EA` | Success badge background |
| `Warning500` | `#D4860A` | Due soon |
| `Warning600` | `#AD6C07` | Warning text |
| `Danger500`  | `#D63B25` | Overdue, errors |
| `Danger600`  | `#B02D1B` | Danger text |
| `Accent400`  | `#3ABFBF` | Teal accent (scan corners, secondary) |

### Dark mode

Dark mode is **automatic** via `isSystemInDarkTheme()` in `PawTheme`.
No manual color switching needed — `MaterialTheme.colorScheme.*` resolves correctly.

---

## Typography

Defined in `Type.kt`. Always use `MaterialTheme.typography.*` — never hardcode sizes.

| M3 role | Font | Size | Weight | Use |
|---------|------|------|--------|-----|
| `displayLarge`   | Outfit | 40sp | Bold     | Hero numbers, big stats |
| `headlineLarge`  | Outfit | 28sp | SemiBold | Page titles (H1) |
| `headlineMedium` | Outfit | 22sp | SemiBold | Section headers (H2) |
| `headlineSmall`  | Outfit | 18sp | SemiBold | Card titles (H3) |
| `titleLarge`     | Outfit | 17sp | SemiBold | Pet name in list/card |
| `titleMedium`    | DM Sans | 14sp | SemiBold | Form labels, sub-headers |
| `titleSmall`     | DM Sans | 12sp | SemiBold | Small labels |
| `bodyLarge`      | DM Sans | 16sp | Normal   | Descriptive body text |
| `bodyMedium`     | DM Sans | 14sp | Normal   | Standard body |
| `bodySmall`      | DM Sans | 12sp | Normal   | Captions, meta text |
| `labelLarge`     | DM Sans | 14sp | SemiBold | Button text |
| `labelMedium`    | DM Sans | 11sp | SemiBold | Badge text |
| `labelSmall`     | DM Sans | 10sp | Bold     | ALLCAPS labels, nav items |

---

## Shape Scale

Defined in `Shape.kt`. Use `MaterialTheme.shapes.*` or the convenience constants.

| Constant | dp | CSS token | Use |
|----------|----|-----------|-----|
| `RadiusXs`   |  4dp | `--radius-xs`   | Chips, small tags |
| `RadiusSm`   |  8dp | `--radius-sm`   | Icon buttons, badge icons |
| `RadiusMd`   | 12dp | `--radius-md`   | Buttons, inputs, dialogs |
| `RadiusLg`   | 16dp | `--radius-lg`   | Cards (default `.card`) |
| `RadiusXl`   | 20dp | `--radius-xl`   | Hero cards, bottom sheets |
| `Radius2xl`  | 24dp | `--radius-2xl`  | Full-screen modals |
| `RadiusFull` | 50% | `--radius-full` | Badges, pills, avatars |

---

## Spacing

All spacing from `Spacing.kt`. Reference as `Spacing.lg` etc.

```
Spacing.xs   =  4dp   (--space-1)
Spacing.sm   =  8dp   (--space-2)
Spacing.md   = 12dp   (--space-3)
Spacing.lg   = 16dp   (--space-4)  ← screen padding
Spacing.xl   = 20dp   (--space-5)  ← card padding
Spacing.xxl  = 24dp   (--space-6)
Spacing.s3xl = 32dp   (--space-8)
Spacing.s5xl = 48dp   (--space-12)
```

---

## Screen-by-Screen Implementation

### Screen 1 — Animals List

**Route:** `/animals`

**Layout:**
```
Scaffold
  topBar: TopAppBar (title "My Animals", subtitle "3 registered · 1 alert")
  bottomBar: PawBottomNavigation
  content:
    Column(padding = screenPadding)
      PawTextField(search, leadingIcon = SearchIcon)
      Spacer(8dp)
      LazyColumn
        items(pets) { PetListItem(…) }
```

**TopAppBar:**
```kotlin
TopAppBar(
    title = {
        Column {
            Text("My Animals", style = MaterialTheme.typography.titleLarge)
            Text("${pets.size} registered", style = MaterialTheme.typography.bodySmall,
                 color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    },
    actions = {
        PawIconButton(onClick = { /* add pet */ }) {
            Icon(Icons.Default.Add, contentDescription = "Add animal")
        }
    },
    colors = TopAppBarDefaults.topAppBarColors(
        containerColor = MaterialTheme.colorScheme.background,
    ),
)
```

**PetListItem colors:**
- Dog avatar: `Primary500`
- Cat avatar: `Accent500`
- Other: `Color(0xFF7C5CBF)` (purple)

---

### Screen 2 — Animal Profile

**Route:** `/animals/{id}`

**Layout:**
```
Scaffold
  topBar: TopAppBar (back arrow, animal name)
  content:
    LazyColumn(padding = screenPadding)
      PawHeroCard { avatar + name + breed + badges }
      Spacer(16dp)
      StatRow { 3 × StatCard }
      Spacer(16dp)
      SectionLabel("Vaccination Records")
      items(vaccinations) { VaccinationListItem(…) }
      SectionLabel("Documents")
      items(documents) { DocumentListItem(…) }
```

**Stat cards:**
```kotlin
Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
    StatCard(value = "6", label = "Vaccinations", modifier = Modifier.weight(1f))
    StatCard(value = "2", label = "Documents",    modifier = Modifier.weight(1f))
    StatCard(value = "1", label = "Active Tag",   modifier = Modifier.weight(1f))
}

@Composable
fun StatCard(value: String, label: String, modifier: Modifier = Modifier) {
    PawCard(modifier = modifier) {
        Text(value, style = MaterialTheme.typography.displaySmall,
             color = Primary500, fontWeight = FontWeight.Bold)
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall,
             color = MaterialTheme.colorScheme.onSurfaceVariant,
             letterSpacing = 0.8.sp)
    }
}
```

**Hero card glass badges (on gradient):**
```kotlin
@Composable
fun HeroBadge(label: String) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        color = Color.White,
        modifier = Modifier
            .clip(RadiusFull)
            .background(White20)
            .border(1.dp, White28, RadiusFull)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}
```

---

### Screen 3 — Document Scan

**Route:** `/scan`

**Layout:**
```
Scaffold
  topBar: TopAppBar (title "Document Scan", back arrow)
  content:
    Column(padding = screenPadding)
      ScanViewfinder(modifier = Modifier.fillMaxWidth())
      Spacer(16dp)
      SectionLabel("Document Type")
      DocTypeSelector(selected, onSelect)
      Spacer(16dp)
      PawButton("Capture & Extract", onClick = { … },
                leadingIcon = { Icon(Camera) })
      Spacer(8dp)
      StatusLogBox(lines = logLines)
```

**Document type grid:**
```kotlin
val docTypes = listOf(
    "Vaccination" to Icons.Outlined.Vaccines,
    "Vet Report"  to Icons.Outlined.Description,
    "Microchip"   to Icons.Outlined.Memory,
    "Passport"    to Icons.Outlined.MenuBook,
)

LazyVerticalGrid(columns = GridCells.Fixed(2), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
    items(docTypes) { (label, icon) ->
        val selected = selectedType == label
        Row(
            modifier = Modifier
                .clip(RadiusMd)
                .background(if (selected) Primary50 else MaterialTheme.colorScheme.surface)
                .border(
                    width = 1.5.dp,
                    color = if (selected) Primary400 else MaterialTheme.colorScheme.outline,
                    shape = RadiusMd,
                )
                .clickable { selectedType = label }
                .padding(Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null,
                 tint = if (selected) Primary500 else MaterialTheme.colorScheme.onSurfaceVariant,
                 modifier = Modifier.size(Spacing.iconSize))
            Text(label,
                 style = MaterialTheme.typography.titleSmall,
                 color = if (selected) Primary600 else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
```

**Status log box:**
```kotlin
@Composable
fun StatusLogBox(lines: List<String>) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 80.dp, max = 200.dp)
            .clip(RadiusMd)
            .background(Color(0xFF0E1019))
            .border(1.dp, OutlineVariantDark, RadiusMd)
            .padding(Spacing.lg),
    ) {
        LazyColumn {
            items(lines) { line ->
                Text(
                    text = line,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = DmMono),
                    color = OnSurfaceVariantDark,
                )
            }
        }
    }
}
```

---

### Screen 4 — Admin Dashboard

**Route:** `/admin`

This screen uses a two-pane layout on tablets; a tab-based layout on phones.

**Phone layout:**
```
Scaffold
  topBar: AdminTopBar
  content:
    Column
      StatsRow (3 cards)
      TabRow (Animals | Pending | Verified)
      AdminAnimalList
```

**Admin TopAppBar:**
```kotlin
TopAppBar(
    title = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Pets, contentDescription = null, tint = Primary400)
            Text("Vax.pet Admin", style = MaterialTheme.typography.titleLarge, color = Color.White)
        }
    },
    colors = TopAppBarDefaults.topAppBarColors(
        containerColor = Primary900,
        titleContentColor = Color.White,
        actionIconContentColor = Color.White,
    ),
    actions = {
        IconButton(onClick = logout) {
            Icon(Icons.Outlined.Logout, contentDescription = "Logout")
        }
    },
)
```

**Admin row item:**
```kotlin
@Composable
fun AdminAnimalRow(
    name: String,
    ownerName: String,
    status: AdminStatus,
    avatarColor: Color,
    onClick: () -> Unit,
) {
    PawCard(onClick = onClick) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            PetAvatarCard(backgroundColor = avatarColor, size = 36.dp) {
                Icon(Icons.Outlined.Pets, contentDescription = null,
                     tint = Color.White, modifier = Modifier.size(16.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(name,      style = MaterialTheme.typography.titleSmall)
                Text(ownerName, style = MaterialTheme.typography.bodySmall,
                     color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            PawStatusBadge(
                label = when (status) {
                    AdminStatus.Verified -> "Verified"
                    AdminStatus.Pending  -> "Pending"
                    AdminStatus.Flagged  -> "Flagged"
                },
                variant = when (status) {
                    AdminStatus.Verified -> BadgeVariant.Success
                    AdminStatus.Pending  -> BadgeVariant.Warning
                    AdminStatus.Flagged  -> BadgeVariant.Danger
                },
            )
        }
    }
}

enum class AdminStatus { Verified, Pending, Flagged }
```

---

## Elevation & Shadow

Material 3 uses tonal elevation (color tint) by default.
For the design system's shadow feel, use `Modifier.shadow()` explicitly on cards:

```kotlin
Modifier.shadow(
    elevation     = 4.dp,
    shape         = RadiusLg,
    ambientColor  = Color(0x17000000),  // --shadow-md
    spotColor     = Color(0x0D000000),
)
```

Elevation levels mapping:

| Shadow token | M3 elevation | Use |
|--------------|-------------|-----|
| `shadow-sm`  | 2dp  | Cards at rest |
| `shadow-md`  | 4dp  | Raised cards, dropdowns |
| `shadow-lg`  | 8dp  | Bottom sheets, hero cards |
| `shadow-xl`  | 16dp | Full-screen overlays |

---

## Animations

### Skeleton shimmer (SkeletonBox composable in Components.kt)
Already implemented. Use like:
```kotlin
SkeletonBox(modifier = Modifier.fillMaxWidth().height(44.dp))
SkeletonBox(modifier = Modifier.size(44.dp).clip(RadiusMd))
```

### Badge pulse dot
`PawStatusBadge(showPulseDot = true)` — infinite opacity oscillation, already in Components.kt.

### Scan line
`ScanViewfinder { VideoPreview() }` — animated scan line via Canvas, already in Components.kt.

### Page transitions
```kotlin
NavHost(
    enterTransition = {
        slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(250))
    },
    exitTransition = {
        slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(250))
    },
    popEnterTransition = {
        slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Right, tween(250))
    },
    popExitTransition = {
        slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Right, tween(250))
    },
) { … }
```

---

## Dependencies (build.gradle.kts)

```kotlin
dependencies {
    // Compose BOM
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended") // for all Outlined icons

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // Activity (edge-to-edge)
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.core:core-ktx:1.13.1")
}
```

---

## Quick Checklist

Use this to verify fidelity against the HTML design reference:

- [ ] App background is a very subtle blue-tinted off-white in light mode, deep navy in dark mode
- [ ] Heading text renders in **Outfit** (distinct from the body)
- [ ] Body text renders in **DM Sans** (not system font)
- [ ] Primary blue matches swatches in Design System.html (Trust Blue variant)
- [ ] Cards have `1dp` border + `RadiusLg (16dp)` corners + subtle shadow
- [ ] Bottom nav uses glassmorphism (semi-transparent, blurred)
- [ ] Active nav item has `Primary50` indicator behind icon
- [ ] Status badges have colored background + colored text (not just colored text)
- [ ] "Up to Date" badge dot pulses with opacity animation
- [ ] Scan viewfinder has animated blue-teal scan line + corner markers
- [ ] Dark mode: background `#0E1019`, cards `#181D2B`
- [ ] No emoji anywhere — all icons from `material-icons-extended`

---

*paw.oxs.at Design System · Kotlin/Jetpack Compose Handoff · v1.0 · April 2026*
*Visual reference: Design System.html · Source design: Outfit + DM Sans + Lucide icons*
