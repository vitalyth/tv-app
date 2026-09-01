package com.tvapp.programguide.ui

import android.view.ViewGroup
import android.view.LayoutInflater
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.tvapp.programguide.R
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlinx.coroutines.delay

private val ScreenBackground = Color(0xFF050607)
private val CellBackground = Color(0xFF202020)
private val CellBorder = Color(0xFF4A4A4A)
private val FocusBlue = Color(0xFF0B5E93)
private val GlowCyan = Color(0xFF7DF9FF)
private val Gold = Color(0xFFFFC928)
private val TimeFormatter = DateTimeFormatter.ofPattern("h:mm a")

@Composable
fun ProgramGuideApp(viewModel: GuideViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
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

    DisposableEffect(Unit) {
        onDispose { player.release() }
    }

    LaunchedEffect(state.isPlayerExpanded) {
        val parameters = trackSelector.buildUponParameters()
            .setForceLowestBitrate(false)
            .let { builder ->
                if (state.isPlayerExpanded) {
                    builder.setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
                } else {
                    builder.setMaxVideoSize(960, 540)
                }
            }
        trackSelector.setParameters(parameters)
    }

    LaunchedEffect(state.isMiniPlayerPlaying, state.isPlayerExpanded, state.playingChannel?.streamUrl) {
        val channel = state.playingChannel ?: return@LaunchedEffect
        val shouldPlay = state.isMiniPlayerPlaying || state.isPlayerExpanded
        if (!shouldPlay) {
            player.stop()
            activeStreamUrl.value = null
            return@LaunchedEffect
        }

        val streamUrl = viewModel.streamUrl(channel)
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
                state.loading -> GuideMessage("Loading program guide...")
                state.error != null -> GuideError(state.error ?: "Error", viewModel::refresh)
                state.guideData != null -> GuideContent(
                    data = state.guideData!!,
                    selectedChannel = state.selectedChannel,
                    selectedProgram = state.selectedProgram,
                    playingChannel = state.playingChannel,
                    playingProgram = state.playingProgram,
                    player = player,
                    isMiniPlayerPlaying = state.isMiniPlayerPlaying,
                    onChannelFocused = viewModel::selectChannel,
                    onChannelActivated = viewModel::playChannel,
                    onProgramSelected = viewModel::selectProgram,
                    onProgramActivated = viewModel::playChannel,
                    onPlayerClick = viewModel::expandPlayer,
                )
            }

            if (state.isPlayerExpanded) {
                ExpandedPlayer(
                    player = player,
                    channel = state.playingChannel,
                    program = state.playingProgram,
                    onNextChannel = viewModel::playNextChannel,
                    onPreviousChannel = viewModel::playPreviousChannel,
                    onClose = viewModel::collapsePlayer,
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
    playingChannel: TvChannel?,
    playingProgram: TvProgram?,
    player: ExoPlayer,
    isMiniPlayerPlaying: Boolean,
    onChannelFocused: (TvChannel, TvProgram?) -> Unit,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onProgramSelected: (TvChannel, TvProgram) -> Unit,
    onProgramActivated: (TvChannel, TvProgram) -> Unit,
    onPlayerClick: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        TopInfoPanel(
            channel = selectedChannel,
            program = selectedProgram,
            playingChannel = playingChannel,
            playingProgram = playingProgram,
            player = player,
            isMiniPlayerPlaying = isMiniPlayerPlaying,
            onPlayerClick = onPlayerClick,
        )
        ProgramGrid(
            data = data,
            selectedProgram = selectedProgram,
            playingChannel = playingChannel,
            onChannelFocused = onChannelFocused,
            onChannelActivated = onChannelActivated,
            onProgramSelected = onProgramSelected,
            onProgramActivated = onProgramActivated,
        )
    }
}

@Composable
private fun TopInfoPanel(
    channel: TvChannel?,
    program: TvProgram?,
    playingChannel: TvChannel?,
    playingProgram: TvProgram?,
    player: ExoPlayer,
    isMiniPlayerPlaying: Boolean,
    onPlayerClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(206.dp)
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF2B2B2B), Color(0xFF171717))
                )
            )
            .padding(start = 34.dp, top = 24.dp, end = 42.dp, bottom = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniPlayerPreview(
            channel = playingChannel ?: channel,
            program = playingProgram ?: program,
            player = player,
            isPlaying = isMiniPlayerPlaying,
            onClick = onPlayerClick,
        )
        Spacer(Modifier.width(42.dp))
        ProgramArtwork(channel = channel, program = program)
        Spacer(Modifier.width(26.dp))
        ProgramDetails(channel = channel, program = program, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun MiniPlayerPreview(
    channel: TvChannel?,
    program: TvProgram?,
    player: ExoPlayer,
    isPlaying: Boolean,
    onClick: () -> Unit,
) {
    val focused = remember { mutableStateOf(false) }
    val border = if (focused.value) {
        BorderStroke(4.dp, GlowCyan)
    } else {
        BorderStroke(1.dp, Color(0xFF777777))
    }

    Box(
        modifier = Modifier
            .width(290.dp)
            .aspectRatio(16f / 9f)
            .background(Color.Black)
            .border(border)
            .onFocusChanged { focused.value = it.isFocused }
            .focusable()
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (isPlaying) {
            PlayerSurface(player = player, useController = false)
        } else {
            AsyncImage(
                model = program?.imageUrl ?: channel?.logoUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize().padding(14.dp),
            )
        }
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = TimeFormatter.format(Instant.now().atZone(ZoneId.systemDefault())),
                color = Color.White,
                fontSize = 25.sp,
                fontWeight = FontWeight.Light,
            )
            Spacer(Modifier.width(8.dp))
            Icon(
                painter = painterResource(R.drawable.ic_fullscreen),
                contentDescription = "Fullscreen",
                tint = Color.White,
            )
        }
        Text(
            text = channel?.name.orEmpty(),
            color = Color.White,
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Color(0xAA000000))
                .padding(horizontal = 14.dp, vertical = 8.dp),
        )
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
            model = program?.imageUrl ?: channel?.logoUrl,
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
    selectedProgram: TvProgram?,
    playingChannel: TvChannel?,
    onChannelFocused: (TvChannel, TvProgram?) -> Unit,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onProgramSelected: (TvChannel, TvProgram) -> Unit,
    onProgramActivated: (TvChannel, TvProgram) -> Unit,
) {
    val scrollState = rememberScrollState()
    val snappedStart = remember(data) {
        val now = System.currentTimeMillis() / 1000
        val windowStart = data.programsByChannel.values.flatten().minOfOrNull { it.startSeconds } ?: now
        windowStart - (windowStart % 1800L)
    }
    val slotWidth = 180.dp
    val channelWidth = 190.dp
    val selectedProgramKey = selectedProgram?.programKey()
    val playingChannelId = playingChannel?.id

    Column(Modifier.fillMaxSize().background(Color.Black)) {
        TimeHeader(
            startSeconds = snappedStart,
            slotWidth = slotWidth,
            channelWidth = channelWidth,
            modifier = Modifier.height(48.dp),
            horizontalScrollState = scrollState,
        )
        LazyColumn(Modifier.fillMaxSize()) {
            items(data.channels, key = { it.id }) { channel ->
                GuideRow(
                    channel = channel,
                    programs = data.programsByChannel[channel.id].orEmpty(),
                    selectedProgramKey = selectedProgramKey,
                    isPlayingChannel = playingChannelId == channel.id,
                    slotWidth = slotWidth,
                    channelWidth = channelWidth,
                    onChannelFocused = onChannelFocused,
                    onChannelActivated = onChannelActivated,
                    onProgramSelected = onProgramSelected,
                    onProgramActivated = onProgramActivated,
                    horizontalScrollState = scrollState,
                )
            }
        }
    }
}

@Composable
private fun TimeHeader(
    startSeconds: Long,
    slotWidth: Dp,
    channelWidth: Dp,
    modifier: Modifier,
    horizontalScrollState: androidx.compose.foundation.ScrollState,
) {
    Row(modifier.background(Color(0xFF121212)), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(channelWidth).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Text("NOW", color = Color(0xFFE6E6E6), fontSize = 18.sp)
        }
        Row(
            Modifier
                .fillMaxHeight()
                .horizontalScroll(horizontalScrollState, enabled = false)
        ) {
            repeat(14) { index ->
                Box(
                    Modifier.width(slotWidth).fillMaxHeight().border(0.5.dp, CellBorder),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Text(
                        text = TimeFormatter.format(Instant.ofEpochSecond(startSeconds + index * 1800L).atZone(ZoneId.systemDefault())),
                        color = Color.White,
                        fontSize = 20.sp,
                        modifier = Modifier.padding(start = 14.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun GuideRow(
    channel: TvChannel,
    programs: List<TvProgram>,
    selectedProgramKey: String?,
    isPlayingChannel: Boolean,
    slotWidth: Dp,
    channelWidth: Dp,
    horizontalScrollState: androidx.compose.foundation.ScrollState,
    onChannelFocused: (TvChannel, TvProgram?) -> Unit,
    onChannelActivated: (TvChannel, TvProgram?) -> Unit,
    onProgramSelected: (TvChannel, TvProgram) -> Unit,
    onProgramActivated: (TvChannel, TvProgram) -> Unit,
) {
    val currentProgram = remember(programs) {
        val now = System.currentTimeMillis() / 1000
        programs.firstOrNull { now in it.startSeconds until it.endSeconds } ?: programs.firstOrNull()
    }

    Row(Modifier.fillMaxWidth().height(72.dp)) {
        ChannelCell(
            channel = channel,
            width = channelWidth,
            active = isPlayingChannel,
            onFocus = { onChannelFocused(channel, currentProgram) },
            onActivate = { onChannelActivated(channel, currentProgram) },
        )
        Row(Modifier.horizontalScroll(horizontalScrollState)) {
            programs.forEach { program ->
                ProgramCell(
                    program = program,
                    width = programWidth(program, slotWidth),
                    selected = selectedProgramKey == program.programKey(),
                    isCurrent = isCurrent(program),
                    isPlayingChannel = isPlayingChannel,
                    onFocus = { onProgramSelected(channel, program) },
                    onActivate = { onProgramActivated(channel, program) },
                )
            }
            if (programs.isEmpty()) {
                Box(
                    Modifier
                        .width(slotWidth * 4)
                        .fillMaxHeight()
                        .background(if (isPlayingChannel) Color(0xFF102D42) else Color.Black)
                        .border(0.5.dp, CellBorder)
                )
            }
        }
    }
}

@Composable
private fun ChannelCell(
    channel: TvChannel,
    width: Dp,
    active: Boolean,
    onFocus: () -> Unit,
    onActivate: () -> Unit,
) {
    val focused = remember { mutableStateOf(false) }
    AutoActivateOnFocus(
        focused = focused.value,
        key = channel.id,
        onActivate = onActivate,
    )

    Row(
        modifier = Modifier
            .width(width)
            .fillMaxHeight()
            .background(if (active) Color(0xFF123A55) else Color.Black)
            .border(
                if (focused.value) 3.dp else if (active) 2.dp else 0.5.dp,
                if (focused.value) GlowCyan else if (active) FocusBlue else CellBorder,
            )
            .onPreviewKeyEvent {
                if (it.type == KeyEventType.KeyUp && it.key.isActivationKey()) {
                    onActivate()
                    true
                } else {
                    false
                }
            }
            .onFocusChanged {
                focused.value = it.isFocused
                if (it.isFocused) onFocus()
            }
            .focusable()
            .clickable(onClick = onActivate)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Star, contentDescription = null, tint = Gold, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(12.dp))
        Text(channel.number, color = Color.White, fontSize = 23.sp, modifier = Modifier.width(48.dp))
        AsyncImage(model = channel.logoUrl, contentDescription = null, modifier = Modifier.weight(1f).height(38.dp))
    }
}

@Composable
private fun ProgramCell(
    program: TvProgram,
    width: Dp,
    selected: Boolean,
    isCurrent: Boolean,
    isPlayingChannel: Boolean,
    onFocus: () -> Unit,
    onActivate: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    FocusBox(
        modifier = Modifier.width(width).fillMaxHeight(),
        selected = selected,
        isCurrent = isCurrent,
        isPlayingChannel = isPlayingChannel,
        interactionSource = interactionSource,
        focusKey = program.programKey(),
        onFocus = onFocus,
        onActivate = onActivate,
    ) {
        Text(
            text = program.title,
            color = Color.White,
            fontSize = 18.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
    }
}

@Composable
private fun FocusBox(
    modifier: Modifier,
    selected: Boolean,
    isCurrent: Boolean,
    isPlayingChannel: Boolean,
    interactionSource: MutableInteractionSource,
    focusKey: String,
    onFocus: () -> Unit,
    onActivate: () -> Unit,
    content: @Composable () -> Unit,
) {
    val focused = remember { mutableStateOf(false) }
    AutoActivateOnFocus(
        focused = focused.value,
        key = focusKey,
        onActivate = onActivate,
    )
    val background = when {
        focused.value || selected -> FocusBlue
        isPlayingChannel -> Color(0xFF102D42)
        isCurrent -> Color(0xFF173D58)
        else -> CellBackground
    }
    val border = when {
        focused.value -> BorderStroke(3.dp, GlowCyan)
        selected -> BorderStroke(2.dp, GlowCyan.copy(alpha = 0.75f))
        isPlayingChannel -> BorderStroke(1.dp, FocusBlue)
        else -> BorderStroke(0.5.dp, CellBorder)
    }

    Box(
        modifier = modifier
            .background(background)
            .border(border, RoundedCornerShape(0.dp))
            .onPreviewKeyEvent {
                if (it.type == KeyEventType.KeyUp && it.key.isActivationKey()) {
                    onActivate()
                    true
                } else {
                    false
                }
            }
            .onFocusChanged {
                focused.value = it.isFocused
                if (it.isFocused) onFocus()
            }
            .focusable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null, onClick = onActivate),
        contentAlignment = Alignment.CenterStart,
    ) {
        content()
    }
}

@Composable
private fun AutoActivateOnFocus(
    focused: Boolean,
    key: String,
    onActivate: () -> Unit,
) {
    LaunchedEffect(focused, key) {
        if (!focused) return@LaunchedEffect
        delay(3_000)
        onActivate()
    }
}

@Composable
private fun ExpandedPlayer(
    player: ExoPlayer,
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
private fun PlayerSurface(player: ExoPlayer, useController: Boolean) {
    AndroidView(
        factory = { context ->
            (LayoutInflater.from(context).inflate(R.layout.player_view, null) as PlayerView).apply {
                this.player = player
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
            it.player = player
            it.useController = useController
            it.controllerAutoShow = true
            it.controllerShowTimeoutMs = if (useController) 5_000 else 3_000
            it.isFocusable = useController
            it.isFocusableInTouchMode = useController
            if (useController) it.showController() else it.hideController()
            if (useController) it.requestFocus()
        },
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun ExpandedPlayerControls(
    player: ExoPlayer,
    channel: TvChannel?,
    program: TvProgram?,
    onInteraction: () -> Unit,
) {
    var positionMs by remember { mutableStateOf(0L) }
    var durationMs by remember { mutableStateOf(C.TIME_UNSET) }
    var isPlaying by remember { mutableStateOf(player.isPlaying) }
    var isLive by remember { mutableStateOf(player.isCurrentMediaItemLive) }

    LaunchedEffect(player) {
        while (true) {
            positionMs = player.currentPosition.coerceAtLeast(0L)
            durationMs = player.duration
            isPlaying = player.isPlaying
            isLive = player.isCurrentMediaItemLive
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
                IconButton(
                    onClick = {
                        onInteraction()
                        if (player.isPlaying) player.pause() else player.play()
                        isPlaying = player.isPlaying
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
                    text = playbackTimeLabel(positionMs, durationMs, isLive),
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
                .width(116.dp)
                .height(58.dp)
                .background(Color.Black, RoundedCornerShape(4.dp))
                .border(1.dp, Color(0xFF333333), RoundedCornerShape(4.dp))
                .padding(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(
                model = channel?.logoUrl,
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
    val hasSeekableDuration = durationMs != C.TIME_UNSET && durationMs > 0 && !isLive
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
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White, fontSize = 24.sp)
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

private fun programWidth(program: TvProgram, slotWidth: Dp): Dp {
    val minutes = max(15L, (program.endSeconds - program.startSeconds) / 60L)
    return slotWidth * (minutes / 30f)
}

private fun isCurrent(program: TvProgram): Boolean {
    val now = System.currentTimeMillis() / 1000
    return now in program.startSeconds until program.endSeconds
}

private fun playbackTimeLabel(positionMs: Long, durationMs: Long, isLive: Boolean): String {
    if (isLive || durationMs == C.TIME_UNSET || durationMs <= 0) {
        return "Live"
    }
    return "${formatPlaybackTime(positionMs)} / ${formatPlaybackTime(durationMs)}"
}

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

private fun Key.isActivationKey(): Boolean =
    this == Key.DirectionCenter || this == Key.Enter || this == Key.NumPadEnter

private fun TvProgram.programKey(): String =
    "$channelId:$startSeconds:$endSeconds:$title"
