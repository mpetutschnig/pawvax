package at.oxs.paw.ui.theme

import androidx.compose.ui.unit.dp

// ═══════════════════════════════════════════════════════════════
//  PAW.OXS.AT — Spacing Tokens (4dp base grid)
// ═══════════════════════════════════════════════════════════════

object Spacing {
    val xs   =  4.dp   // --space-1
    val sm   =  8.dp   // --space-2
    val md   = 12.dp   // --space-3
    val lg   = 16.dp   // --space-4
    val xl   = 20.dp   // --space-5
    val xxl  = 24.dp   // --space-6
    val s3xl = 32.dp   // --space-8
    val s4xl = 40.dp   // --space-10
    val s5xl = 48.dp   // --space-12
    val s6xl = 64.dp   // --space-16

    // Semantic aliases
    val screenPadding        = lg      // horizontal screen margin
    val cardPadding          = xl      // card inner padding
    val cardPaddingSm        = lg      // small card inner padding
    val sectionGap           = xxl     // gap between page sections
    val listItemGap          = md      // gap between list items
    val bottomNavHeight      = 64.dp
    val iconSize             = 20.dp   // default icon
    val iconSizeSm           = 18.dp   // inline icon
    val iconSizeLg           = 24.dp   // nav icon
    val avatarSm             = 36.dp   // mini avatar
    val avatarMd             = 44.dp   // standard avatar
    val avatarLg             = 56.dp   // hero avatar
    val minTouchTarget       = 44.dp   // WCAG 2.5.5
}
