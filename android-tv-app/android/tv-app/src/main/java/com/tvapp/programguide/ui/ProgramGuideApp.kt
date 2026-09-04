package com.tvapp.programguide.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.LayoutInflater
import android.view.KeyEvent as AndroidKeyEvent
import android.view.ViewGroup
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
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
import androidx.compose.ui.platform.LocalFocusManager
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
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
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
private val TimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private const val MINI_PLAYER_MAX_WIDTH = 960
private const val MINI_PLAYER_MAX_HEIGHT = 540
private const val MAX_MULTI_PLAYER_CHANNELS = 4
private const val MULTI_PLAYER_MAX_WIDTH = 854
private const val MULTI_PLAYER_MAX_HEIGHT = 480

@Stable
private class StablePlayer(val value: ExoPlayer)

@Stable
private class StablePlayerView(val value: PlayerView)

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

object TvKeyEventBridge {
    private var handler: ((AndroidKeyEvent) -> Boolean)? = null

    fun setHandler(nextHandler: ((AndroidKeyEvent) -> Boolean)?) {
        handler = nextHandler
    }

    fun dispatch(event: AndroidKeyEvent): Boolean = handler?.invoke(event) == true
}

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
                    .setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
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
    val playerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view, null) as PlayerView).apply {
            this.player = player
            useController = false
            controllerAutoShow = true
            controllerShowTimeoutMs = 3_000
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(true)
            setEnableComposeSurfaceSyncWorkaround(true)
            hideController()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val stablePlayerView = remember(playerView) { StablePlayerView(playerView) }
    val streamingActive = playbackState.isMiniPlayerPlaying || playbackState.isPlayerExpanded
    var detailsVisible by remember { mutableStateOf(false) }
    var multiPlayerChannels by remember { mutableStateOf<List<TvChannel>>(emptyList()) }
    var multiPlayerFocusIndex by remember { mutableIntStateOf(0) }
    var multiModeEnabled by remember { mutableStateOf(false) }
    val maxMultiPlayerChannels = MAX_MULTI_PLAYER_CHANNELS
    val nowSeconds by rememberGuideNowSeconds()
    var gridFocusNonce by remember { mutableIntStateOf(0) }
    var gridFocusTarget by remember { mutableStateOf<GridFocusTarget?>(null) }
    val guideData = guideState.guideData
    val currentPlayingProgram = playbackState.playingChannel
        ?.let { channel -> guideData?.programsByChannel?.get(channel.id).orEmpty() }
        ?.let { programs -> currentProgramForNow(programs, nowSeconds) }
        ?: playbackState.playingProgram
    val expandedMultiChannels = playbackState.playingChannel?.let { primaryChannel ->
        if (!multiModeEnabled) {
            listOf(primaryChannel)
        } else {
            val withoutPrimary = multiPlayerChannels.filterNot { it.id == primaryChannel.id }
            (listOf(primaryChannel) + withoutPrimary).take(maxMultiPlayerChannels)
        }
    }.orEmpty()
    val multiPlayerActive = playbackState.isPlayerExpanded && multiModeEnabled && expandedMultiChannels.size > 1
    val multiFocusedChannel = expandedMultiChannels.getOrNull(multiPlayerFocusIndex)
    val multiFocusedProgram = multiFocusedChannel
        ?.let { channel -> guideData?.programsByChannel?.get(channel.id).orEmpty() }
        ?.let { programs -> currentProgramForNow(programs, nowSeconds) }

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

    fun resetMultiModeForSinglePlayer() {
        multiModeEnabled = false
        multiPlayerFocusIndex = 0
        multiPlayerChannels = playbackState.playingChannel?.let(::listOf).orEmpty()
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
        onDispose {
            playerView.player = null
            player.release()
        }
    }

    LaunchedEffect(multiPlayerActive, multiPlayerFocusIndex, playbackState.playingChannel?.id) {
        player.volume = if (!multiPlayerActive || multiPlayerFocusIndex == 0) 1f else 0f
        trackSelector.setParameters(
            trackSelector.buildUponParameters().apply {
                if (multiPlayerActive && multiPlayerFocusIndex != 0) {
                    clearVideoSizeConstraints()
                    setMaxVideoBitrate(Int.MAX_VALUE)
                    setForceLowestBitrate(true)
                    setExceedVideoConstraintsIfNecessary(true)
                } else {
                    setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                    setMaxVideoBitrate(Int.MAX_VALUE)
                    setForceLowestBitrate(false)
                    setExceedVideoConstraintsIfNecessary(true)
                }
            }
        )
    }

    LaunchedEffect(playbackState.isPlayerExpanded, playbackState.playingChannel?.id) {
        val channel = playbackState.playingChannel ?: return@LaunchedEffect
        if (!playbackState.isPlayerExpanded) {
            multiPlayerFocusIndex = 0
            multiModeEnabled = false
            return@LaunchedEffect
        }
        if (!multiModeEnabled || multiPlayerChannels.size <= 1) {
            multiPlayerChannels = listOf(channel)
            multiPlayerFocusIndex = 0
        } else if (multiPlayerChannels.none { it.id == channel.id }) {
            multiPlayerChannels = (listOf(channel) + multiPlayerChannels)
                .distinctBy { it.id }
                .take(maxMultiPlayerChannels)
            multiPlayerFocusIndex = 0
        }
    }

    LaunchedEffect(
        playbackState.isMiniPlayerPlaying,
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
                    selectedProgram = guideState.selectedProgram,
                    displayChannel = playbackState.playingChannel ?: playbackState.selectedChannel,
                    displayProgram = currentPlayingProgram ?: playbackState.selectedProgram,
                    playingChannel = playbackState.playingChannel,
                    playingProgram = currentPlayingProgram,
                    isMiniPlayerPlaying = playbackState.isMiniPlayerPlaying,
                    isPlayerExpanded = playbackState.isPlayerExpanded,
                    onChannelActivated = viewModel::playChannel,
                    onLiveChannelOpened = viewModel::playChannelExpanded,
                    onProgramSelected = viewModel::selectChannel,
                    onPlayerClick = viewModel::expandPlayer,
                    onGuideRangeNeeded = viewModel::ensureGuideRange,
                    gridFocusTarget = gridFocusTarget,
                    onDetailsVisibleChanged = { detailsVisible = it },
                    onGridFocusRequested = { channel, program, live ->
                        requestGridFocus(channel, program, live)
                    },
                )
            }

            if (streamingActive && playbackState.playingChannel != null && (!detailsVisible || playbackState.isPlayerExpanded) && !multiPlayerActive) {
                PlayerSurface(
                    player = stablePlayer,
                    playerView = stablePlayerView,
                    useController = false,
                    modifier = if (playbackState.isPlayerExpanded) {
                        Modifier.fillMaxSize()
                    } else {
                        Modifier
                            .align(Alignment.TopEnd)
                            .width(360.dp)
                            .height(226.dp)
                    },
                )
                if (!playbackState.isPlayerExpanded) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .width(360.dp)
                            .height(226.dp)
                    ) {
                        Box(
                            Modifier
                                .align(Alignment.CenterStart)
                                .width(128.dp)
                                .fillMaxHeight()
                                .background(
                                    Brush.horizontalGradient(
                                        colorStops = arrayOf(
                                            0.00f to Color(0xF0081420),
                                            0.46f to Color(0x99081420),
                                            0.78f to Color(0x33081420),
                                            1.00f to Color.Transparent,
                                        )
                                    )
                                )
                        )
                    }
                }
            }

            if (playbackState.isPlayerExpanded) {
                ExpandedPlayer(
                    player = stablePlayer,
                    primaryPlayerView = stablePlayerView,
                    channel = multiFocusedChannel ?: playbackState.playingChannel,
                    program = multiFocusedProgram ?: currentPlayingProgram,
                    guideChannels = guideData?.channels.orEmpty(),
                    programsByChannel = guideData?.programsByChannel.orEmpty(),
                    nowSeconds = nowSeconds,
                    streamUrl = viewModel::streamUrl,
                    multiChannels = expandedMultiChannels,
                    multiFocusedIndex = multiPlayerFocusIndex,
                    multiPlayerActive = multiPlayerActive,
                    maxMultiPlayerChannels = maxMultiPlayerChannels,
                    onNextChannel = {
                        if (!multiPlayerActive) resetMultiModeForSinglePlayer()
                        viewModel.playNextChannel()
                    },
                    onPreviousChannel = {
                        if (!multiPlayerActive) resetMultiModeForSinglePlayer()
                        viewModel.playPreviousChannel()
                    },
                    onChannelNumberEntered = viewModel::playChannelNumberExpanded,
                    hasChannelNumberPrefix = viewModel::hasPlayableChannelNumberPrefix,
                    onMultiFocusChanged = { nextIndex ->
                        multiPlayerFocusIndex = nextIndex.coerceIn(0, expandedMultiChannels.lastIndex)
                    },
                    onAddMultiChannel = { channel ->
                        if (channel.hasPlayableStream()) {
                            multiModeEnabled = true
                            val current = if (multiPlayerChannels.isEmpty()) {
                                playbackState.playingChannel?.let(::listOf).orEmpty()
                            } else {
                                multiPlayerChannels
                            }
                            val nextChannels = (current + channel)
                                .distinctBy { it.id }
                                .take(maxMultiPlayerChannels)
                            multiPlayerChannels = nextChannels
                            multiPlayerFocusIndex = nextChannels.indexOfFirst { it.id == channel.id }
                                .takeIf { it >= 0 }
                                ?: multiPlayerFocusIndex
                        }
                    },
                    onOpenFocusedSingle = { channel ->
                        multiModeEnabled = false
                        multiPlayerChannels = listOf(channel)
                        multiPlayerFocusIndex = 0
                        viewModel.playChannelExpanded(
                            channel,
                            guideData?.programsByChannel?.get(channel.id).orEmpty()
                                .let { programs -> currentProgramForNow(programs, nowSeconds) },
                        )
                    },
                    onRemoveFocusedMultiChannel = {
                        if (expandedMultiChannels.size > 1) {
                            val removedChannel = expandedMultiChannels.getOrNull(multiPlayerFocusIndex)
                            val nextChannels = expandedMultiChannels.filterIndexed { index, _ -> index != multiPlayerFocusIndex }
                            multiPlayerChannels = nextChannels
                            multiModeEnabled = nextChannels.size > 1
                            multiPlayerFocusIndex = multiPlayerFocusIndex.coerceAtMost(nextChannels.lastIndex).coerceAtLeast(0)
                            if (removedChannel?.id == playbackState.playingChannel?.id) {
                                nextChannels.firstOrNull()?.let { nextChannel ->
                                    viewModel.playChannelExpanded(
                                        nextChannel,
                                        guideData?.programsByChannel?.get(nextChannel.id).orEmpty()
                                            .let { programs -> currentProgramForNow(programs, nowSeconds) },
                                    )
                                }
                            }
                        }
                    },
                    onClose = {
                        multiPlayerChannels = emptyList()
                        multiPlayerFocusIndex = 0
                        multiModeEnabled = false
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
    selectedProgram: TvProgram?,
    displayChannel: TvChannel?,
    displayProgram: TvProgram?,
    playingChannel: TvChannel?,
    playingProgram: TvProgram?,
    isMiniPlayerPlaying: Boolean,
    isPlayerExpanded: Boolean,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onLiveChannelOpened: (TvChannel, TvProgram?) -> Unit,
    onProgramSelected: (TvChannel, TvProgram?) -> Unit,
    onPlayerClick: () -> Unit,
    onGuideRangeNeeded: (Long, Long) -> Unit,
    gridFocusTarget: GridFocusTarget?,
    onDetailsVisibleChanged: (Boolean) -> Unit,
    onGridFocusRequested: (TvChannel?, TvProgram?, Boolean) -> Unit,
) {
    val topPanelFocusRequester = remember { FocusRequester() }
    val gridFocusRequester = remember { FocusRequester() }
    val nowButtonFocusRequester = remember { FocusRequester() }
    var showNowRequestNonce by remember { mutableIntStateOf(0) }
    var blockGridActivationUntilMs by remember { mutableLongStateOf(0L) }
    var suspendGridAutoPlay by remember { mutableStateOf(false) }
    var detailsChannel by remember { mutableStateOf<TvChannel?>(null) }
    var detailsProgram by remember { mutableStateOf<TvProgram?>(null) }

    val programForDetails = detailsProgram
    LaunchedEffect(programForDetails != null) {
        onDetailsVisibleChanged(programForDetails != null)
    }
    DisposableEffect(Unit) {
        onDispose {
            onDetailsVisibleChanged(false)
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopInfoPanel(
                channel = displayChannel,
                program = displayProgram,
                playingChannel = playingChannel,
                playingProgram = playingProgram,
                isMiniPlayerPlaying = isMiniPlayerPlaying,
                isPlayerExpanded = isPlayerExpanded,
                onPlayerClick = onPlayerClick,
                onShowNowClick = { showNowRequestNonce += 1 },
                topPanelFocusRequester = topPanelFocusRequester,
                gridFocusRequester = gridFocusRequester,
            )
            ProgramGrid(
                data = data,
                selectedChannel = selectedChannel,
                selectedProgram = selectedProgram,
                playingChannel = playingChannel,
                onChannelActivated = onChannelActivated,
                onLiveChannelOpened = onLiveChannelOpened,
                onProgramSelected = onProgramSelected,
                isGridActivationBlocked = {
                    System.currentTimeMillis() < blockGridActivationUntilMs
                },
                isGridAutoPlaySuspended = { suspendGridAutoPlay },
                onGridNavigationStarted = { suspendGridAutoPlay = false },
                onProgramDetailsRequested = { channel, program ->
                    suspendGridAutoPlay = true
                    detailsChannel = channel
                    detailsProgram = program
                },
                onGuideRangeNeeded = onGuideRangeNeeded,
                focusTarget = gridFocusTarget,
                showNowRequestNonce = showNowRequestNonce,
                gridFocusRequester = gridFocusRequester,
                topFocusRequester = topPanelFocusRequester,
                nowButtonFocusRequester = nowButtonFocusRequester,
            )
        }

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
                    blockGridActivationUntilMs = System.currentTimeMillis() + 600L
                    suspendGridAutoPlay = true
                    onGridFocusRequested(detailsChannel, programForDetails, false)
                    detailsChannel = null
                    detailsProgram = null
                },
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
    isMiniPlayerPlaying: Boolean,
    isPlayerExpanded: Boolean,
    onPlayerClick: () -> Unit,
    onShowNowClick: () -> Unit,
    topPanelFocusRequester: FocusRequester,
    gridFocusRequester: FocusRequester,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(226.dp)
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF17262A), Color(0xFF090D10))
                )
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProgramHeroPanel(
            channel = channel,
            program = program,
            onPlayerClick = onPlayerClick,
            onShowNowClick = onShowNowClick,
            topPanelFocusRequester = topPanelFocusRequester,
            gridFocusRequester = gridFocusRequester,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
        MiniPlayerPreview(
            channel = playingChannel ?: channel,
            program = playingProgram ?: program,
            isPlaying = isMiniPlayerPlaying,
            isPlayerExpanded = isPlayerExpanded,
            onClick = onPlayerClick,
            showOpenIcon = false,
            modifier = Modifier.width(360.dp).fillMaxHeight(),
        )
    }
}

@Composable
private fun ProgramHeroPanel(
    channel: TvChannel?,
    program: TvProgram?,
    onPlayerClick: () -> Unit,
    onShowNowClick: () -> Unit,
    topPanelFocusRequester: FocusRequester,
    gridFocusRequester: FocusRequester,
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
        val heroNowFocusRequester = remember { FocusRequester() }

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
                .align(Alignment.TopStart)
                .padding(start = 18.dp, top = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            HeroIconButton(
                focusRequester = topPanelFocusRequester,
                onMoveDown = { gridFocusRequester.requestFocus() },
                onMoveRight = { heroNowFocusRequester.requestFocus() },
                onClick = onPlayerClick,
            ) { tint ->
                Icon(
                    painter = painterResource(R.drawable.ic_fullscreen),
                    contentDescription = "Open fullscreen",
                    tint = tint,
                    modifier = Modifier.size(24.dp),
                )
            }
            HeroIconButton(
                focusRequester = heroNowFocusRequester,
                onMoveDown = { gridFocusRequester.requestFocus() },
                onMoveLeft = { topPanelFocusRequester.requestFocus() },
                onClick = onShowNowClick,
            ) { tint ->
                Icon(
                    painter = painterResource(R.drawable.ic_clock),
                    contentDescription = "Show now",
                    tint = tint,
                    modifier = Modifier.size(25.dp),
                )
            }
        }

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
                fontSize = 16.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = channel?.name.orEmpty(),
                color = Color.White,
                fontSize = 18.sp,
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
                .padding(start = 28.dp, end = 28.dp, bottom = 18.dp)
                .fillMaxWidth(0.94f),
            horizontalAlignment = contentAlignment,
        ) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 23.sp,
                lineHeight = 25.sp,
                fontWeight = FontWeight.Bold,
                textAlign = textAlign,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(7.dp))
            Text(
                text = description,
                color = Color(0xFFD1DEE4),
                fontSize = 13.sp,
                lineHeight = 16.sp,
                textAlign = textAlign,
                maxLines = 6,
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
private fun HeroIconButton(
    focusRequester: FocusRequester,
    onMoveDown: () -> Unit,
    onClick: () -> Unit,
    onMoveLeft: (() -> Unit)? = null,
    onMoveRight: (() -> Unit)? = null,
    icon: @Composable (Color) -> Unit,
) {
    val focused = remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .size(44.dp)
            .background(
                if (focused.value) PrimaryCyan else Color(0xCC06121B),
                RoundedCornerShape(9.dp),
            )
            .onPreviewKeyEvent {
                when {
                    it.type == KeyEventType.KeyUp && it.key.isActivationKey() -> {
                        onClick()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                        onMoveDown()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionLeft && onMoveLeft != null -> {
                        onMoveLeft()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionRight && onMoveRight != null -> {
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
        contentAlignment = Alignment.Center,
    ) {
        icon(if (focused.value) Color(0xFF031012) else Color.White)
    }
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
        if (!isPlaying || isPlayerExpanded) {
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
    selectedProgram: TvProgram?,
    playingChannel: TvChannel?,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onLiveChannelOpened: (TvChannel, TvProgram?) -> Unit,
    onProgramSelected: (TvChannel, TvProgram?) -> Unit,
    isGridActivationBlocked: () -> Boolean,
    isGridAutoPlaySuspended: () -> Boolean,
    onGridNavigationStarted: () -> Unit,
    onProgramDetailsRequested: (TvChannel, TvProgram) -> Unit,
    onGuideRangeNeeded: (Long, Long) -> Unit,
    focusTarget: GridFocusTarget?,
    showNowRequestNonce: Int,
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
    val selectedProgramSeedKey = selectedProgram?.programKey()
    var selectedProgramIndex by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        val programIndex = selectedProgramSeedKey
            ?.let { key -> initialPrograms.indexOfFirst { it.programKey() == key } }
            ?.takeIf { it >= 0 }
            ?: liveProgramIndex(initialPrograms, nowSeconds)
        mutableIntStateOf(programIndex)
    }
    var selectedProgramKey by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        val initialIndex = selectedProgramSeedKey
            ?.let { key -> initialPrograms.indexOfFirst { it.programKey() == key } }
            ?.takeIf { it >= 0 }
            ?: liveProgramIndex(initialPrograms, nowSeconds)
        mutableStateOf(initialPrograms.getOrNull(initialIndex)?.programKey())
    }
    var selectedTimeAnchorSeconds by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        val initialIndex = selectedProgramSeedKey
            ?.let { key -> initialPrograms.indexOfFirst { it.programKey() == key } }
            ?.takeIf { it >= 0 }
            ?: liveProgramIndex(initialPrograms, nowSeconds)
        mutableStateOf(initialPrograms.getOrNull(initialIndex)?.centerSeconds() ?: nowSeconds)
    }
    var programFocusMode by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let { data.programsByChannel[it.id].orEmpty() }.orEmpty()
        mutableStateOf(
            selectedProgramSeedKey?.let { key -> initialPrograms.any { it.programKey() == key } }
                ?: initialPrograms.isNotEmpty()
        )
    }
    val scrollOffsetDp = with(density) { scrollOffsetPx.toDp() }
    val maxFirstVisibleRowIndex = (data.channels.size - visibleRowCount).coerceAtLeast(0)
    var firstVisibleRowIndex by remember(data.channels, visibleRowCount) {
        mutableIntStateOf(
            (selectedRowIndex - 1)
                .coerceIn(0, maxFirstVisibleRowIndex)
        )
    }
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
        onGridNavigationStarted()
        if (!gridNavigating) {
            gridNavigating = true
        }
        navigationIdleJob?.cancel()
        navigationIdleJob = navigationScope.launch {
            delay(650)
            gridNavigating = false
        }
    }

    fun acceptNavigationEvent(): Boolean {
        val nowMs = System.currentTimeMillis()
        if (nowMs - lastNavigationEventMs[0] < 120L) return false
        lastNavigationEventMs[0] = nowMs
        return true
    }

    fun preferredFirstVisibleRowIndex(selectedIndex: Int): Int {
        return (selectedIndex - 1).coerceIn(0, maxFirstVisibleRowIndex)
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
        firstVisibleRowIndex = preferredFirstVisibleRowIndex(nextIndex)
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
            onProgramSelected(channel, program)
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

    LaunchedEffect(showNowRequestNonce) {
        if (showNowRequestNonce <= 0) return@LaunchedEffect
        jumpToNow()
        delay(80)
        gridFocusRequester.requestFocus()
    }

    LaunchedEffect(focusTarget) {
        val target = focusTarget ?: return@LaunchedEffect
        val nextRowIndex = data.channels.indexOfFirst { it.id == target.channelId }
        if (nextRowIndex < 0) return@LaunchedEffect

        selectedRowIndex = nextRowIndex
        firstVisibleRowIndex = preferredFirstVisibleRowIndex(nextRowIndex)

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
        gridNavigating,
        playingChannelId,
    ) {
        if (!gridFocused) return@LaunchedEffect
        if (gridNavigating) return@LaunchedEffect
        if (isGridAutoPlaySuspended()) return@LaunchedEffect
        if (activeSelectionChannel?.id == playingChannelId) return@LaunchedEffect
        delay(3_000)
        if (gridNavigating) return@LaunchedEffect
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

        val seededProgramIndex = selectedProgramSeedKey
            ?.let { key -> activeSelectionPrograms.indexOfFirst { it.programKey() == key } }
            ?: -1
        val seededProgram = activeSelectionPrograms.getOrNull(seededProgramIndex)
        if (seededProgram != null && !isCurrent(seededProgram, nowSeconds)) {
            selectedProgramIndex = seededProgramIndex
            selectedProgramKey = seededProgram.programKey()
            programFocusMode = true
            selectedTimeAnchorSeconds = seededProgram.centerSeconds()
            scrollOffsetPx = centeredScrollOffsetPx(
                program = seededProgram,
                timelineStartSeconds = snappedStart,
                slotWidthPx = slotWidthPx,
                timelineViewportWidthPx = timelineViewportWidthPx,
                maxScrollOffsetPx = maxScrollOffsetPx,
            )
            didInitialScroll = true
            return@LaunchedEffect
        }

        jumpToNow()
        didInitialScroll = true
    }

    LaunchedEffect(didInitialScroll) {
        if (!didInitialScroll) return@LaunchedEffect
        delay(100)
        gridFocusRequester.requestFocus()
    }

    LaunchedEffect(maxFirstVisibleRowIndex, selectedRowIndex, visibleRowCount) {
        firstVisibleRowIndex = preferredFirstVisibleRowIndex(selectedRowIndex)
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
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .focusRequester(gridFocusRequester)
                    .onFocusChanged { gridFocused = it.hasFocus || it.isFocused }
                    .onPreviewKeyEvent {
                        when {
                            it.key.isActivationKey() && it.type == KeyEventType.KeyUp -> {
                                if (!isGridActivationBlocked()) {
                                    activateSelection(expandLive = true)
                                }
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
                                    topFocusRequester.requestFocus()
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
) {
    Row(modifier.background(Color(0xFF131417)), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .width(channelWidth)
                .fillMaxHeight()
                .background(Color(0xFF131417))
                .border(0.5.dp, Color(0xFF2A2C31))
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
                                text = TimeFormatter.format(Instant.ofEpochSecond(slotStart).atZone(ZoneId.systemDefault())),
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
                        text = TimeFormatter.format(Instant.ofEpochSecond(nowSeconds).atZone(ZoneId.systemDefault())),
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
                .size(42.dp)
                .height(36.dp)
                .background(
                    if (focused.value) PrimaryCyan else Color(0xFF0E7C82),
                    CircleShape,
                )
                .border(
                    if (focused.value) 2.dp else 1.dp,
                    if (focused.value) Color.White else Color(0x9910D5D9),
                    CircleShape,
                )
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
                contentDescription = "Show now",
                tint = Color(0xFF031012),
                modifier = Modifier.size(24.dp),
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
    val focusManager = LocalFocusManager.current
    val canPlayLive = !channel?.streamUrl.isNullOrBlank()
    var selectedAction by remember { mutableStateOf(DetailsAction.Close) }
    val closeFocused = selectedAction == DetailsAction.Close
    val playFocused = selectedAction == DetailsAction.PlayLive

    BackHandler(onBack = onClose)
    DisposableEffect(canPlayLive, selectedAction) {
        TvKeyEventBridge.setHandler { event ->
            if (event.action != AndroidKeyEvent.ACTION_DOWN) {
                when (event.keyCode) {
                    AndroidKeyEvent.KEYCODE_BACK -> {
                        onClose()
                        true
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                    AndroidKeyEvent.KEYCODE_ENTER,
                    AndroidKeyEvent.KEYCODE_NUMPAD_ENTER -> {
                        if (event.action == AndroidKeyEvent.ACTION_UP) {
                            if (selectedAction == DetailsAction.PlayLive && canPlayLive) {
                                onPlayLive()
                            } else {
                                onClose()
                            }
                        }
                        true
                    }
                    else -> false
                }
            } else {
                when (event.keyCode) {
                    AndroidKeyEvent.KEYCODE_BACK -> {
                        onClose()
                        true
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                        if (canPlayLive) {
                            selectedAction = DetailsAction.PlayLive
                            playFocusRequester.requestFocus()
                            true
                        } else {
                            false
                        }
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                        selectedAction = DetailsAction.Close
                        closeFocusRequester.requestFocus()
                        true
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                    AndroidKeyEvent.KEYCODE_ENTER,
                    AndroidKeyEvent.KEYCODE_NUMPAD_ENTER -> {
                        if (selectedAction == DetailsAction.PlayLive && canPlayLive) {
                            onPlayLive()
                        } else {
                            onClose()
                        }
                        true
                    }
                    else -> false
                }
            }
        }
        onDispose {
            TvKeyEventBridge.setHandler(null)
        }
    }
    LaunchedEffect(Unit) {
        focusManager.clearFocus(force = true)
        delay(250)
        selectedAction = DetailsAction.Close
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
                        .onFocusChanged {
                            if (it.hasFocus || it.isFocused) selectedAction = DetailsAction.Close
                        },
                    onMoveLeft = {
                        if (canPlayLive) {
                            selectedAction = DetailsAction.PlayLive
                            playFocusRequester.requestFocus()
                        }
                    },
                    onClick = onClose,
                )
                Spacer(Modifier.width(12.dp))
                if (canPlayLive) {
                    DetailActionButton(
                        text = "נגן Live",
                        focused = playFocused,
                        modifier = Modifier
                            .focusRequester(playFocusRequester)
                            .onFocusChanged {
                                if (it.hasFocus || it.isFocused) selectedAction = DetailsAction.PlayLive
                            },
                        onMoveRight = {
                            selectedAction = DetailsAction.Close
                            closeFocusRequester.requestFocus()
                        },
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

private enum class DetailsAction {
    Close,
    PlayLive,
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
                    it.type == KeyEventType.KeyDown && it.key.isActivationKey() -> {
                        onClick()
                        true
                    }
                    it.key.isActivationKey() -> true
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
    primaryPlayerView: StablePlayerView,
    channel: TvChannel?,
    program: TvProgram?,
    guideChannels: List<TvChannel>,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    multiChannels: List<TvChannel>,
    multiFocusedIndex: Int,
    multiPlayerActive: Boolean,
    maxMultiPlayerChannels: Int,
    onNextChannel: () -> Unit,
    onPreviousChannel: () -> Unit,
    onChannelNumberEntered: (String) -> Boolean,
    hasChannelNumberPrefix: (String) -> Boolean,
    onMultiFocusChanged: (Int) -> Unit,
    onAddMultiChannel: (TvChannel) -> Unit,
    onOpenFocusedSingle: (TvChannel) -> Unit,
    onRemoveFocusedMultiChannel: () -> Unit,
    onClose: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    var controlsVisible by remember { mutableStateOf(true) }
    var lastInteraction by remember { mutableStateOf(0) }
    var enteredChannelNumber by remember { mutableStateOf("") }
    var enteredChannelNumberNonce by remember { mutableIntStateOf(0) }
    var addMenuVisible by remember { mutableStateOf(false) }
    var multiControlFocus by remember { mutableStateOf(MultiControlFocus.None) }

    BackHandler {
        when {
            addMenuVisible -> {
                addMenuVisible = false
                controlsVisible = true
                lastInteraction += 1
                focusRequester.requestFocus()
            }
            controlsVisible -> {
                controlsVisible = false
                multiControlFocus = MultiControlFocus.None
                focusRequester.requestFocus()
            }
            else -> onClose()
        }
    }
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
    LaunchedEffect(multiPlayerActive, multiFocusedIndex, addMenuVisible) {
        if (multiPlayerActive && !addMenuVisible) {
            delay(40)
            focusRequester.requestFocus()
        }
    }
    LaunchedEffect(channel?.id) {
        controlsVisible = true
        multiControlFocus = MultiControlFocus.None
        lastInteraction += 1
        enteredChannelNumber = ""
        enteredChannelNumberNonce += 1
    }
    LaunchedEffect(enteredChannelNumberNonce) {
        val pendingNumber = enteredChannelNumber
        if (pendingNumber.isBlank()) return@LaunchedEffect
        delay(1_100)
        if (enteredChannelNumber == pendingNumber) {
            onChannelNumberEntered(pendingNumber)
            enteredChannelNumber = ""
        }
    }
    LaunchedEffect(controlsVisible, lastInteraction) {
        if (!controlsVisible) return@LaunchedEffect
        delay(5_000)
        controlsVisible = false
    }

    fun handleBack() {
        when {
            addMenuVisible -> {
                addMenuVisible = false
                controlsVisible = true
                multiControlFocus = MultiControlFocus.None
                lastInteraction += 1
                focusRequester.requestFocus()
            }
            controlsVisible -> {
                controlsVisible = false
                multiControlFocus = MultiControlFocus.None
                focusRequester.requestFocus()
            }
            else -> onClose()
        }
    }

    fun handleExpandedKey(keyCode: Int): Boolean {
        if (addMenuVisible) {
            return if (keyCode == AndroidKeyEvent.KEYCODE_BACK) {
                handleBack()
                true
            } else {
                false
            }
        }

        val digit = keyCode.toRemoteDigitOrNull()
        when {
            digit != null -> {
                val nextNumber = (enteredChannelNumber + digit).takeLast(4)
                controlsVisible = true
                lastInteraction += 1
                enteredChannelNumber = nextNumber
                enteredChannelNumberNonce += 1
                if (!hasChannelNumberPrefix(nextNumber)) {
                    enteredChannelNumber = ""
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_BACK -> {
                handleBack()
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_UP -> {
                controlsVisible = true
                lastInteraction += 1
                if (multiPlayerActive) {
                    multiControlFocus = MultiControlFocus.None
                    onMultiFocusChanged(multiFocusedIndex - 2)
                } else {
                    addMenuVisible = false
                    multiControlFocus = MultiControlFocus.None
                    onPreviousChannel()
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_CHANNEL_UP -> {
                controlsVisible = true
                lastInteraction += 1
                multiControlFocus = MultiControlFocus.None
                onNextChannel()
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_CHANNEL_DOWN -> {
                controlsVisible = true
                lastInteraction += 1
                multiControlFocus = MultiControlFocus.None
                onPreviousChannel()
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_DOWN -> {
                controlsVisible = true
                lastInteraction += 1
                if (multiPlayerActive) {
                    val nextTileIndex = multiFocusedIndex + 2
                    multiControlFocus = MultiControlFocus.None
                    if (nextTileIndex <= multiChannels.lastIndex) {
                        onMultiFocusChanged(nextTileIndex)
                    }
                } else {
                    addMenuVisible = false
                    multiControlFocus = MultiControlFocus.None
                    onNextChannel()
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_LEFT && multiPlayerActive -> {
                controlsVisible = true
                lastInteraction += 1
                if (multiControlFocus != MultiControlFocus.None) {
                    multiControlFocus = previousMultiControlFocus(
                        current = multiControlFocus,
                        canAdd = multiChannels.size < maxMultiPlayerChannels,
                        canRemove = multiChannels.size > 1,
                    )
                } else {
                    multiControlFocus = MultiControlFocus.None
                    onMultiFocusChanged(multiFocusedIndex - 1)
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                controlsVisible = true
                lastInteraction += 1
                if (multiPlayerActive) {
                    if (multiControlFocus != MultiControlFocus.None) {
                        multiControlFocus = nextMultiControlFocus(
                            current = multiControlFocus,
                            canAdd = multiChannels.size < maxMultiPlayerChannels,
                            canRemove = multiChannels.size > 1,
                        )
                    } else if (multiFocusedIndex < multiChannels.lastIndex) {
                        multiControlFocus = MultiControlFocus.None
                        onMultiFocusChanged(multiFocusedIndex + 1)
                    } else if (multiChannels.size < maxMultiPlayerChannels) {
                        addMenuVisible = true
                    }
                } else {
                    addMenuVisible = true
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_CENTER ||
                keyCode == AndroidKeyEvent.KEYCODE_ENTER ||
                keyCode == AndroidKeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (multiPlayerActive) {
                    if (!controlsVisible || multiControlFocus == MultiControlFocus.None) {
                        controlsVisible = true
                        multiControlFocus = preferredMultiControlFocus(
                            canAdd = multiChannels.size < maxMultiPlayerChannels,
                            canRemove = multiChannels.size > 1,
                        )
                        lastInteraction += 1
                    } else {
                        when (multiControlFocus) {
                            MultiControlFocus.Add -> addMenuVisible = true
                            MultiControlFocus.OpenSingle -> multiChannels
                                .getOrNull(multiFocusedIndex)
                                ?.let(onOpenFocusedSingle)
                            MultiControlFocus.Remove -> {
                                onRemoveFocusedMultiChannel()
                                multiControlFocus = MultiControlFocus.None
                            }
                            MultiControlFocus.None -> Unit
                        }
                    }
                } else {
                    controlsVisible = true
                    lastInteraction += 1
                }
                return true
            }
        }
        return false
    }

    DisposableEffect(
        addMenuVisible,
        controlsVisible,
        enteredChannelNumber,
        multiPlayerActive,
        multiFocusedIndex,
        multiChannels,
        multiControlFocus,
    ) {
        TvKeyEventBridge.setHandler { event ->
            event.action == AndroidKeyEvent.ACTION_DOWN && handleExpandedKey(event.keyCode)
        }
        onDispose {
            TvKeyEventBridge.setHandler(null)
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .focusRequester(focusRequester)
            .focusable()
    ) {
        if (multiPlayerActive) {
            MultiPlayerGrid(
                primaryPlayer = player,
                primaryPlayerView = primaryPlayerView,
                channels = multiChannels,
                focusedIndex = multiFocusedIndex,
                programsByChannel = programsByChannel,
                nowSeconds = nowSeconds,
                streamUrl = streamUrl,
                controlsVisible = controlsVisible,
                canAddChannel = multiChannels.size < maxMultiPlayerChannels,
                canRemoveChannel = multiChannels.size > 1,
                focusedAction = multiControlFocus,
                onAddChannelClick = {
                    controlsVisible = true
                    lastInteraction += 1
                    addMenuVisible = true
                },
                onOpenSingleClick = {
                    controlsVisible = true
                    lastInteraction += 1
                    multiChannels.getOrNull(multiFocusedIndex)?.let(onOpenFocusedSingle)
                    multiControlFocus = MultiControlFocus.None
                },
                onRemoveChannelClick = {
                    controlsVisible = true
                    lastInteraction += 1
                    onRemoveFocusedMultiChannel()
                    multiControlFocus = MultiControlFocus.None
                },
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (controlsVisible) {
            if (!multiPlayerActive) {
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
            if (enteredChannelNumber.isNotBlank()) {
                ChannelNumberOverlay(
                    number = enteredChannelNumber,
                    modifier = Modifier.align(Alignment.TopEnd),
                )
            }
        }
        if (addMenuVisible) {
            AddChannelMenu(
                channels = guideChannels.filter { channel ->
                    multiChannels.size < maxMultiPlayerChannels &&
                        channel.hasPlayableStream() &&
                        multiChannels.none { it.id == channel.id }
                },
                onAddChannel = { selectedChannel ->
                    onAddMultiChannel(selectedChannel)
                    addMenuVisible = false
                    controlsVisible = true
                    multiControlFocus = MultiControlFocus.None
                    lastInteraction += 1
                    focusRequester.requestFocus()
                },
                onClose = {
                    addMenuVisible = false
                    controlsVisible = true
                    multiControlFocus = MultiControlFocus.None
                    focusRequester.requestFocus()
                },
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
    }
}

private enum class MultiControlFocus {
    None,
    Add,
    OpenSingle,
    Remove,
}

private fun availableMultiControlActions(
    canAdd: Boolean,
    canRemove: Boolean,
): List<MultiControlFocus> = buildList {
    if (canAdd) add(MultiControlFocus.Add)
    add(MultiControlFocus.OpenSingle)
    if (canRemove) add(MultiControlFocus.Remove)
}

private fun preferredMultiControlFocus(canAdd: Boolean, canRemove: Boolean): MultiControlFocus =
    if (availableMultiControlActions(canAdd, canRemove).contains(MultiControlFocus.OpenSingle)) {
        MultiControlFocus.OpenSingle
    } else {
        MultiControlFocus.None
    }

private fun nextMultiControlFocus(
    current: MultiControlFocus,
    canAdd: Boolean,
    canRemove: Boolean,
): MultiControlFocus {
    val actions = availableMultiControlActions(canAdd, canRemove)
    if (actions.isEmpty()) return MultiControlFocus.None
    val currentIndex = actions.indexOf(current).takeIf { it >= 0 } ?: -1
    return actions[(currentIndex + 1).floorMod(actions.size)]
}

private fun previousMultiControlFocus(
    current: MultiControlFocus,
    canAdd: Boolean,
    canRemove: Boolean,
): MultiControlFocus {
    val actions = availableMultiControlActions(canAdd, canRemove)
    if (actions.isEmpty()) return MultiControlFocus.None
    val currentIndex = actions.indexOf(current).takeIf { it >= 0 } ?: 0
    return actions[(currentIndex - 1).floorMod(actions.size)]
}

private fun Int.floorMod(divisor: Int): Int = ((this % divisor) + divisor) % divisor

private fun Int.toRemoteDigitOrNull(): Char? =
    when (this) {
        AndroidKeyEvent.KEYCODE_0, AndroidKeyEvent.KEYCODE_NUMPAD_0 -> '0'
        AndroidKeyEvent.KEYCODE_1, AndroidKeyEvent.KEYCODE_NUMPAD_1 -> '1'
        AndroidKeyEvent.KEYCODE_2, AndroidKeyEvent.KEYCODE_NUMPAD_2 -> '2'
        AndroidKeyEvent.KEYCODE_3, AndroidKeyEvent.KEYCODE_NUMPAD_3 -> '3'
        AndroidKeyEvent.KEYCODE_4, AndroidKeyEvent.KEYCODE_NUMPAD_4 -> '4'
        AndroidKeyEvent.KEYCODE_5, AndroidKeyEvent.KEYCODE_NUMPAD_5 -> '5'
        AndroidKeyEvent.KEYCODE_6, AndroidKeyEvent.KEYCODE_NUMPAD_6 -> '6'
        AndroidKeyEvent.KEYCODE_7, AndroidKeyEvent.KEYCODE_NUMPAD_7 -> '7'
        AndroidKeyEvent.KEYCODE_8, AndroidKeyEvent.KEYCODE_NUMPAD_8 -> '8'
        AndroidKeyEvent.KEYCODE_9, AndroidKeyEvent.KEYCODE_NUMPAD_9 -> '9'
        else -> null
    }

private fun Key.toRemoteDigitOrNull(): Char? =
    when (this) {
        Key.Zero, Key.NumPad0 -> '0'
        Key.One, Key.NumPad1 -> '1'
        Key.Two, Key.NumPad2 -> '2'
        Key.Three, Key.NumPad3 -> '3'
        Key.Four, Key.NumPad4 -> '4'
        Key.Five, Key.NumPad5 -> '5'
        Key.Six, Key.NumPad6 -> '6'
        Key.Seven, Key.NumPad7 -> '7'
        Key.Eight, Key.NumPad8 -> '8'
        Key.Nine, Key.NumPad9 -> '9'
        else -> null
    }

@Composable
private fun ChannelNumberOverlay(number: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .padding(top = 44.dp, end = 44.dp)
            .background(Color(0xDD071018), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0xAA10D5D9), RoundedCornerShape(12.dp))
            .padding(horizontal = 24.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = number,
            color = Color.White,
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
private fun MultiPlayerGrid(
    primaryPlayer: StablePlayer,
    primaryPlayerView: StablePlayerView,
    channels: List<TvChannel>,
    focusedIndex: Int,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    controlsVisible: Boolean,
    canAddChannel: Boolean,
    canRemoveChannel: Boolean,
    focusedAction: MultiControlFocus,
    onAddChannelClick: () -> Unit,
    onOpenSingleClick: () -> Unit,
    onRemoveChannelClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .background(Color.Black)
            .padding(10.dp)
    ) {
        when (channels.size) {
            2 -> Row(Modifier.fillMaxSize()) {
                MultiPlayerTile(
                    channel = channels[0],
                    program = currentProgramForNow(programsByChannel[channels[0].id].orEmpty(), nowSeconds),
                    focused = focusedIndex == 0,
                    controlsVisible = controlsVisible && focusedIndex == 0,
                    canAddChannel = canAddChannel,
                    canRemoveChannel = canRemoveChannel,
                    focusedAction = focusedAction,
                    onAddChannelClick = onAddChannelClick,
                    onOpenSingleClick = onOpenSingleClick,
                    onRemoveChannelClick = onRemoveChannelClick,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                ) {
                    PlayerSurface(
                        player = primaryPlayer,
                        playerView = primaryPlayerView,
                        useController = false,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                MultiPlayerTile(
                    channel = channels[1],
                    program = currentProgramForNow(programsByChannel[channels[1].id].orEmpty(), nowSeconds),
                    focused = focusedIndex == 1,
                    controlsVisible = controlsVisible && focusedIndex == 1,
                    canAddChannel = canAddChannel,
                    canRemoveChannel = canRemoveChannel,
                    focusedAction = focusedAction,
                    onAddChannelClick = onAddChannelClick,
                    onOpenSingleClick = onOpenSingleClick,
                    onRemoveChannelClick = onRemoveChannelClick,
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                ) {
                    ExtraChannelPlayerSurface(
                        channel = channels[1],
                        streamUrl = streamUrl,
                        hasAudioFocus = focusedIndex == 1,
                        preferSoftwareDecode = false,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            else -> Column(Modifier.fillMaxSize()) {
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    MultiPlayerCell(
                        index = 0,
                        channels = channels,
                        primaryPlayer = primaryPlayer,
                        primaryPlayerView = primaryPlayerView,
                        focusedIndex = focusedIndex,
                        programsByChannel = programsByChannel,
                        nowSeconds = nowSeconds,
                        streamUrl = streamUrl,
                        controlsVisible = controlsVisible,
                        canAddChannel = canAddChannel,
                        canRemoveChannel = canRemoveChannel,
                        focusedAction = focusedAction,
                        onAddChannelClick = onAddChannelClick,
                        onOpenSingleClick = onOpenSingleClick,
                        onRemoveChannelClick = onRemoveChannelClick,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                    MultiPlayerCell(
                        index = 1,
                        channels = channels,
                        primaryPlayer = primaryPlayer,
                        primaryPlayerView = primaryPlayerView,
                        focusedIndex = focusedIndex,
                        programsByChannel = programsByChannel,
                        nowSeconds = nowSeconds,
                        streamUrl = streamUrl,
                        controlsVisible = controlsVisible,
                        canAddChannel = canAddChannel,
                        canRemoveChannel = canRemoveChannel,
                        focusedAction = focusedAction,
                        onAddChannelClick = onAddChannelClick,
                        onOpenSingleClick = onOpenSingleClick,
                        onRemoveChannelClick = onRemoveChannelClick,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    MultiPlayerCell(
                        index = 2,
                        channels = channels,
                        primaryPlayer = primaryPlayer,
                        primaryPlayerView = primaryPlayerView,
                        focusedIndex = focusedIndex,
                        programsByChannel = programsByChannel,
                        nowSeconds = nowSeconds,
                        streamUrl = streamUrl,
                        controlsVisible = controlsVisible,
                        canAddChannel = canAddChannel,
                        canRemoveChannel = canRemoveChannel,
                        focusedAction = focusedAction,
                        onAddChannelClick = onAddChannelClick,
                        onOpenSingleClick = onOpenSingleClick,
                        onRemoveChannelClick = onRemoveChannelClick,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                    MultiPlayerCell(
                        index = 3,
                        channels = channels,
                        primaryPlayer = primaryPlayer,
                        primaryPlayerView = primaryPlayerView,
                        focusedIndex = focusedIndex,
                        programsByChannel = programsByChannel,
                        nowSeconds = nowSeconds,
                        streamUrl = streamUrl,
                        controlsVisible = controlsVisible,
                        canAddChannel = canAddChannel,
                        canRemoveChannel = canRemoveChannel,
                        focusedAction = focusedAction,
                        onAddChannelClick = onAddChannelClick,
                        onOpenSingleClick = onOpenSingleClick,
                        onRemoveChannelClick = onRemoveChannelClick,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
        }
    }
}

@Composable
private fun MultiPlayerCell(
    index: Int,
    channels: List<TvChannel>,
    primaryPlayer: StablePlayer,
    primaryPlayerView: StablePlayerView,
    focusedIndex: Int,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    controlsVisible: Boolean,
    canAddChannel: Boolean,
    canRemoveChannel: Boolean,
    focusedAction: MultiControlFocus,
    onAddChannelClick: () -> Unit,
    onOpenSingleClick: () -> Unit,
    onRemoveChannelClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val channel = channels.getOrNull(index)
    if (channel == null) {
        Box(
            modifier
                .padding(6.dp)
                .background(Color(0xFF050607), RoundedCornerShape(8.dp))
        )
        return
    }
    MultiPlayerTile(
        channel = channel,
        program = currentProgramForNow(programsByChannel[channel.id].orEmpty(), nowSeconds),
        focused = focusedIndex == index,
        controlsVisible = controlsVisible && focusedIndex == index,
        canAddChannel = canAddChannel,
        canRemoveChannel = canRemoveChannel,
        focusedAction = focusedAction,
        onAddChannelClick = onAddChannelClick,
        onOpenSingleClick = onOpenSingleClick,
        onRemoveChannelClick = onRemoveChannelClick,
        modifier = modifier,
    ) {
        if (index == 0) {
            PlayerSurface(
                player = primaryPlayer,
                playerView = primaryPlayerView,
                useController = false,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            ExtraChannelPlayerSurface(
                channel = channel,
                streamUrl = streamUrl,
                hasAudioFocus = focusedIndex == index,
                preferSoftwareDecode = index >= 2,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun MultiPlayerTile(
    channel: TvChannel,
    program: TvProgram?,
    focused: Boolean,
    controlsVisible: Boolean,
    canAddChannel: Boolean,
    canRemoveChannel: Boolean,
    focusedAction: MultiControlFocus,
    onAddChannelClick: () -> Unit,
    onOpenSingleClick: () -> Unit,
    onRemoveChannelClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .padding(6.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.Black)
            .border(
                if (focused) 3.dp else 1.dp,
                if (focused) PrimaryCyan else Color(0xFF2B3035),
                RoundedCornerShape(8.dp),
            )
    ) {
        content()
        Box(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .height(88.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color(0xB8000000))
                    )
                )
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (channel.logoUrl.isNotBlank()) {
                    AsyncImage(
                        model = rememberSizedImageRequest(channel.logoUrl, width = 96, height = 96),
                        contentDescription = null,
                        modifier = Modifier.size(42.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                }
                Column {
                    Text(
                        text = listOf(channel.number, channel.name).filter { it.isNotBlank() }.joinToString("  "),
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = program?.title.orEmpty(),
                        color = Color(0xFFD2D7DA),
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (controlsVisible) {
            FocusedMultiPlayerControls(
                canAddChannel = canAddChannel,
                canRemoveChannel = canRemoveChannel,
                focusedAction = focusedAction,
                onAddChannelClick = onAddChannelClick,
                onOpenSingleClick = onOpenSingleClick,
                onRemoveChannelClick = onRemoveChannelClick,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(14.dp),
            )
        }
    }
}

@Composable
private fun FocusedMultiPlayerControls(
    canAddChannel: Boolean,
    canRemoveChannel: Boolean,
    focusedAction: MultiControlFocus,
    onAddChannelClick: () -> Unit,
    onOpenSingleClick: () -> Unit,
    onRemoveChannelClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(Color(0x66040A0E), RoundedCornerShape(12.dp))
            .padding(horizontal = 5.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (canAddChannel) {
            MultiControlIconButton(
                focused = focusedAction == MultiControlFocus.Add,
                onClick = onAddChannelClick,
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Add channel",
                    tint = it,
                    modifier = Modifier.size(25.dp),
                )
            }
        }
        MultiControlIconButton(
            focused = focusedAction == MultiControlFocus.OpenSingle,
            onClick = onOpenSingleClick,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_fullscreen),
                contentDescription = "Open single player",
                tint = it,
                modifier = Modifier.size(24.dp),
            )
        }
        if (canRemoveChannel) {
            MultiControlIconButton(
                focused = focusedAction == MultiControlFocus.Remove,
                onClick = onRemoveChannelClick,
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Remove channel",
                    tint = it,
                    modifier = Modifier.size(25.dp),
                )
            }
        }
    }
}

@Composable
private fun MultiControlIconButton(
    focused: Boolean,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val shape = RoundedCornerShape(9.dp)
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(44.dp)
            .background(
                if (focused) PrimaryCyan else Color(0xCC06121B),
                shape,
            ),
    ) {
        icon(if (focused) Color(0xFF031012) else Color.White)
    }
}

@Composable
private fun ExtraChannelPlayerSurface(
    channel: TvChannel,
    streamUrl: (TvChannel) -> String,
    hasAudioFocus: Boolean,
    preferSoftwareDecode: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val trackSelector = remember(channel.id, preferSoftwareDecode) {
        DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .clearVideoSizeConstraints()
                    .setMaxVideoBitrate(Int.MAX_VALUE)
                    .setForceLowestBitrate(true)
                    .setExceedVideoConstraintsIfNecessary(true)
            )
        }
    }
    val player = remember(channel.id, preferSoftwareDecode) {
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
            .apply {
                if (preferSoftwareDecode) {
                    setMediaCodecSelector(MediaCodecSelector.PREFER_SOFTWARE)
                }
            }
        ExoPlayer.Builder(context)
            .setRenderersFactory(renderersFactory)
            .setTrackSelector(trackSelector)
            .build()
            .apply {
                playWhenReady = true
                volume = 0f
            }
    }
    val playerView = remember(player) {
        PlayerView(context).apply {
            this.player = player
            useController = false
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(true)
            setEnableComposeSurfaceSyncWorkaround(true)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }

    LaunchedEffect(channel.id) {
        val url = streamUrl(channel)
        if (url.isBlank()) return@LaunchedEffect
        player.setMediaItem(
            MediaItem.Builder()
                .setUri(url)
                .setMimeType(MimeTypes.APPLICATION_M3U8)
                .build()
        )
        player.prepare()
        player.play()
    }
    LaunchedEffect(hasAudioFocus) {
        trackSelector.setParameters(
            trackSelector.buildUponParameters().apply {
                if (hasAudioFocus) {
                    setMaxVideoSize(MULTI_PLAYER_MAX_WIDTH, MULTI_PLAYER_MAX_HEIGHT)
                    setMaxVideoBitrate(Int.MAX_VALUE)
                    setForceLowestBitrate(false)
                    setExceedVideoConstraintsIfNecessary(true)
                } else {
                    clearVideoSizeConstraints()
                    setMaxVideoBitrate(Int.MAX_VALUE)
                    setForceLowestBitrate(true)
                    setExceedVideoConstraintsIfNecessary(true)
                }
            }
        )
    }
    LaunchedEffect(hasAudioFocus) {
        player.volume = if (hasAudioFocus) 1f else 0f
    }
    DisposableEffect(player) {
        onDispose {
            playerView.player = null
            player.release()
        }
    }

    AndroidView(
        factory = { playerView },
        update = {
            if (it.player !== player) it.player = player
            it.useController = false
        },
        modifier = modifier,
    )
}

@Composable
private fun AddChannelMenu(
    channels: List<TvChannel>,
    onAddChannel: (TvChannel) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    var selectedIndex by remember(channels) { mutableIntStateOf(0) }

    BackHandler(onBack = onClose)
    LaunchedEffect(Unit) {
        delay(80)
        focusRequester.requestFocus()
    }

    Box(
        modifier
            .width(360.dp)
            .fillMaxHeight()
            .background(Color(0xF2071015))
            .border(1.dp, Color(0xFF34454D))
            .focusRequester(focusRequester)
            .onPreviewKeyEvent {
                when {
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionUp -> {
                        selectedIndex = (selectedIndex - 1).coerceAtLeast(0)
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                        selectedIndex = (selectedIndex + 1).coerceAtMost(channels.lastIndex.coerceAtLeast(0))
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionLeft -> {
                        onClose()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key.isActivationKey() -> {
                        channels.getOrNull(selectedIndex)?.let(onAddChannel)
                        true
                    }
                    it.key.isActivationKey() -> true
                    else -> false
                }
            }
            .focusable()
            .padding(18.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                text = "הוסף ערוץ",
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Right,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            if (channels.isEmpty()) {
                Text(
                    text = "אין ערוצים נוספים",
                    color = Color(0xFFB8C4C8),
                    fontSize = 16.sp,
                    textAlign = TextAlign.Right,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                val visibleChannels = channels.drop(selectedIndex.coerceAtLeast(0)).take(8)
                visibleChannels.forEachIndexed { offset, channel ->
                    val index = selectedIndex + offset
                    AddChannelRow(
                        channel = channel,
                        focused = index == selectedIndex,
                        onClick = { onAddChannel(channel) },
                    )
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun AddChannelRow(
    channel: TvChannel,
    focused: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .background(
                if (focused) Color(0xFFEAFBFC) else Color(0xFF172126),
                RoundedCornerShape(8.dp),
            )
            .border(
                1.dp,
                if (focused) PrimaryCyan else Color(0xFF28363D),
                RoundedCornerShape(8.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = rememberSizedImageRequest(channel.logoUrl, width = 80, height = 80),
            contentDescription = null,
            modifier = Modifier.size(42.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
            Text(
                text = channel.name,
                color = if (focused) Color(0xFF061013) else Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Right,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = channel.number,
                color = if (focused) Color(0xFF314348) else Color(0xFFB7C2C6),
                fontSize = 13.sp,
                maxLines = 1,
                textAlign = TextAlign.Right,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PlayerSurface(
    player: StablePlayer,
    playerView: StablePlayerView,
    useController: Boolean,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        factory = {
            (playerView.value.parent as? ViewGroup)?.removeView(playerView.value)
            playerView.value
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
        modifier = modifier,
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
                        listOf(Color.Transparent, Color(0x66000000), Color(0xBF000000))
                    )
                )
                .padding(start = 44.dp, end = 44.dp, top = 42.dp, bottom = 24.dp),
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
                text = listOfNotNull(channel?.name, program?.timeRange()?.asLtrText()).joinToString("  |  "),
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
            .background(Color(0xAA050607), RoundedCornerShape(6.dp))
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
    val zoneId = ZoneId.systemDefault()
    return "${TimeFormatter.format(Instant.ofEpochSecond(startSeconds).atZone(zoneId))} - ${TimeFormatter.format(Instant.ofEpochSecond(endSeconds).atZone(zoneId))}"
}

private fun String.asLtrText(): String =
    "\u200E$this\u200E"

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
        .format(Instant.ofEpochMilli(timeMs).atZone(ZoneId.systemDefault()))

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

private fun TvChannel.hasPlayableStream(): Boolean = streamUrl.isNotBlank()

private fun TvProgram.programKey(): String =
    "$channelId:$startSeconds:$endSeconds:$title"
