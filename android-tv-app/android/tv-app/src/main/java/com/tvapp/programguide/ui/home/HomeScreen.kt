package com.tvapp.programguide.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ConnectedTv
import androidx.compose.material.icons.filled.MovieFilter
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Subscriptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import android.view.ViewGroup
import androidx.media3.ui.AspectRatioFrameLayout
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.AppDestination
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.LocalEpisode
import com.tvapp.programguide.data.LocalSeries
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import com.tvapp.programguide.data.VodPlaybackProgress
import com.tvapp.programguide.data.VodProvider
import com.tvapp.programguide.data.VodRecentItem
import com.tvapp.programguide.ui.StablePlayer
import com.tvapp.programguide.ui.StablePlayerView
import com.tvapp.programguide.ui.vod.tvFocusableClickable
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val ScreenBg = Color(0xFF080A0C)
private val CardBg = Color(0xFF171B22)
private val FocusedBg = Color(0xFFF2F4F7)
private val FocusedContent = Color(0xFF091016)
private val MutedText = Color(0xFFB8C1CC)
private val Accent = Color(0xFF25D4DE)
private val CardShape = RoundedCornerShape(8.dp)
private val RtlTextStyle = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl)
private val TimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

@Composable
fun HomeScreen(
    guideData: GuideData?,
    recentChannelIds: List<String>,
    vodRecentItems: List<VodRecentItem>,
    vodWatchedItems: List<VodRecentItem>,
    vodProgress: Map<String, VodPlaybackProgress>,
    localSeries: List<LocalSeries>,
    localProgress: Map<String, VodPlaybackProgress>,
    nowSeconds: Long,
    player: StablePlayer,
    playerView: StablePlayerView,
    playingLiveChannelId: String?,
    readyLiveChannelId: String?,
    backgroundLiveChannelId: String?,
    readyBackgroundLiveChannelId: String?,
    playingVodPreviewEpisodeId: String?,
    readyVodPreviewEpisodeId: String?,
    modifier: Modifier = Modifier,
    initialFocusRequester: FocusRequester = remember { FocusRequester() },
    contentFocusNonce: Int = 0,
    liveRowFocusNonce: Int = 0,
    restoreLiveChannelId: String? = null,
    onLiveChannelFocused: (String) -> Unit = {},
    onPlayLiveChannel: (TvChannel, TvProgram?) -> Unit,
    onPreviewHomeBackground: (TvChannel, TvProgram?) -> Unit,
    onPreviewLiveChannel: (TvChannel, TvProgram?) -> Unit,
    onStopLivePreview: () -> Unit,
    onPreviewVodItem: (VodRecentItem) -> Unit,
    onStopVodPreview: () -> Unit,
    onPlayRecentVod: (VodRecentItem) -> Unit,
    onPlayLocalEpisode: (LocalSeries, LocalEpisode) -> Unit,
    onOpenDestination: (AppDestination) -> Unit,
    onOpenVodProvider: (VodProvider) -> Unit,
    onNavigateSideRail: () -> Unit,
) {
    val liveChannels = guideData?.channels.orEmpty().filter { it.hasPlayableStream() }
    val currentPrograms = guideData?.programsByChannel.orEmpty()
    val recentLiveChannels = remember(liveChannels, recentChannelIds) {
        val byId = liveChannels.associateBy { it.id }
        val recent = recentChannelIds.mapNotNull { byId[it] }
        (recent + liveChannels).distinctBy { it.id }.take(12)
    }
    val currentLiveItems = remember(liveChannels, currentPrograms, nowSeconds) {
        liveChannels.mapNotNull { channel ->
            currentPrograms[channel.id].orEmpty()
                .currentProgramNow(nowSeconds)
                ?.let { program -> HomeLiveItem(channel = channel, program = program) }
        }.sortedByDescending { it.program.startSeconds }
            .take(12)
    }
    val heroLiveItem = currentLiveItems.firstOrNull()
    val heroChannel = heroLiveItem?.channel ?: recentLiveChannels.firstOrNull()
    val heroProgram = heroLiveItem?.program ?: heroChannel?.let { currentPrograms[it.id].orEmpty().currentProgram(nowSeconds) }
    val continueItems = remember(vodRecentItems, vodWatchedItems, vodProgress, localSeries, localProgress) {
        buildContinueItems(
            vodRecentItems = vodRecentItems,
            vodWatchedItems = vodWatchedItems,
            vodProgress = vodProgress,
            localSeries = localSeries,
            localProgress = localProgress,
        )
    }
    val firstRowFocusRequester = remember { FocusRequester() }
    val firstFocusRequester = initialFocusRequester
    val liveRowState = rememberLazyListState()
    val focusScope = rememberCoroutineScope()
    val liveRowFocusRequesters = remember(currentLiveItems.map { it.channel.id }, firstRowFocusRequester) {
        List(currentLiveItems.size) { index ->
            if (index == 0) firstRowFocusRequester else FocusRequester()
        }
    }
    val recentVodItems = remember(vodRecentItems, vodWatchedItems) {
        (vodRecentItems + vodWatchedItems)
            .distinctBy { it.episodeId }
            .take(12)
    }
    var focusedLiveChannelId by remember { mutableStateOf<String?>(null) }
    var lastFocusedLiveChannelIndex by remember { mutableStateOf(0) }
    var armedPreviewChannelId by remember { mutableStateOf<String?>(null) }
    var focusedVodItem by remember { mutableStateOf<VodRecentItem?>(null) }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0) {
            try {
                firstFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(liveRowFocusNonce, liveRowFocusRequesters) {
        if (liveRowFocusNonce > 0) {
            try {
                val restoredIndex = restoreLiveChannelId
                    ?.let { channelId -> currentLiveItems.indexOfFirst { it.channel.id == channelId } }
                    ?.takeIf { it >= 0 }
                val targetIndex = (restoredIndex ?: lastFocusedLiveChannelIndex)
                    .coerceIn(0, liveRowFocusRequesters.lastIndex.coerceAtLeast(0))
                liveRowState.scrollToItem(targetIndex)
                kotlinx.coroutines.delay(80L)
                liveRowFocusRequesters.getOrNull(targetIndex)?.requestFocus()
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(focusedLiveChannelId, currentLiveItems) {
        val focusedId = focusedLiveChannelId ?: return@LaunchedEffect
        kotlinx.coroutines.delay(2_000L)
        if (focusedLiveChannelId != focusedId) return@LaunchedEffect
        val item = currentLiveItems.firstOrNull { it.channel.id == focusedId } ?: return@LaunchedEffect
        armedPreviewChannelId = focusedId
        onPreviewLiveChannel(item.channel, item.program)
    }

    LaunchedEffect(
        heroChannel?.id,
        heroProgram?.startSeconds,
        heroProgram?.title,
        focusedVodItem?.episodeId,
        armedPreviewChannelId,
        playingLiveChannelId,
        playingVodPreviewEpisodeId,
    ) {
        val channel = heroChannel ?: return@LaunchedEffect
        if (focusedVodItem != null || armedPreviewChannelId != null || playingVodPreviewEpisodeId != null) return@LaunchedEffect
        if (playingLiveChannelId != channel.id) {
            onPreviewHomeBackground(channel, heroProgram)
        }
    }

    LaunchedEffect(focusedLiveChannelId, playingLiveChannelId) {
        val focusedId = focusedLiveChannelId
        if (playingLiveChannelId != null && focusedId != null && playingLiveChannelId != focusedId) {
            armedPreviewChannelId = null
            onStopLivePreview()
        }
    }

    LaunchedEffect(focusedLiveChannelId, playingLiveChannelId) {
        if (
            focusedLiveChannelId != null ||
            playingLiveChannelId == null ||
            playingLiveChannelId == backgroundLiveChannelId
        ) return@LaunchedEffect
        kotlinx.coroutines.delay(250L)
        if (focusedLiveChannelId == null && playingLiveChannelId != backgroundLiveChannelId) {
            armedPreviewChannelId = null
            onStopLivePreview()
        }
    }

    LaunchedEffect(focusedVodItem) {
        val item = focusedVodItem ?: return@LaunchedEffect
        kotlinx.coroutines.delay(2_000L)
        if (focusedVodItem?.episodeId != item.episodeId) return@LaunchedEffect
        onPreviewVodItem(item)
    }

    LaunchedEffect(focusedVodItem, playingVodPreviewEpisodeId) {
        val focusedId = focusedVodItem?.episodeId
        if (playingVodPreviewEpisodeId != null && focusedId != null && playingVodPreviewEpisodeId != focusedId) {
            onStopVodPreview()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            onStopLivePreview()
            onStopVodPreview()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ScreenBg),
    ) {
        val showBackgroundPlayer = backgroundLiveChannelId != null &&
            playingLiveChannelId == backgroundLiveChannelId &&
            armedPreviewChannelId == null &&
            focusedVodItem == null &&
            playingVodPreviewEpisodeId == null
        HomeArtwork(
            imageUrl = heroProgram?.imageUrl ?: heroChannel?.logoUrl,
            title = heroProgram?.title ?: heroChannel?.name.orEmpty(),
            modifier = Modifier.fillMaxSize(),
        )
        if (showBackgroundPlayer) {
            HomeInlinePlayer(
                player = player,
                playerView = playerView,
                visible = true,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color(0x59080A0C),
                        0.34f to Color(0x80080A0C),
                        0.54f to Color(0xD9080A0C),
                        1f to Color(0xFA080A0C),
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xC9080A0C),
                        0.52f to Color(0x66080A0C),
                        1f to Color(0x22080A0C),
                    )
                )
        )
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 24.dp, bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            item {
                HomeHero(
                    channel = heroChannel,
                    program = heroProgram,
                    focusRequester = firstFocusRequester,
                    onClick = {
                        if (heroChannel != null) onPlayLiveChannel(heroChannel, heroProgram)
                    },
                    onNavigateLeft = onNavigateSideRail,
                    onNavigateDown = {
                        val targetIndex = lastFocusedLiveChannelIndex.coerceIn(0, liveRowFocusRequesters.lastIndex.coerceAtLeast(0))
                        focusScope.launch {
                            liveRowState.scrollToItem(targetIndex)
                            kotlinx.coroutines.delay(80L)
                            val targetRequester = liveRowFocusRequesters.getOrNull(targetIndex) ?: firstRowFocusRequester
                            targetRequester.requestFocus()
                        }
                    },
                )
            }

            if (currentLiveItems.isNotEmpty()) {
                item {
                    HomeRow(title = "ערוצים חיים", state = liveRowState) {
                        itemsIndexed(currentLiveItems, key = { _, item -> item.channel.id }) { index, item ->
                            val channel = item.channel
                            val program = item.program
                            LiveChannelCard(
                                channel = channel,
                                program = program,
                                focusRequester = liveRowFocusRequesters.getOrNull(index) ?: if (index == 0) firstRowFocusRequester else null,
                                player = player,
                                playerView = playerView,
                                attachPlayer = focusedLiveChannelId == channel.id && playingLiveChannelId == channel.id,
                                showPlayer = focusedLiveChannelId == channel.id && readyLiveChannelId == channel.id,
                                onClick = { onPlayLiveChannel(channel, program) },
                                onFocusChanged = { isFocused ->
                                    if (isFocused) {
                                        onStopVodPreview()
                                        if (playingLiveChannelId != null && playingLiveChannelId != channel.id && playingLiveChannelId != backgroundLiveChannelId) {
                                            armedPreviewChannelId = null
                                            onStopLivePreview()
                                        }
                                        lastFocusedLiveChannelIndex = index
                                        onLiveChannelFocused(channel.id)
                                        focusedLiveChannelId = channel.id
                                    } else if (focusedLiveChannelId == channel.id) {
                                        focusedLiveChannelId = null
                                        armedPreviewChannelId = null
                                        if (playingLiveChannelId == channel.id && backgroundLiveChannelId != channel.id) {
                                            onStopLivePreview()
                                        }
                                    }
                                },
                                onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            )
                        }
                    }
                }
            }

            if (continueItems.isNotEmpty()) {
                item {
                    HomeRow(title = "המשך צפייה") {
                        itemsIndexed(continueItems, key = { _, item -> item.key }) { index, item ->
                            when (item) {
                                is HomeContinueItem.Vod -> {
                                    VodRecentCard(
                                        item = item.item,
                                        progress = item.progress,
                                        player = player,
                                        playerView = playerView,
                                        attachPlayer = focusedVodItem?.episodeId == item.item.episodeId &&
                                            playingVodPreviewEpisodeId == item.item.episodeId,
                                        showPlayer = focusedVodItem?.episodeId == item.item.episodeId &&
                                            readyVodPreviewEpisodeId == item.item.episodeId,
                                        onClick = { onPlayRecentVod(item.item) },
                                        onFocusChanged = { isFocused ->
                                            if (isFocused) {
                                                onStopLivePreview()
                                                focusedVodItem = item.item
                                            } else if (focusedVodItem?.episodeId == item.item.episodeId) {
                                                focusedVodItem = null
                                                onStopVodPreview()
                                            }
                                        },
                                        onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                                    )
                                }
                                is HomeContinueItem.Local -> {
                                    LocalEpisodeCard(
                                        series = item.series,
                                        episode = item.episode,
                                        progress = item.progress,
                                        onClick = { onPlayLocalEpisode(item.series, item.episode) },
                                        onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (recentVodItems.isNotEmpty()) {
                item {
                    HomeRow(title = "תכני VOD חדשים") {
                        itemsIndexed(recentVodItems.take(14), key = { _, item -> item.id }) { index, item ->
                            VodRecentCard(
                                item = item,
                                progress = vodProgress[item.episodeId],
                                player = player,
                                playerView = playerView,
                                attachPlayer = focusedVodItem?.episodeId == item.episodeId &&
                                    playingVodPreviewEpisodeId == item.episodeId,
                                showPlayer = focusedVodItem?.episodeId == item.episodeId &&
                                    readyVodPreviewEpisodeId == item.episodeId,
                                onClick = { onPlayRecentVod(item) },
                                onFocusChanged = { isFocused ->
                                    if (isFocused) {
                                        onStopLivePreview()
                                        focusedVodItem = item
                                    } else if (focusedVodItem?.episodeId == item.episodeId) {
                                        focusedVodItem = null
                                        onStopVodPreview()
                                    }
                                },
                                onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            )
                        }
                    }
                }
            }

            item {
                HomeRow(title = "עוד לצפות") {
                    item {
                        ShortcutCard(
                            title = "Live TV",
                            subtitle = "כל הערוצים החיים",
                            icon = Icons.Default.ConnectedTv,
                            onClick = { onOpenDestination(AppDestination.LIVE_TV) },
                            onNavigateLeft = onNavigateSideRail,
                        )
                    }
                    item {
                        ShortcutCard(
                            title = "VOD",
                            subtitle = "ספריות הערוצים",
                            icon = Icons.Default.MovieFilter,
                            onClick = { onOpenDestination(AppDestination.VOD) },
                        )
                    }
                    item {
                        ShortcutCard(
                            title = "Series",
                            subtitle = "סדרות מהמכשיר",
                            icon = Icons.Default.Subscriptions,
                            onClick = { onOpenDestination(AppDestination.LOCAL_SERIES) },
                        )
                    }
                    itemsIndexed(VodProvider.entries, key = { _, provider -> provider.id }) { _, provider ->
                        ShortcutCard(
                            title = provider.displayName,
                            subtitle = "VOD ${provider.channelNumber}",
                            icon = Icons.Default.PlayArrow,
                            onClick = { onOpenVodProvider(provider) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHero(
    channel: TvChannel?,
    program: TvProgram?,
    focusRequester: FocusRequester,
    onClick: () -> Unit,
    onNavigateLeft: () -> Unit,
    onNavigateDown: () -> Unit,
) {
    val playInteractionSource = remember { MutableInteractionSource() }
    val isPlayFocused by playInteractionSource.collectIsFocusedAsState()

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(258.dp),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth(if (isPlayFocused) 0.42f else 0.28f)
                .height(if (isPlayFocused) 3.dp else 1.dp)
                .background(
                    if (isPlayFocused) Accent else Color(0x66FFFFFF)
                )
        )
        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 34.dp, end = 34.dp, bottom = 8.dp)
                .fillMaxWidth(0.58f),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                LiveBadge()
                Text(channel?.name.orEmpty(), color = MutedText, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = program?.title ?: "שידור חי",
                color = Color.White,
                fontSize = 33.sp,
                lineHeight = 39.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
            if (!program?.description.isNullOrBlank()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = program?.description.orEmpty(),
                    color = Color(0xFFD0D5DD),
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = RtlTextStyle,
                )
            }
            Spacer(Modifier.height(20.dp))
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isPlayFocused) FocusedBg else Color(0xFFE91E35))
                    .then(if (isPlayFocused) Modifier.border(2.dp, FocusedBg, RoundedCornerShape(8.dp)) else Modifier)
                    .tvFocusableClickable(
                        onClick = onClick,
                        interactionSource = playInteractionSource,
                        focusRequester = focusRequester,
                        onNavigateLeft = onNavigateLeft,
                        onNavigateDown = onNavigateDown,
                    )
                    .padding(horizontal = 24.dp, vertical = 12.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = if (isPlayFocused) FocusedContent else Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                    Text(
                        text = "נגן",
                        color = if (isPlayFocused) FocusedContent else Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeRow(
    title: String,
    state: LazyListState? = null,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    val rowState = state ?: rememberLazyListState()
    Column {
        Text(title, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
        LazyRow(
            state = rowState,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(end = 24.dp),
            content = content,
        )
    }
}

@Composable
private fun LiveChannelCard(
    channel: TvChannel,
    program: TvProgram?,
    focusRequester: FocusRequester?,
    player: StablePlayer,
    playerView: StablePlayerView,
    attachPlayer: Boolean,
    showPlayer: Boolean,
    onClick: () -> Unit,
    onFocusChanged: (Boolean) -> Unit,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(
        width = 238.dp,
        height = 154.dp,
        focusRequester = focusRequester,
        onClick = onClick,
        onFocusChanged = onFocusChanged,
        onNavigateLeft = onNavigateLeft,
    ) { isFocused ->
        if (attachPlayer) {
            HomeInlinePlayer(player = player, playerView = playerView, visible = showPlayer, modifier = Modifier.fillMaxSize())
        }
        if (!showPlayer) {
            HomeArtwork(
                imageUrl = program?.imageUrl ?: channel.logoUrl,
                title = channel.name,
                modifier = Modifier.fillMaxSize(),
            )
        }
        CardScrim()
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text(channel.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(program?.title ?: "Live", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, style = RtlTextStyle)
            if (program != null) {
                Text(program.timeRange(), color = if (isFocused) Color(0xFF344054) else MutedText, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        LiveBadge(Modifier.align(Alignment.TopStart).padding(9.dp))
    }
}

@Composable
private fun HomeInlinePlayer(
    player: StablePlayer,
    playerView: StablePlayerView,
    visible: Boolean,
    modifier: Modifier = Modifier,
) {
    val alpha = if (visible) 1f else 0f
    AndroidView(
        factory = {
            (playerView.value.parent as? ViewGroup)?.removeView(playerView.value)
            playerView.value.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            playerView.value.useController = false
            playerView.value.alpha = alpha
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
            it.alpha = alpha
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
private fun LocalEpisodeCard(
    series: LocalSeries,
    episode: LocalEpisode,
    progress: VodPlaybackProgress?,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(width = 238.dp, height = 164.dp, onClick = onClick, onNavigateLeft = onNavigateLeft) { isFocused ->
        HomeArtwork(
            imageUrl = episode.imageUrl ?: series.backdropUrl ?: series.posterUrl,
            title = episode.title,
            modifier = Modifier.fillMaxSize(),
        )
        CardScrim()
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text(episode.title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, style = RtlTextStyle)
            Text(
                listOfNotNull(series.displayTitle, episode.seasonEpisodeLabel()).joinToString(" · "),
                color = if (isFocused) Color(0xFF344054) else MutedText,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
        }
        if (progress != null && progress.isInProgress) {
            ProgressBar(progress)
        }
    }
}

@Composable
private fun VodRecentCard(
    item: VodRecentItem,
    progress: VodPlaybackProgress?,
    player: StablePlayer? = null,
    playerView: StablePlayerView? = null,
    attachPlayer: Boolean = false,
    showPlayer: Boolean = false,
    onClick: () -> Unit,
    onFocusChanged: ((Boolean) -> Unit)? = null,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(width = 238.dp, height = 164.dp, onClick = onClick, onFocusChanged = onFocusChanged, onNavigateLeft = onNavigateLeft) { isFocused ->
        if (attachPlayer && player != null && playerView != null) {
            HomeInlinePlayer(player = player, playerView = playerView, visible = showPlayer, modifier = Modifier.fillMaxSize())
        }
        if (!showPlayer) {
            HomeArtwork(imageUrl = item.imageUrl, title = item.title, modifier = Modifier.fillMaxSize())
        }
        CardScrim()
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text(item.title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, style = RtlTextStyle)
            Text(
                listOfNotNull(item.channelName, item.programName).distinct().joinToString(" · ").ifBlank { item.provider.displayName },
                color = if (isFocused) Color(0xFF344054) else MutedText,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
        }
        if (progress != null && progress.isInProgress) {
            ProgressBar(progress)
        }
    }
}

@Composable
private fun BoxScope.ProgressBar(progress: VodPlaybackProgress) {
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .height(5.dp)
            .background(Color(0x66232A38)),
    ) {
        Box(
            Modifier
                .fillMaxWidth(progress.progressPercentage.coerceIn(0.04f, 1f))
                .height(5.dp)
                .background(Color(0xFFFF2B44)),
        )
    }
}

@Composable
private fun ShortcutCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
) {
    FocusCard(width = 202.dp, height = 118.dp, onClick = onClick, onNavigateLeft = onNavigateLeft) { isFocused ->
        Row(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier.size(46.dp).clip(RoundedCornerShape(8.dp)).background(if (isFocused) Color(0x22000000) else Color(0x2225D4DE)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = if (isFocused) FocusedContent else Accent, modifier = Modifier.size(26.dp))
            }
            Column {
                Text(title, color = if (isFocused) FocusedContent else Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(subtitle, color = if (isFocused) Color(0xFF344054) else MutedText, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun FocusCard(
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp,
    focusRequester: FocusRequester? = null,
    onClick: () -> Unit,
    onFocusChanged: ((Boolean) -> Unit)? = null,
    onNavigateLeft: (() -> Unit)?,
    content: @Composable BoxScope.(Boolean) -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Box(
        modifier = Modifier
            .width(width)
            .height(height)
            .clip(CardShape)
            .background(if (isFocused) FocusedBg else CardBg)
            .then(if (isFocused) Modifier.border(3.dp, FocusedBg, CardShape) else Modifier)
            .onFocusChanged { onFocusChanged?.invoke(it.isFocused || it.hasFocus) }
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
            ),
    ) {
        content(isFocused)
    }
}

@Composable
private fun HomeArtwork(imageUrl: String?, title: String, modifier: Modifier = Modifier) {
    if (!imageUrl.isNullOrBlank()) {
        val context = LocalContext.current
        val request = remember(imageUrl) {
            ImageRequest.Builder(context).data(imageUrl).size(640, 360).crossfade(false).build()
        }
        AsyncImage(model = request, contentDescription = title, contentScale = ContentScale.Crop, modifier = modifier)
    } else {
        Box(modifier.background(Color(0xFF1B2230)), contentAlignment = Alignment.Center) {
            Text(title.take(2), color = Color(0x66FFFFFF), fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CardScrim() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to Color.Transparent,
                    0.55f to Color(0x33080A0C),
                    1f to Color(0xE6080A0C),
                )
            )
    )
}

@Composable
private fun LiveBadge(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.clip(RoundedCornerShape(4.dp)).background(Color(0xFFE21D2F)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
        Text("LIVE", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

private fun TvChannel.hasPlayableStream(): Boolean =
    streamUrl.isNotBlank() || streamSources.any { it.url.isNotBlank() }

private fun List<TvProgram>.currentProgram(nowSeconds: Long): TvProgram? =
    currentProgramNow(nowSeconds)
        ?: firstOrNull()

private fun List<TvProgram>.currentProgramNow(nowSeconds: Long): TvProgram? =
    filter { nowSeconds in it.startSeconds until it.endSeconds }
        .maxByOrNull { it.startSeconds }

private fun TvProgram.timeRange(): String {
    val zoneId = ZoneId.systemDefault()
    return "${TimeFormatter.format(Instant.ofEpochSecond(startSeconds).atZone(zoneId))} - ${TimeFormatter.format(Instant.ofEpochSecond(endSeconds).atZone(zoneId))}"
}

private data class HomeLiveItem(
    val channel: TvChannel,
    val program: TvProgram,
)

private sealed class HomeContinueItem {
    abstract val progress: VodPlaybackProgress
    abstract val key: String

    data class Vod(
        val item: VodRecentItem,
        override val progress: VodPlaybackProgress,
    ) : HomeContinueItem() {
        override val key: String = "vod:${item.episodeId}"
    }

    data class Local(
        val series: LocalSeries,
        val episode: LocalEpisode,
        override val progress: VodPlaybackProgress,
    ) : HomeContinueItem() {
        override val key: String = "local:${episode.id}"
    }
}

private fun buildContinueItems(
    vodRecentItems: List<VodRecentItem>,
    vodWatchedItems: List<VodRecentItem>,
    vodProgress: Map<String, VodPlaybackProgress>,
    localSeries: List<LocalSeries>,
    localProgress: Map<String, VodPlaybackProgress>,
): List<HomeContinueItem> {
    val vodByEpisode = (vodWatchedItems + vodRecentItems).distinctBy { it.episodeId }.associateBy { it.episodeId }
    val vodItems = vodProgress.values
        .filter { it.isInProgress }
        .mapNotNull { progress -> vodByEpisode[progress.episodeId]?.let { HomeContinueItem.Vod(it, progress) } }

    val localItems = localSeries.flatMap { series ->
        series.episodes.mapNotNull { episode ->
            val progress = localProgress[episode.id]?.takeIf { it.isInProgress } ?: return@mapNotNull null
            HomeContinueItem.Local(series = series, episode = episode, progress = progress)
        }
    }

    return (vodItems + localItems)
        .sortedByDescending { it.progress.lastWatchedAt }
        .take(12)
}

private fun LocalEpisode.seasonEpisodeLabel(): String? =
    when {
        season != null && episode != null -> "עונה $season פרק $episode"
        season != null -> "עונה $season"
        episode != null -> "פרק $episode"
        else -> null
    }
