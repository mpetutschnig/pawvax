package at.oxs.paw.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// ═══════════════════════════════════════════════════════════════
//  PAW.OXS.AT — Typography
//
//  Outfit  → display / headings (font-display)
//  DM Sans → body / UI text     (font-body)
//  DM Mono → code / tokens      (font-mono)
//
//  Add the font files to res/font/:
//    outfit_regular.ttf, outfit_medium.ttf,
//    outfit_semibold.ttf, outfit_bold.ttf
//    dmsans_regular.ttf, dmsans_medium.ttf,
//    dmsans_semibold.ttf, dmsans_italic.ttf
//    dmmono_regular.ttf, dmmono_medium.ttf
//
//  Download from Google Fonts:
//    https://fonts.google.com/specimen/Outfit
//    https://fonts.google.com/specimen/DM+Sans
//    https://fonts.google.com/specimen/DM+Mono
// ═══════════════════════════════════════════════════════════════

val Outfit = FontFamily(
    Font(R.font.outfit_regular,  FontWeight.Normal),
    Font(R.font.outfit_medium,   FontWeight.Medium),
    Font(R.font.outfit_semibold, FontWeight.SemiBold),
    Font(R.font.outfit_bold,     FontWeight.Bold),
)

val DmSans = FontFamily(
    Font(R.font.dmsans_regular,  FontWeight.Normal),
    Font(R.font.dmsans_medium,   FontWeight.Medium),
    Font(R.font.dmsans_semibold, FontWeight.SemiBold),
    Font(R.font.dmsans_italic,   FontWeight.Normal),
)

val DmMono = FontFamily(
    Font(R.font.dmmono_regular, FontWeight.Normal),
    Font(R.font.dmmono_medium,  FontWeight.Medium),
)

// ─────────────────────────────────────────────────────────────
//  Typography scale — maps to design system reference
//
//  displayLarge  → "Display"   Outfit 40sp  W700  ls -0.5
//  headlineLarge → "H1"        Outfit 28sp  W600  ls -0.3
//  headlineMedium→ "H2"        Outfit 22sp  W600  ls -0.2
//  headlineSmall → "H3"        Outfit 18sp  W600  ls 0
//  titleLarge    → card titles  Outfit 17sp  W600
//  titleMedium   → section head DM Sans 14sp W600
//  titleSmall    → small label  DM Sans 12sp W600
//  bodyLarge     → body lg      DM Sans 16sp W400
//  bodyMedium    → body         DM Sans 14sp W400
//  bodySmall     → body sm      DM Sans 12sp W400
//  labelLarge    → buttons      DM Sans 14sp W600  ls 0.1
//  labelMedium   → badge text   DM Sans 11sp W600  ls 0.3
//  labelSmall    → ALLCAPS tag  DM Sans 10sp W700  ls 1.2
// ─────────────────────────────────────────────────────────────

val PawTypography = Typography(

    displayLarge = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.Bold,
        fontSize     = 40.sp,
        lineHeight   = 44.sp,
        letterSpacing = (-0.5).sp,
    ),

    displayMedium = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 32.sp,
        lineHeight   = 36.sp,
        letterSpacing = (-0.3).sp,
    ),

    displaySmall = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 28.sp,
        lineHeight   = 32.sp,
        letterSpacing = (-0.2).sp,
    ),

    headlineLarge = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 28.sp,
        lineHeight   = 34.sp,
        letterSpacing = (-0.3).sp,
    ),

    headlineMedium = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 22.sp,
        lineHeight   = 28.sp,
        letterSpacing = (-0.2).sp,
    ),

    headlineSmall = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 18.sp,
        lineHeight   = 24.sp,
        letterSpacing = 0.sp,
    ),

    titleLarge = TextStyle(
        fontFamily   = Outfit,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 17.sp,
        lineHeight   = 22.sp,
        letterSpacing = (-0.1).sp,
    ),

    titleMedium = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 14.sp,
        lineHeight   = 20.sp,
        letterSpacing = 0.1.sp,
    ),

    titleSmall = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 12.sp,
        lineHeight   = 16.sp,
        letterSpacing = 0.1.sp,
    ),

    bodyLarge = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.Normal,
        fontSize     = 16.sp,
        lineHeight   = 25.sp,
        letterSpacing = 0.sp,
    ),

    bodyMedium = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.Normal,
        fontSize     = 14.sp,
        lineHeight   = 22.sp,
        letterSpacing = 0.sp,
    ),

    bodySmall = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.Normal,
        fontSize     = 12.sp,
        lineHeight   = 18.sp,
        letterSpacing = 0.sp,
    ),

    labelLarge = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 14.sp,
        lineHeight   = 20.sp,
        letterSpacing = 0.1.sp,
    ),

    labelMedium = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.SemiBold,
        fontSize     = 11.sp,
        lineHeight   = 16.sp,
        letterSpacing = 0.3.sp,
    ),

    labelSmall = TextStyle(
        fontFamily   = DmSans,
        fontWeight   = FontWeight.Bold,
        fontSize     = 10.sp,
        lineHeight   = 14.sp,
        letterSpacing = 1.2.sp,
    ),
)
