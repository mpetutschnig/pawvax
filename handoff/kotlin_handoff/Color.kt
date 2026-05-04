package at.oxs.paw.ui.theme

import androidx.compose.ui.graphics.Color

// ═══════════════════════════════════════════════════════════════
//  PAW.OXS.AT — Color Tokens
//  Source: Design System v1.0 (Vax.pet Premium Med-Tech)
//  Hue: 240 (Trust Blue) · Color space: OKLCH → sRGB
// ═══════════════════════════════════════════════════════════════

// ── Primary Scale ────────────────────────────────────────────────
val Primary50  = Color(0xFFEDF2FF)
val Primary100 = Color(0xFFDDE8FF)
val Primary200 = Color(0xFFBBCEFF)
val Primary300 = Color(0xFF8AABFF)
val Primary400 = Color(0xFF5580F5)
val Primary500 = Color(0xFF2E5FD9)  // ← default interactive
val Primary600 = Color(0xFF2450BA)  // ← hover / pressed
val Primary700 = Color(0xFF1B3E96)
val Primary800 = Color(0xFF112770)
val Primary900 = Color(0xFF081545)

// ── Accent Scale (Teal) ──────────────────────────────────────────
val Accent400  = Color(0xFF3ABFBF)
val Accent500  = Color(0xFF249999)
val Accent600  = Color(0xFF187878)

// ── Semantic: Success ─────────────────────────────────────────────
val Success50  = Color(0xFFEBFAF0)
val Success500 = Color(0xFF22A64A)
val Success600 = Color(0xFF198039)

// ── Semantic: Warning ─────────────────────────────────────────────
val Warning50  = Color(0xFFFFF7E6)
val Warning500 = Color(0xFFD4860A)
val Warning600 = Color(0xFFAD6C07)

// ── Semantic: Danger ──────────────────────────────────────────────
val Danger50   = Color(0xFFFFF0EE)
val Danger500  = Color(0xFFD63B25)
val Danger600  = Color(0xFFB02D1B)

// ── Semantic: Info ────────────────────────────────────────────────
val Info50     = Color(0xFFEBF4FF)
val Info500    = Color(0xFF2780D6)
val Info600    = Color(0xFF1B64AB)

// ── Light Surface Tokens ─────────────────────────────────────────
val BackgroundLight        = Color(0xFFF5F6FB)  // --bg
val SurfaceLight           = Color(0xFFFFFFFF)  // --bg-elevated (cards)
val SurfaceVariantLight    = Color(0xFFECEEF8)  // --surface
val SurfaceAltLight        = Color(0xFFE5E8F4)  // --surface-alt
val OutlineLight           = Color(0xFFCDD0E3)  // --border
val OutlineVariantLight    = Color(0xFFDDE0EE)  // --border-subtle
val OnBackgroundLight      = Color(0xFF0E1428)  // --text-primary
val OnSurfaceLight         = Color(0xFF0E1428)
val OnSurfaceVariantLight  = Color(0xFF535A80)  // --text-secondary
val OnSurfaceTertiaryLight = Color(0xFF8A90B0)  // --text-tertiary

// ── Dark Surface Tokens ──────────────────────────────────────────
val BackgroundDark         = Color(0xFF0E1019)  // --bg dark
val SurfaceDark            = Color(0xFF181D2B)  // --bg-elevated dark
val SurfaceVariantDark     = Color(0xFF1F2436)  // --surface dark
val SurfaceAltDark         = Color(0xFF252C3E)  // --surface-alt dark
val OutlineDark            = Color(0xFF363E56)  // --border dark
val OutlineVariantDark     = Color(0xFF2C3348)  // --border-subtle dark
val OnBackgroundDark       = Color(0xFFF0F2FC)  // --text-primary dark
val OnSurfaceDark          = Color(0xFFF0F2FC)
val OnSurfaceVariantDark   = Color(0xFF8A95C0)  // --text-secondary dark
val OnSurfaceTertiaryDark  = Color(0xFF565E80)  // --text-tertiary dark

// ── Admin Sidebar ────────────────────────────────────────────────
val AdminSidebarBg         = Color(0xFF081545)  // primary-900
val AdminSidebarFg         = Color(0xFF8A9ACC)
val AdminSidebarActiveBg   = Color(0x332E5FD9)  // primary-500 @ 20%
val AdminSidebarActiveFg   = Color(0xFFFFFFFF)

// ── Whites with opacity (for glass / overlays) ───────────────────
val White12  = Color(0x1FFFFFFF)
val White20  = Color(0x33FFFFFF)
val White28  = Color(0x47FFFFFF)
val White70  = Color(0xB3FFFFFF)
