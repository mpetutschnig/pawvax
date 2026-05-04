package at.oxs.paw.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// ═══════════════════════════════════════════════════════════════
//  PAW.OXS.AT — Shape Tokens
//  Maps design system border radii → M3 shape scale
// ═══════════════════════════════════════════════════════════════

//  Design token reference:
//    --radius-xs:   4px   → extraSmall
//    --radius-sm:   8px   → small
//    --radius-md:  12px   → medium
//    --radius-lg:  16px   → large
//    --radius-xl:  20px   → extraLarge
//    --radius-2xl: 24px   → (use manually)
//    --radius-full: 999px → CircleShape / 50.dp+

val PawShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),   // chips, small badges
    small      = RoundedCornerShape(8.dp),   // icon buttons, tags
    medium     = RoundedCornerShape(12.dp),  // buttons, inputs, dialogs
    large      = RoundedCornerShape(16.dp),  // cards, bottom sheets
    extraLarge = RoundedCornerShape(20.dp),  // hero cards, modals
)

// Convenience values for direct use
val RadiusXs   = RoundedCornerShape(4.dp)
val RadiusSm   = RoundedCornerShape(8.dp)
val RadiusMd   = RoundedCornerShape(12.dp)
val RadiusLg   = RoundedCornerShape(16.dp)
val RadiusXl   = RoundedCornerShape(20.dp)
val Radius2xl  = RoundedCornerShape(24.dp)
val RadiusFull = RoundedCornerShape(percent = 50)
