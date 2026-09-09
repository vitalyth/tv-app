package com.tvapp.programguide.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ConnectedTv
import androidx.compose.material.icons.filled.MovieFilter
import androidx.compose.material.icons.filled.Subscriptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.tvapp.programguide.data.AppDestination
import com.tvapp.programguide.ui.vod.tvFocusableClickable

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.roundToInt

// Item colors matching CanvasGuideGrid & Android TV Leanback
private val ItemFocusedBg = Color(0xFFF2F4F7)
private val ItemFocusedContent = Color(0xFF0A0E14)
private val ItemSelectedBg = Color(0x25FFFFFF)
private val ItemSelectedContent = Color(0xFFF2F4F7)
private val ItemIdleContent = Color(0xFF8E95A2)

@Composable
fun AppSideNavRail(
    currentDestination: AppDestination,
    onDestinationSelected: (AppDestination) -> Unit,
    modifier: Modifier = Modifier,
    liveTvFocusRequester: FocusRequester = remember { FocusRequester() },
    vodFocusRequester: FocusRequester = remember { FocusRequester() },
    localSeriesFocusRequester: FocusRequester = remember { FocusRequester() },
    onNavigateToContent: () -> Unit = {},
) {
    var liveTvFocused by remember { mutableStateOf(false) }
    var vodFocused by remember { mutableStateOf(false) }
    var localSeriesFocused by remember { mutableStateOf(false) }
    val hasRailFocus = liveTvFocused || vodFocused || localSeriesFocused
    val isRailExpanded = hasRailFocus

    val width = if (isRailExpanded) 176.dp else 56.dp
    val railCornerRadius = if (isRailExpanded) 16.dp else 0.dp
    val railShape = RoundedCornerShape(
        topStart = 0.dp,
        bottomStart = 0.dp,
        topEnd = railCornerRadius,
        bottomEnd = railCornerRadius,
    )

    val railBgColor = if (isRailExpanded) Color(0xF80A0E17) else Color(0xFA080A0D)

    // Ensure strictly LTR geometry so expanding from 56dp to 176dp anchors to physical screen left (x=0)
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = modifier
                .fillMaxHeight()
                .width(width)
                .zIndex(50f)
                .then(
                    if (isRailExpanded) {
                        Modifier.drawBehind {
                            val sw = 20.dp.toPx()
                            drawRect(
                                brush = Brush.horizontalGradient(
                                    0.0f to Color.Black.copy(alpha = 0.6f),
                                    0.4f to Color.Black.copy(alpha = 0.25f),
                                    1.0f to Color.Transparent,
                                    startX = size.width,
                                    endX = size.width + sw,
                                ),
                                topLeft = Offset(size.width, 0f),
                                size = Size(sw, size.height),
                            )
                        }
                    } else Modifier
                ),
            contentAlignment = Alignment.TopStart,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth()
                    .clip(railShape)
                    .background(color = railBgColor, shape = railShape)
                    .padding(top = 28.dp, bottom = 20.dp, start = 6.dp, end = 6.dp)
            ) {
                Column(
                    modifier = Modifier.fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Navigation Items in English with clean Google TV aesthetic
                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        NavRailItem(
                            destination = AppDestination.LIVE_TV,
                            icon = Icons.Default.ConnectedTv,
                            label = "Live",
                            isSelected = currentDestination == AppDestination.LIVE_TV,
                            isRailExpanded = isRailExpanded,
                            focusRequester = liveTvFocusRequester,
                            onSelect = { onDestinationSelected(AppDestination.LIVE_TV) },
                            onFocusChanged = { liveTvFocused = it },
                            onNavigateRight = onNavigateToContent,
                            onNavigateDown = { vodFocusRequester.requestFocus() },
                            onNavigateUp = null,
                        )

                        NavRailItem(
                            destination = AppDestination.VOD,
                            icon = Icons.Default.MovieFilter,
                            label = "VOD",
                            isSelected = currentDestination == AppDestination.VOD,
                            isRailExpanded = isRailExpanded,
                            focusRequester = vodFocusRequester,
                            onSelect = { onDestinationSelected(AppDestination.VOD) },
                            onFocusChanged = { vodFocused = it },
                            onNavigateRight = onNavigateToContent,
                            onNavigateDown = { localSeriesFocusRequester.requestFocus() },
                            onNavigateUp = { liveTvFocusRequester.requestFocus() },
                        )

                        NavRailItem(
                            destination = AppDestination.LOCAL_SERIES,
                            icon = Icons.Default.Subscriptions,
                            label = "Series",
                            isSelected = currentDestination == AppDestination.LOCAL_SERIES,
                            isRailExpanded = isRailExpanded,
                            focusRequester = localSeriesFocusRequester,
                            onSelect = { onDestinationSelected(AppDestination.LOCAL_SERIES) },
                            onFocusChanged = { localSeriesFocused = it },
                            onNavigateRight = onNavigateToContent,
                            onNavigateDown = null,
                            onNavigateUp = { vodFocusRequester.requestFocus() },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NavRailItem(
    destination: AppDestination,
    icon: ImageVector,
    label: String,
    isSelected: Boolean,
    isRailExpanded: Boolean,
    focusRequester: FocusRequester,
    onSelect: () -> Unit,
    onFocusChanged: (Boolean) -> Unit,
    onNavigateRight: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    LaunchedEffect(isFocused) {
        onFocusChanged(isFocused)
    }

    val targetBgColor = when {
        isFocused -> ItemFocusedBg
        isSelected -> ItemSelectedBg
        else -> Color.Transparent
    }
    val targetContentColor = when {
        isFocused -> ItemFocusedContent
        isSelected -> ItemSelectedContent
        else -> ItemIdleContent
    }

    val bgColor = targetBgColor
    val contentColor = targetContentColor

    val shape = RoundedCornerShape(8.dp)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp)
            .clip(shape)
            .background(bgColor)
            .onPreviewKeyEvent { event ->
                if (event.key == Key.Back) {
                    if (event.type == KeyEventType.KeyUp) {
                        onNavigateRight?.invoke()
                    }
                    true
                } else {
                    false
                }
            }
            .onFocusChanged { onFocusChanged(it.isFocused) }
            .tvFocusableClickable(
                onClick = onSelect,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateRight = onNavigateRight,
                onNavigateDown = onNavigateDown,
                onNavigateUp = onNavigateUp,
            )
            .padding(horizontal = 11.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = contentColor,
            modifier = Modifier.size(19.dp),
        )

        if (isRailExpanded) {
            Text(
                text = label,
                color = contentColor,
                fontSize = 13.sp,
                fontWeight = if (isFocused || isSelected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip,
                modifier = Modifier.padding(start = 9.dp),
            )
        }
    }
}
