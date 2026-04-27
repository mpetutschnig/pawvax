package at.oxs.paw.ui.components

// ═══════════════════════════════════════════════════════════════
//  PAW.OXS.AT — Composable Component Library
//  All visual targets sourced from Design System v1.0
// ═══════════════════════════════════════════════════════════════

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import at.oxs.paw.ui.theme.*

// ──────────────────────────────────────────────────────────────
//  PawCard
//  Equivalent to .card in CSS
// ──────────────────────────────────────────────────────────────
@Composable
fun PawCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RadiusLg
    val containerColor = MaterialTheme.colorScheme.surface

    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier
                .fillMaxWidth()
                .shadow(elevation = 4.dp, shape = shape, ambientColor = Color(0x17000000)),
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = containerColor),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Column(
                modifier = Modifier.padding(Spacing.xl),
                content = content,
            )
        }
    } else {
        Card(
            modifier = modifier
                .fillMaxWidth()
                .shadow(elevation = 4.dp, shape = shape, ambientColor = Color(0x17000000)),
            shape = shape,
            colors = CardDefaults.cardColors(containerColor = containerColor),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Column(
                modifier = Modifier.padding(Spacing.xl),
                content = content,
            )
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  PawHeroCard
//  Gradient card used for pet profile header
//  background: linear-gradient(135deg, primary-500, primary-700)
// ──────────────────────────────────────────────────────────────
@Composable
fun PawHeroCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RadiusXl)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(Primary500, Primary700),
                    start = Offset(0f, 0f),
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                )
            )
            .shadow(elevation = 8.dp, shape = RadiusXl, ambientColor = Color(0x1C000000)),
    ) {
        Column(
            modifier = Modifier.padding(Spacing.xl),
            content = content,
        )
    }
}

// ──────────────────────────────────────────────────────────────
//  PetAvatar
//  Frosted glass circle for hero card
//  background: white/18%  border: white/28%
// ──────────────────────────────────────────────────────────────
@Composable
fun PetAvatarHero(
    icon: @Composable () -> Unit,
    size: Dp = Spacing.avatarLg,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(RadiusMd)
            .background(White20)
            .border(1.5.dp, White28, RadiusMd),
    ) {
        icon()
    }
}

// ──────────────────────────────────────────────────────────────
//  PetAvatar (list item)
//  Used inside PetListItem; color is passed in
// ──────────────────────────────────────────────────────────────
@Composable
fun PetAvatarCard(
    backgroundColor: Color = Primary500,
    size: Dp = Spacing.avatarMd,
    icon: @Composable () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(size)
            .clip(RadiusMd)
            .background(backgroundColor),
    ) {
        icon()
    }
}

// ──────────────────────────────────────────────────────────────
//  PawStatusBadge
//  Equivalent to .badge .badge-success / .badge-warning / etc.
// ──────────────────────────────────────────────────────────────
enum class BadgeVariant { Success, Warning, Danger, Primary, Info, Neutral }

data class BadgeColors(
    val background: Color,
    val content: Color,
    val border: Color,
)

@Composable
fun badgeColors(variant: BadgeVariant): BadgeColors {
    return when (variant) {
        BadgeVariant.Success -> BadgeColors(Success50,  Success600, Success500.copy(alpha = 0.25f))
        BadgeVariant.Warning -> BadgeColors(Warning50,  Warning600, Warning500.copy(alpha = 0.25f))
        BadgeVariant.Danger  -> BadgeColors(Danger50,   Danger600,  Danger500.copy(alpha = 0.25f))
        BadgeVariant.Primary -> BadgeColors(Primary50,  Primary600, Primary200)
        BadgeVariant.Info    -> BadgeColors(Info50,     Info600,    Info500.copy(alpha = 0.25f))
        BadgeVariant.Neutral -> BadgeColors(
            MaterialTheme.colorScheme.surfaceVariant,
            MaterialTheme.colorScheme.onSurfaceVariant,
            MaterialTheme.colorScheme.outline,
        )
    }
}

@Composable
fun PawStatusBadge(
    label: String,
    variant: BadgeVariant,
    showPulseDot: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val colors = badgeColors(variant)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = modifier
            .clip(RadiusFull)
            .background(colors.background)
            .border(1.dp, colors.border, RadiusFull)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        if (showPulseDot) {
            PulseDot(color = when (variant) {
                BadgeVariant.Success -> Success500
                BadgeVariant.Warning -> Warning500
                BadgeVariant.Danger  -> Danger500
                BadgeVariant.Primary -> Primary500
                BadgeVariant.Info    -> Info500
                BadgeVariant.Neutral -> MaterialTheme.colorScheme.outline
            })
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = colors.content,
        )
    }
}

@Composable
private fun PulseDot(color: Color) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f, targetValue = 0.4f, label = "alpha",
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
    )
    Box(
        modifier = Modifier
            .size(6.dp)
            .clip(CircleShape)
            .background(color.copy(alpha = alpha)),
    )
}

// ──────────────────────────────────────────────────────────────
//  PawButton (Primary)
//  Equivalent to .btn .btn-primary
//  height: 44dp  radius: 12dp  gradient shadow on primary
// ──────────────────────────────────────────────────────────────
@Composable
fun PawButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leadingIcon: @Composable (() -> Unit)? = null,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = Spacing.minTouchTarget),
        shape = RadiusMd,
        colors = ButtonDefaults.buttonColors(
            containerColor = Primary500,
            contentColor   = Color.White,
            disabledContainerColor = Primary500.copy(alpha = 0.4f),
            disabledContentColor   = Color.White.copy(alpha = 0.6f),
        ),
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation  = 2.dp,
            pressedElevation  = 0.dp,
            hoveredElevation  = 6.dp,
        ),
        contentPadding = PaddingValues(horizontal = Spacing.xl, vertical = Spacing.md),
    ) {
        if (leadingIcon != null) {
            Box(modifier = Modifier.size(Spacing.iconSize)) { leadingIcon() }
            Spacer(Modifier.width(Spacing.sm))
        }
        Text(text = text, style = MaterialTheme.typography.labelLarge)
    }
}

// ──────────────────────────────────────────────────────────────
//  PawOutlinedButton (Secondary / Ghost)
// ──────────────────────────────────────────────────────────────
@Composable
fun PawOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = Spacing.minTouchTarget),
        shape = RadiusMd,
        border = BorderStroke(1.5.dp, Primary400),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = Primary500,
        ),
        contentPadding = PaddingValues(horizontal = Spacing.xl, vertical = Spacing.md),
    ) {
        Text(text = text, style = MaterialTheme.typography.labelLarge)
    }
}

// ──────────────────────────────────────────────────────────────
//  PawIconButton
//  Equivalent to .btn-icon  size: 40×40dp  radius: 12dp
// ──────────────────────────────────────────────────────────────
@Composable
fun PawIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    contentColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    content: @Composable () -> Unit,
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(40.dp)
            .clip(RadiusSm)
            .background(containerColor)
            .clickable(onClick = onClick),
    ) {
        CompositionLocalProvider(LocalContentColor provides contentColor) {
            content()
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  PawTextField
//  Equivalent to .form-input
//  height: 44dp  radius: 12dp  focus ring: primary/15%
// ──────────────────────────────────────────────────────────────
@Composable
fun PawTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    leadingIcon: @Composable (() -> Unit)? = null,
    isError: Boolean = false,
    supportingText: String? = null,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, style = MaterialTheme.typography.titleSmall) },
        placeholder = if (placeholder.isNotEmpty()) {
            { Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)) }
        } else null,
        leadingIcon = leadingIcon,
        isError = isError,
        enabled = enabled,
        supportingText = if (supportingText != null) {
            { Text(supportingText, style = MaterialTheme.typography.bodySmall) }
        } else null,
        modifier = modifier.fillMaxWidth(),
        shape = RadiusMd,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor     = Primary400,
            unfocusedBorderColor   = MaterialTheme.colorScheme.outline,
            errorBorderColor       = Danger500,
            focusedContainerColor  = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor= MaterialTheme.colorScheme.surfaceVariant,
            focusedLabelColor      = Primary500,
            unfocusedLabelColor    = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        singleLine = true,
        textStyle  = MaterialTheme.typography.bodyMedium,
    )
}

// ──────────────────────────────────────────────────────────────
//  PetListItem
//  Used on AnimalsScreen — equivalent to .mini-pet-card
// ──────────────────────────────────────────────────────────────
@Composable
fun PetListItem(
    name: String,
    breed: String,
    age: String,
    vaccinationStatus: VaccinationStatus,
    hasNfc: Boolean,
    isVetVerified: Boolean,
    onClick: () -> Unit,
    avatarColor: Color = Primary500,
    icon: @Composable () -> Unit,
) {
    PawCard(onClick = onClick) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.lg),
        ) {
            // Avatar
            PetAvatarCard(backgroundColor = avatarColor, icon = icon)

            // Text + badges
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "$breed · $age",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp, bottom = 6.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    PawStatusBadge(
                        label = when (vaccinationStatus) {
                            VaccinationStatus.Current  -> "Up to Date"
                            VaccinationStatus.DueSoon  -> "Due Soon"
                            VaccinationStatus.Overdue  -> "Overdue"
                        },
                        variant = when (vaccinationStatus) {
                            VaccinationStatus.Current  -> BadgeVariant.Success
                            VaccinationStatus.DueSoon  -> BadgeVariant.Warning
                            VaccinationStatus.Overdue  -> BadgeVariant.Danger
                        },
                        showPulseDot = vaccinationStatus == VaccinationStatus.Current,
                    )
                    if (hasNfc) {
                        PawStatusBadge(label = "NFC", variant = BadgeVariant.Primary)
                    }
                    if (isVetVerified) {
                        PawStatusBadge(label = "Verified", variant = BadgeVariant.Info)
                    }
                }
            }

            // Chevron
            Icon(
                imageVector = Icons.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(Spacing.iconSize),
            )
        }
    }
}

enum class VaccinationStatus { Current, DueSoon, Overdue }

// ──────────────────────────────────────────────────────────────
//  VaccinationListItem
//  Used on AnimalProfileScreen
// ──────────────────────────────────────────────────────────────
@Composable
fun VaccinationListItem(
    name: String,
    date: String,
    nextDue: String,
    isValid: Boolean,
) {
    val iconTint = if (isValid) Success600 else Warning600
    val iconBg   = if (isValid) Success50  else Warning50

    PawCard {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.md),
        ) {
            // Icon
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(RadiusSm)
                    .background(iconBg),
            ) {
                Icon(
                    imageVector = Icons.Filled.MoreVert, // or Syringe from extended
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(16.dp),
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "$date · due $nextDue",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            PawStatusBadge(
                label = if (isValid) "Valid" else "Renew",
                variant = if (isValid) BadgeVariant.Success else BadgeVariant.Warning,
            )
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  SkeletonLoader
//  Equivalent to .skeleton shimmer animation
// ──────────────────────────────────────────────────────────────
@Composable
fun SkeletonBox(
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim by transition.animateFloat(
        initialValue = -300f, targetValue = 300f, label = "shimmer_x",
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
    )

    val shimmerColors = listOf(
        MaterialTheme.colorScheme.surfaceVariant,
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
        MaterialTheme.colorScheme.surfaceVariant,
    )

    Box(
        modifier = modifier
            .clip(RadiusSm)
            .background(
                brush = Brush.linearGradient(
                    colors = shimmerColors,
                    start = Offset(translateAnim, 0f),
                    end = Offset(translateAnim + 300f, 0f),
                )
            ),
    )
}

// ──────────────────────────────────────────────────────────────
//  PawBottomNavigation
//  Equivalent to .bottom-nav
//  Uses NavigationBar M3 — glass via container color + elevation=0
// ──────────────────────────────────────────────────────────────
@Composable
fun PawBottomNavigation(
    currentRoute: String,
    onNavigate: (String) -> Unit,
) {
    val items = listOf(
        NavItem("animals",   "Animals",  Icons.Filled.Home),
        NavItem("alerts",    "Alerts",   Icons.Outlined.Notifications),
        NavItem("scan",      "Scan",     Icons.Filled.Favorite),
        NavItem("documents", "Docs",     Icons.Filled.MoreVert),
        NavItem("profile",   "Profile",  Icons.Filled.Person),
    )

    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f),
        tonalElevation = 0.dp,
        modifier = Modifier
            .windowInsetsPadding(WindowInsets.navigationBars)
            .border(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outlineVariant,
                shape = RoundedCornerShape(topStart = 0.dp, topEnd = 0.dp),
            ),
    ) {
        items.forEach { item ->
            val selected = currentRoute == item.route
            NavigationBarItem(
                selected = selected,
                onClick  = { onNavigate(item.route) },
                label    = {
                    Text(
                        text  = item.label,
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
                icon = {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.label,
                        modifier = Modifier.size(Spacing.iconSizeLg),
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor       = Primary500,
                    selectedTextColor       = Primary500,
                    indicatorColor          = Primary50,
                    unselectedIconColor     = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor     = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

data class NavItem(val route: String, val label: String, val icon: ImageVector)

// ──────────────────────────────────────────────────────────────
//  ScanViewfinder
//  Camera preview overlay with animated scan line and corner marks
// ──────────────────────────────────────────────────────────────
@Composable
fun ScanViewfinder(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit = {},
) {
    val transition = rememberInfiniteTransition(label = "scan")
    val scanY by transition.animateFloat(
        initialValue = 0.2f, targetValue = 0.8f, label = "scanY",
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
    )

    Box(
        modifier = modifier
            .clip(RadiusXl)
            .background(Color(0xFF0E1019))
            .aspectRatio(4f / 3f),
    ) {
        content()

        Canvas(modifier = Modifier.fillMaxSize()) {
            val cornerLen = 24.dp.toPx()
            val cornerStroke = 3.dp.toPx()
            val margin = 16.dp.toPx()
            val accentColor = Accent400

            fun drawCorner(x: Float, y: Float, flipX: Boolean, flipY: Boolean) {
                val dxSign = if (flipX) -1 else 1
                val dySign = if (flipY) -1 else 1
                drawLine(accentColor, Offset(x, y), Offset(x + dxSign * cornerLen, y), cornerStroke)
                drawLine(accentColor, Offset(x, y), Offset(x, y + dySign * cornerLen), cornerStroke)
            }

            drawCorner(margin, margin, false, false)
            drawCorner(size.width - margin, margin, true, false)
            drawCorner(margin, size.height - margin, false, true)
            drawCorner(size.width - margin, size.height - margin, true, true)

            // Scan line
            val lineY = size.height * scanY
            drawLine(
                brush  = Brush.horizontalGradient(
                    colors = listOf(Color.Transparent, accentColor, Color.Transparent),
                    startX = margin, endX = size.width - margin,
                ),
                start  = Offset(margin, lineY),
                end    = Offset(size.width - margin, lineY),
                strokeWidth = 2.dp.toPx(),
            )
        }
    }
}
