package com.tvapp.programguide.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.os.SystemClock
import android.view.LayoutInflater
import android.view.KeyEvent as AndroidKeyEvent
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
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
import androidx.compose.ui.unit.IntSize
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
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.tvapp.programguide.R
import com.tvapp.programguide.data.AppDestination
import com.tvapp.programguide.data.VodEpisode
import com.tvapp.programguide.data.VodProvider
import com.tvapp.programguide.data.VodSeries
import com.tvapp.programguide.ui.components.AppSideNavRail
import com.tvapp.programguide.ui.components.TvScreenLayout
import com.tvapp.programguide.ui.home.HomeScreen
import com.tvapp.programguide.ui.local.LocalSeriesScreen
import com.tvapp.programguide.ui.vod.VodPlayerOverlay
import com.tvapp.programguide.ui.vod.VodScreen
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import com.tvapp.programguide.data.TvStreamSource
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.withContext

private val ScreenBackground = Color(0xFF050607)
private val CellBackground = Color(0xFF202020)
private val CellBorder = Color(0xFF4A4A4A)
private val FocusBlue = Color(0xFF0B5E93)
private val GlowCyan = Color(0xFF7DF9FF)
private val PrimaryCyan = Color(0xFF10D5D9)
private val ActiveGreen = Color(0xFF19D99A)
private val Gold = Color(0xFFFFC928)
private val TimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val HeaderTimeFormatter = DateTimeFormatter.ofPattern("EEE HH:mm", Locale.getDefault())
private val TopPanelHeight = 190.dp
private val MiniPlayerWidth = 320.dp
private const val MAX_MULTI_PLAYER_CHANNELS = 4
private const val MULTI_PLAYER_MAX_WIDTH = 320
private const val MULTI_PLAYER_MAX_HEIGHT = 180
private const val MULTI_PLAYER_MAX_VIDEO_BITRATE = 260_000
private const val PRIMARY_PLAYER_MIN_BUFFER_MS = 4_000
private const val PRIMARY_PLAYER_MAX_BUFFER_MS = 12_000
private const val PRIMARY_PLAYER_PLAYBACK_BUFFER_MS = 750
private const val PRIMARY_PLAYER_REBUFFER_MS = 1_500
private const val MULTI_PLAYER_MIN_BUFFER_MS = 2_500
private const val MULTI_PLAYER_MAX_BUFFER_MS = 8_000
private const val MULTI_PLAYER_PLAYBACK_BUFFER_MS = 750
private const val MULTI_PLAYER_REBUFFER_MS = 1_500
private const val NO_PROGRAM_BLOCK_SECONDS = 60 * 60L
private const val HALF_HOUR_SECONDS = 30 * 60L
private const val GRID_LOOKBACK_SECONDS = 60 * 60L
private const val GRID_VISIBLE_WINDOW_SECONDS = 12 * 60 * 60L
private const val GRID_MOTION_MS = 120
private const val GRID_NAVIGATION_MIN_INTERVAL_MS = 70L
private const val HOME_LIVE_REFRESH_INTERVAL_MS = 2 * 60 * 1000L
private const val MAX_ACTIVE_ROW_IMAGES = 24

@Stable
class StablePlayer(val value: ExoPlayer)

@Stable
class StablePlayerView(val value: PlayerView)

@Stable
private class StableProgramList(val value: List<TvProgram>)

private enum class PrimaryVideoProfile {
    Mini,
    HomeBackground,
    Full,
    MultiFocused,
    MultiBackground,
}

private data class VisibleProgram(
    val program: TvProgram,
    val key: String,
    val timeRange: String,
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
        val window = activity?.window
        println("KeepScreenOnEffect: enabled=$enabled, window=$window")
        if (enabled) {
            window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        onDispose {
            println("KeepScreenOnEffect onDispose (was enabled=$enabled)")
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

@Composable
private fun rememberPlayerIsPlaying(player: Player): Boolean {
    fun Player.isActivelyPlaying(): Boolean {
        val active = isPlaying || (playWhenReady && (playbackState == Player.STATE_READY || playbackState == Player.STATE_BUFFERING))
        println("KeepScreenOn isActivelyPlaying: isPlaying=$isPlaying, playWhenReady=$playWhenReady, state=$playbackState -> active=$active")
        return active
    }

    var isPlaying by remember(player) { mutableStateOf(player.isActivelyPlaying()) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onEvents(p: Player, events: Player.Events) {
                isPlaying = p.isActivelyPlaying()
            }
        }
        player.addListener(listener)
        isPlaying = player.isActivelyPlaying()
        onDispose {
            player.removeListener(listener)
        }
    }

    return isPlaying
}

private const val APP_SESSION_TIMEOUT_MS = 15 * 60 * 1000L

@Composable
private fun AppLifecycleSessionEffect(
    onStop: () -> Unit,
    onStart: (elapsedMs: Long) -> Unit,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnStop by rememberUpdatedState(onStop)
    val currentOnStart by rememberUpdatedState(onStart)
    var lastStoppedAtMs by remember { mutableLongStateOf(0L) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> {
                    lastStoppedAtMs = SystemClock.elapsedRealtime()
                    currentOnStop()
                }
                Lifecycle.Event.ON_START -> {
                    val stoppedAt = lastStoppedAtMs
                    if (stoppedAt > 0L) {
                        val elapsedMs = SystemClock.elapsedRealtime() - stoppedAt
                        lastStoppedAtMs = 0L
                        currentOnStart(elapsedMs)
                    }
                }
                else -> Unit
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
    val focusManager = LocalFocusManager.current
    val activeStreamUrl = remember { mutableStateOf<String?>(null) }
    val activeStreamProfile = remember { mutableStateOf<PrimaryVideoProfile?>(null) }
    val renderedStreamUrl = remember { mutableStateOf<String?>(null) }
    var primaryVideoProfile by remember { mutableStateOf<PrimaryVideoProfile?>(null) }
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
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(SharedHttpDataSourceFactory))
            .setTrackSelector(trackSelector)
            .setLoadControl(createPrimaryPlayerLoadControl())
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
            .apply {
            playWhenReady = true
        }
    }
    val stablePlayer = remember(player) { StablePlayer(player) }
    val playerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view_texture, null) as PlayerView).apply {
            (videoSurfaceView as? TextureView)?.isOpaque = true
            useController = false
            controllerAutoShow = true
            controllerShowTimeoutMs = 3_000
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(true)
            setEnableComposeSurfaceSyncWorkaround(false)
            hideController()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val stablePlayerView = remember(playerView) { StablePlayerView(playerView) }
    val homeInlinePlayerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view_texture, null) as PlayerView).apply {
            (videoSurfaceView as? TextureView)?.isOpaque = false
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(false)
            setEnableComposeSurfaceSyncWorkaround(false)
            hideController()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val stableHomeInlinePlayerView = remember(homeInlinePlayerView) { StablePlayerView(homeInlinePlayerView) }
    val guideInlinePlayerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view_texture, null) as PlayerView).apply {
            (videoSurfaceView as? TextureView)?.isOpaque = true
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(false)
            setEnableComposeSurfaceSyncWorkaround(false)
            hideController()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val stableGuideInlinePlayerView = remember(guideInlinePlayerView) { StablePlayerView(guideInlinePlayerView) }
    val vodInlinePlayerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view_texture, null) as PlayerView).apply {
            (videoSurfaceView as? TextureView)?.isOpaque = false
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(false)
            setEnableComposeSurfaceSyncWorkaround(false)
            hideController()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val stableVodInlinePlayerView = remember(vodInlinePlayerView) { StablePlayerView(vodInlinePlayerView) }
    var liveTvIsMuted by remember { mutableStateOf(false) }
    val liveTvMuteFocusRequester = remember { FocusRequester() }
    var homeVodPreviewEpisodeId by remember { mutableStateOf<String?>(null) }
    var homeVodPreviewStreamUrl by remember { mutableStateOf<String?>(null) }
    var homeVodPreviewSeekReadyEpisodeId by remember { mutableStateOf<String?>(null) }
    var homeVodPreviewLoadToken by remember { mutableIntStateOf(0) }
    var homeBackgroundChannelId by remember { mutableStateOf<String?>(null) }
    var homeIsMuted by remember { mutableStateOf(false) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                renderedStreamUrl.value = activeStreamUrl.value
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying && activeStreamUrl.value != null) {
                    renderedStreamUrl.value = activeStreamUrl.value
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY && player.playWhenReady && activeStreamUrl.value != null) {
                    renderedStreamUrl.value = activeStreamUrl.value
                }
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
        }
    }
    val multiPlayerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view_texture, null) as PlayerView).apply {
            (videoSurfaceView as? TextureView)?.isOpaque = true
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(true)
            setEnableComposeSurfaceSyncWorkaround(false)
            hideController()
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }
    val stableMultiPlayerView = remember(multiPlayerView) { StablePlayerView(multiPlayerView) }
    val streamingActive = playbackState.isMiniPlayerPlaying || playbackState.isPlayerExpanded
    var detailsVisible by remember { mutableStateOf(false) }
    var navRailExpanded by remember { mutableStateOf(false) }
    var multiPlayerChannels by remember { mutableStateOf<List<TvChannel>>(emptyList()) }
    var multiPlayerFocusIndex by remember { mutableIntStateOf(0) }
    var multiModeEnabled by remember { mutableStateOf(false) }
    var currentDestination by remember { mutableStateOf(AppDestination.HOME) }
    val vodViewModel: VodViewModel = viewModel()
    val vodUiState by vodViewModel.uiState.collectAsStateWithLifecycle()
    val localSeriesViewModel: LocalSeriesViewModel = viewModel()
    val localSeriesUiState by localSeriesViewModel.uiState.collectAsStateWithLifecycle()
    val isVodPlaying = currentDestination == AppDestination.VOD && vodUiState.playingEpisode != null
    val isLocalSeriesPlaying = currentDestination == AppDestination.LOCAL_SERIES && localSeriesUiState.playingEpisode != null
    val isInitialLoading = guideState.guideData == null && guideState.error == null
    val sideRailHomeFocusRequester = remember { FocusRequester() }
    val sideRailLiveTvFocusRequester = remember { FocusRequester() }
    val sideRailVodFocusRequester = remember { FocusRequester() }
    val sideRailLocalSeriesFocusRequester = remember { FocusRequester() }
    val mainGridFocusRequester = remember { FocusRequester() }
    val homeContentFocusRequester = remember { FocusRequester() }
    val vodContentFocusRequester = remember { FocusRequester() }
    val localSeriesContentFocusRequester = remember { FocusRequester() }
    val coroutineScope = rememberCoroutineScope()
    var vodContentFocusNonce by remember { mutableIntStateOf(0) }
    var homeContentFocusNonce by remember { mutableIntStateOf(0) }
    var homeLiveRowFocusNonce by remember { mutableIntStateOf(0) }
    var localSeriesContentFocusNonce by remember { mutableIntStateOf(0) }
    var vodFocusRestorer by remember { mutableStateOf<(() -> Unit)?>(null) }
    var localSeriesFocusRestorer by remember { mutableStateOf<(() -> Unit)?>(null) }
    var sideNavForceCollapsed by remember { mutableStateOf(true) }
    var openingHomeLivePlayer by remember { mutableStateOf(false) }
    var expandedPlayerReturnDestination by remember { mutableStateOf(AppDestination.LIVE_TV) }
    var homeLiveFocusChannelId by remember { mutableStateOf<String?>(null) }
    var restoreHomeLiveRowOnReturn by remember { mutableStateOf(false) }

    fun openSideRail(destination: AppDestination) {
        sideNavForceCollapsed = false
        coroutineScope.launch {
            delay(20)
            try {
                when (destination) {
                    AppDestination.HOME -> sideRailHomeFocusRequester.requestFocus()
                    AppDestination.LIVE_TV -> sideRailLiveTvFocusRequester.requestFocus()
                    AppDestination.VOD -> sideRailVodFocusRequester.requestFocus()
                    AppDestination.LOCAL_SERIES -> sideRailLocalSeriesFocusRequester.requestFocus()
                }
            } catch (_: Exception) {}
        }
    }

    fun requestVodContentFocus() {
        val restorer = vodFocusRestorer
        if (restorer != null) {
            restorer()
        } else {
            vodContentFocusNonce += 1
            try {
                vodContentFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    fun requestLocalSeriesContentFocus() {
        val restorer = localSeriesFocusRestorer
        if (restorer != null) {
            restorer()
        } else {
            localSeriesContentFocusNonce += 1
            try {
                localSeriesContentFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    fun requestHomeContentFocus() {
        homeContentFocusNonce += 1
        try {
            homeContentFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    fun requestHomeLiveRowFocus() {
        homeLiveRowFocusNonce += 1
    }

    BackHandler(
        enabled = currentDestination == AppDestination.LIVE_TV && !playbackState.isPlayerExpanded && !detailsVisible && !isInitialLoading
    ) {
        openSideRail(AppDestination.LIVE_TV)
    }

    BackHandler(
        enabled = currentDestination == AppDestination.HOME && !playbackState.isPlayerExpanded && !isInitialLoading
    ) {
        if (!navRailExpanded) {
            openSideRail(AppDestination.HOME)
        }
    }

    LaunchedEffect(guideState.guideData != null) {
        if (guideState.guideData != null && currentDestination == AppDestination.HOME) {
            delay(40)
            requestHomeContentFocus()
        }
    }

    LaunchedEffect(currentDestination) {
        if (currentDestination == AppDestination.HOME) {
            openingHomeLivePlayer = false
            if (playbackState.playingChannel != null && homeVodPreviewEpisodeId == null) {
                homeBackgroundChannelId = playbackState.playingChannel?.id
            }
            viewModel.refreshSilentlyIfStale()
            vodViewModel.refreshIfStale()
            delay(40)
            if (restoreHomeLiveRowOnReturn) {
                restoreHomeLiveRowOnReturn = false
                requestHomeLiveRowFocus()
            } else {
                requestHomeContentFocus()
            }
        } else if (currentDestination == AppDestination.VOD) {
            homeBackgroundChannelId = null
            player.pause()
            vodViewModel.refreshIfStale()
            delay(40)
            requestVodContentFocus()
        } else if (currentDestination == AppDestination.LOCAL_SERIES) {
            homeBackgroundChannelId = null
            player.pause()
            localSeriesViewModel.refreshIfStale()
            delay(40)
            requestLocalSeriesContentFocus()
        } else if (currentDestination == AppDestination.LIVE_TV) {
            homeBackgroundChannelId = null
            openingHomeLivePlayer = false
            viewModel.refreshSilentlyIfStale()
            if (!isInitialLoading && !playbackState.isPlayerExpanded) {
                delay(40)
                try {
                    mainGridFocusRequester.requestFocus()
                } catch (_: Exception) {}
            }
        }
    }

    LaunchedEffect(currentDestination) {
        if (currentDestination != AppDestination.HOME) return@LaunchedEffect
        while (true) {
            delay(HOME_LIVE_REFRESH_INTERVAL_MS)
            viewModel.refreshSilentlyIfStale(force = true)
        }
    }

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

    val playerIsPlaying = rememberPlayerIsPlaying(player)
    val isVodResolving = isVodPlaying && vodUiState.isResolvingStream
    val isPlayerActive = playerIsPlaying || isVodResolving
    val isBigPlayerActive = playbackState.isPlayerExpanded || isVodPlaying || isLocalSeriesPlaying
    val isAnyPlaybackActive = isBigPlayerActive || streamingActive ||
        (currentDestination == AppDestination.HOME && (homeBackgroundChannelId != null || homeVodPreviewEpisodeId != null))
    val shouldKeepScreenOn = isAnyPlaybackActive && isPlayerActive

    KeepScreenOnEffect(enabled = shouldKeepScreenOn)
    var playbackEpoch by remember { mutableLongStateOf(0L) }
    var savedVodPositionMs by remember { mutableStateOf<Long?>(null) }
    var savedLocalPositionMs by remember { mutableStateOf<Long?>(null) }

    AppLifecycleSessionEffect(
        onStop = {
            savedVodPositionMs = if (isVodPlaying) player.currentPosition.coerceAtLeast(0L) else null
            savedLocalPositionMs = if (isLocalSeriesPlaying) player.currentPosition.coerceAtLeast(0L) else null
            player.stop()
            activeStreamUrl.value = null
            activeStreamProfile.value = null
            renderedStreamUrl.value = null
        },
        onStart = { elapsedMs ->
            if (elapsedMs > APP_SESSION_TIMEOUT_MS) {
                savedVodPositionMs = null
                savedLocalPositionMs = null
                currentDestination = AppDestination.HOME
                viewModel.stopPlayback()
                vodViewModel.stopVodPlayback()
                localSeriesViewModel.stopPlayback()
                vodViewModel.closeSeriesDetails()
                localSeriesViewModel.closeSeries()
                viewModel.refresh()
                vodViewModel.loadRecent()
            }
            playbackEpoch++
        }
    )

    DisposableEffect(Unit) {
        onDispose {
            playerView.player = null
            homeInlinePlayerView.player = null
            guideInlinePlayerView.player = null
            multiPlayerView.player = null
            player.release()
        }
    }

    fun applyPrimaryVideoProfile(profile: PrimaryVideoProfile) {
        if (primaryVideoProfile == profile) return
        primaryVideoProfile = profile
        player.volume = when (profile) {
            PrimaryVideoProfile.MultiBackground -> 0f
            PrimaryVideoProfile.HomeBackground -> if (homeIsMuted) 0f else 1f
            PrimaryVideoProfile.Mini -> if (currentDestination == AppDestination.LIVE_TV && liveTvIsMuted) 0f else 1f
            else -> 1f
        }
        trackSelector.setParameters(
            trackSelector.buildUponParameters().apply {
                when (profile) {
                    PrimaryVideoProfile.Mini -> {
                        setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                        setMaxVideoBitrate(Int.MAX_VALUE)
                        setForceLowestBitrate(false)
                        setExceedVideoConstraintsIfNecessary(true)
                        setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                    }
                    PrimaryVideoProfile.HomeBackground -> {
                        setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                        setMaxVideoBitrate(Int.MAX_VALUE)
                        setForceLowestBitrate(false)
                        setExceedVideoConstraintsIfNecessary(true)
                        setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                    }
                    PrimaryVideoProfile.Full -> {
                        setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                        setMaxVideoBitrate(Int.MAX_VALUE)
                        setForceLowestBitrate(false)
                        setExceedVideoConstraintsIfNecessary(true)
                        setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                    }
                    PrimaryVideoProfile.MultiFocused -> {
                        setMaxVideoSize(MULTI_PLAYER_MAX_WIDTH, MULTI_PLAYER_MAX_HEIGHT)
                        setMaxVideoBitrate(MULTI_PLAYER_MAX_VIDEO_BITRATE)
                        setForceLowestBitrate(true)
                        setExceedVideoConstraintsIfNecessary(true)
                        setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                    }
                    PrimaryVideoProfile.MultiBackground -> {
                        setMaxVideoSize(MULTI_PLAYER_MAX_WIDTH, MULTI_PLAYER_MAX_HEIGHT)
                        setMaxVideoBitrate(MULTI_PLAYER_MAX_VIDEO_BITRATE)
                        setForceLowestBitrate(true)
                        setExceedVideoConstraintsIfNecessary(true)
                        setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                    }
                }
            }
        )
    }

    LaunchedEffect(multiPlayerActive, playbackState.playingChannel?.id) {
        if (!multiPlayerActive) {
            if (primaryVideoProfile == PrimaryVideoProfile.MultiBackground ||
                primaryVideoProfile == PrimaryVideoProfile.MultiFocused
            ) {
                applyPrimaryVideoProfile(PrimaryVideoProfile.Full)
            } else {
                player.volume = 1f
            }
            return@LaunchedEffect
        }
        applyPrimaryVideoProfile(PrimaryVideoProfile.MultiFocused)
    }

    LaunchedEffect(multiPlayerActive, currentDestination, playbackState.isPlayerExpanded) {
        if (multiPlayerActive) {
            playerView.player = null
            homeInlinePlayerView.player = null
            guideInlinePlayerView.player = null
            multiPlayerView.player = player
        } else if (currentDestination == AppDestination.HOME && !playbackState.isPlayerExpanded) {
            playerView.player = null
            multiPlayerView.player = null
            guideInlinePlayerView.player = null
            if (homeInlinePlayerView.player !== player) {
                homeInlinePlayerView.player = player
            }
        } else if (currentDestination == AppDestination.LIVE_TV && !playbackState.isPlayerExpanded) {
            playerView.player = null
            multiPlayerView.player = null
            homeInlinePlayerView.player = null
            if (guideInlinePlayerView.player !== player) {
                guideInlinePlayerView.player = player
            }
        } else {
            multiPlayerView.player = null
            homeInlinePlayerView.player = null
            guideInlinePlayerView.player = null
            if (playerView.player !== player) {
                playerView.player = player
            }
        }
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
        currentDestination,
        playbackState.isMiniPlayerPlaying,
        playbackState.isPlayerExpanded,
        playbackState.playingChannel?.id,
        playbackState.playingChannel?.streamUrl,
        playbackState.selectedStreamSourceIds,
        isVodPlaying,
        vodUiState.playingStreamUrl,
        homeVodPreviewStreamUrl,
        isLocalSeriesPlaying,
        localSeriesUiState.playingEpisode?.streamUrl,
        playbackEpoch,
    ) {
        if (isLocalSeriesPlaying) {
            val stream = localSeriesUiState.playingEpisode?.streamUrl
            if (!stream.isNullOrBlank()) {
                if (activeStreamUrl.value != stream) {
                    applyPrimaryVideoProfile(PrimaryVideoProfile.Full)
                    val mediaItem = when {
                        stream.contains(".m3u8", ignoreCase = true) -> {
                            MediaItem.Builder()
                                .setUri(stream)
                                .setMimeType(MimeTypes.APPLICATION_M3U8)
                                .build()
                        }
                        stream.contains(".mp4", ignoreCase = true) -> {
                            MediaItem.Builder()
                                .setUri(stream)
                                .setMimeType(MimeTypes.APPLICATION_MP4)
                                .build()
                        }
                        else -> MediaItem.fromUri(stream)
                    }
                    val targetPos = savedLocalPositionMs ?: 0L
                    savedLocalPositionMs = null
                    renderedStreamUrl.value = null
                    activeStreamUrl.value = null
                    player.setMediaItem(mediaItem, targetPos)
                    if (targetPos > 0L) {
                        player.seekTo(targetPos)
                    }
                    player.prepare()
                    activeStreamUrl.value = stream
                }
                player.play()
            }
            return@LaunchedEffect
        }

        if (isVodPlaying) {
            val vodStream = vodUiState.playingStreamUrl
            if (!vodStream.isNullOrBlank()) {
                if (activeStreamUrl.value != vodStream) {
                    applyPrimaryVideoProfile(PrimaryVideoProfile.Full)
                    val mediaItem = when {
                        vodStream.contains(".mpd", ignoreCase = true) || vodStream.contains(".livx", ignoreCase = true) -> {
                            MediaItem.Builder()
                                .setUri(vodStream)
                                .setMimeType(MimeTypes.APPLICATION_MPD)
                                .build()
                        }
                        // Mako/Keshet HLS URLs can include ".mp4.csmil/index.m3u8"; prefer HLS when present.
                        vodStream.contains(".m3u8", ignoreCase = true) -> {
                            MediaItem.Builder()
                                .setUri(vodStream)
                                .setMimeType(MimeTypes.APPLICATION_M3U8)
                                .build()
                        }
                        vodStream.contains(".mp4", ignoreCase = true) -> {
                            MediaItem.Builder()
                                .setUri(vodStream)
                                .setMimeType(MimeTypes.APPLICATION_MP4)
                                .build()
                        }
                        else -> {
                            // VOD usually arrives through /api/proxy?url=..., so URL sniffing is unreliable.
                            MediaItem.Builder()
                                .setUri(vodStream)
                                .setMimeType(MimeTypes.APPLICATION_M3U8)
                                .build()
                        }
                    }
                    val resumePos = savedVodPositionMs ?: vodUiState.resumePositionMs ?: 0L
                    savedVodPositionMs = null
                    if (resumePos > 0L) {
                        renderedStreamUrl.value = null
                        activeStreamUrl.value = null
                        player.setMediaItem(mediaItem, resumePos)
                        player.seekTo(resumePos)
                    } else {
                        renderedStreamUrl.value = null
                        activeStreamUrl.value = null
                        player.setMediaItem(mediaItem, 0L)
                        player.seekTo(0L)
                    }
                    player.prepare()
                    activeStreamUrl.value = vodStream
                }
                player.play()
            }
            return@LaunchedEffect
        }

        if (currentDestination == AppDestination.HOME && !homeVodPreviewStreamUrl.isNullOrBlank()) {
            val previewStream = homeVodPreviewStreamUrl ?: return@LaunchedEffect
            if (activeStreamUrl.value != previewStream) {
                applyPrimaryVideoProfile(PrimaryVideoProfile.HomeBackground)
                val mediaItem = when {
                    previewStream.contains(".mpd", ignoreCase = true) || previewStream.contains(".livx", ignoreCase = true) -> {
                        MediaItem.Builder()
                            .setUri(previewStream)
                            .setMimeType(MimeTypes.APPLICATION_MPD)
                            .build()
                    }
                    previewStream.contains(".m3u8", ignoreCase = true) -> {
                        MediaItem.Builder()
                            .setUri(previewStream)
                            .setMimeType(MimeTypes.APPLICATION_M3U8)
                            .build()
                    }
                    previewStream.contains(".mp4", ignoreCase = true) -> {
                        MediaItem.Builder()
                            .setUri(previewStream)
                            .setMimeType(MimeTypes.APPLICATION_MP4)
                            .build()
                    }
                    else -> {
                        MediaItem.Builder()
                            .setUri(previewStream)
                            .setMimeType(MimeTypes.APPLICATION_M3U8)
                            .build()
                    }
                }
                renderedStreamUrl.value = null
                activeStreamUrl.value = null
                player.setMediaItem(mediaItem)
                player.prepare()
                activeStreamUrl.value = previewStream
            }
            player.play()
            return@LaunchedEffect
        }

        if ((currentDestination == AppDestination.VOD && vodUiState.selectedSeriesDetails == null) || currentDestination == AppDestination.LOCAL_SERIES) {
            player.stop()
            activeStreamUrl.value = null
            renderedStreamUrl.value = null
            return@LaunchedEffect
        }

        val channel = playbackState.playingChannel
        if (channel == null) {
            player.stop()
            activeStreamUrl.value = null
            renderedStreamUrl.value = null
            return@LaunchedEffect
        }
        val shouldPlay = playbackState.isMiniPlayerPlaying || playbackState.isPlayerExpanded
        if (!shouldPlay) {
            player.stop()
            activeStreamUrl.value = null
            renderedStreamUrl.value = null
            return@LaunchedEffect
        }

        val streamSource = viewModel.selectedStreamSource(channel)
        val streamUrl = streamSource?.url.orEmpty()
        if (streamUrl.isBlank()) {
            player.stop()
            activeStreamUrl.value = null
            renderedStreamUrl.value = null
            return@LaunchedEffect
        }
        val targetProfile = if (playbackState.isPlayerExpanded) {
            PrimaryVideoProfile.Full
        } else if (currentDestination == AppDestination.HOME && (homeBackgroundChannelId == channel.id || homeBackgroundChannelId == null)) {
            PrimaryVideoProfile.HomeBackground
        } else {
            PrimaryVideoProfile.Mini
        }
        if (activeStreamUrl.value != streamUrl || player.playbackState == Player.STATE_IDLE) {
            renderedStreamUrl.value = null
            activeStreamUrl.value = streamUrl
            activeStreamProfile.value = targetProfile
            applyPrimaryVideoProfile(targetProfile)
            val mediaItem = liveMediaItem(streamUrl, streamSource?.mimeType)
            player.setMediaItem(mediaItem)
            player.prepare()
        } else if (activeStreamProfile.value != targetProfile) {
            applyPrimaryVideoProfile(targetProfile)
            activeStreamProfile.value = targetProfile
        }
        if (currentDestination == AppDestination.HOME && (homeBackgroundChannelId == channel.id || homeBackgroundChannelId == null) && !playbackState.isPlayerExpanded) {
            player.volume = if (homeIsMuted) 0f else 1f
        } else if (currentDestination == AppDestination.LIVE_TV && !playbackState.isPlayerExpanded) {
            player.volume = if (liveTvIsMuted) 0f else 1f
        } else if (playbackState.isPlayerExpanded) {
            player.volume = 1f
        }
        player.play()
    }

    LaunchedEffect(homeIsMuted, liveTvIsMuted, currentDestination, playbackState.isPlayerExpanded) {
        if (currentDestination == AppDestination.HOME && !playbackState.isPlayerExpanded) {
            player.volume = if (homeIsMuted) 0f else 1f
        } else if (currentDestination == AppDestination.LIVE_TV && !playbackState.isPlayerExpanded) {
            player.volume = if (liveTvIsMuted) 0f else 1f
        } else if (playbackState.isPlayerExpanded) {
            player.volume = 1f
        }
    }

    LaunchedEffect(homeVodPreviewStreamUrl, homeVodPreviewEpisodeId) {
        val previewStream = homeVodPreviewStreamUrl ?: return@LaunchedEffect
        val previewEpisodeId = homeVodPreviewEpisodeId ?: return@LaunchedEffect
        var waited = 0
        while (waited < 30 && player.playbackState != Player.STATE_READY && player.playbackState != Player.STATE_BUFFERING) {
            delay(100L)
            waited++
        }
        if (
            currentDestination == AppDestination.HOME &&
            homeVodPreviewEpisodeId == previewEpisodeId &&
            activeStreamUrl.value == previewStream
        ) {
            homeVodPreviewSeekReadyEpisodeId = previewEpisodeId
        }
    }

    MaterialTheme {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Box(Modifier.fillMaxSize().background(ScreenBackground)) {
                val showNavRail = !playbackState.isPlayerExpanded && !isVodPlaying && !isLocalSeriesPlaying && !isInitialLoading
                val contentStartPadding = when {
                    !showNavRail -> 0.dp
                    navRailExpanded -> 176.dp
                    else -> 56.dp
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = contentStartPadding),
                ) {
                    when (currentDestination) {
                        AppDestination.HOME -> {
                            if (guideState.error != null && guideState.guideData == null) {
                                GuideError(guideState.error ?: "שגיאה בטעינת לוח השידורים", viewModel::refresh)
                            } else if (guideState.guideData == null) {
                                GuideMessage(stringResource(R.string.loading_guide))
                            } else {
                                HomeScreen(
                                    guideData = guideState.guideData,
                                recentChannelIds = guideState.recentChannelIds,
                                vodRecentItems = vodUiState.recentItems,
                                vodWatchedItems = vodUiState.watchedItems,
                                vodProgress = vodUiState.episodeProgress,
                                localSeries = localSeriesUiState.series,
                                localProgress = localSeriesUiState.episodeProgress,
                                nowSeconds = nowSeconds,
                                player = stablePlayer,
                                playerView = stableHomeInlinePlayerView,
                                playingLiveChannelId = playbackState.playingChannel?.let { channel ->
                                    channel.id.takeIf {
                                        currentDestination == AppDestination.HOME &&
                                            playbackState.isMiniPlayerPlaying &&
                                            !playbackState.isPlayerExpanded &&
                                            homeVodPreviewEpisodeId == null
                                    }
                                },
                                readyLiveChannelId = playbackState.playingChannel?.let { channel ->
                                    val streamUrl = viewModel.selectedStreamSource(channel)?.url.orEmpty()
                                    channel.id.takeIf {
                                        currentDestination == AppDestination.HOME &&
                                            playbackState.isMiniPlayerPlaying &&
                                            !playbackState.isPlayerExpanded &&
                                            homeVodPreviewEpisodeId == null &&
                                            streamUrl.isNotBlank() &&
                                            (renderedStreamUrl.value == streamUrl || (activeStreamUrl.value == streamUrl && (player.isPlaying || player.playbackState == Player.STATE_READY)))
                                    }
                                },
                                backgroundLiveChannelId = homeBackgroundChannelId,
                                readyBackgroundLiveChannelId = playbackState.playingChannel?.let { channel ->
                                    val streamUrl = viewModel.selectedStreamSource(channel)?.url.orEmpty()
                                    channel.id.takeIf {
                                        currentDestination == AppDestination.HOME &&
                                            (homeBackgroundChannelId == channel.id || homeBackgroundChannelId == null) &&
                                            playbackState.isMiniPlayerPlaying &&
                                            !playbackState.isPlayerExpanded &&
                                            homeVodPreviewEpisodeId == null &&
                                            streamUrl.isNotBlank() &&
                                            (renderedStreamUrl.value == streamUrl || (activeStreamUrl.value == streamUrl && (player.isPlaying || player.playbackState == Player.STATE_READY)))
                                    }
                                },
                                playingVodPreviewEpisodeId = homeVodPreviewEpisodeId,
                                readyVodPreviewEpisodeId = homeVodPreviewEpisodeId.takeIf {
                                    !homeVodPreviewStreamUrl.isNullOrBlank() &&
                                        (renderedStreamUrl.value == homeVodPreviewStreamUrl || player.playbackState == Player.STATE_READY)
                                },
                                initialFocusRequester = homeContentFocusRequester,
                                isMuted = homeIsMuted,
                                isPlayerExpanded = playbackState.isPlayerExpanded,
                                onToggleMute = { homeIsMuted = !homeIsMuted },
                                contentFocusNonce = homeContentFocusNonce,
                                liveRowFocusNonce = homeLiveRowFocusNonce,
                                restoreLiveChannelId = homeLiveFocusChannelId,
                                onLiveChannelFocused = { channelId ->
                                    homeLiveFocusChannelId = channelId
                                },
                                onPlayLiveChannel = { channel, program ->
                                    openingHomeLivePlayer = true
                                    expandedPlayerReturnDestination = currentDestination
                                    homeLiveFocusChannelId = channel.id
                                    homeVodPreviewLoadToken += 1
                                    homeVodPreviewEpisodeId = null
                                    homeVodPreviewStreamUrl = null
                                    homeVodPreviewSeekReadyEpisodeId = null
                                    val isAlreadyPlaying = playbackState.playingChannel?.id == channel.id &&
                                        activeStreamUrl.value != null &&
                                        player.playbackState != Player.STATE_IDLE
                                    if (!isAlreadyPlaying) {
                                        renderedStreamUrl.value = null
                                        activeStreamUrl.value = null
                                        player.stop()
                                        player.clearMediaItems()
                                    }
                                    currentDestination = AppDestination.LIVE_TV
                                    viewModel.playChannelExpanded(channel, program)
                                },
                                onPreviewHomeBackground = { channel, program ->
                                    if (currentDestination == AppDestination.HOME && !playbackState.isPlayerExpanded) {
                                        homeBackgroundChannelId = channel.id
                                        homeVodPreviewLoadToken += 1
                                        homeVodPreviewEpisodeId = null
                                        homeVodPreviewStreamUrl = null
                                        homeVodPreviewSeekReadyEpisodeId = null
                                        viewModel.previewChannel(channel, program)
                                    }
                                },
                                onPreviewLiveChannel = { channel, program ->
                                    homeBackgroundChannelId = channel.id
                                    homeVodPreviewEpisodeId = null
                                    homeVodPreviewStreamUrl = null
                                    homeVodPreviewSeekReadyEpisodeId = null
                                    viewModel.previewChannel(channel, program)
                                },
                                onStopLivePreview = {
                                    if (!openingHomeLivePlayer && !playbackState.isPlayerExpanded && currentDestination != AppDestination.LIVE_TV) {
                                        homeBackgroundChannelId = null
                                        viewModel.stopPreviewPlayback()
                                        renderedStreamUrl.value = null
                                        activeStreamUrl.value = null
                                        player.stop()
                                        player.clearMediaItems()
                                    }
                                },
                                onPreviewVodItem = { recent ->
                                    homeVodPreviewLoadToken += 1
                                    val loadToken = homeVodPreviewLoadToken
                                    homeBackgroundChannelId = null
                                    viewModel.stopPreviewPlayback()
                                    homeVodPreviewEpisodeId = recent.episodeId
                                    homeVodPreviewStreamUrl = null
                                    homeVodPreviewSeekReadyEpisodeId = null
                                    renderedStreamUrl.value = null
                                    activeStreamUrl.value = null
                                    player.stop()
                                    player.clearMediaItems()
                                    coroutineScope.launch {
                                        val stream = vodViewModel.resolveRecentItemPreviewStream(recent)
                                        if (
                                            homeVodPreviewLoadToken == loadToken &&
                                            currentDestination == AppDestination.HOME &&
                                            homeVodPreviewEpisodeId == recent.episodeId &&
                                            !stream.isNullOrBlank()
                                        ) {
                                            homeVodPreviewStreamUrl = stream
                                        }
                                    }
                                },
                                onStopVodPreview = {
                                    homeVodPreviewLoadToken += 1
                                    if (homeVodPreviewEpisodeId != null || homeVodPreviewStreamUrl != null) {
                                        homeVodPreviewEpisodeId = null
                                        homeVodPreviewStreamUrl = null
                                        homeVodPreviewSeekReadyEpisodeId = null
                                        renderedStreamUrl.value = null
                                        activeStreamUrl.value = null
                                        player.stop()
                                        player.clearMediaItems()
                                    }
                                },
                                onPlayRecentVod = { recent ->
                                    currentDestination = AppDestination.VOD
                                    vodViewModel.playRecentItem(recent)
                                },
                                onPlayLocalEpisode = { series, episode ->
                                    currentDestination = AppDestination.LOCAL_SERIES
                                    localSeriesViewModel.playEpisode(series, episode)
                                },
                                onOpenDestination = { destination ->
                                    currentDestination = destination
                                },
                                onOpenVodProvider = { provider ->
                                    currentDestination = AppDestination.VOD
                                    vodViewModel.openChannel(provider)
                                },
                                onNavigateSideRail = { openSideRail(AppDestination.HOME) },
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                        AppDestination.LIVE_TV -> {
                            when {
                                guideState.error != null -> GuideError(guideState.error ?: "Error", viewModel::refresh)
                                guideState.loading || guideState.guideData == null -> GuideMessage(stringResource(R.string.loading_guide))
                                else -> GuideContent(
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
                                    onStopPlayback = viewModel::stopPreviewPlayback,
                                    isLiveStreamReady = { channel ->
                                        val streamUrl = viewModel.selectedStreamSource(channel)?.url.orEmpty()
                                        streamUrl.isNotBlank() && (
                                            renderedStreamUrl.value == streamUrl ||
                                            (activeStreamUrl.value == streamUrl && (player.isPlaying || player.playbackState == Player.STATE_READY))
                                        )
                                    },
                                    onLiveChannelOpened = { channel, program ->
                                        expandedPlayerReturnDestination = AppDestination.LIVE_TV
                                        viewModel.playChannelExpanded(channel, program)
                                    },
                                    onProgramSelected = viewModel::selectChannel,
                                    selectedStreamSource = viewModel::selectedStreamSource,
                                    onPlayerClick = viewModel::expandPlayer,
                                    onGuideRangeNeeded = viewModel::ensureGuideRange,
                                    gridFocusTarget = gridFocusTarget,
                                    onDetailsVisibleChanged = { detailsVisible = it },
                                    onGridFocusRequested = { channel, program, live ->
                                        requestGridFocus(channel, program, live)
                                    },
                                    onNavigateSideRail = { openSideRail(AppDestination.LIVE_TV) },
                                    externalGridFocusRequester = mainGridFocusRequester,
                                    player = stablePlayer,
                                    playerView = stableGuideInlinePlayerView,
                                    isMuted = liveTvIsMuted,
                                    onToggleMute = { liveTvIsMuted = !liveTvIsMuted },
                                    muteFocusRequester = liveTvMuteFocusRequester,
                                )
                            }
                        }
                        AppDestination.VOD -> {
                            VodScreen(
                                viewModel = vodViewModel,
                                onNavigateSideRail = { openSideRail(AppDestination.VOD) },
                                initialFocusRequester = vodContentFocusRequester,
                                contentFocusNonce = vodContentFocusNonce,
                                player = stablePlayer,
                                inlinePlayerView = stableVodInlinePlayerView,
                                playerView = stablePlayerView,
                                onRegisterFocusRestorer = { restorer ->
                                    vodFocusRestorer = restorer
                                },
                            )
                        }
                        AppDestination.LOCAL_SERIES -> {
                            LocalSeriesScreen(
                                viewModel = localSeriesViewModel,
                                onNavigateSideRail = { openSideRail(AppDestination.LOCAL_SERIES) },
                                initialFocusRequester = localSeriesContentFocusRequester,
                                contentFocusNonce = localSeriesContentFocusNonce,
                                onRegisterFocusRestorer = { restorer ->
                                    localSeriesFocusRestorer = restorer
                                },
                            )

                            if (isLocalSeriesPlaying) {
                                val localEpisode = localSeriesUiState.playingEpisode
                                val localSeries = localSeriesUiState.playingSeries
                                VodPlayerOverlay(
                                    streamUrl = localEpisode?.streamUrl,
                                    episode = localEpisode?.let { episode ->
                                        VodEpisode(
                                            id = episode.id,
                                            programId = localSeries?.id.orEmpty(),
                                            seasonId = episode.season?.let { "season-$it" },
                                            title = episode.title,
                                            description = episode.overview.orEmpty(),
                                            imageUrl = episode.imageUrl ?: localSeries?.backdropUrl ?: localSeries?.posterUrl,
                                            playUrl = episode.streamUrl,
                                            streamEndpoint = null,
                                            displayOrder = episode.episode ?: 0,
                                        )
                                    },
                                    series = localSeries?.let { series ->
                                        VodSeries(
                                            id = series.id,
                                            title = series.displayTitle,
                                            description = series.metadata?.overview.orEmpty(),
                                            imageUrl = series.backdropUrl ?: series.posterUrl,
                                            episodeCount = series.episodes.size,
                                            seasonCount = series.metadata?.numberOfSeasons ?: 0,
                                            genre = series.metadata?.genres.orEmpty().take(2).joinToString(" · ").takeIf { it.isNotBlank() },
                                            provider = VodProvider.KAN11,
                                        )
                                    },
                                    providerLogoUrl = null,
                                    providerDisplayNameOverride = "סדרות",
                                    badgeText = "סדרות",
                                    isResolvingStream = false,
                                    error = null,
                                    onClose = localSeriesViewModel::stopPlayback,
                                    player = stablePlayer,
                                    playerView = stablePlayerView,
                                    modifier = Modifier.fillMaxSize(),
                                    resumePositionMs = localSeriesUiState.resumePositionMs,
                                    onSaveProgress = localSeriesViewModel::savePlaybackProgress,
                                )
                            }
                        }
                    }
                }

                if (showNavRail) {
                    AppSideNavRail(
                        currentDestination = currentDestination,
                        onDestinationSelected = { destination ->
                            sideNavForceCollapsed = true
                            navRailExpanded = false
                            focusManager.clearFocus(force = true)
                            currentDestination = destination
                            coroutineScope.launch {
                                delay(40)
                                if (destination == AppDestination.HOME) {
                                    requestHomeContentFocus()
                                } else if (destination == AppDestination.VOD) {
                                    requestVodContentFocus()
                                } else if (destination == AppDestination.LOCAL_SERIES) {
                                    requestLocalSeriesContentFocus()
                                } else {
                                    try {
                                        mainGridFocusRequester.requestFocus()
                                    } catch (_: Exception) {}
                                }
                            }
                        },
                        liveTvFocusRequester = sideRailLiveTvFocusRequester,
                        homeFocusRequester = sideRailHomeFocusRequester,
                        vodFocusRequester = sideRailVodFocusRequester,
                        localSeriesFocusRequester = sideRailLocalSeriesFocusRequester,
                        forceCollapsed = sideNavForceCollapsed,
                        onExpandedChanged = { expanded ->
                            navRailExpanded = expanded
                        },
                        onNavigateToContent = {
                            sideNavForceCollapsed = true
                            navRailExpanded = false
                            if (currentDestination == AppDestination.HOME) {
                                requestHomeContentFocus()
                            } else if (currentDestination == AppDestination.VOD) {
                                requestVodContentFocus()
                            } else if (currentDestination == AppDestination.LOCAL_SERIES) {
                                requestLocalSeriesContentFocus()
                            } else {
                                try {
                                    mainGridFocusRequester.requestFocus()
                                } catch (_: Exception) {}
                            }
                        },
                        modifier = Modifier.align(Alignment.TopStart),
                    )
                }

            if (playbackState.isPlayerExpanded) {
                ExpandedPlayer(
                    player = stablePlayer,
                    primaryPlayerView = stablePlayerView,
                    primaryMultiPlayerView = stableMultiPlayerView,
                    channel = if (multiPlayerActive) playbackState.playingChannel else multiFocusedChannel ?: playbackState.playingChannel,
                    program = if (multiPlayerActive) currentPlayingProgram else multiFocusedProgram ?: currentPlayingProgram,
                    guideChannels = guideData?.channels.orEmpty(),
                    programsByChannel = guideData?.programsByChannel.orEmpty(),
                    nowSeconds = nowSeconds,
                    streamUrl = viewModel::streamUrl,
                    streamSources = viewModel::streamSources,
                    selectedStreamSource = viewModel::selectedStreamSource,
                    onSelectStreamSource = viewModel::selectStreamSource,
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
                    onPrimaryMultiAudioFocusChanged = { focused ->
                        applyPrimaryVideoProfile(
                            if (focused) PrimaryVideoProfile.MultiFocused else PrimaryVideoProfile.MultiBackground
                        )
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
                        expandedPlayerReturnDestination = AppDestination.LIVE_TV
                        viewModel.playChannelExpanded(
                            channel,
                            guideData?.programsByChannel?.get(channel.id).orEmpty()
                                .let { programs -> currentProgramForNow(programs, nowSeconds) },
                        )
                    },
                    onRemoveFocusedMultiChannel = { focusedIndex ->
                        if (expandedMultiChannels.size > 1) {
                            val safeFocusedIndex = focusedIndex.coerceIn(0, expandedMultiChannels.lastIndex)
                            val removedChannel = expandedMultiChannels.getOrNull(safeFocusedIndex)
                            val nextChannels = expandedMultiChannels.filterIndexed { index, _ -> index != safeFocusedIndex }
                            multiPlayerChannels = nextChannels
                            multiModeEnabled = nextChannels.size > 1
                            multiPlayerFocusIndex = safeFocusedIndex.coerceAtMost(nextChannels.lastIndex).coerceAtLeast(0)
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
                        val returnDestination = expandedPlayerReturnDestination
                        expandedPlayerReturnDestination = AppDestination.LIVE_TV
                        multiPlayerChannels = emptyList()
                        multiPlayerFocusIndex = 0
                        multiModeEnabled = false
                        viewModel.collapsePlayer()
                        if (returnDestination == AppDestination.HOME) {
                            restoreHomeLiveRowOnReturn = true
                            homeBackgroundChannelId = playbackState.playingChannel?.id
                            currentDestination = AppDestination.HOME
                        } else {
                            requestGridFocus(playbackState.playingChannel, live = true)
                        }
                    },
                )
            }
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
    onStopPlayback: () -> Unit = {},
    isLiveStreamReady: (TvChannel) -> Boolean = { true },
    onLiveChannelOpened: (TvChannel, TvProgram?) -> Unit,
    onProgramSelected: (TvChannel, TvProgram?) -> Unit,
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    onPlayerClick: () -> Unit,
    onGuideRangeNeeded: (Long, Long) -> Unit,
    gridFocusTarget: GridFocusTarget?,
    onDetailsVisibleChanged: (Boolean) -> Unit,
    onGridFocusRequested: (TvChannel?, TvProgram?, Boolean) -> Unit,
    onNavigateSideRail: () -> Unit = {},
    externalGridFocusRequester: FocusRequester? = null,
    player: StablePlayer,
    playerView: StablePlayerView,
    isMuted: Boolean,
    onToggleMute: () -> Unit,
    muteFocusRequester: FocusRequester,
) {
    val gridFocusRequester = externalGridFocusRequester ?: remember { FocusRequester() }
    val fullScreenFocusRequester = remember { FocusRequester() }
    var blockGridActivationUntilMs by remember { mutableLongStateOf(0L) }
    var suspendGridAutoPlay by remember { mutableStateOf(false) }
    var detailsChannel by remember { mutableStateOf<TvChannel?>(null) }
    var detailsProgram by remember { mutableStateOf<TvProgram?>(null) }
    var focusedChannel by remember { mutableStateOf<TvChannel?>(null) }
    var focusedProgram by remember { mutableStateOf<TvProgram?>(null) }
    val nowSeconds by rememberGuideNowSeconds()

    val programForDetails = detailsProgram
    LaunchedEffect(programForDetails != null) {
        onDetailsVisibleChanged(programForDetails != null)
    }
    DisposableEffect(Unit) {
        onDispose {
            onDetailsVisibleChanged(false)
            onStopPlayback()
        }
    }

    val activeChannel = focusedChannel ?: displayChannel ?: playingChannel ?: selectedChannel ?: data.channels.firstOrNull()
    val activeProgram = focusedProgram ?: displayProgram ?: playingProgram ?: selectedProgram ?: activeChannel?.let { ch ->
        data.programsByChannel[ch.id]?.let { currentProgramForNow(it, nowSeconds) }
    }

    val isLive = activeProgram != null && isCurrent(activeProgram, nowSeconds)

    var livePreviewChannelId by remember {
        mutableStateOf(
            if (playingChannel != null && !isPlayerExpanded && activeProgram != null && isCurrent(activeProgram, nowSeconds)) {
                playingChannel.id
            } else {
                null
            }
        )
    }

    LaunchedEffect(isPlayerExpanded) {
        if (!isPlayerExpanded && playingChannel != null && activeChannel?.id == playingChannel.id && isLive) {
            livePreviewChannelId = playingChannel.id
        }
    }

    LaunchedEffect(
        activeChannel?.id,
        activeProgram?.programKey(),
        isPlayerExpanded,
        detailsProgram != null,
        suspendGridAutoPlay,
        isLive,
        playingChannel?.id,
        isMiniPlayerPlaying,
    ) {
        if (isPlayerExpanded || detailsProgram != null || suspendGridAutoPlay) {
            return@LaunchedEffect
        }

        val channel = activeChannel
        val program = activeProgram

        if (!isLive || channel == null) {
            livePreviewChannelId = null
            if (playingChannel != null) {
                onStopPlayback()
            }
            return@LaunchedEffect
        }

        val isAlreadyPlayingThisChannel = playingChannel?.id == channel.id && isMiniPlayerPlaying

        if (livePreviewChannelId != channel.id || !isAlreadyPlayingThisChannel) {
            if (playingChannel != null && playingChannel.id != channel.id) {
                onStopPlayback()
            }
            livePreviewChannelId = null

            delay(350L)

            if (isCurrent(program, nowSeconds)) {
                livePreviewChannelId = channel.id
                if (playingChannel?.id != channel.id || !isMiniPlayerPlaying) {
                    onChannelActivated(channel, program)
                }
            }
        }
    }

    val heroTitle = activeProgram?.title ?: activeChannel?.name ?: "שידור חי"
    val heroSubtitle = activeChannel?.name.orEmpty()
    val heroDescription = activeProgram?.description?.ifBlank { null }
        ?: if (isLive) "שידור חי בערוץ ${activeChannel?.name.orEmpty()}" else activeChannel?.name.orEmpty()
    val heroTimeRange = activeProgram?.timeRange()
    val heroChannelLogoUrl = activeChannel?.logoUrl

    val isVideoRendering = livePreviewChannelId != null &&
        livePreviewChannelId == playingChannel?.id &&
        !isPlayerExpanded &&
        playingChannel?.let(isLiveStreamReady) == true

    val backgroundImageUrl = activeProgram?.imageUrl ?: activeChannel?.logoUrl

    TvScreenLayout(
        player = player,
        playerView = playerView,
        isVideoRendering = isVideoRendering,
        isPlayerExpanded = isPlayerExpanded,
        backgroundImageUrl = backgroundImageUrl,
        artworkTitle = heroTitle,
        heroTitle = heroTitle,
        heroSubtitle = heroSubtitle,
        heroDescription = heroDescription,
        heroTimeRange = heroTimeRange,
        heroChannelLogoUrl = heroChannelLogoUrl,
        isLive = isLive,
        showVodBadge = false,
        isMuted = isMuted,
        onToggleMute = onToggleMute,
        muteFocusRequester = muteFocusRequester,
        onOpenFullScreen = {
            activeChannel?.let { ch -> onLiveChannelOpened(ch, activeProgram) } ?: onPlayerClick()
        },
        fullScreenFocusRequester = fullScreenFocusRequester,
        onNavigateLeft = onNavigateSideRail,
        onNavigateDown = {
            try {
                gridFocusRequester.requestFocus()
            } catch (_: Exception) {}
        },
        onFocusChanged = { isHeroActionFocused ->
            if (isHeroActionFocused) {
                focusedChannel = null
                focusedProgram = null
            }
        },
        heroPadding = PaddingValues(start = 24.dp, end = 32.dp, top = 28.dp),
        contentPadding = PaddingValues(0.dp),
        spacerAfterHero = 8.dp,
        overlayContent = {
            if (programForDetails != null) {
                ProgramDetailsPage(
                    channel = detailsChannel,
                    program = programForDetails,
                    selectedStreamSource = selectedStreamSource,
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
        },
    ) {
        ProgramGrid(
            data = data,
            selectedChannel = selectedChannel,
            selectedProgram = selectedProgram,
            playingChannel = playingChannel,
            onChannelActivated = onChannelActivated,
            onLiveChannelOpened = onLiveChannelOpened,
            onProgramSelected = onProgramSelected,
            onSelectionFocused = { channel, program ->
                focusedChannel = channel
                focusedProgram = program
            },
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
            showNowRequestNonce = 0,
            gridFocusRequester = gridFocusRequester,
            topFocusRequester = if (isVideoRendering) fullScreenFocusRequester else null,
            onNavigateSideRail = onNavigateSideRail,
            modifier = Modifier.fillMaxSize(),
        )
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
    onSelectionFocused: (TvChannel?, TvProgram?) -> Unit = { _, _ -> },
    isGridActivationBlocked: () -> Boolean,
    isGridAutoPlaySuspended: () -> Boolean,
    onGridNavigationStarted: () -> Unit,
    onProgramDetailsRequested: (TvChannel, TvProgram) -> Unit,
    onGuideRangeNeeded: (Long, Long) -> Unit,
    focusTarget: GridFocusTarget?,
    showNowRequestNonce: Int,
    gridFocusRequester: FocusRequester,
    topFocusRequester: FocusRequester? = null,
    onNavigateSideRail: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current

    BoxWithConstraints(modifier) {
    val nowSeconds by rememberGuideNowSeconds()
    val desiredWindowStartSeconds = nowSeconds.floorToHalfHour() - GRID_LOOKBACK_SECONDS
    val desiredWindowEndSeconds = desiredWindowStartSeconds + GRID_VISIBLE_WINDOW_SECONDS
    val snappedStart = desiredWindowStartSeconds
    val timelineEndSeconds = desiredWindowEndSeconds
    val slotWidth = 180.dp
    val channelWidth = 150.dp
    val visibleRowCount = visibleGuideRowCount(data.channels.size)
    val headerHeight = 36.dp
    val gridAvailableHeight = (maxHeight - headerHeight).coerceAtLeast(72.dp)
    val activeRowHeight = if (visibleRowCount > 1) gridAvailableHeight * 0.34f else gridAvailableHeight
    val inactiveRowHeight = if (visibleRowCount > 1) {
        (gridAvailableHeight - activeRowHeight) / (visibleRowCount - 1)
    } else {
        gridAvailableHeight
    }
    val baseScrollRowHeight = gridAvailableHeight / visibleRowCount.coerceAtLeast(1)
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
    val fullDisplayProgramsCache = remember(data.programsByChannel, snappedStart, timelineEndSeconds) {
        mutableMapOf<String, StableProgramList>()
    }
    fun fullDisplayPrograms(channel: TvChannel): StableProgramList =
        fullDisplayProgramsCache.getOrPut(channel.id) {
            StableProgramList(
                displayProgramsForChannel(
                    channel = channel,
                    programs = data.programsByChannel[channel.id].orEmpty(),
                    timelineStartSeconds = snappedStart,
                    timelineEndSeconds = timelineEndSeconds,
                )
            )
        }

    var scrollOffsetPx by remember(snappedStart) {
        mutableIntStateOf(0)
    }
    var selectedRowIndex by remember(data.channels) {
        mutableIntStateOf(
            data.channels.indexOfFirst { it.id == selectedChannelId }
                .takeIf { it >= 0 }
                ?: 0
        )
    }
    val selectedProgramSeedKey = selectedProgram?.programKey()
    var selectedProgramIndex by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let(::fullDisplayPrograms)?.value.orEmpty()
        val programIndex = selectedProgramSeedKey
            ?.let { key -> initialPrograms.indexOfFirst { it.programKey() == key } }
            ?.takeIf { it >= 0 }
            ?: liveProgramIndex(initialPrograms, nowSeconds)
        mutableIntStateOf(programIndex)
    }
    var selectedProgramKey by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let(::fullDisplayPrograms)?.value.orEmpty()
        val initialIndex = selectedProgramSeedKey
            ?.let { key -> initialPrograms.indexOfFirst { it.programKey() == key } }
            ?.takeIf { it >= 0 }
            ?: liveProgramIndex(initialPrograms, nowSeconds)
        mutableStateOf(initialPrograms.getOrNull(initialIndex)?.programKey())
    }
    var selectedTimeAnchorSeconds by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let(::fullDisplayPrograms)?.value.orEmpty()
        val initialIndex = selectedProgramSeedKey
            ?.let { key -> initialPrograms.indexOfFirst { it.programKey() == key } }
            ?.takeIf { it >= 0 }
            ?: liveProgramIndex(initialPrograms, nowSeconds)
        mutableStateOf(initialPrograms.getOrNull(initialIndex)?.centerSeconds() ?: nowSeconds)
    }
    var programFocusMode by remember(data.channels, selectedChannelId, selectedProgramSeedKey) {
        val initialChannel = data.channels.getOrNull(selectedRowIndex)
        val initialPrograms = initialChannel?.let(::fullDisplayPrograms)?.value.orEmpty()
        mutableStateOf(
            selectedProgramSeedKey?.let { key -> initialPrograms.any { it.programKey() == key } }
                ?: initialPrograms.isNotEmpty()
        )
    }
    val animatedScrollOffsetPx = animateFloatAsState(
        targetValue = scrollOffsetPx.toFloat(),
        animationSpec = tween(durationMillis = GRID_MOTION_MS, easing = FastOutSlowInEasing),
        label = "guideTimelineScroll",
    )
	    val scrollOffsetProvider = remember(animatedScrollOffsetPx) {
	        { animatedScrollOffsetPx.value }
	    }
	    val maxFirstVisibleRowIndex = (data.channels.size - visibleRowCount).coerceAtLeast(0)
	    var firstVisibleRowIndex by remember(data.channels, visibleRowCount) {
        mutableIntStateOf(
            (selectedRowIndex - 1)
                .coerceIn(0, maxFirstVisibleRowIndex)
	            )
	    }
	    val animatedFirstVisibleRowIndex = animateFloatAsState(
	        targetValue = firstVisibleRowIndex.toFloat(),
	        animationSpec = tween(durationMillis = GRID_MOTION_MS, easing = FastOutSlowInEasing),
	        label = "guideVerticalScroll",
	    )
    val visibleTimeRange by remember(scrollOffsetPx, slotWidthPx, timelineViewportWidthPx, snappedStart) {
        derivedStateOf {
            val pixelsPerSecond = slotWidthPx / 1800f
            val visibleStart = snappedStart + (scrollOffsetPx / pixelsPerSecond).toLong()
            val visibleDuration = (timelineViewportWidthPx / pixelsPerSecond).toLong()
            visibleStart to visibleStart + visibleDuration
        }
    }
    val nowOffset = durationWidth(max(0L, nowSeconds - snappedStart), slotWidth)
    val showLiveLine = nowSeconds >= snappedStart && nowSeconds <= timelineEndSeconds
    var gridFocused by remember { mutableStateOf(true) }
    val lastNavigationEventMs = remember { LongArray(1) }
    val activeSelectionChannel = data.channels.getOrNull(selectedRowIndex)
    val activeSelectionPrograms = activeSelectionChannel
        ?.let(::fullDisplayPrograms)
        ?.value
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
    }

    fun acceptNavigationEvent(): Boolean {
        val nowMs = System.currentTimeMillis()
        if (nowMs - lastNavigationEventMs[0] < GRID_NAVIGATION_MIN_INTERVAL_MS) return false
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
        val targetTimeSeconds = selectedTimeAnchorSeconds
            .coerceIn(visibleTimeRange.first, visibleTimeRange.second)
        selectedRowIndex = nextIndex
        val nextChannel = data.channels.getOrNull(nextIndex)
        val nextPrograms = nextChannel?.let(::fullDisplayPrograms)?.value.orEmpty()
        selectedProgramIndex = if (keepProgramFocus) {
            programIndexAtTime(nextPrograms, targetTimeSeconds)
        } else {
            -1
        }
        selectedProgramKey = nextPrograms.getOrNull(selectedProgramIndex)?.programKey()
        programFocusMode = keepProgramFocus
        firstVisibleRowIndex = preferredFirstVisibleRowIndex(nextIndex)
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
        selectedTimeAnchorSeconds = program.startSeconds
            .coerceIn(visibleTimeRange.first, visibleTimeRange.second)
        scrollOffsetPx = scrollOffsetKeepingProgramVisiblePx(
            program = program,
            timelineStartSeconds = snappedStart,
            slotWidthPx = slotWidthPx,
            timelineViewportWidthPx = timelineViewportWidthPx,
            currentScrollOffsetPx = scrollOffsetPx,
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
        scrollOffsetPx = 0

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

        val targetChannel = data.channels.firstOrNull { it.id == target.channelId }
        val programs = targetChannel?.let(::fullDisplayPrograms)?.value.orEmpty()
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
                0
            } else {
                scrollOffsetKeepingProgramVisiblePx(
                    program = program,
                    timelineStartSeconds = snappedStart,
                    slotWidthPx = slotWidthPx,
                    timelineViewportWidthPx = timelineViewportWidthPx,
                    currentScrollOffsetPx = scrollOffsetPx,
                    maxScrollOffsetPx = maxScrollOffsetPx,
                )
            }
        }

        delay(80)
        gridFocusRequester.requestFocus()
    }

    LaunchedEffect(activeSelectionChannel, activeSelectionProgram) {
        onSelectionFocused(activeSelectionChannel, activeSelectionProgram)
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

    LaunchedEffect(maxScrollOffsetPx) {
        scrollOffsetPx = scrollOffsetPx.coerceIn(0, maxScrollOffsetPx)
    }

    LaunchedEffect(desiredWindowStartSeconds, desiredWindowEndSeconds) {
        onGuideRangeNeeded(desiredWindowStartSeconds, desiredWindowEndSeconds)
    }

    LaunchedEffect(data.channels) {
        delay(100)
        gridFocusRequester.requestFocus()
    }

    LaunchedEffect(maxFirstVisibleRowIndex, selectedRowIndex, visibleRowCount) {
        firstVisibleRowIndex = preferredFirstVisibleRowIndex(selectedRowIndex)
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Transparent)
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
                                    topFocusRequester?.let {
                                        try {
                                            it.requestFocus()
                                        } catch (_: Exception) {}
                                    }
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
                                if (selectedProgramIndex <= 0) {
                                    onNavigateSideRail()
                                    true
                                } else {
                                    if (acceptNavigationEvent()) moveSelectedProgram(-1)
                                    true
                                }
                            }
                            it.type == KeyEventType.KeyDown && it.key == Key.Back -> {
                                onNavigateSideRail()
                                true
                            }
                            else -> false
                        }
                    }
                    .focusable()
        ) {
            CanvasGuideGrid(
                data = data,
                fullDisplayPrograms = ::fullDisplayPrograms,
                selectedRowIndex = selectedRowIndex,
                playingChannelId = playingChannelId,
                selectedProgramKey = activeSelectionProgram?.programKey().takeIf { selectedProgramIndex >= 0 },
                gridFocused = gridFocused,
                startSeconds = snappedStart,
                endSeconds = timelineEndSeconds,
                nowSeconds = nowSeconds,
                channelWidth = channelWidth,
                slotWidth = slotWidth,
                headerHeight = headerHeight,
                activeRowHeight = activeRowHeight,
                inactiveRowHeight = inactiveRowHeight,
                baseScrollRowHeight = baseScrollRowHeight,
                visibleRowCount = visibleRowCount,
                firstVisibleRowIndex = { animatedFirstVisibleRowIndex.value },
                scrollOffsetPx = scrollOffsetProvider,
                modifier = Modifier.fillMaxSize(),
            )
            ChannelLogoOverlay(
                data = data,
                selectedRowIndex = selectedRowIndex,
                headerHeight = headerHeight,
                activeRowHeight = activeRowHeight,
                inactiveRowHeight = inactiveRowHeight,
                visibleRowCount = visibleRowCount,
                firstVisibleRowIndex = { animatedFirstVisibleRowIndex.value },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
    }
}

@Composable
private fun ChannelLogoOverlay(
    data: GuideData,
    selectedRowIndex: Int,
    headerHeight: Dp,
    activeRowHeight: Dp,
    inactiveRowHeight: Dp,
    visibleRowCount: Int,
    firstVisibleRowIndex: () -> Float,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    BoxWithConstraints(modifier.clipToBounds()) {
        val firstRowIndex = firstVisibleRowIndex()
        val headerHeightPx = with(density) { headerHeight.toPx() }
        val activeRowHeightPx = with(density) { activeRowHeight.toPx() }
        val inactiveRowHeightPx = with(density) { inactiveRowHeight.toPx() }
        val viewportHeightPx = with(density) { maxHeight.toPx() }
        val renderStart = floor(firstRowIndex).toInt().coerceAtLeast(0)
        val renderEnd = min(data.channels.lastIndex, renderStart + visibleRowCount)
        var rowTopPx = headerHeightPx - (firstRowIndex - renderStart) * inactiveRowHeightPx

        for (index in renderStart..renderEnd) {
            val rowHeightPx = if (selectedRowIndex == index) activeRowHeightPx else inactiveRowHeightPx
            val channel = data.channels[index]
            if (rowTopPx + rowHeightPx > headerHeightPx && rowTopPx < viewportHeightPx && channel.logoUrl.isNotBlank()) {
                val visibleTopPx = max(rowTopPx, headerHeightPx)
                val visibleBottomPx = min(rowTopPx + rowHeightPx, viewportHeightPx)
                if (visibleBottomPx - visibleTopPx < with(density) { 44.dp.toPx() }) {
                    rowTopPx += rowHeightPx
                    continue
                }
                val x = with(density) { 18.dp }
                val y = with(density) { (visibleTopPx + (visibleBottomPx - visibleTopPx) / 2f - 20.dp.toPx()).toDp() }
                key(channel.id) {
                    AsyncImage(
                        model = rememberSizedImageRequest(channel.logoUrl, width = 80, height = 80),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .offset(x = x, y = y)
                            .size(40.dp)
                            .clip(RoundedCornerShape(6.dp)),
                    )
                }
            }
            rowTopPx += rowHeightPx
        }
    }
}

@Composable
private fun CanvasGuideGrid(
    data: GuideData,
    fullDisplayPrograms: (TvChannel) -> StableProgramList,
    selectedRowIndex: Int,
    playingChannelId: String?,
    selectedProgramKey: String?,
    gridFocused: Boolean,
    startSeconds: Long,
    endSeconds: Long,
    nowSeconds: Long,
    channelWidth: Dp,
    slotWidth: Dp,
    headerHeight: Dp,
    activeRowHeight: Dp,
    inactiveRowHeight: Dp,
    baseScrollRowHeight: Dp,
    visibleRowCount: Int,
    firstVisibleRowIndex: () -> Float,
    scrollOffsetPx: () -> Float,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val programImageCache = remember { mutableStateMapOf<String, ImageBitmap>() }
    val activeImageUrls = remember(
        data.channels,
        data.programsByChannel,
        selectedRowIndex,
        startSeconds,
        endSeconds,
    ) {
        val channel = data.channels.getOrNull(selectedRowIndex)
        channel
            ?.let(fullDisplayPrograms)
            ?.value
            .orEmpty()
            .asSequence()
            .filter { !it.imageUrl.isNullOrBlank() }
            .filter { it.endSeconds > startSeconds && it.startSeconds < endSeconds }
            .take(MAX_ACTIVE_ROW_IMAGES)
            .mapNotNull { it.imageUrl }
            .toList()
    }
    LaunchedEffect(activeImageUrls) {
        if (programImageCache.size > 24) {
            val activeSet = activeImageUrls.toSet()
            val keysToRemove = programImageCache.keys.filter { it !in activeSet }
            keysToRemove.take(programImageCache.size - 24).forEach { key ->
                programImageCache.remove(key)
            }
        }
        activeImageUrls.forEach { url ->
            if (programImageCache[url] != null) return@forEach
            val imageBitmap = withContext(Dispatchers.IO) {
                val result = context.imageLoader.execute(
                    ImageRequest.Builder(context)
                        .data(url)
                        .size(320, 180)
                        .crossfade(false)
                        .build()
                )
                ((result as? SuccessResult)?.drawable as? BitmapDrawable)
                    ?.bitmap
                    ?.asImageBitmap()
            }
            if (imageBitmap != null) {
                programImageCache[url] = imageBitmap
            }
        }
    }
    val titlePaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.RIGHT
        }
    }
    val metaPaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(170, 174, 184)
            textAlign = Paint.Align.RIGHT
        }
    }
    val darkTextPaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(7, 17, 20)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.RIGHT
        }
    }
    val playPaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(3, 24, 18)
            style = Paint.Style.FILL
        }
    }
    val reusablePath = remember { Path() }
    val reusablePlayPath = remember { Path() }
    val reusableRectF = remember { RectF() }
    val boldTypeface = remember { Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
    val normalTypeface = remember { Typeface.DEFAULT }
    val size8Px = remember(density) { with(density) { 8.sp.toPx() } }
    val size11Px = remember(density) { with(density) { 11.sp.toPx() } }
    val size12Px = remember(density) { with(density) { 12.sp.toPx() } }
    val size14Px = remember(density) { with(density) { 14.sp.toPx() } }

    Canvas(modifier) {
        val channelWidthPx = channelWidth.toPx()
        val slotWidthPx = slotWidth.toPx()
        val headerHeightPx = headerHeight.toPx()
        val activeRowHeightPx = activeRowHeight.toPx()
        val inactiveRowHeightPx = inactiveRowHeight.toPx()
        val baseScrollRowHeightPx = baseScrollRowHeight.toPx()
        val rowGapPx = 6.dp.toPx()
        val cellGapPx = 6.dp.toPx()
        val cornerPx = 8.dp.toPx()
        val scrollPx = scrollOffsetPx()
        val firstRow = firstVisibleRowIndex()
        val renderStart = floor(firstRow).toInt().coerceAtLeast(0)
        val renderEnd = min(data.channels.lastIndex, renderStart + visibleRowCount)
        val visibleStartSeconds = startSeconds + (scrollPx / (slotWidthPx / HALF_HOUR_SECONDS)).toLong()
        val visibleEndSeconds = visibleStartSeconds + ((size.width - channelWidthPx) / (slotWidthPx / HALF_HOUR_SECONDS)).toLong()

        drawRect(Color.Transparent)

        val nativeCanvas = drawContext.canvas.nativeCanvas
        fun Paint.withText(sizePx: Float, color: Int = this.color, bold: Boolean = false): Paint {
            textSize = sizePx
            this.color = color
            typeface = if (bold) boldTypeface else normalTypeface
            return this
        }
        fun drawAlignedText(
            text: String,
            x: Float,
            centerY: Float,
            maxWidth: Float,
            paint: Paint,
            align: Paint.Align = Paint.Align.RIGHT,
        ) {
            paint.textAlign = align
            val label = paint.ellipsizeToWidth(text, maxWidth)
            val metrics = paint.fontMetrics
            val baseline = centerY - (metrics.ascent + metrics.descent) / 2f
            nativeCanvas.drawText(label, x, baseline, paint)
        }

        val totalSlots = (((endSeconds - startSeconds) / HALF_HOUR_SECONDS).toInt()).coerceAtLeast(1)
        val firstSlot = max(0, ((visibleStartSeconds - startSeconds) / HALF_HOUR_SECONDS).toInt() - 1)
        val lastSlot = min(totalSlots - 1, ((visibleEndSeconds - startSeconds) / HALF_HOUR_SECONDS).toInt() + 1)
        clipRect(left = channelWidthPx, top = 0f, right = size.width, bottom = headerHeightPx) {
            for (slot in firstSlot..lastSlot) {
                val slotStart = startSeconds + slot * HALF_HOUR_SECONDS
                val x = channelWidthPx + slot * slotWidthPx - scrollPx
                if (x > size.width || x + slotWidthPx < channelWidthPx) continue
                val slotLeft = max(channelWidthPx + 3.dp.toPx(), x + 3.dp.toPx())
                val slotRight = min(size.width - 3.dp.toPx(), x + slotWidthPx - 3.dp.toPx())
                val slotCellWidth = slotRight - slotLeft
                if (slotCellWidth <= 18.dp.toPx()) continue
                drawRoundRect(
                    color = Color(0xE817181B),
                    topLeft = Offset(slotLeft, 3.dp.toPx()),
                    size = Size(slotCellWidth, headerHeightPx - 6.dp.toPx()),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(cornerPx, cornerPx),
                )
                val labelX = max(x + 14.dp.toPx(), channelWidthPx + 14.dp.toPx())
                drawAlignedText(
                    text = HeaderTimeFormatter.format(Instant.ofEpochSecond(slotStart).atZone(ZoneId.systemDefault())),
                    x = labelX,
                    centerY = headerHeightPx / 2f,
                    maxWidth = max(24.dp.toPx(), slotRight - labelX - 10.dp.toPx()),
                    paint = titlePaint.withText(size12Px, android.graphics.Color.rgb(200, 209, 214), bold = true),
                    align = Paint.Align.LEFT,
                )
            }
        }

        var rowTop = headerHeightPx - (firstRow - renderStart) * baseScrollRowHeightPx
        clipRect(top = headerHeightPx, bottom = size.height) {
            for (index in renderStart..renderEnd) {
                val channel = data.channels[index]
                val rowHeightPx = if (selectedRowIndex == index) activeRowHeightPx else inactiveRowHeightPx
                if (rowTop > size.height) break
                if (rowTop + rowHeightPx < headerHeightPx) {
                    rowTop += rowHeightPx
                    continue
                }
                val isActiveRow = selectedRowIndex == index
                val isChannelFocused = gridFocused && isActiveRow && selectedProgramKey == null
                val isPlaying = playingChannelId == channel.id
                val channelColor = when {
                    isChannelFocused -> Color(0xFFE8EAEE)
                    isActiveRow -> Color(0xFF565B64)
                    else -> Color(0xFF17181B)
                }
                val channelLeft = 6.dp.toPx()
                val channelTop = rowTop + 3.dp.toPx()
                val channelHeight = rowHeightPx - rowGapPx
                drawRoundRect(
                    color = channelColor,
                    topLeft = Offset(channelLeft, channelTop),
                    size = Size(channelWidthPx - 12.dp.toPx(), channelHeight),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(cornerPx, cornerPx),
                )
                if (isActiveRow) {
                    drawRoundRect(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                Color.White.copy(alpha = if (isChannelFocused) 0.22f else 0.10f),
                                Color.Transparent,
                            ),
                            startX = channelLeft,
                            endX = channelLeft + channelWidthPx * 0.42f,
                        ),
                        topLeft = Offset(channelLeft, channelTop),
                        size = Size(channelWidthPx - 12.dp.toPx(), channelHeight),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(cornerPx, cornerPx),
                    )
                }
                val channelTextColor = when {
                    isChannelFocused -> android.graphics.Color.rgb(10, 14, 18)
                    isActiveRow -> android.graphics.Color.WHITE
                    else -> android.graphics.Color.rgb(232, 234, 238)
                }
                drawAlignedText(
                    text = channel.name,
                    x = channelWidthPx - 16.dp.toPx(),
                    centerY = rowTop + rowHeightPx * 0.38f,
                    maxWidth = channelWidthPx - 82.dp.toPx(),
                    paint = titlePaint.withText(size14Px, channelTextColor, bold = true),
                )
                drawAlignedText(
                    text = if (isPlaying) "מנגן עכשיו" else channel.number,
                    x = channelWidthPx - 16.dp.toPx(),
                    centerY = rowTop + rowHeightPx * 0.68f,
                    maxWidth = channelWidthPx - 82.dp.toPx(),
                    paint = metaPaint.withText(
                        size11Px,
                        when {
                            isChannelFocused -> android.graphics.Color.rgb(46, 52, 58)
                            isPlaying -> android.graphics.Color.rgb(185, 191, 198)
                            else -> android.graphics.Color.rgb(140, 143, 152)
                        },
                    ),
                )
                drawRoundRect(
                    color = when {
                        isChannelFocused -> Color(0xFFFFFFFF)
                        isActiveRow -> Color(0xFF707680)
                        else -> Color(0xFF26272C)
                    },
                    topLeft = Offset(18.dp.toPx(), rowTop + rowHeightPx / 2f - 20.dp.toPx()),
                    size = Size(40.dp.toPx(), 40.dp.toPx()),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(6.dp.toPx(), 6.dp.toPx()),
                )
                drawAlignedText(
                    text = channel.number,
                    x = 38.dp.toPx(),
                    centerY = rowTop + rowHeightPx / 2f,
                    maxWidth = 32.dp.toPx(),
                    paint = titlePaint.withText(
                        size12Px,
                        if (isChannelFocused) android.graphics.Color.rgb(10, 14, 18) else android.graphics.Color.WHITE,
                        bold = true,
                    ),
                    align = Paint.Align.CENTER,
                )

                fullDisplayPrograms(channel).value.forEach { program ->
                val clippedStart = max(program.startSeconds, startSeconds)
                val clippedEnd = min(program.endSeconds, endSeconds)
                if (clippedEnd <= clippedStart) return@forEach
                val x = channelWidthPx + ((clippedStart - startSeconds) / HALF_HOUR_SECONDS.toFloat()) * slotWidthPx - scrollPx
                val width = ((clippedEnd - clippedStart) / HALF_HOUR_SECONDS.toFloat()) * slotWidthPx
                if (x > size.width || x + width < channelWidthPx) return@forEach
                val key = program.programKey()
                val focused = gridFocused && isActiveRow && selectedProgramKey == key
                val current = isCurrent(program, nowSeconds)
                val background = when {
                    focused -> Color(0xFFF2F4F7)
                    current -> Color(0xFF33363E)
                    else -> Color(0xEE24252A)
                }
                val sideGapPx = if (width < 24.dp.toPx()) 1.dp.toPx() else 3.dp.toPx()
                val cellLeft = max(channelWidthPx + sideGapPx, x + sideGapPx)
                val cellRight = min(size.width - sideGapPx, x + width - sideGapPx)
                val cellTop = rowTop + 3.dp.toPx()
                val cellWidth = cellRight - cellLeft
                val cellHeight = rowHeightPx - rowGapPx
                if (cellWidth <= 1.dp.toPx()) return@forEach
                val cellCornerPx = min(cornerPx, cellWidth / 2f)
                drawRoundRect(
                    color = background,
                    topLeft = Offset(cellLeft, cellTop),
                    size = Size(cellWidth, cellHeight),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(cellCornerPx, cellCornerPx),
                )
                val programImage = program.imageUrl?.let(programImageCache::get)
                if (isActiveRow && programImage != null && cellWidth >= 110.dp.toPx()) {
                    val imageWidthPx = min(132.dp.toPx(), cellWidth * 0.46f)
                    reusablePath.rewind()
                    reusableRectF.set(cellLeft, cellTop, cellLeft + cellWidth, cellTop + cellHeight)
                    reusablePath.addRoundRect(
                        reusableRectF,
                        cornerPx,
                        cornerPx,
                        Path.Direction.CW,
                    )
                    nativeCanvas.save()
                    nativeCanvas.clipPath(reusablePath)
                    drawImage(
                        image = programImage,
                        dstOffset = IntOffset(cellLeft.roundToInt(), cellTop.roundToInt()),
                        dstSize = IntSize(imageWidthPx.roundToInt(), cellHeight.roundToInt()),
                    )
                    drawRect(
                        brush = Brush.horizontalGradient(
                            colorStops = arrayOf(
                                0.00f to Color.Transparent,
                                0.28f to background.copy(alpha = 0.10f),
                                0.72f to background.copy(alpha = 0.78f),
                                1.00f to background.copy(alpha = 0.98f),
                            ),
                            startX = cellLeft,
                            endX = cellLeft + imageWidthPx,
                        ),
                        topLeft = Offset(cellLeft, cellTop),
                        size = Size(imageWidthPx, cellHeight),
                    )
                    nativeCanvas.restore()
                }
                val liveBadgeWidth = if (isPlaying) 46.dp.toPx() else 36.dp.toPx()
                val liveBadgeHeight = 16.dp.toPx()
                val liveBadgeLeft = cellLeft + 8.dp.toPx()
                val liveBadgeTop = cellTop + 7.dp.toPx()
                val showLiveBadge = current &&
                    cellWidth >= liveBadgeWidth + 16.dp.toPx() &&
                    cellHeight >= liveBadgeHeight + 14.dp.toPx()
                if (showLiveBadge) {
                        drawRoundRect(
                            color = if (isPlaying) ActiveGreen else Color(0xFFE82034),
                            topLeft = Offset(liveBadgeLeft, liveBadgeTop),
                            size = Size(liveBadgeWidth, liveBadgeHeight),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                        )
                        if (isPlaying) {
                            val iconLeft = liveBadgeLeft + 7.dp.toPx()
                            val iconCenterY = liveBadgeTop + liveBadgeHeight / 2f
                            reusablePlayPath.rewind()
                            reusablePlayPath.moveTo(iconLeft, iconCenterY - 4.dp.toPx())
                            reusablePlayPath.lineTo(iconLeft, iconCenterY + 4.dp.toPx())
                            reusablePlayPath.lineTo(iconLeft + 7.dp.toPx(), iconCenterY)
                            reusablePlayPath.close()
                            nativeCanvas.drawPath(reusablePlayPath, playPaint)
                        }
                        drawAlignedText(
                            text = "LIVE",
                            x = if (isPlaying) liveBadgeLeft + 29.dp.toPx() else liveBadgeLeft + liveBadgeWidth / 2f,
                            centerY = liveBadgeTop + liveBadgeHeight / 2f,
                            maxWidth = if (isPlaying) liveBadgeWidth - 20.dp.toPx() else liveBadgeWidth - 6.dp.toPx(),
                            paint = titlePaint.withText(
                                size8Px,
                                if (isPlaying) android.graphics.Color.rgb(3, 24, 18) else android.graphics.Color.WHITE,
                                bold = true,
                            ),
                            align = Paint.Align.CENTER,
                        )
                }
                if (cellWidth >= 32.dp.toPx()) {
                    nativeCanvas.save()
                    nativeCanvas.clipRect(cellLeft, cellTop, cellLeft + cellWidth, cellTop + cellHeight)
                    val textPaddingPx = min(12.dp.toPx(), cellWidth * 0.12f)
                    val textRight = min(cellLeft + cellWidth - textPaddingPx, x + width - 16.dp.toPx())
                    val textLeftLimit = if (showLiveBadge) {
                        liveBadgeLeft + liveBadgeWidth + 10.dp.toPx()
                    } else {
                        cellLeft + textPaddingPx
                    }
                    val maxTextWidth = (textRight - textLeftLimit).coerceAtLeast(0f)
                    if (maxTextWidth >= 16.dp.toPx()) {
                        val paint = if (focused) darkTextPaint else titlePaint
                        val textClusterCenterY = cellTop + cellHeight / 2f
                        val titleCenterY = textClusterCenterY - 11.dp.toPx()
                        val timeCenterY = textClusterCenterY + 13.dp.toPx()
                        drawAlignedText(
                            text = program.title,
                            x = textRight,
                            centerY = titleCenterY,
                            maxWidth = maxTextWidth,
                            paint = paint.withText(size14Px, if (focused) android.graphics.Color.rgb(7, 17, 20) else android.graphics.Color.WHITE, bold = true),
                        )
                        drawAlignedText(
                            text = program.timeRange(),
                            x = textRight,
                            centerY = timeCenterY,
                            maxWidth = maxTextWidth,
                            paint = metaPaint.withText(size11Px, if (focused) android.graphics.Color.rgb(50, 58, 62) else android.graphics.Color.rgb(170, 174, 184)),
                        )
                    }
                    nativeCanvas.restore()
                }
                }
                rowTop += rowHeightPx
            }
        }

        if (nowSeconds in startSeconds..endSeconds) {
            val nowX = channelWidthPx + ((nowSeconds - startSeconds) / HALF_HOUR_SECONDS.toFloat()) * slotWidthPx - scrollPx
            if (nowX in channelWidthPx..size.width) {
                val bubbleWidthPx = 50.dp.toPx()
                val bubbleHeightPx = 18.dp.toPx()
                val bubbleTop = (headerHeightPx - bubbleHeightPx) / 2f
                val bubbleBottom = bubbleTop + bubbleHeightPx

                drawRect(
                    color = Color(0x80E21D2F),
                    topLeft = Offset(nowX - 1.dp.toPx(), bubbleBottom),
                    size = Size(2.dp.toPx(), size.height - bubbleBottom),
                )
                drawRoundRect(
                    color = Color(0xD9E21D2F),
                    topLeft = Offset(nowX - bubbleWidthPx / 2f, bubbleTop),
                    size = Size(bubbleWidthPx, bubbleHeightPx),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(5.dp.toPx(), 5.dp.toPx()),
                )
                drawAlignedText(
                    text = TimeFormatter.format(Instant.ofEpochSecond(nowSeconds).atZone(ZoneId.systemDefault())),
                    x = nowX,
                    centerY = headerHeightPx / 2f,
                    maxWidth = 44.dp.toPx(),
                    paint = titlePaint.withText(size11Px, android.graphics.Color.WHITE, bold = true),
                    align = Paint.Align.CENTER,
                )
            }
        }
    }
}

private fun Paint.ellipsizeToWidth(text: String, maxWidth: Float): String {
    if (maxWidth <= 0f || measureText(text) <= maxWidth) return text
    val ellipsis = "..."
    val ellipsisWidth = measureText(ellipsis)
    val targetWidth = maxWidth - ellipsisWidth
    if (targetWidth <= 0f) return ellipsis
    val count = breakText(text, true, targetWidth, null)
    return if (count <= 0) ellipsis else text.substring(0, count) + ellipsis
}

@Composable
private fun TimeHeader(
    startSeconds: Long,
    slotWidth: Dp,
    channelWidth: Dp,
    timelineWidth: Dp,
    totalSlots: Int,
    modifier: Modifier,
    scrollOffsetPx: () -> Float,
    visibleStartSeconds: Long,
    visibleEndSeconds: Long,
    nowSeconds: Long,
    showLiveLine: Boolean,
    nowOffsetPx: Float,
) {
    val density = LocalDensity.current
    Row(
        modifier.background(
            Brush.verticalGradient(
                listOf(
                    Color(0xFF081723),
                    Color(0xB8081723),
                    Color(0x22081723),
                    Color.Transparent,
                )
            )
        ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .width(channelWidth)
                .fillMaxHeight()
                .padding(horizontal = 3.dp, vertical = 3.dp)
        )
        Box(Modifier.fillMaxHeight().fillMaxWidth().clipToBounds()) {
            Box(
                Modifier
                    .width(timelineWidth)
                    .fillMaxHeight()
                    .graphicsLayer { translationX = -scrollOffsetPx() }
            ) {
                val firstSlotIndex = max(0, ((visibleStartSeconds - startSeconds) / 1800L).toInt() - 1)
                val lastSlotIndex = min(totalSlots - 1, ((visibleEndSeconds - startSeconds) / 1800L).toInt() + 1)
                if (firstSlotIndex <= lastSlotIndex) {
                    for (index in firstSlotIndex..lastSlotIndex) {
                        val slotStart = startSeconds + index * 1800L
                        val xOffset = durationWidth(slotStart - startSeconds, slotWidth)
                        Box(
                            Modifier
                                .offset(x = xOffset)
                                .width(slotWidth)
                                .fillMaxHeight()
                                .padding(horizontal = 3.dp, vertical = 3.dp)
                                .background(Color(0xE817181B), RoundedCornerShape(7.dp)),
                            contentAlignment = Alignment.CenterStart,
                        ) {
                            Text(
                                text = HeaderTimeFormatter.format(Instant.ofEpochSecond(slotStart).atZone(ZoneId.systemDefault())),
                                color = Color(0xFFC8D1D6),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(start = 12.dp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
            if (showLiveLine) {
                Box(
                    Modifier
                        .offset {
                            IntOffset(
                                x = (nowOffsetPx - scrollOffsetPx() - with(density) { 25.dp.toPx() }).roundToInt(),
                                y = 0,
                            )
                        }
                        .width(50.dp)
                        .height(18.dp)
                        .align(Alignment.BottomStart)
                        .background(Color(0xD9E21D2F), RoundedCornerShape(5.dp))
                        .padding(horizontal = 4.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = TimeFormatter.format(Instant.ofEpochSecond(nowSeconds).atZone(ZoneId.systemDefault())),
                        color = Color.White,
                        fontSize = 11.sp,
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
private fun LiveNowLine(
    channelWidth: Dp,
    nowOffsetPx: Float,
    timelineWidth: Dp,
    scrollOffsetPx: () -> Float,
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
                    .graphicsLayer { translationX = -scrollOffsetPx() }
            ) {
                Box(
                    Modifier
                        .offset { IntOffset(nowOffsetPx.roundToInt(), 0) }
                        .width(2.dp)
                        .fillMaxHeight()
                        .background(Color(0x80E21D2F))
                )
            }
        }
    }
}

@Composable
private fun GuideRow(
    channel: TvChannel,
    programs: StableProgramList,
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
    nowSeconds: Long,
    rowHeight: Dp,
    showArtwork: Boolean,
    slotWidthPx: Float,
    scrollOffsetPx: () -> Float,
) {
    val visiblePrograms = remember(programs, timelineStartSeconds, timelineEndSeconds, slotWidth) {
        programs.value.mapNotNull { program ->
            val clippedStartSeconds = max(program.startSeconds, timelineStartSeconds)
            val clippedEndSeconds = min(program.endSeconds, timelineEndSeconds)
            val displayDurationSeconds = clippedEndSeconds - clippedStartSeconds
            if (displayDurationSeconds <= 0L) return@mapNotNull null
            VisibleProgram(
                program = program,
                key = program.programKey(),
                timeRange = program.timeRange(),
                visibleStartSeconds = clippedStartSeconds,
                width = durationWidth(displayDurationSeconds, slotWidth),
            )
        }
    }

    val rowSelected = isSelectedChannel

    Row(
        Modifier
            .fillMaxWidth()
            .height(rowHeight)
            .background(Color(0xFF101114))
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
                    .graphicsLayer { translationX = -scrollOffsetPx() }
            ) {
                visiblePrograms.forEach { visibleProgram ->
                    val program = visibleProgram.program
                    key(visibleProgram.key) {
                        val width = visibleProgram.width
                        val programOffsetPx =
                            (((visibleProgram.visibleStartSeconds - timelineStartSeconds) / 1800f) * slotWidthPx)
                                .roundToInt()
                        ProgramCell(
                            program = program,
                            timeRange = visibleProgram.timeRange,
                            width = width,
                            isCurrent = isCurrent(program, nowSeconds),
                            isSelectedChannel = rowSelected,
                            isFocusedProgram = selectedProgramKey == visibleProgram.key,
                            isPlayingChannel = isPlayingChannel,
                            showImage = showArtwork && width >= 110.dp && !program.imageUrl.isNullOrBlank(),
                            offsetXPx = programOffsetPx,
                        )
                    }
                }
                if (programs.value.isEmpty()) {
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
    val cellShape = RoundedCornerShape(7.dp)
    Box(
        modifier = Modifier
            .width(width)
            .fillMaxHeight()
            .background(Color(0xFF101114))
            .padding(horizontal = 3.dp, vertical = 3.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    when {
                        focused -> Color(0xFF0FCBD0)
                        active -> Color(0xFF043626)
                        selected -> Color(0xFF102B30)
                        else -> Color(0xFF17181B)
                    },
                    cellShape,
                )
                .clip(cellShape)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xFF26272C)),
                contentAlignment = Alignment.Center,
            ) {
                if (channel.logoUrl.isNotBlank()) {
                    AsyncImage(
                        model = rememberSizedImageRequest(channel.logoUrl, width = 72, height = 72),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
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
private fun LiveDot() {
    Box(
        Modifier
            .size(10.dp)
            .background(Color(0xFFFF3648), CircleShape)
    )
}

@Composable
private fun ProgramCell(
    program: TvProgram,
    timeRange: String,
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
                    text = timeRange,
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
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    onPlayLive: () -> Unit,
    onClose: () -> Unit,
) {
    val closeFocusRequester = remember { FocusRequester() }
    val playFocusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val canPlayLive = !channel?.streamUrl.isNullOrBlank()
    val channelDisplayName = channel?.let { selectedStreamSource(it).displayNameOrNull() }
        ?: channel?.name.orEmpty()
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
                text = channelDisplayName,
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
    primaryMultiPlayerView: StablePlayerView,
    channel: TvChannel?,
    program: TvProgram?,
    guideChannels: List<TvChannel>,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    streamSources: (TvChannel) -> List<TvStreamSource>,
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    onSelectStreamSource: (TvChannel, TvStreamSource) -> Unit,
    multiChannels: List<TvChannel>,
    multiFocusedIndex: Int,
    multiPlayerActive: Boolean,
    maxMultiPlayerChannels: Int,
    onNextChannel: () -> Unit,
    onPreviousChannel: () -> Unit,
    onChannelNumberEntered: (String) -> Boolean,
    hasChannelNumberPrefix: (String) -> Boolean,
    onPrimaryMultiAudioFocusChanged: (Boolean) -> Unit,
    onAddMultiChannel: (TvChannel) -> Unit,
    onOpenFocusedSingle: (TvChannel) -> Unit,
    onRemoveFocusedMultiChannel: (Int) -> Unit,
    onClose: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val controlsVisibleState = remember { mutableStateOf(true) }
    var controlsVisible by controlsVisibleState
    val lastInteractionState = remember { mutableIntStateOf(0) }
    var lastInteraction by lastInteractionState
    var enteredChannelNumber by remember { mutableStateOf("") }
    var enteredChannelNumberNonce by remember { mutableIntStateOf(0) }
    var addMenuVisible by remember { mutableStateOf(false) }
    var addMenuMounted by remember { mutableStateOf(false) }
    var sourceMenuVisible by remember { mutableStateOf(false) }
    var sourceMenuMounted by remember { mutableStateOf(false) }
    val multiControlFocusState = remember { mutableStateOf(MultiControlFocus.None) }
    var multiControlFocus by multiControlFocusState
    var controlsMetadataVisible by remember { mutableStateOf(false) }
    val multiFocusedIndexState = remember { mutableIntStateOf(multiFocusedIndex) }
    val multiAudioIndexState = remember { mutableIntStateOf(multiFocusedIndex) }
    var pendingMultiFocusChannelId by remember { mutableStateOf<String?>(null) }
    val addableChannels = remember(guideChannels, multiChannels, maxMultiPlayerChannels) {
        if (multiChannels.size >= maxMultiPlayerChannels) {
            emptyList()
        } else {
            guideChannels.filter { channel ->
                channel.hasPlayableStream() &&
                    multiChannels.none { it.id == channel.id }
            }
        }
    }
    val sourceOptions = remember(channel) {
        channel?.let(streamSources).orEmpty()
    }
    val selectedSource = channel?.let(selectedStreamSource)
    val hasAlternateSources = sourceOptions.size > 1

    fun openAddMenu() {
        if (multiChannels.size >= maxMultiPlayerChannels) return
        controlsVisible = false
        multiControlFocus = MultiControlFocus.None
        addMenuMounted = true
        addMenuVisible = true
    }

    fun openSourceMenu() {
        if (!hasAlternateSources) return
        controlsVisible = false
        multiControlFocus = MultiControlFocus.None
        sourceMenuMounted = true
        sourceMenuVisible = true
    }

    fun closeAddMenu(showControls: Boolean = false) {
        addMenuVisible = false
        controlsVisible = showControls
        multiControlFocus = MultiControlFocus.None
        lastInteraction += 1
        focusRequester.requestFocus()
    }

    fun closeSourceMenu(showControls: Boolean = false) {
        sourceMenuVisible = false
        controlsVisible = showControls
        multiControlFocus = MultiControlFocus.None
        lastInteraction += 1
        focusRequester.requestFocus()
    }

    BackHandler {
        when {
            sourceMenuVisible -> {
                closeSourceMenu()
            }
            addMenuVisible -> {
                closeAddMenu()
            }
            else -> onClose()
        }
    }
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
    LaunchedEffect(multiPlayerActive, multiChannels.size) {
        multiFocusedIndexState.intValue = multiFocusedIndexState.intValue
            .coerceIn(0, multiChannels.lastIndex.coerceAtLeast(0))
        multiAudioIndexState.intValue = multiAudioIndexState.intValue
            .coerceIn(0, multiChannels.lastIndex.coerceAtLeast(0))
    }
    LaunchedEffect(multiChannels, pendingMultiFocusChannelId) {
        val pendingChannelId = pendingMultiFocusChannelId ?: return@LaunchedEffect
        val pendingIndex = multiChannels.indexOfFirst { it.id == pendingChannelId }
        if (pendingIndex >= 0) {
            multiFocusedIndexState.intValue = pendingIndex
            pendingMultiFocusChannelId = null
        }
    }
    LaunchedEffect(multiPlayerActive, addMenuVisible) {
        if (multiPlayerActive && !addMenuVisible) {
            delay(40)
            focusRequester.requestFocus()
        }
    }
    LaunchedEffect(multiPlayerActive) {
        if (!multiPlayerActive) return@LaunchedEffect
        snapshotFlow { multiFocusedIndexState.intValue }
            .distinctUntilChanged()
            .collectLatest { focusedIndex ->
                delay(1_000)
                multiAudioIndexState.intValue = focusedIndex
                onPrimaryMultiAudioFocusChanged(focusedIndex == 0)
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
    LaunchedEffect(Unit) {
        snapshotFlow { controlsVisibleState.value to lastInteractionState.intValue }
            .distinctUntilChanged()
            .collectLatest { (visible, _) ->
                if (!visible) return@collectLatest
                delay(5_000)
                controlsVisibleState.value = false
            }
    }
    LaunchedEffect(multiPlayerActive, channel?.id, program?.channelId, program?.startSeconds) {
        controlsMetadataVisible = false
        if (multiPlayerActive) return@LaunchedEffect
        snapshotFlow { controlsVisibleState.value }
            .distinctUntilChanged()
            .collectLatest { visible ->
                controlsMetadataVisible = false
                if (!visible) return@collectLatest
                delay(260)
                controlsMetadataVisible = controlsVisibleState.value && !multiPlayerActive
            }
    }

    fun handleBack() {
        when {
            sourceMenuVisible -> {
                closeSourceMenu()
            }
            addMenuVisible -> {
                closeAddMenu()
            }
            else -> onClose()
        }
    }

    fun currentMultiFocusedIndex(): Int =
        multiFocusedIndexState.intValue.coerceIn(0, multiChannels.lastIndex.coerceAtLeast(0))

    fun handleExpandedKey(keyCode: Int): Boolean {
        if (sourceMenuVisible) {
            return if (keyCode == AndroidKeyEvent.KEYCODE_BACK) {
                handleBack()
                true
            } else {
                false
            }
        }

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
                controlsVisible = false
                multiControlFocus = MultiControlFocus.None
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
                lastInteraction += 1
                if (multiPlayerActive) {
                    val focusedIndex = currentMultiFocusedIndex()
                    controlsVisible = false
                    multiControlFocus = MultiControlFocus.None
                    multiFocusedIndexState.intValue = (focusedIndex - multiPlayerColumnCount(multiChannels.size))
                        .coerceIn(0, multiChannels.lastIndex)
                } else {
                    controlsVisible = true
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
                lastInteraction += 1
                if (multiPlayerActive) {
                    val focusedIndex = currentMultiFocusedIndex()
                    controlsVisible = false
                    val nextTileIndex = focusedIndex + multiPlayerColumnCount(multiChannels.size)
                    multiControlFocus = MultiControlFocus.None
                    if (nextTileIndex <= multiChannels.lastIndex) {
                        multiFocusedIndexState.intValue = nextTileIndex
                    }
                } else {
                    controlsVisible = true
                    multiControlFocus = MultiControlFocus.None
                    onNextChannel()
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_LEFT && multiPlayerActive -> {
                lastInteraction += 1
                if (controlsVisible && multiControlFocus != MultiControlFocus.None) {
                    controlsVisible = true
                    multiControlFocus = previousMultiControlFocus(
                        current = multiControlFocus,
                        canAdd = multiChannels.size < maxMultiPlayerChannels,
                        canRemove = multiChannels.size > 1,
                    )
                } else {
                    controlsVisible = false
                    multiControlFocus = MultiControlFocus.None
                    multiFocusedIndexState.intValue = (currentMultiFocusedIndex() - 1).coerceAtLeast(0)
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_LEFT && !multiPlayerActive -> {
                lastInteraction += 1
                if (hasAlternateSources) {
                    openSourceMenu()
                } else {
                    controlsVisible = true
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                lastInteraction += 1
                if (multiPlayerActive) {
                    val focusedIndex = currentMultiFocusedIndex()
                    if (controlsVisible && multiControlFocus != MultiControlFocus.None) {
                        controlsVisible = true
                        multiControlFocus = nextMultiControlFocus(
                            current = multiControlFocus,
                            canAdd = multiChannels.size < maxMultiPlayerChannels,
                            canRemove = multiChannels.size > 1,
                        )
                    } else if (focusedIndex < multiChannels.lastIndex) {
                        controlsVisible = false
                        multiControlFocus = MultiControlFocus.None
                        multiFocusedIndexState.intValue = focusedIndex + 1
                    } else if (multiChannels.size < maxMultiPlayerChannels) {
                        openAddMenu()
                    }
                } else {
                    controlsVisible = true
                    openAddMenu()
                }
                return true
            }
            keyCode == AndroidKeyEvent.KEYCODE_DPAD_CENTER ||
                keyCode == AndroidKeyEvent.KEYCODE_ENTER ||
                keyCode == AndroidKeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (enteredChannelNumber.isNotBlank()) {
                    val number = enteredChannelNumber
                    controlsVisible = false
                    multiControlFocus = MultiControlFocus.None
                    enteredChannelNumber = ""
                    enteredChannelNumberNonce += 1
                    onChannelNumberEntered(number)
                    return true
                }
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
                            MultiControlFocus.Add -> openAddMenu()
                            MultiControlFocus.OpenSingle -> multiChannels
                                .getOrNull(currentMultiFocusedIndex())
                                ?.let(onOpenFocusedSingle)
                            MultiControlFocus.Remove -> {
                                onRemoveFocusedMultiChannel(currentMultiFocusedIndex())
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

    val currentExpandedKeyHandler by rememberUpdatedState<(AndroidKeyEvent) -> Boolean> { event ->
        event.action == AndroidKeyEvent.ACTION_DOWN && handleExpandedKey(event.keyCode)
    }

    DisposableEffect(Unit) {
        TvKeyEventBridge.setHandler { event ->
            currentExpandedKeyHandler(event)
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
                primaryPlayerView = primaryMultiPlayerView,
                channels = multiChannels,
                focusedIndexState = multiFocusedIndexState,
                audioIndexState = multiAudioIndexState,
                programsByChannel = programsByChannel,
                nowSeconds = nowSeconds,
                streamUrl = streamUrl,
                selectedStreamSource = selectedStreamSource,
                modifier = Modifier.fillMaxSize(),
            )
            val columnCount = multiPlayerColumnCount(multiChannels.size)
            val rowCount = ((multiChannels.size + columnCount - 1) / columnCount).coerceAtLeast(1)
            MultiPlayerNativeOverlayLayer(
                visibleState = controlsVisibleState,
                channels = multiChannels,
                focusedIndexState = multiFocusedIndexState,
                columnCount = columnCount,
                rowCount = rowCount,
                canAddChannel = multiChannels.size < maxMultiPlayerChannels,
                canRemoveChannel = multiChannels.size > 1,
                focusedActionState = multiControlFocusState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(12.dp),
            )
        } else {
            PlayerSurface(
                player = player,
                playerView = primaryPlayerView,
                useController = false,
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT,
                modifier = Modifier.fillMaxSize(),
                keepScreenOn = true,
            )
        }
        if (!multiPlayerActive && controlsVisible) {
            ExpandedPlayerControls(
                player = player,
                channel = channel,
                program = program,
                sourceName = selectedSource.displayNameOrNull(),
                showMetadataPanel = controlsMetadataVisible,
                onInteraction = {
                    controlsVisible = true
                    lastInteraction += 1
                },
            )
            if (!addMenuMounted && multiChannels.size < maxMultiPlayerChannels) {
                AddChannelMenuPeek(
                    modifier = Modifier.align(Alignment.CenterEnd),
                )
            }
            if (!sourceMenuMounted && hasAlternateSources) {
                SourceMenuPeek(
                    modifier = Modifier.align(Alignment.CenterStart),
                )
            }
        }
        if (enteredChannelNumber.isNotBlank()) {
            ChannelNumberOverlay(
                number = enteredChannelNumber,
                modifier = Modifier.align(Alignment.TopEnd),
            )
        }
        if (addMenuMounted) {
            AddChannelMenu(
                channels = addableChannels,
                onAddChannel = { selectedChannel ->
                    pendingMultiFocusChannelId = selectedChannel.id
                    onAddMultiChannel(selectedChannel)
                    closeAddMenu()
                },
                onClose = {
                    closeAddMenu()
                },
                onClosed = {
                    addMenuMounted = false
                },
                visible = addMenuVisible,
                modifier = Modifier.align(Alignment.CenterEnd),
            )
        }
        if (sourceMenuMounted && channel != null) {
            SourceSelectionMenu(
                channel = channel,
                sources = sourceOptions,
                selectedSourceId = selectedSource?.id,
                onSelectSource = { source ->
                    onSelectStreamSource(channel, source)
                    closeSourceMenu()
                },
                onClose = {
                    closeSourceMenu()
                },
                onClosed = {
                    sourceMenuMounted = false
                },
                visible = sourceMenuVisible,
                modifier = Modifier.align(Alignment.CenterStart),
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

@Composable
private fun MultiPlayerNativeOverlayLayer(
    visibleState: State<Boolean>,
    channels: List<TvChannel>,
    focusedIndexState: State<Int>,
    columnCount: Int,
    rowCount: Int,
    canAddChannel: Boolean,
    canRemoveChannel: Boolean,
    focusedActionState: State<MultiControlFocus>,
    modifier: Modifier = Modifier,
) {
    val overlayViewState = remember { mutableStateOf<MultiPlayerOverlayView?>(null) }
    val actions = remember(canAddChannel, canRemoveChannel) {
        availableMultiControlActions(canAddChannel, canRemoveChannel)
    }
    AndroidView(
        factory = { context ->
            MultiPlayerOverlayView(context).also { overlayViewState.value = it }
        },
        update = { view ->
            view.updateConfig(
                channelCount = channels.size,
                columnCount = columnCount,
                rowCount = rowCount,
                actions = actions,
            )
        },
        modifier = modifier,
    )
    LaunchedEffect(focusedIndexState) {
        snapshotFlow { focusedIndexState.value }
            .distinctUntilChanged()
            .collect { focusedIndex ->
                overlayViewState.value?.updateFocusedIndex(focusedIndex)
            }
    }
    LaunchedEffect(visibleState, focusedActionState) {
        snapshotFlow { visibleState.value to focusedActionState.value }
            .distinctUntilChanged()
            .collect { (visible, focusedAction) ->
                overlayViewState.value?.updateControls(
                    controlsVisible = visible,
                    focusedAction = focusedAction,
                )
            }
    }
}

private class MultiPlayerOverlayView(context: Context) : View(context) {
    private val density = resources.displayMetrics.density
    private val focusRect = RectF()
    private val buttonRect = RectF()
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.dpPx()
        color = 0xCC16D7D7.toInt()
    }
    private val panelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = 0xDD08141A.toInt()
    }
    private val buttonPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = 2.4f.dpPx()
    }

    private var channelCount = 0
    private var focusedIndex = 0
    private var columnCount = 1
    private var rowCount = 1
    private var controlsVisible = false
    private var actions: List<MultiControlFocus> = emptyList()
    private var focusedAction = MultiControlFocus.None

    init {
        setWillNotDraw(false)
        isFocusable = false
        isFocusableInTouchMode = false
    }

    fun updateConfig(
        channelCount: Int,
        columnCount: Int,
        rowCount: Int,
        actions: List<MultiControlFocus>,
    ) {
        val changed = this.channelCount != channelCount ||
            this.columnCount != columnCount ||
            this.rowCount != rowCount ||
            this.actions != actions
        if (!changed) return
        this.channelCount = channelCount
        this.columnCount = columnCount.coerceAtLeast(1)
        this.rowCount = rowCount.coerceAtLeast(1)
        this.actions = actions
        invalidate()
    }

    fun updateFocusedIndex(focusedIndex: Int) {
        if (this.focusedIndex == focusedIndex) return
        this.focusedIndex = focusedIndex
        invalidate()
    }

    fun updateControls(
        controlsVisible: Boolean,
        focusedAction: MultiControlFocus,
    ) {
        if (this.controlsVisible == controlsVisible && this.focusedAction == focusedAction) return
        this.controlsVisible = controlsVisible
        this.focusedAction = focusedAction
        invalidate()
    }

    override fun onDraw(canvas: android.graphics.Canvas) {
        super.onDraw(canvas)
        if (channelCount <= 0 || focusedIndex !in 0 until channelCount) return

        val cellWidth = width.toFloat() / columnCount
        val cellHeight = height.toFloat() / rowCount
        val column = focusedIndex % columnCount
        val row = focusedIndex / columnCount
        val inset = 6.dpPx()
        focusRect.set(
            column * cellWidth + inset,
            row * cellHeight + inset,
            (column + 1) * cellWidth - inset,
            (row + 1) * cellHeight - inset,
        )
        canvas.drawRoundRect(focusRect, 12.dpPx(), 12.dpPx(), strokePaint)
        if (controlsVisible && actions.isNotEmpty()) {
            drawControls(canvas)
        }
    }

    private fun drawControls(canvas: android.graphics.Canvas) {
        val buttonSize = 44.dpPx()
        val gap = 4.dpPx()
        val padding = 5.dpPx()
        val panelWidth = actions.size * buttonSize + (actions.size - 1).coerceAtLeast(0) * gap + padding * 2
        val panelHeight = buttonSize + padding * 2
        val panelRight = focusRect.right - 20.dpPx()
        val panelTop = focusRect.top + 20.dpPx()
        val panelLeft = panelRight - panelWidth
        buttonRect.set(panelLeft, panelTop, panelRight, panelTop + panelHeight)
        canvas.drawRoundRect(buttonRect, 16.dpPx(), 16.dpPx(), panelPaint)

        var x = panelLeft + padding
        val y = panelTop + padding
        actions.forEach { action ->
            val focused = focusedAction == action
            buttonPaint.color = if (focused) 0xFF17D7D7.toInt() else 0x6620242A
            buttonRect.set(x, y, x + buttonSize, y + buttonSize)
            canvas.drawRoundRect(buttonRect, 9.dpPx(), 9.dpPx(), buttonPaint)
            iconPaint.color = if (focused) 0xFF031012.toInt() else android.graphics.Color.WHITE
            drawActionIcon(canvas, action, buttonRect)
            x += buttonSize + gap
        }
    }

    private fun drawActionIcon(
        canvas: android.graphics.Canvas,
        action: MultiControlFocus,
        rect: RectF,
    ) {
        val cx = rect.centerX()
        val cy = rect.centerY()
        when (action) {
            MultiControlFocus.Add -> {
                val r = 10.dpPx()
                canvas.drawLine(cx - r, cy, cx + r, cy, iconPaint)
                canvas.drawLine(cx, cy - r, cx, cy + r, iconPaint)
            }
            MultiControlFocus.OpenSingle -> {
                val left = rect.left + 13.dpPx()
                val top = rect.top + 13.dpPx()
                val right = rect.right - 13.dpPx()
                val bottom = rect.bottom - 13.dpPx()
                val len = 7.dpPx()
                canvas.drawLine(left, top + len, left, top, iconPaint)
                canvas.drawLine(left, top, left + len, top, iconPaint)
                canvas.drawLine(right - len, top, right, top, iconPaint)
                canvas.drawLine(right, top, right, top + len, iconPaint)
                canvas.drawLine(left, bottom - len, left, bottom, iconPaint)
                canvas.drawLine(left, bottom, left + len, bottom, iconPaint)
                canvas.drawLine(right - len, bottom, right, bottom, iconPaint)
                canvas.drawLine(right, bottom - len, right, bottom, iconPaint)
            }
            MultiControlFocus.Remove -> {
                val r = 9.dpPx()
                canvas.drawLine(cx - r, cy - r, cx + r, cy + r, iconPaint)
                canvas.drawLine(cx + r, cy - r, cx - r, cy + r, iconPaint)
            }
            MultiControlFocus.None -> Unit
        }
    }

    private fun Int.dpPx(): Float = this * density
    private fun Float.dpPx(): Float = this * density
}

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
            .background(
                Brush.horizontalGradient(
                    colorStops = arrayOf(
                        0.00f to Color(0xEE08141A),
                        0.76f to Color(0xDC08141A),
                        1.00f to Color(0xB808141A),
                    )
                ),
                RoundedCornerShape(18.dp),
            )
            .padding(horizontal = 22.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .background(PrimaryCyan, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = null,
                    tint = Color(0xFF031012),
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "Channel",
                    color = Color(0xFF9FB1B8),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
                Text(
                    text = number,
                    color = Color.White,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun MultiPlayerGrid(
    primaryPlayer: StablePlayer,
    primaryPlayerView: StablePlayerView,
    channels: List<TvChannel>,
    focusedIndexState: State<Int>,
    audioIndexState: State<Int>,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF08141A),
                        Color(0xFF040A0E),
                    )
                )
            )
            .padding(12.dp)
    ) {
        val columnCount = multiPlayerColumnCount(channels.size)
        val rowCount = ((channels.size + columnCount - 1) / columnCount).coerceAtLeast(1)
        MultiPlayerVideoGrid(
            primaryPlayer = primaryPlayer,
            primaryPlayerView = primaryPlayerView,
            channels = channels,
            focusedIndexState = focusedIndexState,
            audioIndexState = audioIndexState,
            programsByChannel = programsByChannel,
            nowSeconds = nowSeconds,
            streamUrl = streamUrl,
            selectedStreamSource = selectedStreamSource,
            columnCount = columnCount,
            rowCount = rowCount,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

private fun multiPlayerColumnCount(channelCount: Int): Int =
    if (channelCount > 4) 3 else 2

@Composable
private fun MultiPlayerVideoGrid(
    primaryPlayer: StablePlayer,
    primaryPlayerView: StablePlayerView,
    channels: List<TvChannel>,
    focusedIndexState: State<Int>,
    audioIndexState: State<Int>,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    columnCount: Int,
    rowCount: Int,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        repeat(rowCount) { row ->
            Row(Modifier.weight(1f).fillMaxWidth()) {
                repeat(columnCount) { column ->
                    val index = row * columnCount + column
                    key(channels.getOrNull(index)?.id ?: "empty-$index") {
                        MultiPlayerVideoCell(
                            index = index,
                            channels = channels,
                            focusedIndexState = focusedIndexState,
                            audioIndexState = audioIndexState,
                            primaryPlayer = primaryPlayer,
                            primaryPlayerView = primaryPlayerView,
                            programsByChannel = programsByChannel,
                            nowSeconds = nowSeconds,
                            streamUrl = streamUrl,
                            selectedStreamSource = selectedStreamSource,
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MultiPlayerVideoCell(
    index: Int,
    channels: List<TvChannel>,
    focusedIndexState: State<Int>,
    audioIndexState: State<Int>,
    primaryPlayer: StablePlayer,
    primaryPlayerView: StablePlayerView,
    programsByChannel: Map<String, List<TvProgram>>,
    nowSeconds: Long,
    streamUrl: (TvChannel) -> String,
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    modifier: Modifier = Modifier,
) {
    val channel = channels.getOrNull(index)
    if (channel == null) {
        Box(
            modifier
                .padding(6.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0x8A20242A), RoundedCornerShape(12.dp))
        )
        return
    }
    MultiPlayerTile(
        channel = channel,
        program = currentProgramForNow(programsByChannel[channel.id].orEmpty(), nowSeconds),
        sourceName = selectedStreamSource(channel).displayNameOrNull(),
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
                index = index,
                focusedIndexState = focusedIndexState,
                audioIndexState = audioIndexState,
                streamUrl = streamUrl,
                selectedStreamSource = selectedStreamSource,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
private fun MultiPlayerTile(
    channel: TvChannel,
    program: TvProgram?,
    sourceName: String?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val channelDisplayName = sourceName ?: channel.name
    val tileShape = RoundedCornerShape(12.dp)
    Box(
        modifier
            .padding(6.dp)
            .clip(tileShape)
            .background(Color.Black, tileShape)
    ) {
        content()
        Box(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .height(92.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Transparent,
                            Color(0x9908141A),
                            Color(0xE608141A),
                        )
                    )
                )
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (channel.logoUrl.isNotBlank()) {
                    AsyncImage(
                        model = rememberSizedImageRequest(channel.logoUrl, width = 96, height = 96),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(6.dp)),
                    )
                    Spacer(Modifier.width(10.dp))
                }
                Column {
                    Text(
                        text = listOf(channel.number, channelDisplayName).filter { it.isNotBlank() }.joinToString("  "),
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
    }
}

@Composable
private fun ExtraChannelPlayerSurface(
    channel: TvChannel,
    index: Int,
    focusedIndexState: State<Int>,
    audioIndexState: State<Int>,
    streamUrl: (TvChannel) -> String,
    selectedStreamSource: (TvChannel) -> TvStreamSource?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val trackSelector = remember(channel.id) {
        DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setMaxVideoSize(MULTI_PLAYER_MAX_WIDTH, MULTI_PLAYER_MAX_HEIGHT)
                    .setMaxVideoBitrate(MULTI_PLAYER_MAX_VIDEO_BITRATE)
                    .setForceLowestBitrate(true)
                    .setExceedVideoConstraintsIfNecessary(true)
                    .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
            )
        }
    }
    val player = remember(channel.id) {
        val renderersFactory = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
        ExoPlayer.Builder(context)
            .setRenderersFactory(renderersFactory)
            .setMediaSourceFactory(DefaultMediaSourceFactory(SharedHttpDataSourceFactory))
            .setTrackSelector(trackSelector)
            .setLoadControl(createMultiPlayerLoadControl())
            .build()
            .apply {
                playWhenReady = true
                volume = 0f
            }
    }
    val playerView = remember(player) {
        (LayoutInflater.from(context).inflate(R.layout.player_view_texture, null) as PlayerView).apply {
            (videoSurfaceView as? TextureView)?.isOpaque = true
            this.player = player
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            isFocusable = false
            isFocusableInTouchMode = false
            setKeepContentOnPlayerReset(true)
            setEnableComposeSurfaceSyncWorkaround(false)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
    }

    LaunchedEffect(channel.id) {
        val streamSource = selectedStreamSource(channel)
        val url = streamSource?.url ?: streamUrl(channel)
        if (url.isBlank()) return@LaunchedEffect
        player.setMediaItem(liveMediaItem(url, streamSource?.mimeType))
        player.prepare()
        player.play()
    }
    LaunchedEffect(index, focusedIndexState) {
        snapshotFlow { focusedIndexState.value == index }
            .distinctUntilChanged()
            .collect { focused ->
                if (!focused) player.volume = 0f
            }
    }
    LaunchedEffect(index, audioIndexState) {
        snapshotFlow { audioIndexState.value == index }
            .distinctUntilChanged()
            .collect { hasAudio ->
                player.volume = if (hasAudio) 1f else 0f
                trackSelector.setParameters(
                    trackSelector.buildUponParameters()
                        .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, !hasAudio)
                )
            }
    }
    DisposableEffect(player) {
        onDispose {
            playerView.player = null
            player.release()
        }
    }

    val loading = rememberPlayerLoadingState(player)
    Box(modifier) {
        AndroidView(
            factory = { playerView },
            update = {
                if (it.player !== player) it.player = player
                it.useController = false
            },
            modifier = Modifier.fillMaxSize(),
        )
        PlayerLoadingOverlay(
            visible = loading,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

private val SharedHttpDataSourceFactory by lazy {
    DefaultHttpDataSource.Factory()
        .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(20_000)
        .setKeepPostFor302Redirects(true)
        .setAllowCrossProtocolRedirects(true)
}

private fun createMultiPlayerLoadControl(): DefaultLoadControl =
    DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            MULTI_PLAYER_MIN_BUFFER_MS,
            MULTI_PLAYER_MAX_BUFFER_MS,
            MULTI_PLAYER_PLAYBACK_BUFFER_MS,
            MULTI_PLAYER_REBUFFER_MS,
        )
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

private fun createPrimaryPlayerLoadControl(): DefaultLoadControl =
    DefaultLoadControl.Builder()
        .setBufferDurationsMs(
            PRIMARY_PLAYER_MIN_BUFFER_MS,
            PRIMARY_PLAYER_MAX_BUFFER_MS,
            PRIMARY_PLAYER_PLAYBACK_BUFFER_MS,
            PRIMARY_PLAYER_REBUFFER_MS,
        )
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

@Composable
private fun AddChannelMenu(
    channels: List<TvChannel>,
    onAddChannel: (TvChannel) -> Unit,
    onClose: () -> Unit,
    onClosed: () -> Unit,
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    var selectedIndex by remember(channels) { mutableIntStateOf(0) }
    var firstVisibleIndex by remember(channels) { mutableIntStateOf(0) }
    var visibleRowCount by remember(channels) { mutableIntStateOf(1) }
    var panelReady by remember { mutableStateOf(false) }
    var lastMenuInteractionAtMs by remember(channels) { mutableLongStateOf(System.currentTimeMillis()) }
    val panelProgress by animateFloatAsState(
        targetValue = if (visible && panelReady) 1f else 0f,
        animationSpec = tween(durationMillis = 180, easing = FastOutSlowInEasing),
        label = "addChannelMenuSlide",
        finishedListener = { if (!visible) onClosed() },
    )
    val density = LocalDensity.current
    val panelShape = RoundedCornerShape(topStart = 18.dp, bottomStart = 18.dp)

    fun moveSelection(delta: Int) {
        if (channels.isEmpty()) return
        val nextIndex = (selectedIndex + delta).coerceIn(0, channels.lastIndex)
        if (nextIndex == selectedIndex) return
        selectedIndex = nextIndex
        val visibleCount = visibleRowCount.coerceAtLeast(1)
        val maxFirstIndex = (channels.size - visibleCount).coerceAtLeast(0)
        val topGuard = 1
        val bottomGuard = (visibleCount - 2).coerceAtLeast(0)
        firstVisibleIndex = when {
            nextIndex < firstVisibleIndex -> nextIndex
            nextIndex - firstVisibleIndex < topGuard -> nextIndex - topGuard
            nextIndex - firstVisibleIndex > bottomGuard -> nextIndex - bottomGuard
            else -> firstVisibleIndex
        }.coerceIn(0, maxFirstIndex)
        lastMenuInteractionAtMs = System.currentTimeMillis()
    }

    BackHandler(onBack = onClose)
    LaunchedEffect(visible) {
        if (!visible) {
            panelReady = false
            return@LaunchedEffect
        }
        panelReady = true
        lastMenuInteractionAtMs = System.currentTimeMillis()
        delay(80)
        focusRequester.requestFocus()
    }
    LaunchedEffect(visible) {
        if (!visible) return@LaunchedEffect
        while (true) {
            delay(1_000)
            if (System.currentTimeMillis() - lastMenuInteractionAtMs >= 7_000) {
                onClose()
                break
            }
        }
    }
    Box(
        modifier
            .graphicsLayer {
                translationX = with(density) { (64.dp).toPx() } * (1f - panelProgress)
                alpha = 0.74f + 0.26f * panelProgress
            }
            .width(282.dp)
            .fillMaxHeight(0.76f)
            .clip(panelShape)
            .background(
                Brush.horizontalGradient(
                    colorStops = arrayOf(
                        0.00f to Color(0xEE08141A),
                        0.76f to Color(0xDC08141A),
                        1.00f to Color(0xB808141A),
                    )
                ),
                panelShape,
            )
            .focusRequester(focusRequester)
            .onPreviewKeyEvent {
                when {
                    !visible -> true
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionUp -> {
                        moveSelection(-1)
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                        moveSelection(1)
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionLeft -> {
                        onClose()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key.isActivationKey() -> {
                        lastMenuInteractionAtMs = System.currentTimeMillis()
                        channels.getOrNull(selectedIndex)?.let(onAddChannel)
                        true
                    }
                    it.key.isActivationKey() -> true
                    else -> false
                }
            }
            .focusable()
            .padding(start = 12.dp, top = 14.dp, end = 12.dp, bottom = 12.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(PrimaryCyan, RoundedCornerShape(9.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        tint = Color(0xFF031012),
                        modifier = Modifier.size(22.dp),
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                    Text(
                        text = "Multi view",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Right,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        text = "בחר ערוץ להוספה",
                        color = Color(0xFF9FB1B8),
                        fontSize = 11.sp,
                        textAlign = TextAlign.Right,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            if (channels.isEmpty()) {
                Text(
                    text = "אין ערוצים נוספים",
                    color = Color(0xFFB8C4C8),
                    fontSize = 16.sp,
                    textAlign = TextAlign.Right,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                BoxWithConstraints(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .clipToBounds(),
                ) {
                    val rowHeight = 54.dp
                    val rowGap = 6.dp
                    val visibleCount = (((maxHeight.value + rowGap.value) / (rowHeight.value + rowGap.value)).toInt())
                        .coerceIn(1, channels.size)
                    LaunchedEffect(visibleCount, channels.size) {
                        visibleRowCount = visibleCount
                        selectedIndex = selectedIndex.coerceIn(0, channels.lastIndex)
                        firstVisibleIndex = firstVisibleIndex.coerceIn(0, (channels.size - visibleCount).coerceAtLeast(0))
                    }
                    val visibleChannels = remember(channels, firstVisibleIndex, visibleCount) {
                        channels.drop(firstVisibleIndex).take(visibleCount)
                    }
                    val focusedOffset = selectedIndex - firstVisibleIndex

                    Box(Modifier.fillMaxSize()) {
                        if (focusedOffset in visibleChannels.indices) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(rowHeight)
                                    .offset(y = (rowHeight + rowGap) * focusedOffset)
                                    .background(Color(0x66EAFBFC), RoundedCornerShape(10.dp))
                            )
                        }
                        AddChannelMenuRows(
                            channels = visibleChannels,
                            rowHeight = rowHeight,
                            rowGap = rowGap,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AddChannelMenuRows(
    channels: List<TvChannel>,
    rowHeight: Dp,
    rowGap: Dp,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val logoCache = remember { mutableStateMapOf<String, ImageBitmap>() }
    val titlePaint = remember(density) {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            textSize = with(density) { 13.sp.toPx() }
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.RIGHT
        }
    }
    val numberPaint = remember(density) {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(183, 194, 198)
            textSize = with(density) { 10.sp.toPx() }
            textAlign = Paint.Align.RIGHT
        }
    }

    LaunchedEffect(channels) {
        channels.forEach { channel ->
            val url = channel.logoUrl.takeIf(String::isNotBlank) ?: return@forEach
            if (logoCache[url] != null) return@forEach
            val image = withContext(Dispatchers.IO) {
                val result = context.imageLoader.execute(
                    ImageRequest.Builder(context)
                        .data(url)
                        .size(64, 64)
                        .crossfade(false)
                        .build()
                )
                ((result as? SuccessResult)?.drawable as? BitmapDrawable)
                    ?.bitmap
                    ?.asImageBitmap()
            }
            if (image != null) {
                logoCache[url] = image
            }
        }
    }

    Canvas(Modifier.fillMaxSize()) {
        val rowHeightPx = rowHeight.toPx()
        val rowGapPx = rowGap.toPx()
        val cornerRadius = 10.dp.toPx()
        val logoRadius = 7.dp.toPx()
        val horizontalPadding = 12.dp.toPx()
        val logoSize = 32.dp.roundToPx()
        val logoLeft = horizontalPadding.toInt()
        val textRight = size.width - horizontalPadding

        channels.forEachIndexed { offset, channel ->
            val top = offset * (rowHeightPx + rowGapPx)
            val logoTop = (top + (rowHeightPx - logoSize) / 2f).toInt()
            drawRoundRect(
                color = Color(0x8A20242A),
                topLeft = Offset(0f, top),
                size = Size(size.width, rowHeightPx),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(cornerRadius, cornerRadius),
            )
            drawRoundRect(
                color = Color(0xCC05090D),
                topLeft = Offset(logoLeft.toFloat(), logoTop.toFloat()),
                size = Size(logoSize.toFloat(), logoSize.toFloat()),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(logoRadius, logoRadius),
            )
            logoCache[channel.logoUrl]?.let { logo ->
                drawImage(
                    image = logo,
                    dstOffset = IntOffset(logoLeft, logoTop),
                    dstSize = IntSize(logoSize, logoSize),
                )
            }
            drawContext.canvas.nativeCanvas.drawText(
                channel.name,
                textRight,
                top + 24.dp.toPx(),
                titlePaint,
            )
            drawContext.canvas.nativeCanvas.drawText(
                channel.number,
                textRight,
                top + 41.dp.toPx(),
                numberPaint,
            )
        }
    }
}

@Composable
private fun SourceSelectionMenu(
    channel: TvChannel,
    sources: List<TvStreamSource>,
    selectedSourceId: String?,
    onSelectSource: (TvStreamSource) -> Unit,
    onClose: () -> Unit,
    onClosed: () -> Unit,
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    val density = LocalDensity.current
    val panelProgress by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(durationMillis = 180),
        label = "sourceMenuProgress",
        finishedListener = { if (!visible) onClosed() },
    )
    var selectedIndex by remember(sources, selectedSourceId) {
        mutableIntStateOf(sources.indexOfFirst { it.id == selectedSourceId }.coerceAtLeast(0))
    }
    val listState = rememberLazyListState()
    var lastMenuInteractionAtMs by remember { mutableLongStateOf(System.currentTimeMillis()) }

    fun moveSelection(delta: Int) {
        if (sources.isEmpty()) return
        selectedIndex = Math.floorMod(selectedIndex + delta, sources.size)
        lastMenuInteractionAtMs = System.currentTimeMillis()
    }

    LaunchedEffect(visible) {
        if (visible) {
            delay(40)
            focusRequester.requestFocus()
        }
    }
    LaunchedEffect(visible, selectedIndex) {
        if (!visible) return@LaunchedEffect
        if (sources.isNotEmpty()) {
            listState.animateScrollToItem(selectedIndex)
        }
        while (true) {
            delay(1_000)
            if (System.currentTimeMillis() - lastMenuInteractionAtMs >= 7_000) {
                onClose()
                break
            }
        }
    }

    Box(
        modifier
            .graphicsLayer {
                translationX = with(density) { (-64.dp).toPx() } * (1f - panelProgress)
                alpha = 0.74f + 0.26f * panelProgress
            }
            .width(292.dp)
            .fillMaxHeight(0.78f)
            .clip(RoundedCornerShape(topEnd = 18.dp, bottomEnd = 18.dp))
            .background(
                Brush.horizontalGradient(
                    colorStops = arrayOf(
                        0.00f to Color(0xF208141A),
                        0.74f to Color(0xEA08141A),
                        1.00f to Color(0xB008141A),
                    )
                )
            )
            .focusRequester(focusRequester)
            .onPreviewKeyEvent {
                when {
                    !visible -> true
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionUp -> {
                        moveSelection(-1)
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown -> {
                        moveSelection(1)
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionRight -> {
                        onClose()
                        true
                    }
                    it.type == KeyEventType.KeyDown && it.key == Key.DirectionLeft -> true
                    it.type == KeyEventType.KeyDown && it.key.isActivationKey() -> {
                        sources.getOrNull(selectedIndex)?.let(onSelectSource)
                        true
                    }
                    it.key.isActivationKey() -> true
                    else -> false
                }
            }
            .focusable()
            .padding(start = 12.dp, top = 14.dp, end = 14.dp, bottom = 12.dp),
    ) {
        Column(Modifier.fillMaxSize()) {
            Text(
                text = "מקורות שידור",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = listOf(channel.number, channel.name).filter { it.isNotBlank() }.joinToString("  "),
                color = Color(0xFF9FB1B8),
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 2.dp, bottom = 12.dp),
            )

            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                itemsIndexed(sources, key = { _, source -> source.id }) { index, source ->
                    val isFocused = index == selectedIndex
                    val isSelected = source.id == selectedSourceId
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                when {
                                    isFocused -> Color(0x66EAFBFC)
                                    isSelected -> Color(0x2823DDE3)
                                    else -> Color(0x8A20242A)
                                }
                            )
                            .padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(if (isSelected) PrimaryCyan else Color(0xFF667078))
                        )
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = source.label.ifBlank { "מקור ${index + 1}" },
                                color = if (isFocused) Color.White else Color(0xFFD7E0E4),
                                fontSize = 14.sp,
                                fontWeight = if (isSelected || isFocused) FontWeight.Bold else FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = if (isSelected) "מוצג" else "זמין",
                                color = if (isSelected) PrimaryCyan else Color(0xFF9FB1B8),
                                fontSize = 10.sp,
                                maxLines = 1,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SourceMenuPeek(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(width = 46.dp, height = 58.dp)
            .background(
                Brush.horizontalGradient(
                    colorStops = arrayOf(
                        0.00f to Color(0xF208141A),
                        1.00f to Color(0xD005090D),
                    )
                ),
                RoundedCornerShape(topEnd = 10.dp, bottomEnd = 10.dp),
            )
            .border(
                width = 1.dp,
                color = Color(0x663B3B3B),
                shape = RoundedCornerShape(topEnd = 10.dp, bottomEnd = 10.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            repeat(3) { index ->
                Box(
                    Modifier
                        .width(if (index == 1) 23.dp else 17.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(PrimaryCyan)
                )
            }
        }
    }
}

@Composable
private fun AddChannelMenuPeek(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(48.dp)
            .background(
                Brush.horizontalGradient(
                    colorStops = arrayOf(
                        0.00f to Color(0xD005090D),
                        1.00f to Color(0xF208141A),
                    )
                ),
                RoundedCornerShape(topStart = 10.dp, bottomStart = 10.dp),
            )
            .border(
                width = 1.dp,
                color = Color(0x663B3B3B),
                shape = RoundedCornerShape(topStart = 10.dp, bottomStart = 10.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(22.dp)) {
            val gap = 3.dp.toPx()
            val tile = (size.minDimension - gap) / 2f
            val radius = 3.dp.toPx()
            listOf(
                Offset(0f, 0f),
                Offset(tile + gap, 0f),
                Offset(0f, tile + gap),
                Offset(tile + gap, tile + gap),
            ).forEach { topLeft ->
                drawRoundRect(
                    color = PrimaryCyan,
                    topLeft = topLeft,
                    size = Size(tile, tile),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius, radius),
                )
            }
        }
    }
}

@Composable
private fun PlayerSurface(
    player: StablePlayer,
    playerView: StablePlayerView,
    useController: Boolean,
    resizeMode: Int = AspectRatioFrameLayout.RESIZE_MODE_FIT,
    modifier: Modifier = Modifier,
    showLeadingFade: Boolean = false,
    keepScreenOn: Boolean = false,
) {
    val loading = rememberPlayerLoadingState(player.value)
    DisposableEffect(playerView.value) {
        onDispose {
            playerView.value.player = null
        }
    }
    Box(modifier.clipToBounds()) {
        AndroidView(
            factory = {
                (playerView.value.parent as? ViewGroup)?.removeView(playerView.value)
                playerView.value.resizeMode = resizeMode
                playerView.value.keepScreenOn = keepScreenOn
                playerView.value.layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                playerView.value
            },
            update = {
                if (it.player !== player.value) {
                    it.player = player.value
                }
                if (it.keepScreenOn != keepScreenOn) {
                    it.keepScreenOn = keepScreenOn
                }
                if (it.alpha != 1f) {
                    it.alpha = 1f
                }
                if (it.resizeMode != resizeMode) {
                    it.resizeMode = resizeMode
                }
                if (it.useController != useController) {
                    it.useController = useController
                }
                if (
                    it.layoutParams?.width != ViewGroup.LayoutParams.MATCH_PARENT ||
                    it.layoutParams?.height != ViewGroup.LayoutParams.MATCH_PARENT
                ) {
                    it.layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    it.requestLayout()
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
        PlayerLoadingOverlay(
            visible = loading,
            modifier = Modifier.fillMaxSize(),
        )
        if (showLeadingFade) {
            MiniPlayerFadeOverlay(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .fillMaxHeight()
                    .width(190.dp),
            )
        }
    }
}

@Composable
private fun MiniPlayerFadeOverlay(modifier: Modifier = Modifier) {
    Box(
        modifier.background(
            Brush.horizontalGradient(
                colorStops = arrayOf(
                    0.00f to Color(0xF8081420),
                    0.16f to Color(0xE6081420),
                    0.38f to Color(0xA8081420),
                    0.66f to Color(0x50081420),
                    1.00f to Color.Transparent,
                )
            )
        )
    )
}

@Composable
private fun rememberPlayerLoadingState(player: Player): Boolean {
    var loading by remember(player) { mutableStateOf(player.isVideoLoading()) }

    DisposableEffect(player) {
        fun updateLoading() {
            loading = player.isVideoLoading()
        }
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) = updateLoading()
            override fun onIsLoadingChanged(isLoading: Boolean) = updateLoading()
            override fun onRenderedFirstFrame() = updateLoading()
        }
        player.addListener(listener)
        updateLoading()
        onDispose {
            player.removeListener(listener)
        }
    }

    return loading
}

private fun Player.isVideoLoading(): Boolean =
    mediaItemCount > 0 &&
        playbackState == Player.STATE_BUFFERING

@Composable
private fun PlayerLoadingOverlay(
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    if (!visible) return
    Box(
        modifier = modifier
            .background(Color(0x66000000)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(54.dp)
                .background(Color(0xCC06121B), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                color = PrimaryCyan,
                strokeWidth = 3.dp,
                modifier = Modifier.size(30.dp),
            )
        }
    }
}

@Composable
private fun ExpandedPlayerControls(
    player: StablePlayer,
    channel: TvChannel?,
    program: TvProgram?,
    sourceName: String?,
    showMetadataPanel: Boolean,
    onInteraction: () -> Unit,
) {
    val isLive = player.value.isCurrentMediaItemLive
    val channelDisplayName = sourceName ?: channel?.name.orEmpty()
    com.tvapp.programguide.ui.components.UnifiedPlayerControlsOverlay(
        player = player,
        title = program?.title ?: channelDisplayName,
        subtitle = listOf(channelDisplayName, program?.timeRange()?.asLtrText())
            .filterNotNull()
            .filter { it.isNotBlank() }
            .joinToString("  |  "),
        badgeText = if (isLive) "LIVE" else "DVR",
        isLive = isLive,
        logoUrl = channel?.logoUrl,
        providerDisplayName = channelDisplayName,
        previewImageUrl = program?.imageUrl ?: channel?.logoUrl,
        headerChannelText = listOf(channel?.number.orEmpty(), channelDisplayName)
            .filter { it.isNotBlank() }
            .joinToString("  "),
        showMetadataPanel = showMetadataPanel,
        onInteraction = onInteraction,
    )
}

private fun liveMediaItem(url: String, mimeType: String?): MediaItem {
    val lowerMimeType = mimeType?.lowercase().orEmpty()
    val resolvedMimeType = when {
        "dash" in lowerMimeType ||
            "mpd" in lowerMimeType ||
            url.contains(".mpd", ignoreCase = true) ||
            url.contains("/livedash/", ignoreCase = true) ||
            url.contains(".livx", ignoreCase = true) -> MimeTypes.APPLICATION_MPD
        "hls" in lowerMimeType ||
            "mpegurl" in lowerMimeType ||
            url.contains(".m3u8", ignoreCase = true) -> MimeTypes.APPLICATION_M3U8
        else -> MimeTypes.APPLICATION_M3U8
    }
    return MediaItem.Builder()
        .setUri(url)
        .setMimeType(resolvedMimeType)
        .build()
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
            Spacer(Modifier.height(20.dp))
            androidx.compose.material3.CircularProgressIndicator(
                color = Color(0xFF25D4DE),
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.5.dp,
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
    min(5, channelCount).coerceAtLeast(1)

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

private fun scrollOffsetKeepingProgramVisiblePx(
    program: TvProgram,
    timelineStartSeconds: Long,
    slotWidthPx: Float,
    timelineViewportWidthPx: Float,
    currentScrollOffsetPx: Int,
    maxScrollOffsetPx: Int,
): Int {
    val programStartPx = ((program.startSeconds - timelineStartSeconds) / 1800f) * slotWidthPx
    val programEndPx = ((program.endSeconds - timelineStartSeconds) / 1800f) * slotWidthPx
    val visibleStartPx = currentScrollOffsetPx.toFloat()
    val visibleEndPx = visibleStartPx + timelineViewportWidthPx
    val edgePaddingPx = slotWidthPx * 0.08f

    return when {
        programStartPx >= visibleStartPx + edgePaddingPx &&
            programEndPx <= visibleEndPx - edgePaddingPx -> currentScrollOffsetPx
        programStartPx < visibleStartPx + edgePaddingPx -> programStartPx.roundToInt()
        else -> programStartPx.roundToInt()
    }.coerceIn(0, maxScrollOffsetPx)
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

private fun TvChannel.hasPlayableStream(): Boolean =
    streamUrl.isNotBlank() || streamSources.any { it.url.isNotBlank() }

private fun TvStreamSource?.displayNameOrNull(): String? =
    this?.label?.trim()?.takeIf { it.isNotBlank() }

private fun TvProgram.programKey(): String =
    "$channelId:$startSeconds:$endSeconds:$title"

private fun displayProgramsForChannel(
    channel: TvChannel,
    programs: List<TvProgram>,
    timelineStartSeconds: Long,
    timelineEndSeconds: Long,
): List<TvProgram> {
    if (timelineEndSeconds <= timelineStartSeconds) return emptyList()
    if (programs.isEmpty()) {
        return noProgramBlocks(
            channelId = channel.id,
            startSeconds = timelineStartSeconds,
            endSeconds = timelineEndSeconds,
        )
    }

    val filledPrograms = mutableListOf<TvProgram>()
    var cursorSeconds = timelineStartSeconds

    programs
        .sortedBy { it.startSeconds }
        .forEach { program ->
            when {
                program.endSeconds <= timelineStartSeconds -> return@forEach
                program.startSeconds >= timelineEndSeconds -> return@forEach
            }

            val coveredStartSeconds = max(program.startSeconds, timelineStartSeconds)
            val coveredEndSeconds = min(program.endSeconds, timelineEndSeconds)
            if (coveredEndSeconds <= coveredStartSeconds) return@forEach

            if (coveredStartSeconds > cursorSeconds) {
                filledPrograms += noProgramBlocks(
                    channelId = channel.id,
                    startSeconds = cursorSeconds,
                    endSeconds = coveredStartSeconds,
                )
            }
            filledPrograms += program
            cursorSeconds = max(cursorSeconds, coveredEndSeconds)
        }

    if (cursorSeconds < timelineEndSeconds) {
        filledPrograms += noProgramBlocks(
            channelId = channel.id,
            startSeconds = cursorSeconds,
            endSeconds = timelineEndSeconds,
        )
    }

    return filledPrograms.sortedBy { it.startSeconds }
}

private fun noProgramBlocks(
    channelId: String,
    startSeconds: Long,
    endSeconds: Long,
): List<TvProgram> {
    if (endSeconds <= startSeconds) return emptyList()
    return generateSequence(startSeconds) { currentStartSeconds ->
        val nextHourSeconds = currentStartSeconds.roundUpToHour()
        if (nextHourSeconds <= currentStartSeconds) {
            currentStartSeconds + NO_PROGRAM_BLOCK_SECONDS
        } else {
            nextHourSeconds
        }
    }
        .takeWhile { it < endSeconds }
        .map { blockStartSeconds ->
            TvProgram(
                channelId = channelId,
                startSeconds = blockStartSeconds,
                endSeconds = min(blockStartSeconds.roundUpToHour(), endSeconds),
                title = "אין מידע",
                description = "No program info",
                imageUrl = null,
            )
        }
        .toList()
}

private fun Long.roundUpToHour(): Long {
    val remainder = ((this % NO_PROGRAM_BLOCK_SECONDS) + NO_PROGRAM_BLOCK_SECONDS) % NO_PROGRAM_BLOCK_SECONDS
    return if (remainder == 0L) this + NO_PROGRAM_BLOCK_SECONDS else this + (NO_PROGRAM_BLOCK_SECONDS - remainder)
}

private fun Long.floorToHalfHour(): Long =
    this - ((this % HALF_HOUR_SECONDS) + HALF_HOUR_SECONDS) % HALF_HOUR_SECONDS
