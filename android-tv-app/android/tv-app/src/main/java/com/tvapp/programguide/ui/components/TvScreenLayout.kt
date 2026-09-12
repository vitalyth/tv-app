package com.tvapp.programguide.ui.components

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.MovieFilter
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.ui.StablePlayer
import com.tvapp.programguide.ui.StablePlayerView
import com.tvapp.programguide.ui.vod.tvFocusableClickable

val TvScreenDarkBg = Color(0xFF080A0C)
private val HeroFocusedBg = Color(0xFFF2F4F7)
private val HeroFocusedContent = Color(0xFF091016)
private val HeroMutedText = Color(0xFFB8C1CC)
private val HeroAccent = Color(0xFF25D4DE)
private const val TvBackgroundImageWidth = 3840
private const val TvBackgroundImageHeight = 2160

/**
 * Common layout for TV screens (Home, Live TV Guide, etc.).
 * Displays background artwork, inline background video playback, dual gradient overlays,
 * an adaptive Hero header with controls, and a dedicated slot for page-specific content.
 */
@Composable
fun TvScreenLayout(
    // Visual / Player State
    player: StablePlayer,
    playerView: StablePlayerView,
    isVideoRendering: Boolean,
    isPlayerExpanded: Boolean,
    backgroundImageUrl: String?,
    artworkTitle: String,

    // Hero Metadata
    heroTitle: String,
    heroSubtitle: String = "",
    heroDescription: String = "",
    heroTimeRange: String? = null,
    heroChannelLogoUrl: String? = null,
    isLive: Boolean = true,
    showVodBadge: Boolean = true,

    // Hero Actions & Controls
    isMuted: Boolean,
    onToggleMute: () -> Unit,
    muteFocusRequester: FocusRequester = remember { FocusRequester() },
    onOpenFullScreen: (() -> Unit)? = null,
    fullScreenFocusRequester: FocusRequester = remember { FocusRequester() },
    onNavigateLeft: () -> Unit = {},
    onNavigateDown: () -> Unit = {},
    onFocusChanged: ((Boolean) -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,

    // Layout configuration
    modifier: Modifier = Modifier,
    heroPadding: PaddingValues = PaddingValues(start = 32.dp, end = 32.dp, top = 32.dp),
    spacerAfterHero: Dp = 8.dp,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    overlayContent: (@Composable BoxScope.() -> Unit)? = null,

    // Main content slot below Hero
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TvScreenDarkBg),
    ) {
        TvArtwork(
            imageUrl = backgroundImageUrl,
            title = artworkTitle,
            modifier = Modifier.fillMaxSize(),
        )

        TvInlinePlayer(
            player = player,
            playerView = playerView,
            visible = isVideoRendering,
            isPlayerExpanded = isPlayerExpanded,
            modifier = Modifier.fillMaxSize(),
        )

        // Vertical Scrim Gradient (Top-to-Bottom)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.28f to Color.Transparent,
                        0.44f to Color(0xCC080A0C),
                        0.60f to Color(0xF6080A0C),
                        1f to Color(0xFF080A0C),
                    )
                )
        )

        // Horizontal Scrim Gradient (Right-to-Left in RTL / Left-to-Right edge)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xF8080A0C),
                        0.32f to Color(0xEB080A0C),
                        0.48f to Color(0xC0080A0C),
                        0.62f to Color(0x40080A0C),
                        0.74f to Color.Transparent,
                        1f to Color.Transparent,
                    )
                )
        )

        // Main Vertical Content Column
        Column(
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(heroPadding),
            ) {
                TvHero(
                    title = heroTitle,
                    subtitle = heroSubtitle,
                    description = heroDescription,
                    timeRange = heroTimeRange,
                    channelLogoUrl = heroChannelLogoUrl,
                    isLive = isLive,
                    showVodBadge = showVodBadge,
                    isMuted = isMuted,
                    onToggleMute = onToggleMute,
                    muteFocusRequester = muteFocusRequester,
                    hasActivePlayer = isVideoRendering,
                    onOpenFullScreen = onOpenFullScreen,
                    fullScreenFocusRequester = fullScreenFocusRequester,
                    onNavigateLeft = onNavigateLeft,
                    onNavigateDown = onNavigateDown,
                    onFocusChanged = onFocusChanged,
                    actions = actions,
                )
            }

            if (spacerAfterHero > 0.dp) {
                Spacer(Modifier.height(spacerAfterHero))
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(contentPadding),
            ) {
                content()
            }
        }

        if (overlayContent != null) {
            overlayContent()
        }
    }
}

/**
 * Hero header component displaying program/channel information and action buttons.
 */
@Composable
fun TvHero(
    title: String,
    subtitle: String,
    description: String,
    timeRange: String?,
    channelLogoUrl: String?,
    isLive: Boolean,
    isMuted: Boolean,
    onToggleMute: () -> Unit,
    muteFocusRequester: FocusRequester,
    onNavigateLeft: () -> Unit,
    onNavigateDown: () -> Unit,
    onFocusChanged: ((Boolean) -> Unit)? = null,
    modifier: Modifier = Modifier,
    showVodBadge: Boolean = true,
    hasActivePlayer: Boolean = false,
    onOpenFullScreen: (() -> Unit)? = null,
    fullScreenFocusRequester: FocusRequester = remember { FocusRequester() },
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    val muteInteractionSource = remember { MutableInteractionSource() }
    val isMuteFocused by muteInteractionSource.collectIsFocusedAsState()

    val fullScreenInteractionSource = remember { MutableInteractionSource() }
    val isFullScreenFocused by fullScreenInteractionSource.collectIsFocusedAsState()

    LaunchedEffect(isMuteFocused, isFullScreenFocused) {
        onFocusChanged?.invoke(isMuteFocused || isFullScreenFocused)
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 155.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        // Info Column (Full available width across the left/center)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Row 1: Badges & Channel Metadata
            Row(
                modifier = Modifier.height(26.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (!channelLogoUrl.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .size(26.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0x33FFFFFF)),
                        contentAlignment = Alignment.Center,
                    ) {
                        AsyncImage(
                            model = channelLogoUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
                if (isLive) {
                    LiveBadge()
                } else if (showVodBadge) {
                    VodBadge()
                }
                if (subtitle.isNotBlank()) {
                    Text(
                        text = subtitle,
                        color = Color(0xFFE2E8F0),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!timeRange.isNullOrBlank()) {
                    Text(
                        text = "·  $timeRange",
                        color = HeroMutedText,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Normal,
                        maxLines = 1,
                    )
                }
            }

            // Row 2: Program Title (Bold, crisp with text shadow)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    text = title.ifBlank { "שידור חי" },
                    color = Color.White,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = TextStyle(
                        shadow = Shadow(
                            color = Color(0xEE000000),
                            offset = Offset(1.5f, 1.5f),
                            blurRadius = 4f,
                        )
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Row 3: Program Description (Flexible height, up to 3-5 lines, auto-scaled font, limited to a bit over half screen width)
            val displayDescription = description.trim().ifBlank {
                if (isLive && subtitle.isNotBlank()) "שידור חי בערוץ $subtitle" else ""
            }
            var fontScale by remember(displayDescription) { mutableStateOf(1f) }
            val descLength = displayDescription.length
            val (baseSizeSp, baseLineHeightSp, maxLines) = when {
                descLength <= 130 -> Triple(14f, 20f, 3)
                descLength <= 230 -> Triple(13f, 18.5f, 3)
                descLength <= 340 -> Triple(12f, 17f, 4)
                else -> Triple(11f, 15.5f, 5)
            }
            val currentFontSize = (baseSizeSp * fontScale).sp
            val currentLineHeight = (baseLineHeightSp * fontScale).sp

            Box(
                modifier = Modifier
                    .fillMaxWidth(0.58f)
                    .heightIn(min = 44.dp),
                contentAlignment = Alignment.TopStart,
            ) {
                if (displayDescription.isNotBlank()) {
                    Text(
                        text = displayDescription,
                        color = Color(0xFFD1D5DB),
                        fontSize = currentFontSize,
                        lineHeight = currentLineHeight,
                        maxLines = maxLines,
                        overflow = TextOverflow.Ellipsis,
                        onTextLayout = { textLayoutResult ->
                            if (textLayoutResult.hasVisualOverflow && fontScale > 0.75f) {
                                fontScale = (fontScale - 0.08f).coerceAtLeast(0.75f)
                            }
                        },
                        style = TextStyle(
                            shadow = Shadow(
                                color = Color(0xEE000000),
                                offset = Offset(1f, 1f),
                                blurRadius = 3f,
                            )
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        // Action Buttons: custom actions slot or default Fullscreen & Mute
        if (actions != null) {
            Row(
                modifier = Modifier.padding(start = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = actions,
            )
        } else if (hasActivePlayer) {
            Row(
                modifier = Modifier.padding(start = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Fullscreen Button
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (isFullScreenFocused) HeroFocusedBg
                            else Color(0x4D0E141D)
                        )
                        .border(
                            width = if (isFullScreenFocused) 2.dp else 1.dp,
                            color = if (isFullScreenFocused) HeroFocusedBg else Color(0x44FFFFFF),
                            shape = RoundedCornerShape(8.dp),
                        )
                        .tvFocusableClickable(
                            onClick = { onOpenFullScreen?.invoke() },
                            interactionSource = fullScreenInteractionSource,
                            focusRequester = fullScreenFocusRequester,
                            onNavigateDown = onNavigateDown,
                            onNavigateLeft = onNavigateLeft,
                            onNavigateRight = {
                                try {
                                    muteFocusRequester.requestFocus()
                                } catch (_: Exception) {}
                            },
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Fullscreen,
                        contentDescription = "מסך מלא",
                        tint = if (isFullScreenFocused) HeroFocusedContent else Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                }

                // Mute / Unmute Button
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            if (isMuteFocused) HeroFocusedBg
                            else Color(0x4D0E141D)
                        )
                        .border(
                            width = if (isMuteFocused) 2.dp else 1.dp,
                            color = if (isMuteFocused) HeroFocusedBg else Color(0x44FFFFFF),
                            shape = RoundedCornerShape(8.dp),
                        )
                        .tvFocusableClickable(
                            onClick = onToggleMute,
                            interactionSource = muteInteractionSource,
                            focusRequester = muteFocusRequester,
                            onNavigateDown = onNavigateDown,
                            onNavigateLeft = {
                                try {
                                    fullScreenFocusRequester.requestFocus()
                                } catch (_: Exception) {}
                            },
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                        contentDescription = if (isMuted) "הפעל קול" else "השתק",
                        tint = if (isMuteFocused) HeroFocusedContent else Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}

/**
 * Background artwork displaying image with letter fallback.
 */
@Composable
fun TvArtwork(imageUrl: String?, title: String, modifier: Modifier = Modifier) {
    if (!imageUrl.isNullOrBlank()) {
        val context = LocalContext.current
        val request = remember(imageUrl) {
            ImageRequest.Builder(context)
                .data(imageUrl)
                .size(TvBackgroundImageWidth, TvBackgroundImageHeight)
                .crossfade(250)
                .allowHardware(true)
                .build()
        }
        AsyncImage(model = request, contentDescription = title, contentScale = ContentScale.Crop, modifier = modifier)
    } else {
        Box(modifier.background(Color(0xFF1B2230)), contentAlignment = Alignment.Center) {
            Text(title.take(2), color = Color(0x66FFFFFF), fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * Inline video player for background playback.
 */
@Composable
fun TvInlinePlayer(
    player: StablePlayer,
    playerView: StablePlayerView,
    visible: Boolean,
    isPlayerExpanded: Boolean = false,
    modifier: Modifier = Modifier,
) {
    if (isPlayerExpanded) {
        return
    }

    val alpha = if (visible) 1f else 0f
    val shouldKeepScreenOn = visible && (player.value.isPlaying || (player.value.playWhenReady && player.value.playbackState != Player.STATE_IDLE && player.value.playbackState != Player.STATE_ENDED))

    DisposableEffect(playerView.value) {
        onDispose {
            playerView.value.player = null
            playerView.value.keepScreenOn = false
        }
    }

    AndroidView(
        factory = {
            (playerView.value.parent as? ViewGroup)?.removeView(playerView.value)
            playerView.value.player = if (isPlayerExpanded) null else player.value
            playerView.value.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            playerView.value.useController = false
            playerView.value.alpha = alpha
            playerView.value.keepScreenOn = shouldKeepScreenOn
            playerView.value.layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            playerView.value
        },
        update = {
            val targetPlayer = if (isPlayerExpanded) null else player.value
            if (it.player !== targetPlayer) {
                it.player = targetPlayer
            }
            it.alpha = alpha
            if (it.keepScreenOn != shouldKeepScreenOn) {
                it.keepScreenOn = shouldKeepScreenOn
            }
            if (it.resizeMode != AspectRatioFrameLayout.RESIZE_MODE_ZOOM) {
                it.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            }
            if (it.useController) {
                it.useController = false
            }
            if (it.isControllerFullyVisible) {
                it.hideController()
            }
        },
        modifier = modifier,
    )
}

@Composable
fun LiveBadge(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.clip(RoundedCornerShape(4.dp)).background(Color(0xFFE21D2F)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
        Text("LIVE", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun VodBadge(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(HeroAccent)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Icons.Default.MovieFilter, contentDescription = null, tint = Color(0xFF091016), modifier = Modifier.size(13.dp))
        Text("VOD", color = Color(0xFF091016), fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

// Backward-compatibility aliases for Home* names
@Composable
fun HomeHero(
    title: String,
    subtitle: String,
    description: String,
    timeRange: String?,
    channelLogoUrl: String?,
    isLive: Boolean,
    isMuted: Boolean,
    onToggleMute: () -> Unit,
    muteFocusRequester: FocusRequester,
    onNavigateLeft: () -> Unit,
    onNavigateDown: () -> Unit,
    onFocusChanged: ((Boolean) -> Unit)? = null,
    modifier: Modifier = Modifier,
    showVodBadge: Boolean = true,
    hasActivePlayer: Boolean = false,
    onOpenFullScreen: (() -> Unit)? = null,
    fullScreenFocusRequester: FocusRequester = remember { FocusRequester() },
) {
    TvHero(
        title = title,
        subtitle = subtitle,
        description = description,
        timeRange = timeRange,
        channelLogoUrl = channelLogoUrl,
        isLive = isLive,
        isMuted = isMuted,
        onToggleMute = onToggleMute,
        muteFocusRequester = muteFocusRequester,
        onNavigateLeft = onNavigateLeft,
        onNavigateDown = onNavigateDown,
        onFocusChanged = onFocusChanged,
        modifier = modifier,
        showVodBadge = showVodBadge,
        hasActivePlayer = hasActivePlayer,
        onOpenFullScreen = onOpenFullScreen,
        fullScreenFocusRequester = fullScreenFocusRequester,
    )
}

@Composable
fun HomeArtwork(imageUrl: String?, title: String, modifier: Modifier = Modifier) =
    TvArtwork(imageUrl = imageUrl, title = title, modifier = modifier)

@Composable
fun HomeInlinePlayer(
    player: StablePlayer,
    playerView: StablePlayerView,
    visible: Boolean,
    isPlayerExpanded: Boolean = false,
    modifier: Modifier = Modifier,
) = TvInlinePlayer(
    player = player,
    playerView = playerView,
    visible = visible,
    isPlayerExpanded = isPlayerExpanded,
    modifier = modifier,
)
