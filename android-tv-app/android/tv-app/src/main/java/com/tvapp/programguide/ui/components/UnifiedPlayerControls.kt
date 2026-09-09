package com.tvapp.programguide.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.ui.StablePlayer
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val GlowCyan = Color(0xFF7DF9FF)
private val FocusBlue = Color(0xFF0B5E93)

@Composable
fun UnifiedPlayerControlsOverlay(
    player: StablePlayer,
    title: String,
    subtitle: String? = null,
    badgeText: String = if (player.value.isCurrentMediaItemLive) "LIVE" else "VOD",
    isLive: Boolean = player.value.isCurrentMediaItemLive,
    logoUrl: String? = null,
    providerDisplayName: String? = null,
    previewImageUrl: String? = null,
    headerChannelText: String? = null,
    showMetadataPanel: Boolean = true,
    onInteraction: () -> Unit = {},
) {
    var positionMs by remember { mutableStateOf(0L) }
    var durationMs by remember { mutableStateOf(C.TIME_UNSET) }
    var isPlaying by remember { mutableStateOf(player.value.isPlaying) }
    var actualIsLive by remember { mutableStateOf(isLive || player.value.isCurrentMediaItemLive) }
    var liveWindowStartTimeMs by remember { mutableStateOf(C.TIME_UNSET) }
    var videoQuality by remember { mutableStateOf(videoQualityLabel(player.value.videoFormat)) }

    fun updatePlayerSnapshot(window: Timeline.Window) {
        positionMs = player.value.currentPosition.coerceAtLeast(0L)
        durationMs = player.value.duration
        isPlaying = player.value.isPlaying
        actualIsLive = isLive || player.value.isCurrentMediaItemLive
        liveWindowStartTimeMs = if (!player.value.currentTimeline.isEmpty) {
            player.value.currentTimeline.getWindow(player.value.currentMediaItemIndex, window).windowStartTimeMs
        } else {
            C.TIME_UNSET
        }
        videoQuality = videoQualityLabel(player.value.videoFormat)
    }

    DisposableEffect(player) {
        val window = Timeline.Window()
        val listener = object : Player.Listener {
            override fun onEvents(p: Player, events: Player.Events) {
                updatePlayerSnapshot(window)
            }
        }
        player.value.addListener(listener)
        updatePlayerSnapshot(window)
        onDispose {
            player.value.removeListener(listener)
        }
    }

    LaunchedEffect(player) {
        val window = Timeline.Window()
        while (true) {
            updatePlayerSnapshot(window)
            delay(if (actualIsLive) 1_500 else 500)
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomCenter,
    ) {
        if (showMetadataPanel && (!previewImageUrl.isNullOrBlank() || !headerChannelText.isNullOrBlank())) {
            ChannelOverlayPanel(
                headerChannelText = headerChannelText,
                title = title,
                imageUrl = previewImageUrl,
                modifier = Modifier.align(Alignment.TopStart),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color(0x66000000), Color(0xBF000000))
                    )
                )
                .padding(start = 44.dp, end = 44.dp, top = 42.dp, bottom = 24.dp),
        ) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = subtitle,
                    color = Color(0xFFCFCFCF),
                    fontSize = 18.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(18.dp))
            PlayerProgressBar(
                positionMs = positionMs,
                durationMs = durationMs,
                isLive = actualIsLive,
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ChannelLogoBadge(logoUrl = logoUrl, displayName = providerDisplayName)
                Spacer(Modifier.width(18.dp))
                IconButton(
                    onClick = {
                        onInteraction()
                        if (player.value.isPlaying) player.value.pause() else player.value.play()
                        isPlaying = player.value.isPlaying
                    },
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = Color.White,
                        modifier = Modifier.size(42.dp),
                    )
                }
                Spacer(Modifier.width(18.dp))
                Text(
                    text = playbackTimeLabel(positionMs, durationMs, actualIsLive, liveWindowStartTimeMs),
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.width(18.dp))
                UnifiedBadge(text = badgeText, isLive = actualIsLive)
                Spacer(Modifier.width(12.dp))
                VideoQualityBadge(videoQuality)
            }
        }
    }
}

@Composable
fun ChannelLogoBadge(logoUrl: String?, displayName: String? = null) {
    Box(
        modifier = Modifier
            .width(118.dp)
            .height(54.dp)
            .background(Color(0xFF050607), RoundedCornerShape(5.dp))
            .border(1.dp, Color(0xFF3B3B3B), RoundedCornerShape(5.dp))
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (!logoUrl.isNullOrBlank()) {
            val context = LocalContext.current
            val imageRequest = remember(logoUrl) {
                ImageRequest.Builder(context)
                    .data(logoUrl)
                    .size(236, 108)
                    .crossfade(false)
                    .build()
            }
            AsyncImage(
                model = imageRequest,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
        } else if (!displayName.isNullOrBlank()) {
            Text(
                text = displayName,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun ChannelOverlayPanel(
    headerChannelText: String?,
    title: String?,
    imageUrl: String?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .padding(start = 44.dp, top = 36.dp)
            .background(
                Brush.horizontalGradient(
                    colorStops = arrayOf(
                        0.00f to Color(0xEE08141A),
                        0.72f to Color(0xDC08141A),
                        1.00f to Color(0xB008141A),
                    )
                ),
                RoundedCornerShape(18.dp),
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!imageUrl.isNullOrBlank()) {
            val context = LocalContext.current
            val imageRequest = remember(imageUrl) {
                ImageRequest.Builder(context)
                    .data(imageUrl)
                    .size(328, 184)
                    .crossfade(false)
                    .build()
            }
            Box(
                modifier = Modifier
                    .width(164.dp)
                    .height(92.dp)
                    .background(Color(0xCC020609), RoundedCornerShape(10.dp))
                    .clip(RoundedCornerShape(10.dp))
                    .padding(5.dp),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = imageRequest,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Spacer(Modifier.width(14.dp))
        }
        Column {
            if (!headerChannelText.isNullOrBlank()) {
                Text(
                    text = headerChannelText,
                    color = Color.White,
                    fontSize = 21.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!title.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = title,
                    color = GlowCyan,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun PlayerProgressBar(positionMs: Long, durationMs: Long, isLive: Boolean) {
    val hasSeekableDuration = durationMs != C.TIME_UNSET && durationMs > 0
    val progress = if (hasSeekableDuration) {
        (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
    } else {
        1f
    }

    Box(
        Modifier
            .fillMaxWidth()
            .height(7.dp)
            .background(Color(0xFF4D4D4D), RoundedCornerShape(4.dp))
    ) {
        Box(
            Modifier
                .fillMaxWidth(progress)
                .fillMaxHeight()
                .background(if (isLive) Color(0xFFE21D2F) else GlowCyan, RoundedCornerShape(4.dp))
        )
    }
}

@Composable
fun UnifiedBadge(text: String, isLive: Boolean) {
    val bgColor = when {
        isLive -> Color(0xFFE21D2F)
        text == "VOD" -> Color(0xFF0F9BA8)
        else -> FocusBlue
    }
    Text(
        text = text,
        color = Color.White,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .background(bgColor, RoundedCornerShape(4.dp))
            .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

@Composable
fun VideoQualityBadge(label: String) {
    Text(
        text = "Quality $label",
        color = Color.White,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        modifier = Modifier
            .background(Color(0xAA111820), RoundedCornerShape(4.dp))
            .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

fun videoQualityLabel(format: Format?): String {
    if (format == null) return "Auto"
    val resolution = if (format.width > 0 && format.height > 0) {
        "${format.width}x${format.height}"
    } else {
        null
    }
    val bitrate = if (format.bitrate > 0) {
        String.format(Locale.US, "%.1f Mbps", format.bitrate / 1_000_000f)
    } else {
        null
    }
    return listOfNotNull(resolution, bitrate).takeIf { it.isNotEmpty() }?.joinToString("  ") ?: "Auto"
}

fun playbackTimeLabel(
    positionMs: Long,
    durationMs: Long,
    isLive: Boolean,
    liveWindowStartTimeMs: Long,
): String {
    if (durationMs == C.TIME_UNSET || durationMs <= 0) {
        return if (isLive) "Live" else "0:00 / 0:00"
    }
    if (isLive && liveWindowStartTimeMs != C.TIME_UNSET && liveWindowStartTimeMs > 0) {
        val startClock = formatClockTime(liveWindowStartTimeMs)
        val currentClock = formatClockTime(liveWindowStartTimeMs + positionMs)
        return "$startClock / $currentClock"
    }
    return "${formatPlaybackTime(positionMs)} / ${formatPlaybackTime(durationMs)}"
}

private fun formatClockTime(timeMs: Long): String =
    DateTimeFormatter.ofPattern("HH:mm:ss")
        .format(Instant.ofEpochMilli(timeMs).atZone(ZoneId.systemDefault()))

private fun formatPlaybackTime(timeMs: Long): String {
    val totalSeconds = (timeMs.coerceAtLeast(0L) / 1_000L)
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}
