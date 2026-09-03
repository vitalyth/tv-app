package com.tvapp.programguide.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.ViewGroup
import android.view.LayoutInflater
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Timeline
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.R
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ScreenBackground = Color(0xFF050607)
private val CellBackground = Color(0xFF202020)
private val CellBorder = Color(0xFF4A4A4A)
private val FocusBlue = Color(0xFF0B5E93)
private val GlowCyan = Color(0xFF7DF9FF)
private val PrimaryCyan = Color(0xFF10D5D9)
private val ActiveGreen = Color(0xFF19D99A)
private val Gold = Color(0xFFFFC928)
private val GuideZoneId = ZoneId.of("Asia/Jerusalem")
private val TimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

@Stable
private class StablePlayer(val value: ExoPlayer)

private data class VisibleProgram(
    val program: TvProgram,
    val visibleStartSeconds: Long,
    val width: Dp,
)

private data class GridFocusTarget(
    val nonce: Int,
    val channelId: String,
    val programKey: String? = null,
    val live: Boolean = false,
)

@Composable
private fun KeepScreenOnEffect(enabled: Boolean) {
    val activity = LocalContext.current.findActivity()

    DisposableEffect(activity, enabled) {
        if (enabled) {
            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

@Composable
private fun StopPlaybackOnStopEffect(onStop: () -> Unit) {
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner, onStop) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                onStop()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
}

@Composable
fun ProgramGuideApp(viewModel: GuideViewModel = viewModel()) {
    val guideState by viewModel.guideState.collectAsStateWithLifecycle()
    val playbackState by viewModel.playbackState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val activeStreamUrl = remember { mutableStateOf<String?>(null) }
    val trackSelector = remember {
        DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setMaxVideoSize(960, 540)
                    .setForceLowestBitrate(false)
            )
        }
    }
    val player = remember {
        ExoPlayer.Builder(context).setTrackSelector(trackSelector).build().apply {
            playWhenReady = true
        }
    }
    val stablePlayer = remember(player) { StablePlayer(player) }
    val streamingActive = playbackState.isMiniPlayerPlaying || playbackState.isPlayerExpanded
    var gridFocusNonce by remember { mutableIntStateOf(0) }
    var gridFocusTarget by remember { mutableStateOf<GridFocusTarget?>(null) }

    fun requestGridFocus(channel: TvChannel?, program: TvProgram? = null, live: Boolean = false) {
        val channelId = channel?.id ?: return
        gridFocusNonce += 1
        gridFocusTarget = GridFocusTarget(
            nonce = gridFocusNonce,
            channelId = channelId,
            programKey = program?.programKey(),
            live = live,
        )
    }

    KeepScreenOnEffect(enabled = streamingActive)
    StopPlaybackOnStopEffect(
        onStop = {
            player.stop()
            activeStreamUrl.value = null
            viewModel.stopPlayback()
        }
    )

    DisposableEffect(Unit) {
        onDispose { player.release() }
    }

    LaunchedEffect(playbackState.isPlayerExpanded) {
        val parameters = trackSelector.buildUponParameters()
            .setForceLowestBitrate(false)
            .let { builder ->
                if (playbackState.isPlayerExpanded) {
                    builder.setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                } else {
                    builder.setMaxVideoSize(960, 540)
                }
            }
        trackSelector.setParameters(parameters)
    }

    LaunchedEffect(
        playbackState.isMiniPlayerPlaying,
        playbackState.isPlayerExpanded,
        playbackState.playingChannel?.streamUrl,
    ) {
        val channel = playbackState.playingChannel ?: return@LaunchedEffect
        val shouldPlay = playbackState.isMiniPlayerPlaying || playbackState.isPlayerExpanded
        if (!shouldPlay) {
            player.stop()
            activeStreamUrl.value = null
            return@LaunchedEffect
        }

        val streamUrl = viewModel.streamUrl(channel)
        if (streamUrl.isBlank()) {
            player.stop()
            activeStreamUrl.value = null
            return@LaunchedEffect
        }
        if (activeStreamUrl.value != streamUrl) {
            val mediaItem = MediaItem.Builder()
                .setUri(streamUrl)
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .build()
            player.setMediaItem(mediaItem)
            player.prepare()
            activeStreamUrl.value = streamUrl
        }
        player.play()
    }

    MaterialTheme {
        Box(Modifier.fillMaxSize().background(ScreenBackground)) {
            when {
                guideState.loading -> GuideMessage(stringResource(R.string.loading_guide))
                guideState.error != null -> GuideError(guideState.error ?: "Error", viewModel::refresh)
                guideState.guideData != null -> GuideContent(
                    data = guideState.guideData!!,
                    selectedChannel = guideState.selectedChannel,
                    displayChannel = playbackState.playingChannel ?: playbackState.selectedChannel,
                    displayProgram = playbackState.playingProgram ?: playbackState.selectedProgram,
                    playingChannel = playbackState.playingChannel,
                    playingProgram = playbackState.playingProgram,
                    player = stablePlayer,
                    isMiniPlayerPlaying = playbackState.isMiniPlayerPlaying,
                    isPlayerExpanded = playbackState.isPlayerExpanded,
                    onChannelActivated = viewModel::playChannel,
                    onLiveChannelOpened = viewModel::playChannelExpanded,
                    onPlayerClick = viewModel::expandPlayer,
                    onGuideRangeNeeded = viewModel::ensureGuideRange,
                    gridFocusTarget = gridFocusTarget,
                    onGridFocusRequested = { channel, program, live ->
                        requestGridFocus(channel, program, live)
                    },
                )
            }

            if (playbackState.isPlayerExpanded) {
                ExpandedPlayer(
                    player = stablePlayer,
                    channel = playbackState.playingChannel,
                    program = playbackState.playingProgram,
                    onNextChannel = viewModel::playNextChannel,
                    onPreviousChannel = viewModel::playPreviousChannel,
                    onClose = {
                        requestGridFocus(playbackState.playingChannel, live = true)
                        viewModel.collapsePlayer()
                    },
                )
            }
        }
    }
}

@Composable
private fun GuideContent(
    data: GuideData,
    selectedChannel: TvChannel?,
    displayChannel: TvChannel?,
    displayProgram: TvProgram?,
    playingChannel: TvChannel?,
    playingProgram: TvProgram?,
    player: StablePlayer,
    isMiniPlayerPlaying: Boolean,
    isPlayerExpanded: Boolean,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onLiveChannelOpened: (TvChannel, TvProgram?) -> Unit,
    onPlayerClick: () -> Unit,
    onGuideRangeNeeded: (Long, Long) -> Unit,
    gridFocusTarget: GridFocusTarget?,
    onGridFocusRequested: (TvChannel?, TvProgram?, Boolean) -> Unit,
) {
    val topPanelFocusRequester = remember { FocusRequester() }
    val gridFocusRequester = remember { FocusRequester() }
    val nowButtonFocusRequester = remember { FocusRequester() }
    var detailsChannel by remember { mutableStateOf<TvChannel?>(null) }
    var detailsProgram by remember { mutableStateOf<TvProgram?>(null) }

    val programForDetails = detailsProgram
    if (programForDetails != null) {
        ProgramDetailsPage(
            channel = detailsChannel,
            program = programForDetails,
            onPlayLive = {
                detailsChannel?.let { channel ->
                    onGridFocusRequested(channel, null, true)
                    detailsChannel = null
                    detailsProgram = null
                    onLiveChannelOpened(channel, null)
                }
            },
            onClose = {
                onGridFocusRequested(detailsChannel, programForDetails, false)
                detailsChannel = null
                detailsProgram = null
            },
        )
    } else {
        Column(Modifier.fillMaxSize()) {
            TopInfoPanel(
                channel = displayChannel,
                program = displayProgram,
                playingChannel = playingChannel,
                playingProgram = playingProgram,
                player = player,
                isMiniPlayerPlaying = isMiniPlayerPlaying,
                isPlayerExpanded = isPlayerExpanded,
                onPlayerClick = onPlayerClick,
                topPanelFocusRequester = topPanelFocusRequester,
                gridFocusRequester = gridFocusRequester,
            )
            ProgramGrid(
                data = data,
                selectedChannel = selectedChannel,
                playingChannel = playingChannel,
                onChannelActivated = onChannelActivated,
                onLiveChannelOpened = onLiveChannelOpened,
                onProgramDetailsRequested = { channel, program ->
                    detailsChannel = channel
                    detailsProgram = program
                },
                onGuideRangeNeeded = onGuideRangeNeeded,
                focusTarget = gridFocusTarget,
                gridFocusRequester = gridFocusRequester,
                topFocusRequester = topPanelFocusRequester,
                nowButtonFocusRequester = nowButtonFocusRequester,
            )
        }
    }
}

@Composable
private fun TopInfoPanel(
    channel: TvChannel?,
    program: TvProgram?,
    playingChannel: TvChannel?,
    playingProgram: TvProgram?,
    player: StablePlayer,
    isMiniPlayerPlaying: Boolean,
    isPlayerExpanded: Boolean,
    onPlayerClick: () -> Unit,
    topPanelFocusRequester: FocusRequester,
    gridFocusRequester: FocusRequester,
) {
    val focused = remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(226.dp)
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF17262A), Color(0xFF090D10))
                )
            )
            .padding(start = 14.dp, top = 12.dp, end = 14.dp, bottom = 12.dp)
            .clip(RoundedCornerShape(9.dp))
            .border(1.dp, Color(0xFF3F5961), RoundedCornerShape(9.dp))
            .onPreviewKeyEvent {
                when {
                    it.type == KeyEventType.KeyUp && it.key.isActivationKey() -> {
                        onPlayerClick()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                        gridFocusRequester.requestFocus()
                        true
                    }
                    else -> false
                }
            }
            .onFocusChanged { focused.value = it.isFocused }
            .focusRequester(topPanelFocusRequester)
            .focusable()
            .clickable(onClick = onPlayerClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProgramHeroPanel(
            channel = channel,
            program = program,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
        MiniPlayerPreview(
            channel = playingChannel ?: channel,
            program = playingProgram ?: program,
            player = player,
            isPlaying = isMiniPlayerPlaying,
            isPlayerExpanded = isPlayerExpanded,
            onClick = onPlayerClick,
            showOpenIcon = focused.value,
            modifier = Modifier.width(360.dp).fillMaxHeight(),
        )
    }
}

@Composable
private fun ProgramHeroPanel(
    channel: TvChannel?,
    program: TvProgram?,
    modifier: Modifier = Modifier,
) {
    val backgroundUrl = program?.imageUrl ?: channel?.logoUrl
    val title = program?.title ?: channel?.name ?: ""
    val description = program?.description?.ifBlank { null } ?: channel?.name.orEmpty()
    val textAlign = if (title.isMostlyRtlText() || description.isMostlyRtlText()) TextAlign.Right else TextAlign.Left
    val contentAlignment = if (textAlign == TextAlign.Right) Alignment.End else Alignment.Start

    Box(
        modifier = modifier
            .background(Color(0xFF081723))
            .clipToBounds(),
    ) {
        AsyncImage(
            model = rememberSizedImageRequest(backgroundUrl, width = 900, height = 320),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xAA00101A))
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        listOf(Color(0xF1081420), Color(0xDD081420), Color(0x88081420))
                    )
                )
        )
        Box(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .height(112.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color(0xEE071016))
                    )
                )
        )

        Row(
            modifier = Modifier
                .align(if (textAlign == TextAlign.Right) Alignment.TopEnd else Alignment.TopStart)
                .padding(start = 30.dp, top = 26.dp, end = 30.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LiveDot()
            Spacer(Modifier.width(10.dp))
            Text(
                text = program?.timeRange().orEmpty(),
                color = Color(0xFFD4DEE3),
                fontSize = 18.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = channel?.name.orEmpty(),
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.width(14.dp))
            ChannelLogoCircle(channel)
        }

        Column(
            modifier = Modifier
                .align(if (textAlign == TextAlign.Right) Alignment.BottomEnd else Alignment.BottomStart)
                .padding(start = 38.dp, end = 38.dp, bottom = 26.dp)
                .fillMaxWidth(0.9f),
            horizontalAlignment = contentAlignment,
        ) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = textAlign,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = description,
                color = Color(0xFFD1DEE4),
                fontSize = 16.sp,
                lineHeight = 21.sp,
                textAlign = textAlign,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun LiveDot() {
    Box(
        Modifier
            .size(10.dp)
            .background(Color(0xFFFF3648), CircleShape)
    )
}

@Composable
private fun ChannelLogoCircle(channel: TvChannel?) {
    Box(
        modifier = Modifier
            .size(58.dp)
            .background(Color.White, CircleShape)
            .border(1.dp, Color(0x55FFFFFF), CircleShape)
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = rememberSizedImageRequest(channel?.logoUrl, width = 96, height = 96),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun MiniPlayerPreview(
    channel: TvChannel?,
    program: TvProgram?,
    player: StablePlayer,
    isPlaying: Boolean,
    isPlayerExpanded: Boolean,
    onClick: () -> Unit,
    showOpenIcon: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .aspectRatio(16f / 9f)
            .background(Color.Black)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (isPlaying && !isPlayerExpanded) {
            PlayerSurface(player = player, useController = false)
        } else {
            AsyncImage(
                model = rememberSizedImageRequest(program?.imageUrl ?: channel?.logoUrl, width = 580, height = 326),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().padding(14.dp),
            )
        }
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .fillMaxHeight()
                .width(118.dp)
                .background(
                    Brush.horizontalGradient(
                        colorStops = arrayOf(
                            0.00f to Color(0xF0081420),
                            0.42f to Color(0xA0081420),
                            0.76f to Color(0x22081420),
                            1.00f to Color.Transparent,
                        )
                    )
                )
        )
        if (showOpenIcon) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(72.dp)
                    .background(Color(0xAA000000), CircleShape)
                    .border(2.dp, Color(0xCCFFFFFF), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_fullscreen),
                    contentDescription = "Open fullscreen",
                    tint = Color.White,
                    modifier = Modifier.size(38.dp),
                )
            }
        }
    }
}

@Composable
private fun ProgramArtwork(channel: TvChannel?, program: TvProgram?) {
    Box(
        modifier = Modifier
            .width(220.dp)
            .aspectRatio(16f / 9f)
            .background(Color.Black)
            .border(1.dp, Color(0xFF666666)),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = rememberSizedImageRequest(program?.imageUrl ?: channel?.logoUrl, width = 440, height = 248),
            contentDescription = null,
            modifier = Modifier.fillMaxSize().padding(10.dp),
        )
        Row(
            modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(channel?.number.orEmpty(), color = Color.White, fontSize = 22.sp)
        }
    }
}

@Composable
private fun ProgramDetails(channel: TvChannel?, program: TvProgram?, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxHeight(), verticalArrangement = Arrangement.Center) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = program?.title ?: channel?.name ?: "",
                    color = Color.White,
                    fontSize = 26.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = channel?.name.orEmpty(),
                    color = Color(0xFFB7B7B7),
                    fontSize = 20.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(
                painter = painterResource(R.drawable.ic_clock),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(12.dp))
            Text(program?.timeRange().orEmpty(), color = Color.White, fontSize = 22.sp)
        }
        Spacer(Modifier.height(14.dp))
        RatingLine()
        Spacer(Modifier.height(14.dp))
        Text(
            text = program?.description?.ifBlank { "No description available" } ?: "Select a program",
            color = Color(0xFFC9C9C9),
            fontSize = 18.sp,
            lineHeight = 24.sp,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun RatingLine() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("HD", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.background(Color.White).padding(horizontal = 4.dp))
        Spacer(Modifier.width(10.dp))
        repeat(5) {
            Icon(Icons.Default.Star, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
        }
    }
}

@Composable
private fun ProgramGrid(
    data: GuideData,
    selectedChannel: TvChannel?,
    playingChannel: TvChannel?,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onLiveChannelOpened: (TvChannel, TvProgram?) -> Unit,
    onProgramDetailsRequested: (TvChannel, TvProgram) -> Unit,
    onGuideRangeNeeded: (Long, Long) -> Unit,
    focusTarget: GridFocusTarget?,
    gridFocusRequester: FocusRequester,
    topFocusRequester: FocusRequester,
    nowButtonFocusRequester: FocusRequester,
) {
    val density = LocalDensity.current

    BoxWithConstraints(Modifier.fillMaxSize()) {
    val snappedStart = data.guideStartSeconds
    val timelineEndSeconds = data.guideEndSeconds
    val slotWidth = 180.dp
    val channelWidth = 150.dp
    val visibleRowCount = visibleGuideRowCount(data.channels.size)
    val headerHeight = 48.dp
    val gridAvailableHeight = (maxHeight - headerHeight).coerceAtLeast(72.dp)
    val activeRowHeight = if (visibleRowCount > 1) {
        gridAvailableHeight * 0.34f
    } else {
        gridAvailableHeight
    }
    val inactiveRowHeight = if (visibleRowCount > 1) {
        (gridAvailableHeight - activeRowHeight) / (visibleRowCount - 1)
    } else {
        gridAvailableHeight
    }
    val totalSlots = (((timelineEndSeconds - snappedStart) / 1800L).toInt()).coerceAtLeast(10)
    val timelineWidth = slotWidth * totalSlots
    val timelineViewportWidth = (maxWidth - channelWidth).coerceAtLeast(slotWidth)
    val selectedChannelId = selectedChannel?.id
    val playingChannelId = playingChannel?.id
    val slotWidthPx = with(density) { slotWidth.toPx() }
    val timelineViewportWidthPx = with(density) { timelineViewportWidth.toPx() }
    val maxScrollOffsetPx = with(density) {
        max(0f, (timelineWidth - timelineViewportWidth).toPx()).roundToInt()
    }
    val renderPaddingSeconds = 5 * 60L
    var scrollOffsetPx by remember { mutableIntStateOf(0) }
    var selectedRowIndex by remember(data.channels) {
        mutableIntStateOf(
            data.channels.indexOfFirst { it.id == selectedChannelId }
                .takeIf { it >= 0 }
                ?: 0
        )
    }
    val nowSeconds by rememberGuideNowSeconds()
    var selectedProgramIndex by remember(data.channels, selectedChannelId) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        mutableIntStateOf(liveProgramIndex(initialPrograms, nowSeconds))
    }
    var selectedProgramKey by remember(data.channels, selectedChannelId) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        val initialIndex = liveProgramIndex(initialPrograms, nowSeconds)
        mutableStateOf(initialPrograms.getOrNull(initialIndex)?.programKey())
    }
    var selectedTimeAnchorSeconds by remember(data.channels, selectedChannelId) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        val initialIndex = liveProgramIndex(initialPrograms, nowSeconds)
        mutableStateOf(initialPrograms.getOrNull(initialIndex)?.centerSeconds() ?: nowSeconds)
    }
    var programFocusMode by remember(data.channels, selectedChannelId) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        mutableStateOf(initialPrograms.isNotEmpty())
    }
    val scrollOffsetDp = with(density) { scrollOffsetPx.toDp() }
    var firstVisibleRowIndex by remember(data.channels, visibleRowCount) {
        mutableIntStateOf(
            (selectedRowIndex - visibleRowCount / 2)
                .coerceIn(0, data.channels.lastIndex.coerceAtLeast(0))
        )
    }
    val maxFirstVisibleRowIndex = (data.channels.size - visibleRowCount).coerceAtLeast(0)
    val visibleTimeRange by remember(scrollOffsetPx, slotWidthPx, timelineViewportWidthPx, snappedStart) {
        derivedStateOf {
            val pixelsPerSecond = slotWidthPx / 1800f
            val visibleStart = snappedStart + (scrollOffsetPx / pixelsPerSecond).toLong()
            val visibleDuration = (timelineViewportWidthPx / pixelsPerSecond).toLong()
            visibleStart to visibleStart + visibleDuration
        }
    }
    val renderTimeRange by remember(visibleTimeRange) {
        derivedStateOf {
            visibleTimeRange.first - renderPaddingSeconds to visibleTimeRange.second + renderPaddingSeconds
        }
    }
    val nowOffset = durationWidth(max(0L, nowSeconds - snappedStart), slotWidth)
    val initialNowScrollOffset = durationWidth(max(0L, nowSeconds - 3600L - snappedStart), slotWidth)
    val showLiveLine = nowSeconds >= snappedStart && nowSeconds <= timelineEndSeconds
    var previousNowSeconds by remember { mutableStateOf<Long?>(null) }
    var didInitialScroll by remember { mutableStateOf(false) }
    var previousGuideStartSeconds by remember { mutableStateOf(snappedStart) }
    var gridFocused by remember { mutableStateOf(true) }
    var gridNavigating by remember { mutableStateOf(false) }
    var navigationIdleJob by remember { mutableStateOf<Job?>(null) }
    val lastNavigationEventMs = remember { LongArray(1) }
    val navigationScope = rememberCoroutineScope()
    val scrollOffsetProvider = remember { { scrollOffsetPx } }
    val activeSelectionChannel = data.channels.getOrNull(selectedRowIndex)
    val activeSelectionPrograms = activeSelectionChannel
        ?.let { data.programsByChannel[it.id].orEmpty() }
        .orEmpty()
    val activeSelectionProgramKeys = remember(activeSelectionPrograms) {
        activeSelectionPrograms.map { it.programKey() }
    }
    val currentSelectionProgram = currentProgramForNow(activeSelectionPrograms, nowSeconds)
        ?: activeSelectionPrograms.firstOrNull()
    val keyedSelectionProgram = selectedProgramKey
        ?.let { key -> activeSelectionPrograms.firstOrNull { it.programKey() == key } }
    val activeSelectionProgram = if (selectedProgramIndex >= 0) {
        keyedSelectionProgram ?: activeSelectionPrograms.getOrNull(selectedProgramIndex) ?: currentSelectionProgram
    } else {
        currentSelectionProgram
    }

    fun markGridNavigating() {
        if (!gridNavigating) {
            gridNavigating = true
        }
        navigationIdleJob?.cancel()
        navigationIdleJob = navigationScope.launch {
            delay(450)
            gridNavigating = false
        }
    }

    fun acceptNavigationEvent(): Boolean {
        val nowMs = System.currentTimeMillis()
        if (nowMs - lastNavigationEventMs[0] < 85L) return false
        lastNavigationEventMs[0] = nowMs
        return true
    }

    fun moveSelectedRow(delta: Int) {
        val nextIndex = (selectedRowIndex + delta).coerceIn(0, data.channels.lastIndex)
        if (nextIndex == selectedRowIndex) return
        markGridNavigating()
        val keepProgramFocus = programFocusMode
        val targetTimeSeconds = activeSelectionProgram
            ?.visibleCenterSeconds(visibleTimeRange)
            ?.also { selectedTimeAnchorSeconds = it }
            ?: selectedTimeAnchorSeconds.coerceIn(visibleTimeRange.first, visibleTimeRange.second)
        selectedRowIndex = nextIndex
        val nextChannel = data.channels.getOrNull(nextIndex)
        val nextPrograms = nextChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        selectedProgramIndex = if (keepProgramFocus) {
            programIndexAtTime(nextPrograms, targetTimeSeconds)
        } else {
            -1
        }
        selectedProgramKey = nextPrograms.getOrNull(selectedProgramIndex)?.programKey()
        programFocusMode = keepProgramFocus
        firstVisibleRowIndex = when {
            nextIndex < firstVisibleRowIndex -> nextIndex
            nextIndex >= firstVisibleRowIndex + visibleRowCount ->
                (nextIndex - visibleRowCount + 1).coerceAtMost(maxFirstVisibleRowIndex)
            else -> firstVisibleRowIndex
        }
    }

    fun moveTimeline(delta: Int) {
        val nextOffset = (scrollOffsetPx + delta * slotWidthPx.roundToInt()).coerceIn(0, maxScrollOffsetPx)
        if (nextOffset == scrollOffsetPx) return
        markGridNavigating()
        scrollOffsetPx = nextOffset
    }

    fun moveSelectedProgram(delta: Int) {
        val programs = activeSelectionPrograms
        if (programs.isEmpty()) {
            selectedProgramIndex = -1
            selectedProgramKey = null
            programFocusMode = false
            return
        }
        markGridNavigating()
        selectedProgramIndex = (selectedProgramIndex + delta).coerceIn(-1, programs.lastIndex)
        selectedProgramKey = programs.getOrNull(selectedProgramIndex)?.programKey()
        programFocusMode = selectedProgramIndex >= 0
        if (selectedProgramIndex < 0) return
        val program = programs[selectedProgramIndex]
        selectedTimeAnchorSeconds = program.visibleCenterSeconds(visibleTimeRange)
        scrollOffsetPx = centeredScrollOffsetPx(
            program = program,
            timelineStartSeconds = snappedStart,
            slotWidthPx = slotWidthPx,
            timelineViewportWidthPx = timelineViewportWidthPx,
            maxScrollOffsetPx = maxScrollOffsetPx,
        )
    }

    fun activateSelection(expandLive: Boolean) {
        val channel = activeSelectionChannel ?: return
        val program = activeSelectionProgram
        if (selectedProgramIndex < 0 || program == null || isCurrent(program, nowSeconds)) {
            if (expandLive) {
                onLiveChannelOpened(channel, program)
            } else {
                onChannelActivated(channel, program)
            }
        } else {
            onProgramDetailsRequested(channel, program)
        }
    }

    fun jumpToNow() {
        val target = with(density) { initialNowScrollOffset.toPx() }
            .roundToInt()
            .coerceIn(0, maxScrollOffsetPx)
        scrollOffsetPx = target

        val liveIndex = liveProgramIndex(activeSelectionPrograms, nowSeconds)
        selectedProgramIndex = liveIndex
        selectedProgramKey = activeSelectionPrograms.getOrNull(liveIndex)?.programKey()
        programFocusMode = liveIndex >= 0
        selectedTimeAnchorSeconds = activeSelectionPrograms.getOrNull(liveIndex)?.centerSeconds() ?: nowSeconds
    }

    LaunchedEffect(focusTarget) {
        val target = focusTarget ?: return@LaunchedEffect
        val nextRowIndex = data.channels.indexOfFirst { it.id == target.channelId }
        if (nextRowIndex < 0) return@LaunchedEffect

        selectedRowIndex = nextRowIndex
        firstVisibleRowIndex = when {
            nextRowIndex < firstVisibleRowIndex -> nextRowIndex
            nextRowIndex >= firstVisibleRowIndex + visibleRowCount ->
                (nextRowIndex - visibleRowCount + 1).coerceAtMost(maxFirstVisibleRowIndex)
            else -> firstVisibleRowIndex
        }

        val programs = data.programsByChannel[target.channelId].orEmpty()
        val nextProgramIndex = when {
            target.live -> liveProgramIndex(programs, nowSeconds)
            target.programKey != null -> programs.indexOfFirst { it.programKey() == target.programKey }
            else -> -1
        }
        selectedProgramIndex = nextProgramIndex
        selectedProgramKey = programs.getOrNull(nextProgramIndex)?.programKey()
        programFocusMode = nextProgramIndex >= 0 || target.live

        programs.getOrNull(nextProgramIndex)?.let { program ->
            selectedTimeAnchorSeconds = if (target.live) {
                nowSeconds
            } else {
                program.visibleCenterSeconds(visibleTimeRange)
            }
            scrollOffsetPx = if (target.live) {
                with(density) { initialNowScrollOffset.toPx() }
                    .roundToInt()
                    .coerceIn(0, maxScrollOffsetPx)
            } else {
                centeredScrollOffsetPx(
                    program = program,
                    timelineStartSeconds = snappedStart,
                    slotWidthPx = slotWidthPx,
                    timelineViewportWidthPx = timelineViewportWidthPx,
                    maxScrollOffsetPx = maxScrollOffsetPx,
                )
            }
        }

        delay(80)
        gridFocusRequester.requestFocus()
    }

    LaunchedEffect(
        activeSelectionChannel?.id,
        activeSelectionProgram?.programKey(),
        gridFocused,
        playingChannelId,
    ) {
        if (!gridFocused) return@LaunchedEffect
        if (activeSelectionChannel?.id == playingChannelId) return@LaunchedEffect
        delay(3_000)
        activeSelectionChannel?.let { channel ->
            if (channel.id == playingChannelId) return@let
            onChannelActivated(channel, currentSelectionProgram)
        }
    }

    LaunchedEffect(activeSelectionChannel?.id, activeSelectionProgramKeys) {
        if (selectedProgramIndex < 0) {
            selectedProgramKey = null
            return@LaunchedEffect
        }

        val stableIndex = selectedProgramKey
            ?.let { key -> activeSelectionProgramKeys.indexOf(key) }
            ?: -1
        if (stableIndex >= 0) {
            if (selectedProgramIndex != stableIndex) {
                selectedProgramIndex = stableIndex
            }
            return@LaunchedEffect
        }

        val liveIndex = liveProgramIndex(activeSelectionPrograms, nowSeconds)
        selectedProgramIndex = liveIndex
        selectedProgramKey = activeSelectionPrograms.getOrNull(liveIndex)?.programKey()
    }

    LaunchedEffect(snappedStart, slotWidthPx) {
        val previousStart = previousGuideStartSeconds
        previousGuideStartSeconds = snappedStart
        if (didInitialScroll && snappedStart < previousStart) {
            val addedSeconds = previousStart - snappedStart
            val addedPx = (addedSeconds / 1800f) * slotWidthPx
            scrollOffsetPx = (scrollOffsetPx + addedPx.roundToInt()).coerceIn(0, maxScrollOffsetPx)
        }
    }

    LaunchedEffect(didInitialScroll, visibleTimeRange.first, visibleTimeRange.second) {
        if (!didInitialScroll) return@LaunchedEffect
        onGuideRangeNeeded(visibleTimeRange.first, visibleTimeRange.second)
    }

    LaunchedEffect(data, nowSeconds, slotWidthPx, initialNowScrollOffset, maxScrollOffsetPx) {
        if (didInitialScroll) return@LaunchedEffect
        if (maxScrollOffsetPx <= 0) return@LaunchedEffect
        jumpToNow()
        didInitialScroll = true
    }

    LaunchedEffect(didInitialScroll, selectedRowIndex, selectedProgramIndex) {
        if (!didInitialScroll) return@LaunchedEffect
        delay(100)
        gridFocusRequester.requestFocus()
    }

    LaunchedEffect(maxFirstVisibleRowIndex, selectedRowIndex, visibleRowCount) {
        firstVisibleRowIndex = firstVisibleRowIndex.coerceIn(0, maxFirstVisibleRowIndex)
        if (selectedRowIndex < firstVisibleRowIndex) {
            firstVisibleRowIndex = selectedRowIndex.coerceIn(0, maxFirstVisibleRowIndex)
        } else if (selectedRowIndex >= firstVisibleRowIndex + visibleRowCount) {
            firstVisibleRowIndex = (selectedRowIndex - visibleRowCount + 1).coerceIn(0, maxFirstVisibleRowIndex)
        }
    }

    LaunchedEffect(nowSeconds, slotWidthPx, timelineViewportWidthPx, timelineEndSeconds) {
        val previousNow = previousNowSeconds
        previousNowSeconds = nowSeconds
        if (previousNow == null) return@LaunchedEffect

        val deltaSeconds = nowSeconds - previousNow
        if (deltaSeconds <= 0 || deltaSeconds > 3600L) return@LaunchedEffect

        val previousNowX = ((previousNow - snappedStart).coerceAtLeast(0L) / 1800f) * slotWidthPx
        val visibleProgramLeft = scrollOffsetPx.toFloat()
        val visibleProgramWidth = max(slotWidthPx, timelineViewportWidthPx)
        val nowWasVisible =
            previousNowX >= visibleProgramLeft - 2f &&
                previousNowX <= visibleProgramLeft + visibleProgramWidth + 2f

        if (!nowWasVisible) return@LaunchedEffect

        val deltaPx = deltaSeconds * (slotWidthPx / 1800f)
        scrollOffsetPx = min(maxScrollOffsetPx.toFloat(), scrollOffsetPx.toFloat() + deltaPx).toInt()
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Column(Modifier.fillMaxSize().background(Color(0xFF080A0C))) {
            TimeHeader(
                startSeconds = snappedStart,
                slotWidth = slotWidth,
                channelWidth = channelWidth,
                timelineWidth = timelineWidth,
                totalSlots = totalSlots,
                modifier = Modifier.height(48.dp),
                scrollOffset = scrollOffsetDp,
                visibleStartSeconds = renderTimeRange.first,
                visibleEndSeconds = renderTimeRange.second,
                nowSeconds = nowSeconds,
                showLiveLine = showLiveLine,
                nowOffset = nowOffset,
                focusRequester = nowButtonFocusRequester,
                onMoveUp = { topFocusRequester.requestFocus() },
                onMoveDown = { gridFocusRequester.requestFocus() },
                onMoveRight = { gridFocusRequester.requestFocus() },
                onNowClick = {
                    jumpToNow()
                },
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .focusRequester(gridFocusRequester)
                    .onFocusChanged { gridFocused = it.hasFocus || it.isFocused }
                    .onPreviewKeyEvent {
                        when {
                            it.key.isActivationKey() && it.type == KeyEventType.KeyUp -> {
                                activateSelection(expandLive = true)
                                true
                            }
                            it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                                if (acceptNavigationEvent()) moveSelectedRow(1)
                                true
                            }
                            it.type == KeyEventType.KeyDown && it.key == Key.DirectionUp -> {
                                if (!acceptNavigationEvent()) {
                                    true
                                } else if (selectedRowIndex == 0) {
                                    nowButtonFocusRequester.requestFocus()
                                } else {
                                    moveSelectedRow(-1)
                                }
                                true
                            }
                            it.type == KeyEventType.KeyDown && it.key == Key.DirectionRight -> {
                                if (acceptNavigationEvent()) moveSelectedProgram(1)
                                true
                            }
                            it.type == KeyEventType.KeyDown && it.key == Key.DirectionLeft -> {
                                if (acceptNavigationEvent()) moveSelectedProgram(-1)
                                true
                            }
                            else -> false
                        }
                    }
                    .focusable()
            ) {
                Column(Modifier.fillMaxSize()) {
                    val lastVisibleRowIndex = min(data.channels.lastIndex, firstVisibleRowIndex + visibleRowCount - 1)
                    if (firstVisibleRowIndex <= lastVisibleRowIndex) {
                        for (index in firstVisibleRowIndex..lastVisibleRowIndex) {
                            val channel = data.channels[index]
                            key(channel.id) {
                                GuideRow(
                                    channel = channel,
                                    programs = data.programsByChannel[channel.id].orEmpty(),
                                    isSelectedChannel = gridFocused && selectedRowIndex == index,
                                    isPlayingChannel = playingChannelId == channel.id,
                                    isChannelFocused = gridFocused && selectedRowIndex == index && selectedProgramIndex < 0,
                                    selectedProgramKey = activeSelectionProgram?.programKey().takeIf {
                                        selectedRowIndex == index && selectedProgramIndex >= 0
                                    },
                                    slotWidth = slotWidth,
                                    channelWidth = channelWidth,
                                    timelineWidth = timelineWidth,
                                    timelineViewportWidth = timelineViewportWidth,
                                    timelineStartSeconds = snappedStart,
                                    timelineEndSeconds = timelineEndSeconds,
                                    visibleStartSeconds = visibleTimeRange.first,
                                    visibleEndSeconds = visibleTimeRange.second,
                                    nowSeconds = nowSeconds,
                                    rowHeight = if (selectedRowIndex == index) activeRowHeight else inactiveRowHeight,
                                    showArtwork = selectedRowIndex == index,
                                    slotWidthPx = slotWidthPx,
                                    scrollOffsetPx = scrollOffsetProvider,
                                )
                            }
                        }
                    }
                }
                if (showLiveLine) {
                    LiveNowLine(
                        channelWidth = channelWidth,
                        nowOffset = nowOffset,
                        timelineWidth = timelineWidth,
                        scrollOffset = scrollOffsetDp,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
    }
    }
}

@Composable
private fun TimeHeader(
    startSeconds: Long,
    slotWidth: Dp,
    channelWidth: Dp,
    timelineWidth: Dp,
    totalSlots: Int,
    modifier: Modifier,
    scrollOffset: Dp,
    visibleStartSeconds: Long,
    visibleEndSeconds: Long,
    nowSeconds: Long,
    showLiveLine: Boolean,
    nowOffset: Dp,
    focusRequester: FocusRequester,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onMoveRight: () -> Unit,
    onNowClick: () -> Unit,
) {
    Row(modifier.background(Color(0xFF131417)), verticalAlignment = Alignment.CenterVertically) {
        NowJumpButton(
            width = channelWidth,
            focusRequester = focusRequester,
            onMoveUp = onMoveUp,
            onMoveDown = onMoveDown,
            onMoveRight = onMoveRight,
            onClick = onNowClick,
        )
        Box(Modifier.fillMaxHeight().fillMaxWidth().clipToBounds()) {
            Box(Modifier.width(timelineWidth).fillMaxHeight()) {
                val firstSlotIndex = max(0, ((visibleStartSeconds - startSeconds) / 1800L).toInt() - 1)
                val lastSlotIndex = min(totalSlots - 1, ((visibleEndSeconds - startSeconds) / 1800L).toInt() + 1)
                if (firstSlotIndex <= lastSlotIndex) {
                    for (index in firstSlotIndex..lastSlotIndex) {
                        val slotStart = startSeconds + index * 1800L
                        val xOffset = durationWidth(slotStart - startSeconds, slotWidth) - scrollOffset
                        Box(
                            Modifier
                                .offset(x = xOffset)
                                .width(slotWidth)
                                .fillMaxHeight()
                                .border(0.5.dp, Color(0xFF26282D)),
                            contentAlignment = Alignment.CenterStart,
                        ) {
                            Text(
                                text = TimeFormatter.format(Instant.ofEpochSecond(slotStart).atZone(GuideZoneId)),
                                color = Color(0xFFB8BCC6),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(start = 12.dp),
                            )
                        }
                    }
                }
            }
            if (showLiveLine) {
                Box(
                    Modifier
                        .offset(x = nowOffset - scrollOffset - 39.dp)
                        .width(78.dp)
                        .height(22.dp)
                        .align(Alignment.BottomStart)
                        .background(PrimaryCyan, RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = TimeFormatter.format(Instant.ofEpochSecond(nowSeconds).atZone(GuideZoneId)),
                        color = Color(0xFF031012),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                    )
                }
            }
        }
    }
}

@Composable
private fun NowJumpButton(
    width: Dp,
    focusRequester: FocusRequester,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onMoveRight: () -> Unit,
    onClick: () -> Unit,
) {
    val focused = remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .width(width)
            .fillMaxHeight()
            .background(Color(0xFF131417))
            .border(0.5.dp, Color(0xFF2A2C31))
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .width(124.dp)
                .height(36.dp)
                .background(
                    if (focused.value) PrimaryCyan else Color(0xFF0E7C82),
                    RoundedCornerShape(18.dp),
                )
                .border(
                    if (focused.value) 3.dp else 1.dp,
                    if (focused.value) Color.White else Color(0x9910D5D9),
                    RoundedCornerShape(18.dp),
                )
                .padding(horizontal = 12.dp)
                .onPreviewKeyEvent {
                    when {
                        it.type == KeyEventType.KeyUp && it.key.isActivationKey() -> {
                            onClick()
                            true
                        }
                        it.type == KeyEventType.KeyDown && it.key == Key.DirectionUp -> {
                            onMoveUp()
                            true
                        }
                        it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                            onMoveDown()
                            true
                        }
                        it.type == KeyEventType.KeyDown && it.key == Key.DirectionRight -> {
                            onMoveRight()
                            true
                        }
                        else -> false
                    }
                }
                .onFocusChanged { focused.value = it.isFocused }
                .focusRequester(focusRequester)
                .focusable()
                .clickable(onClick = onClick),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(
                Icons.Default.PlayArrow,
                contentDescription = null,
                tint = Color(0xFF031012),
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(5.dp))
            Text(
                text = "Show Now",
                color = Color(0xFF031012),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun LiveNowLine(
    channelWidth: Dp,
    nowOffset: Dp,
    timelineWidth: Dp,
    scrollOffset: Dp,
    modifier: Modifier = Modifier,
) {
    Box(modifier) {
        Box(
            Modifier
                .padding(start = channelWidth)
                .fillMaxHeight()
                .fillMaxWidth()
                .clipToBounds()
        ) {
            Box(
                Modifier
                    .width(timelineWidth)
                    .fillMaxHeight()
            ) {
                Box(
                    Modifier
                        .offset(x = nowOffset - scrollOffset)
                        .width(2.dp)
                        .fillMaxHeight()
                        .background(PrimaryCyan)
                )
            }
        }
    }
}

@Composable
private fun GuideRow(
    channel: TvChannel,
    programs: List<TvProgram>,
    isSelectedChannel: Boolean,
    isPlayingChannel: Boolean,
    isChannelFocused: Boolean,
    selectedProgramKey: String?,
    slotWidth: Dp,
    channelWidth: Dp,
    timelineWidth: Dp,
    timelineViewportWidth: Dp,
    timelineStartSeconds: Long,
    timelineEndSeconds: Long,
    visibleStartSeconds: Long,
    visibleEndSeconds: Long,
    nowSeconds: Long,
    rowHeight: Dp,
    showArtwork: Boolean,
    slotWidthPx: Float,
    scrollOffsetPx: () -> Int,
) {
    val visiblePrograms = remember(programs, visibleStartSeconds, visibleEndSeconds, slotWidth) {
        val sortedPrograms = programs.sortedBy { it.startSeconds }
        sortedPrograms
            .mapIndexedNotNull { index, program ->
                if (program.endSeconds <= visibleStartSeconds || program.startSeconds >= visibleEndSeconds) {
                    return@mapIndexedNotNull null
                }
                val nextStartSeconds = sortedPrograms.getOrNull(index + 1)?.startSeconds
                val displayEndSeconds = min(program.endSeconds, nextStartSeconds ?: program.endSeconds)
                val clippedStartSeconds = max(program.startSeconds, visibleStartSeconds)
                val clippedEndSeconds = min(displayEndSeconds, visibleEndSeconds)
                val displayDurationSeconds = clippedEndSeconds - clippedStartSeconds
                if (displayDurationSeconds <= 0L) {
                    null
                } else {
                    VisibleProgram(
                        program = program,
                        visibleStartSeconds = clippedStartSeconds,
                        width = durationWidth(displayDurationSeconds, slotWidth),
                    )
                }
            }
    }

    val rowSelected = isSelectedChannel

    Row(
        Modifier
            .fillMaxWidth()
            .height(rowHeight)
            .background(Color(0xFF101114))
            .border(0.5.dp, Color(0xFF101114))
    ) {
        ChannelCell(
            channel = channel,
            width = channelWidth,
            selected = rowSelected,
            focused = isChannelFocused,
            active = isPlayingChannel,
        )
        Box(
            Modifier
                .width(timelineViewportWidth)
                .fillMaxHeight()
                .clipToBounds()
        ) {
            Box(
                Modifier
                    .width(timelineWidth)
                    .fillMaxHeight()
                    .offset { IntOffset(-scrollOffsetPx(), 0) }
            ) {
                visiblePrograms.forEach { visibleProgram ->
                    val program = visibleProgram.program
                    key(program.programKey()) {
                        val width = visibleProgram.width
                        val programOffsetPx =
                            (((visibleProgram.visibleStartSeconds - timelineStartSeconds) / 1800f) * slotWidthPx)
                                .roundToInt()
                        ProgramCell(
                            program = program,
                            width = width,
                            isCurrent = isCurrent(program, nowSeconds),
                            isSelectedChannel = rowSelected,
                            isFocusedProgram = selectedProgramKey == program.programKey(),
                            isPlayingChannel = isPlayingChannel,
                            showImage = showArtwork && width >= 110.dp && !program.imageUrl.isNullOrBlank(),
                            offsetXPx = programOffsetPx,
                        )
                    }
                }
                if (programs.isEmpty()) {
                    Box(
                        Modifier
                            .width(if (timelineWidth < timelineViewportWidth) timelineWidth else timelineViewportWidth)
                            .fillMaxHeight()
                            .padding(horizontal = 3.dp, vertical = 3.dp)
                            .background(Color(0x8018191D), RoundedCornerShape(8.dp))
                            .border(1.dp, Color(0x66303136), RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.CenterEnd,
                    ) {
                        Text(
                            text = "אין מידע",
                            color = Color(0xFF777A82),
                            fontSize = 14.sp,
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChannelCell(
    channel: TvChannel,
    width: Dp,
    selected: Boolean,
    focused: Boolean,
    active: Boolean,
) {
    Row(
        modifier = Modifier
            .width(width)
            .fillMaxHeight()
            .background(
                when {
                    focused -> Color(0xFF0FCBD0)
                    active -> Color(0xFF043626)
                    selected -> Color(0xFF102B30)
                    else -> Color(0xFF17181B)
                }
            )
            .border(0.5.dp, Color(0xFF17181B))
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(Color(0xFF26272C), RoundedCornerShape(6.dp))
                .padding(5.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (channel.logoUrl.isNotBlank()) {
                AsyncImage(
                    model = rememberSizedImageRequest(channel.logoUrl, width = 72, height = 72),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Text(
                    text = channel.number,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(7.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (active) {
                    Icon(
                        Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = if (focused) Color(0xFF031012) else ActiveGreen,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                }
                Text(
                    text = channel.name,
                    color = if (focused) Color(0xFF031012) else Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(2.dp))
            Text(
                text = if (active) "מנגן עכשיו" else channel.number,
                color = when {
                    focused -> Color(0xFF073235)
                    active -> ActiveGreen
                    else -> Color(0xFF8C8F98)
                },
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun rememberSizedImageRequest(url: String?, width: Int, height: Int): ImageRequest {
    val context = LocalContext.current
    return remember(url, width, height) {
        ImageRequest.Builder(context)
            .data(url)
            .size(width, height)
            .crossfade(false)
            .build()
    }
}

@Composable
private fun ProgramCell(
    program: TvProgram,
    width: Dp,
    isCurrent: Boolean,
    isSelectedChannel: Boolean,
    isFocusedProgram: Boolean,
    isPlayingChannel: Boolean,
    showImage: Boolean,
    offsetXPx: Int,
) {
    val background = when {
        isFocusedProgram -> Color(0xFFF2F4F7)
        isCurrent -> Color(0xFF31333A)
        else -> Color(0xEE24252A)
    }
    val borderColor = when {
        isCurrent -> Color(0xFF4B4E57)
        else -> Color(0xFF383A40)
    }
    val borderWidth = when {
        isFocusedProgram -> 0.dp
        isCurrent -> 0.5.dp
        else -> 0.dp
    }
    val cellShape = RoundedCornerShape(7.dp)
    val imageWidth = 88.dp

    Box(
        modifier = Modifier
            .offset { IntOffset(offsetXPx, 0) }
            .width(width)
            .fillMaxHeight()
            .padding(horizontal = 3.dp, vertical = 3.dp)
            .background(background, cellShape)
            .then(
                if (borderWidth > 0.dp) {
                    Modifier.border(borderWidth, borderColor, cellShape)
                } else {
                    Modifier
                }
            )
            .clip(cellShape),
        contentAlignment = Alignment.CenterEnd,
    ) {
        if (showImage) {
            AsyncImage(
                model = rememberSizedImageRequest(program.imageUrl, width = 180, height = 96),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(imageWidth)
                    .fillMaxHeight(),
            )
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .width(imageWidth)
                    .fillMaxHeight()
                    .background(
                        Brush.horizontalGradient(
                            colorStops = arrayOf(
                                0.00f to Color.Transparent,
                                0.28f to background.copy(alpha = 0.18f),
                                0.62f to background.copy(alpha = 0.68f),
                                1.00f to background.copy(alpha = 0.96f),
                            )
                        )
                    )
            )
        }
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = if (showImage) imageWidth - 8.dp else 8.dp, end = 8.dp, top = 3.dp, bottom = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.End,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isPlayingChannel && isCurrent) {
                        Box(
                            modifier = Modifier
                                .size(18.dp)
                                .background(ActiveGreen, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Default.PlayArrow,
                                contentDescription = null,
                                tint = Color(0xFF032018),
                                modifier = Modifier.size(13.dp),
                            )
                        }
                        Spacer(Modifier.width(5.dp))
                    } else if (isCurrent) {
                        LiveDot()
                        Spacer(Modifier.width(5.dp))
                    }
                    val focusedTextColor = Color(0xFF071114)
                    Text(
                        text = program.title,
                        color = if (isFocusedProgram) focusedTextColor else Color.White,
                        fontSize = 13.sp,
                        lineHeight = 14.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Right,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
                Text(
                    text = program.timeRange(),
                    color = if (isFocusedProgram) Color(0xFF263238) else Color(0xFFB1B4BC),
                    fontSize = 10.sp,
                    lineHeight = 10.sp,
                    textAlign = TextAlign.Right,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun ProgramDetailsPage(
    channel: TvChannel?,
    program: TvProgram,
    onPlayLive: () -> Unit,
    onClose: () -> Unit,
) {
    val closeFocusRequester = remember { FocusRequester() }
    val playFocusRequester = remember { FocusRequester() }
    var closeFocused by remember { mutableStateOf(false) }
    var playFocused by remember { mutableStateOf(false) }

    BackHandler(onBack = onClose)
    LaunchedEffect(Unit) {
        closeFocusRequester.requestFocus()
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF17262A), Color(0xFF050607))
                )
            )
            .padding(32.dp)
    ) {
        AsyncImage(
            model = rememberSizedImageRequest(program.imageUrl ?: channel?.logoUrl, width = 1280, height = 720),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0xD9050A0D))
        )

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(0.86f),
            horizontalAlignment = Alignment.End,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
            ) {
                DetailActionButton(
                    text = "סגור",
                    focused = closeFocused,
                    modifier = Modifier
                        .focusRequester(closeFocusRequester)
                        .onFocusChanged { closeFocused = it.isFocused },
                    onMoveRight = { playFocusRequester.requestFocus() },
                    onClick = onClose,
                )
                Spacer(Modifier.width(12.dp))
                if (!channel?.streamUrl.isNullOrBlank()) {
                    DetailActionButton(
                        text = "נגן Live",
                        focused = playFocused,
                        modifier = Modifier
                            .focusRequester(playFocusRequester)
                            .onFocusChanged { playFocused = it.isFocused },
                        onMoveLeft = { closeFocusRequester.requestFocus() },
                        onClick = onPlayLive,
                    )
                }
            }
            Spacer(Modifier.height(70.dp))
            Text(
                text = channel?.name.orEmpty(),
                color = Color(0xFFB9C6CC),
                fontSize = 24.sp,
                textAlign = TextAlign.Right,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = program.title,
                color = Color.White,
                fontSize = 42.sp,
                lineHeight = 46.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Right,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = program.timeRange(),
                color = Color(0xFFCAD4D9),
                fontSize = 22.sp,
                textAlign = TextAlign.Right,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(28.dp))
            Text(
                text = program.description.ifBlank { "אין תיאור זמין" },
                color = Color(0xFFE2EAEE),
                fontSize = 24.sp,
                lineHeight = 32.sp,
                textAlign = TextAlign.Right,
                maxLines = 7,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun DetailActionButton(
    text: String,
    focused: Boolean,
    modifier: Modifier = Modifier,
    onMoveLeft: (() -> Unit)? = null,
    onMoveRight: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .height(44.dp)
            .background(
                if (focused) Color(0xFFF2F4F7) else Color(0xFF1D272C),
                RoundedCornerShape(22.dp),
            )
            .border(
                1.5.dp,
                if (focused) PrimaryCyan else Color(0xFF4A5960),
                RoundedCornerShape(22.dp),
            )
            .padding(horizontal = 20.dp)
            .onPreviewKeyEvent {
                when {
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionLeft && onMoveLeft != null -> {
                        onMoveLeft()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionRight && onMoveRight != null -> {
                        onMoveRight()
                        true
                    }
                    it.type == KeyEventType.KeyUp && it.key.isActivationKey() -> {
                        onClick()
                        true
                    }
                    else -> false
                }
            }
            .focusable()
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            color = if (focused) Color(0xFF061013) else Color.White,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun ExpandedPlayer(
    player: StablePlayer,
    channel: TvChannel?,
    program: TvProgram?,
    onNextChannel: () -> Unit,
    onPreviousChannel: () -> Unit,
    onClose: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    var controlsVisible by remember { mutableStateOf(true) }
    var lastInteraction by remember { mutableStateOf(0) }

    BackHandler(onBack = onClose)
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
    LaunchedEffect(channel?.id) {
        controlsVisible = true
        lastInteraction += 1
    }
    LaunchedEffect(controlsVisible, lastInteraction) {
        if (!controlsVisible) return@LaunchedEffect
        delay(5_000)
        controlsVisible = false
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .onPreviewKeyEvent {
                if (it.type != KeyEventType.KeyUp) return@onPreviewKeyEvent false
                when {
                    it.key == Key.DirectionUp -> {
                        controlsVisible = true
                        lastInteraction += 1
                        onPreviousChannel()
                        true
                    }
                    it.key == Key.DirectionDown -> {
                        controlsVisible = true
                        lastInteraction += 1
                        onNextChannel()
                        true
                    }
                    it.key.isActivationKey() && !controlsVisible -> {
                        controlsVisible = true
                        lastInteraction += 1
                        true
                    }
                    else -> {
                        controlsVisible = true
                        lastInteraction += 1
                        false
                    }
                }
            }
            .focusable()
    ) {
        PlayerSurface(player = player, useController = false)
        if (controlsVisible) {
            ExpandedPlayerControls(
                player = player,
                channel = channel,
                program = program,
                onInteraction = {
                    controlsVisible = true
                    lastInteraction += 1
                },
            )
        }
    }
}

@Composable
private fun PlayerSurface(player: StablePlayer, useController: Boolean) {
    AndroidView(
        factory = { context ->
            (LayoutInflater.from(context).inflate(R.layout.player_view, null) as PlayerView).apply {
                this.player = player.value
                this.useController = useController
                controllerAutoShow = true
                controllerShowTimeoutMs = if (useController) 5_000 else 3_000
                isFocusable = useController
                isFocusableInTouchMode = useController
                if (useController) showController() else hideController()
                if (useController) requestFocus()
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
        },
        update = {
            if (it.player !== player.value) {
                it.player = player.value
            }
            if (it.useController != useController) {
                it.useController = useController
            }
            it.controllerAutoShow = true
            val timeoutMs = if (useController) 5_000 else 3_000
            if (it.controllerShowTimeoutMs != timeoutMs) {
                it.controllerShowTimeoutMs = timeoutMs
            }
            if (it.isFocusable != useController) {
                it.isFocusable = useController
            }
            if (it.isFocusableInTouchMode != useController) {
                it.isFocusableInTouchMode = useController
            }
            if (useController) {
                if (!it.isControllerFullyVisible) it.showController()
                if (!it.hasFocus()) it.requestFocus()
            } else if (it.isControllerFullyVisible) {
                it.hideController()
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun ExpandedPlayerControls(
    player: StablePlayer,
    channel: TvChannel?,
    program: TvProgram?,
    onInteraction: () -> Unit,
) {
    var positionMs by remember { mutableStateOf(0L) }
    var durationMs by remember { mutableStateOf(C.TIME_UNSET) }
    var isPlaying by remember { mutableStateOf(player.value.isPlaying) }
    var isLive by remember { mutableStateOf(player.value.isCurrentMediaItemLive) }
    var liveWindowStartTimeMs by remember { mutableStateOf(C.TIME_UNSET) }

    LaunchedEffect(player) {
        val window = Timeline.Window()
        while (true) {
            positionMs = player.value.currentPosition.coerceAtLeast(0L)
            durationMs = player.value.duration
            isPlaying = player.value.isPlaying
            isLive = player.value.isCurrentMediaItemLive
            liveWindowStartTimeMs = if (!player.value.currentTimeline.isEmpty) {
                player.value.currentTimeline.getWindow(player.value.currentMediaItemIndex, window).windowStartTimeMs
            } else {
                C.TIME_UNSET
            }
            delay(500)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize(),
        contentAlignment = Alignment.BottomCenter,
    ) {
        ChannelOverlayPanel(
            channel = channel,
            program = program,
            modifier = Modifier.align(Alignment.TopStart),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color(0xDD000000), Color(0xF6000000))
                    )
                )
                .padding(start = 44.dp, end = 44.dp, top = 84.dp, bottom = 28.dp),
        ) {
            Text(
                text = program?.title ?: channel?.name ?: "",
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = listOfNotNull(channel?.name, program?.timeRange()).joinToString("  |  "),
                color = Color(0xFFCFCFCF),
                fontSize = 18.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(18.dp))
            PlayerProgressBar(
                positionMs = positionMs,
                durationMs = durationMs,
                isLive = isLive,
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ChannelLogoBadge(channel = channel)
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
                    text = playbackTimeLabel(positionMs, durationMs, isLive, liveWindowStartTimeMs),
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.width(18.dp))
                LiveBadge(isLive = isLive)
            }
        }
    }
}

@Composable
private fun ChannelLogoBadge(channel: TvChannel?) {
    Box(
        modifier = Modifier
            .width(118.dp)
            .height(54.dp)
            .background(Color(0xFF050607), RoundedCornerShape(5.dp))
            .border(1.dp, Color(0xFF3B3B3B), RoundedCornerShape(5.dp))
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = channel?.logoUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun ChannelOverlayPanel(
    channel: TvChannel?,
    program: TvProgram?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .padding(start = 44.dp, top = 36.dp)
            .background(Color(0xDD050607), RoundedCornerShape(6.dp))
            .border(1.dp, Color(0xFF4E5F68), RoundedCornerShape(6.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(178.dp)
                .height(100.dp)
                .background(Color.Black, RoundedCornerShape(4.dp))
                .border(1.dp, Color(0xFF333333), RoundedCornerShape(4.dp))
                .padding(6.dp),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(
                model = program?.imageUrl ?: channel?.logoUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Spacer(Modifier.width(14.dp))
        Column {
            Text(
                text = listOfNotNull(channel?.number, channel?.name).joinToString("  "),
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = program?.title.orEmpty(),
                color = Color(0xFFCFCFCF),
                fontSize = 16.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun PlayerProgressBar(positionMs: Long, durationMs: Long, isLive: Boolean) {
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
private fun LiveBadge(isLive: Boolean) {
    Text(
        text = if (isLive) "LIVE" else "DVR",
        color = Color.White,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .background(if (isLive) Color(0xFFE21D2F) else FocusBlue, RoundedCornerShape(4.dp))
            .padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

@Composable
private fun GuideMessage(text: String) {
    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF17262A), Color(0xFF050607))
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.ic_app_logo),
                contentDescription = text,
                modifier = Modifier.size(96.dp),
            )
            Spacer(Modifier.height(18.dp))
            Text(
                text = text,
                color = Color.White,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Loading...",
                color = Color(0xFFB8C4CA),
                fontSize = 16.sp,
            )
        }
    }
}

@Composable
private fun GuideError(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, color = Color.White, fontSize = 22.sp)
        Spacer(Modifier.height(18.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

private fun TvProgram.timeRange(): String {
    val zoneId = GuideZoneId
    return "${TimeFormatter.format(Instant.ofEpochSecond(startSeconds).atZone(zoneId))} - ${TimeFormatter.format(Instant.ofEpochSecond(endSeconds).atZone(zoneId))}"
}

private fun programWidth(program: TvProgram, slotWidth: Dp): Dp {
    val minutes = max(15L, (program.endSeconds - program.startSeconds) / 60L)
    return slotWidth * (minutes / 30f)
}

private fun durationWidth(durationSeconds: Long, slotWidth: Dp): Dp =
    slotWidth * (durationSeconds / 1800f)

private fun visibleGuideRowCount(channelCount: Int): Int =
    min(4, channelCount).coerceAtLeast(1)

private fun isCurrent(program: TvProgram, nowSeconds: Long): Boolean =
    nowSeconds in program.startSeconds until program.endSeconds

private fun TvProgram.centerSeconds(): Long =
    startSeconds + (endSeconds - startSeconds) / 2

private fun TvProgram.visibleCenterSeconds(visibleTimeRange: Pair<Long, Long>): Long {
    val visibleStart = max(startSeconds, visibleTimeRange.first)
    val visibleEnd = min(endSeconds, visibleTimeRange.second)
    return if (visibleEnd > visibleStart) {
        visibleStart + (visibleEnd - visibleStart) / 2
    } else {
        centerSeconds()
    }
}

private fun closestProgramIndex(programs: List<TvProgram>, targetSeconds: Long): Int =
    programs.indices.minByOrNull { index ->
        kotlin.math.abs(programs[index].centerSeconds() - targetSeconds)
    } ?: -1

private fun programIndexAtTime(programs: List<TvProgram>, targetSeconds: Long): Int =
    programs
        .withIndex()
        .filter { (_, program) -> targetSeconds in program.startSeconds until program.endSeconds }
        .maxByOrNull { (_, program) -> program.startSeconds }
        ?.index
        ?: programs.indices.minByOrNull { index ->
            val program = programs[index]
            when {
                targetSeconds < program.startSeconds -> program.startSeconds - targetSeconds
                targetSeconds >= program.endSeconds -> targetSeconds - program.endSeconds
                else -> 0L
            }
        }
        ?: -1

private fun currentProgramForNow(programs: List<TvProgram>, nowSeconds: Long): TvProgram? =
    programs
        .asSequence()
        .filter { isCurrent(it, nowSeconds) }
        .maxByOrNull { it.startSeconds }

private fun liveProgramIndex(programs: List<TvProgram>, nowSeconds: Long): Int =
    programs
        .withIndex()
        .filter { (_, program) -> isCurrent(program, nowSeconds) }
        .maxByOrNull { (_, program) -> program.startSeconds }
        ?.index
        ?: closestProgramIndex(programs, nowSeconds)

private fun centeredScrollOffsetPx(
    program: TvProgram,
    timelineStartSeconds: Long,
    slotWidthPx: Float,
    timelineViewportWidthPx: Float,
    maxScrollOffsetPx: Int,
): Int {
    val programCenterPx = ((program.centerSeconds() - timelineStartSeconds) / 1800f) * slotWidthPx
    return (programCenterPx - timelineViewportWidthPx / 2f)
        .roundToInt()
        .coerceIn(0, maxScrollOffsetPx)
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

@Composable
private fun rememberGuideNowSeconds(): androidx.compose.runtime.State<Long> {
    val nowSeconds = remember { mutableStateOf(currentEpochSeconds()) }
    LaunchedEffect(Unit) {
        while (true) {
            nowSeconds.value = currentEpochSeconds()
            delay(60_000L - (System.currentTimeMillis() % 60_000L))
        }
    }
    return nowSeconds
}

private fun currentEpochSeconds(): Long =
    System.currentTimeMillis() / 1_000L

private fun playbackTimeLabel(
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
        .format(Instant.ofEpochMilli(timeMs).atZone(GuideZoneId))

private fun formatPlaybackTime(timeMs: Long): String {
    val totalSeconds = (timeMs.coerceAtLeast(0L) / 1_000L)
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}

private fun String.isMostlyRtlText(): Boolean {
    val strongCharacters = asSequence()
        .map { Character.getDirectionality(it) }
        .filter {
            it == Character.DIRECTIONALITY_LEFT_TO_RIGHT ||
                it == Character.DIRECTIONALITY_RIGHT_TO_LEFT ||
                it == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC
        }
        .take(8)
        .toList()
    if (strongCharacters.isEmpty()) return false
    return strongCharacters.count {
        it == Character.DIRECTIONALITY_RIGHT_TO_LEFT ||
            it == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC
    } >= strongCharacters.size / 2f
}

private fun Key.isActivationKey(): Boolean =
    this == Key.DirectionCenter || this == Key.Enter || this == Key.NumPadEnter

private fun TvProgram.programKey(): String =
    "$channelId:$startSeconds:$endSeconds:$title"
