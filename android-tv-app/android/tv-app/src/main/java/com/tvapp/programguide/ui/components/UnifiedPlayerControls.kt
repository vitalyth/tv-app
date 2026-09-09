package com.tvapp.programguide.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
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
private const val LIVE_EDGE_TOLERANCE_MS = 2_000L
private const val SEEK_STEP_MS = 30_000L

private data class VideoQualityOption(
    val key: String,
    val label: String,
    val height: Int,
    val bitrate: Int,
)

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
    var qualityOptions by remember { mutableStateOf<List<VideoQualityOption>>(emptyList()) }
    var qualityMenuOpen by remember { mutableStateOf(false) }
    var selectedQualityKey by remember { mutableStateOf<String?>(null) }
    var autoQuality by remember { mutableStateOf(true) }
    val playFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        playFocusRequester.requestFocus()
    }

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
        qualityOptions = videoQualityOptions(player.value.currentTracks)
        autoQuality = isAutoVideoQuality(player.value)
        selectedQualityKey = if (autoQuality) null else selectedVideoQualityKey(player.value)
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
            Box {
                if (qualityMenuOpen && qualityOptions.isNotEmpty()) {
                    QualityMenu(
                        options = qualityOptions,
                        selectedQualityKey = selectedQualityKey,
                        autoQuality = autoQuality,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(bottom = 68.dp)
                            .zIndex(2f),
                        onAuto = {
                            onInteraction()
                            setAutoVideoQuality(player.value)
                            qualityMenuOpen = false
                        },
                        onSelect = { option ->
                            onInteraction()
                            setManualVideoQuality(player.value, option)
                            qualityMenuOpen = false
                        },
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                ChannelLogoBadge(logoUrl = logoUrl, displayName = providerDisplayName)
                Spacer(Modifier.width(18.dp))
                IconButton(
                    onClick = {
                        onInteraction()
                        if (player.value.isPlaying) player.value.pause() else player.value.play()
                        isPlaying = player.value.isPlaying
                    },
                    modifier = Modifier
                        .size(56.dp)
                        .focusRequester(playFocusRequester),
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        tint = Color.White,
                        modifier = Modifier.size(42.dp),
                    )
                }
                Spacer(Modifier.width(18.dp))
                ControlPill(
                    text = "-30s",
                    enabled = canSeekBack(positionMs, durationMs),
                    onClick = {
                        onInteraction()
                        seekBy(player.value, -SEEK_STEP_MS)
                    },
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = playbackTimeLabel(positionMs, durationMs, actualIsLive, liveWindowStartTimeMs),
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.width(18.dp))
                if (actualIsLive) {
                    LiveButton(
                        atLiveEdge = isAtLiveEdge(positionMs, durationMs),
                        onClick = {
                            onInteraction()
                            seekToLive(player.value)
                        },
                    )
                } else {
                    UnifiedBadge(text = badgeText, isLive = false)
                }
                Spacer(Modifier.width(12.dp))
                VideoQualityBadge(
                    label = videoQualityButtonLabel(player.value.videoFormat, autoQuality),
                    enabled = qualityOptions.isNotEmpty(),
                    onClick = {
                        onInteraction()
                        if (qualityOptions.isNotEmpty()) {
                            qualityMenuOpen = !qualityMenuOpen
                        }
                    },
                )
                }
            }
        }
    }
}

@Composable
private fun ControlPill(
    text: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xAA111820),
            contentColor = Color.White,
            disabledContainerColor = Color(0x55111820),
            disabledContentColor = Color(0x66FFFFFF),
        ),
        shape = RoundedCornerShape(4.dp),
        contentPadding = ButtonDefaults.ContentPadding,
        modifier = Modifier.height(36.dp),
    ) {
        Text(text = text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun LiveButton(
    atLiveEdge: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (atLiveEdge) Color(0x22E21D2F) else Color(0xAA111820),
            contentColor = if (atLiveEdge) Color(0xFFE21D2F) else Color.White,
        ),
        shape = RoundedCornerShape(4.dp),
        contentPadding = ButtonDefaults.ContentPadding,
        modifier = Modifier.height(36.dp),
    ) {
        Text(text = "LIVE", fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun QualityMenu(
    options: List<VideoQualityOption>,
    selectedQualityKey: String?,
    autoQuality: Boolean,
    modifier: Modifier = Modifier,
    onAuto: () -> Unit,
    onSelect: (VideoQualityOption) -> Unit,
) {
    Column(
        modifier = modifier
            .width(148.dp)
            .background(Color(0xE6111820), RoundedCornerShape(6.dp))
            .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(6.dp))
            .padding(vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        QualityMenuItem(
            text = currentAutoQualityLabel(options, selectedQualityKey),
            selected = autoQuality,
            onClick = onAuto,
        )
        options.forEach { option ->
            QualityMenuItem(
                text = option.label,
                selected = option.key == selectedQualityKey,
                onClick = { onSelect(option) },
            )
        }
    }
}

@Composable
private fun QualityMenuItem(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = if (selected) Color.White else Color.Transparent,
            contentColor = if (selected) Color(0xFF111820) else Color.White,
        ),
        shape = RoundedCornerShape(3.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(38.dp),
    ) {
        Text(
            text = text,
            fontSize = 14.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
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
fun VideoQualityBadge(label: String, enabled: Boolean = false, onClick: () -> Unit = {}) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xAA111820),
            contentColor = Color.White,
            disabledContainerColor = Color(0xAA111820),
            disabledContentColor = Color.White,
        ),
        shape = RoundedCornerShape(4.dp),
        contentPadding = ButtonDefaults.ContentPadding,
        modifier = Modifier.height(36.dp),
    ) {
        Text(
            text = "Quality $label",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun canSeekBack(positionMs: Long, durationMs: Long): Boolean =
    positionMs > 1_000L && durationMs != C.TIME_UNSET && durationMs > 0

private fun isAtLiveEdge(positionMs: Long, durationMs: Long): Boolean =
    durationMs == C.TIME_UNSET || durationMs <= 0 || durationMs - positionMs <= LIVE_EDGE_TOLERANCE_MS

private fun seekBy(player: Player, deltaMs: Long) {
    val durationMs = player.duration
    if (durationMs == C.TIME_UNSET || durationMs <= 0) return
    val target = (player.currentPosition + deltaMs).coerceIn(0L, durationMs)
    player.seekTo(target)
    player.play()
}

private fun seekToLive(player: Player) {
    player.seekToDefaultPosition()
    player.play()
}

private fun setAutoVideoQuality(player: Player) {
    player.trackSelectionParameters = player.trackSelectionParameters
        .buildUpon()
        .setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
        .setMaxVideoBitrate(Int.MAX_VALUE)
        .build()
}

private fun setManualVideoQuality(player: Player, option: VideoQualityOption) {
    player.trackSelectionParameters = player.trackSelectionParameters
        .buildUpon()
        .setMaxVideoSize(Int.MAX_VALUE, if (option.height > 0) option.height else Int.MAX_VALUE)
        .setMaxVideoBitrate(if (option.bitrate > 0) option.bitrate else Int.MAX_VALUE)
        .build()
}

private fun isAutoVideoQuality(player: Player): Boolean {
    val parameters = player.trackSelectionParameters
    return parameters.maxVideoHeight == Int.MAX_VALUE &&
        parameters.maxVideoWidth == Int.MAX_VALUE &&
        parameters.maxVideoBitrate == Int.MAX_VALUE
}

private fun selectedVideoQualityKey(player: Player): String? {
    val parameters = player.trackSelectionParameters
    return when {
        parameters.maxVideoHeight != Int.MAX_VALUE -> "height:${parameters.maxVideoHeight}"
        parameters.maxVideoBitrate != Int.MAX_VALUE -> "bitrate:${parameters.maxVideoBitrate}"
        else -> null
    }
}

private fun videoQualityOptions(tracks: androidx.media3.common.Tracks): List<VideoQualityOption> {
    val options = linkedMapOf<String, VideoQualityOption>()
    tracks.groups.forEach { group ->
        if (group.type != C.TRACK_TYPE_VIDEO) return@forEach
        for (index in 0 until group.length) {
            if (!group.isTrackSupported(index)) continue
            val format = group.getTrackFormat(index)
            val height = format.height.takeIf { it > 0 } ?: 0
            val bitrate = format.bitrate.takeIf { it > 0 } ?: 0
            val key = when {
                height > 0 -> "height:$height"
                bitrate > 0 -> "bitrate:$bitrate"
                else -> continue
            }
            options.putIfAbsent(
                key,
                VideoQualityOption(
                    key = key,
                    label = videoQualityOptionLabel(height, bitrate),
                    height = height,
                    bitrate = bitrate,
                ),
            )
        }
    }
    return options.values.sortedWith(
        compareByDescending<VideoQualityOption> { it.height }
            .thenByDescending { it.bitrate }
    )
}

private fun videoQualityOptionLabel(height: Int, bitrate: Int): String =
    when {
        height > 0 -> "${height}p"
        bitrate >= 1_000_000 -> String.format(Locale.US, "%.1fM", bitrate / 1_000_000f)
        bitrate > 0 -> "${bitrate / 1_000}K"
        else -> "Unknown"
    }

private fun currentAutoQualityLabel(options: List<VideoQualityOption>, selectedQualityKey: String?): String {
    val selected = options.firstOrNull { it.key == selectedQualityKey }?.label
    return if (selected.isNullOrBlank()) "Auto" else "Auto ($selected)"
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

private fun videoQualityButtonLabel(format: Format?, autoQuality: Boolean): String {
    if (format == null) return "Auto"
    val current = when {
        format.height >= 2160 -> "4K"
        format.height >= 1080 -> "FHD"
        format.height >= 720 -> "HD"
        format.height > 0 -> "SD"
        else -> null
    }
    return when {
        autoQuality && current != null -> current
        autoQuality -> "Auto"
        current != null -> current
        else -> "Manual"
    }
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
