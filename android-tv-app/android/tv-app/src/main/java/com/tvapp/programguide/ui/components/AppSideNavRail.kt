package com.tvapp.programguide.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.VideoLibrary
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
import kotlinx.coroutines.delay

// Delicate, modern Google TV rail styling without harsh borders
private val RailBackground = Color(0xFF080A0D)

// Item colors matching CanvasGuideGrid & Android TV Leanback
private val ItemFocusedBg = Color(0xFFF2F4F7)
private val ItemFocusedContent = Color(0xFF0A0E14)
private val ItemSelectedBg = Color(0x1FFFFFFF)
private val ItemSelectedContent = Color(0xFFF2F4F7)
private val ItemIdleContent = Color(0xFF8E95A2)

@Composable
fun AppSideNavRail(
    currentDestination: AppDestination,
    onDestinationSelected: (AppDestination) -> Unit,
    modifier: Modifier = Modifier,
    liveTvFocusRequester: FocusRequester = remember { FocusRequester() },
    vodFocusRequester: FocusRequester = remember { FocusRequester() },
    onNavigateToContent: () -> Unit = {},
    allowExpansion: Boolean = true,
) {
    var liveTvFocused by remember { mutableStateOf(false) }
    var vodFocused by remember { mutableStateOf(false) }
    val hasRailFocus = liveTvFocused || vodFocused
    var isRailExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(hasRailFocus, allowExpansion) {
        val shouldExpand = hasRailFocus && allowExpansion
        if (shouldExpand) {
            delay(140)
        }
        isRailExpanded = shouldExpand
    }

    val width by animateDpAsState(
        targetValue = if (isRailExpanded) 176.dp else 56.dp,
        animationSpec = tween(180),
        label = "rail_width",
    )

    // Ensure strictly LTR geometry so expanding from 56dp to 176dp anchors to physical screen left (x=0)
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = modifier
                .fillMaxHeight()
                .width(width)
                .zIndex(50f),
            contentAlignment = Alignment.TopStart,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth()
                    .shadow(elevation = 12.dp)
                    .background(RailBackground)
                    .drawBehind {
                        // Delicate soft drop shadow on trailing edge
                        val shadowWidth = 14.dp.toPx()
                        drawRect(
                            brush = Brush.horizontalGradient(
                                colors = listOf(Color(0x38000000), Color.Transparent),
                                startX = size.width,
                                endX = size.width + shadowWidth,
                            ),
                            topLeft = Offset(size.width, 0f),
                            size = Size(shadowWidth, size.height),
                        )
                    }
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
                            icon = Icons.Default.LiveTv,
                            label = "Live TV",
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
                            icon = Icons.Default.VideoLibrary,
                            label = "VOD",
                            isSelected = currentDestination == AppDestination.VOD,
                            isRailExpanded = isRailExpanded,
                            focusRequester = vodFocusRequester,
                            onSelect = { onDestinationSelected(AppDestination.VOD) },
                            onFocusChanged = { vodFocused = it },
                            onNavigateRight = onNavigateToContent,
                            onNavigateDown = null,
                            onNavigateUp = { liveTvFocusRequester.requestFocus() },
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

    val bgColor by animateColorAsState(targetBgColor, animationSpec = tween(150), label = "rail_bg")
    val contentColor by animateColorAsState(targetContentColor, animationSpec = tween(150), label = "rail_fg")

    val shape = RoundedCornerShape(8.dp)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .height(40.dp)
            .scale(if (isFocused) 1.04f else 1f)
            .clip(shape)
            .background(bgColor)
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

        AnimatedVisibility(
            visible = isRailExpanded,
            enter = fadeIn(tween(150)),
            exit = fadeOut(tween(100)),
        ) {
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
