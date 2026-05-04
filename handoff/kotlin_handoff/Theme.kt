package at.oxs.paw.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// ═══════════════════════════════════════════════════════════════
//  PAW.OXS.AT — Material3 Color Schemes
//  Maps design tokens → M3 roles
// ═══════════════════════════════════════════════════════════════

private val LightColorScheme = lightColorScheme(
    // ── Brand ──────────────────────────────────────────────────
    primary              = Primary500,
    onPrimary            = SurfaceLight,
    primaryContainer     = Primary50,
    onPrimaryContainer   = Primary700,

    secondary            = Accent500,
    onSecondary          = SurfaceLight,
    secondaryContainer   = Color(0xFFE0F5F5),
    onSecondaryContainer = Accent600,

    tertiary             = Success500,
    onTertiary           = SurfaceLight,
    tertiaryContainer    = Success50,
    onTertiaryContainer  = Success600,

    // ── Error ──────────────────────────────────────────────────
    error                = Danger500,
    onError              = SurfaceLight,
    errorContainer       = Danger50,
    onErrorContainer     = Danger600,

    // ── Surfaces ───────────────────────────────────────────────
    background           = BackgroundLight,
    onBackground         = OnBackgroundLight,
    surface              = SurfaceLight,
    onSurface            = OnSurfaceLight,
    surfaceVariant       = SurfaceVariantLight,
    onSurfaceVariant     = OnSurfaceVariantLight,
    surfaceContainerLow  = BackgroundLight,
    surfaceContainer     = SurfaceVariantLight,
    surfaceContainerHigh = SurfaceAltLight,

    // ── Outlines ───────────────────────────────────────────────
    outline              = OutlineLight,
    outlineVariant       = OutlineVariantLight,

    // ── Inverse ────────────────────────────────────────────────
    inverseSurface       = OnBackgroundLight,
    inverseOnSurface     = SurfaceLight,
    inversePrimary       = Primary300,

    scrim                = Color(0x99000000),
)

private val DarkColorScheme = darkColorScheme(
    primary              = Primary400,
    onPrimary            = Primary900,
    primaryContainer     = Primary700,
    onPrimaryContainer   = Primary100,

    secondary            = Accent400,
    onSecondary          = Color(0xFF003E3E),
    secondaryContainer   = Color(0xFF005252),
    onSecondaryContainer = Color(0xFFB2EFEF),

    tertiary             = Success500,
    onTertiary           = Color(0xFF003314),
    tertiaryContainer    = Color(0xFF005225),
    onTertiaryContainer  = Color(0xFFA0F5BB),

    error                = Color(0xFFFF8F80),
    onError              = Color(0xFF690000),
    errorContainer       = Color(0xFF93000A),
    onErrorContainer     = Color(0xFFFFDAD6),

    background           = BackgroundDark,
    onBackground         = OnBackgroundDark,
    surface              = SurfaceDark,
    onSurface            = OnSurfaceDark,
    surfaceVariant       = SurfaceVariantDark,
    onSurfaceVariant     = OnSurfaceVariantDark,
    surfaceContainerLow  = BackgroundDark,
    surfaceContainer     = SurfaceVariantDark,
    surfaceContainerHigh = SurfaceAltDark,

    outline              = OutlineDark,
    outlineVariant       = OutlineVariantDark,

    inverseSurface       = OnBackgroundDark,
    inverseOnSurface     = SurfaceDark,
    inversePrimary       = Primary500,

    scrim                = Color(0xCC000000),
)

// ═══════════════════════════════════════════════════════════════
//  PawTheme composable
// ═══════════════════════════════════════════════════════════════
@Composable
fun PawTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            // Edge-to-edge: system handles bar colors
            WindowCompat.setDecorFitsSystemWindows(window, false)
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            WindowCompat.getInsetsController(window, view)
                .isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography  = PawTypography,
        shapes      = PawShapes,
        content     = content,
    )
}
