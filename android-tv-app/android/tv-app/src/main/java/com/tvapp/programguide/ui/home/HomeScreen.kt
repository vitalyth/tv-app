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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.MovieFilter
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Subscriptions
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.viewinterop.AndroidView
import android.view.ViewGroup
import androidx.media3.common.Player
import androidx.media3.ui.AspectRatioFrameLayout
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.BuildConfig
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
import com.tvapp.programguide.ui.components.TvScreenLayout
import com.tvapp.programguide.ui.components.TvHero
import com.tvapp.programguide.ui.components.TvArtwork
import com.tvapp.programguide.ui.components.HomeArtwork
import com.tvapp.programguide.ui.components.TvInlinePlayer
import com.tvapp.programguide.ui.components.LiveBadge
import com.tvapp.programguide.ui.components.VodBadge
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
    isMuted: Boolean = false,
    isPlayerExpanded: Boolean = false,
    onToggleMute: () -> Unit = {},
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
    val currentLiveItems = remember(recentLiveChannels, currentPrograms, nowSeconds) {
        recentLiveChannels.mapNotNull { channel ->
            val program = currentPrograms[channel.id].orEmpty().currentProgramNow(nowSeconds)
                ?: currentPrograms[channel.id].orEmpty().currentProgram(nowSeconds)
            program?.let { HomeLiveItem(channel = channel, program = it) }
        }.take(12)
    }
    val heroLiveItem = currentLiveItems.firstOrNull()
    val heroChannel = heroLiveItem?.channel ?: recentLiveChannels.firstOrNull()
    val heroProgram = heroLiveItem?.program ?: heroChannel?.let { currentPrograms[it.id].orEmpty().currentProgram(nowSeconds) }

    var focusedLiveChannelId by remember { mutableStateOf<String?>(null) }
    var lastFocusedLiveChannelIndex by remember { mutableStateOf(0) }
    var focusedVodItem by remember { mutableStateOf<VodRecentItem?>(null) }

    val focusedLiveItem = remember(focusedLiveChannelId, currentLiveItems) {
        focusedLiveChannelId?.let { id -> currentLiveItems.firstOrNull { it.channel.id == id } }
    }
    val focusedLiveChannel = remember(focusedLiveChannelId, liveChannels) {
        focusedLiveChannelId?.let { id -> liveChannels.firstOrNull { it.id == id } }
    }
    val activeChannel = focusedLiveChannel ?: focusedLiveItem?.channel ?: heroChannel
    val activeProgram = if (focusedLiveChannelId != null) {
        focusedLiveItem?.program ?: activeChannel?.let { currentPrograms[it.id].orEmpty().currentProgram(nowSeconds) }
    } else {
        heroProgram
    }

    val isVodActive = focusedVodItem != null
    val heroTitle = if (isVodActive) {
        focusedVodItem?.title.orEmpty()
    } else {
        activeProgram?.title ?: activeChannel?.name.orEmpty().ifBlank { "שידור חי" }
    }
    val heroSubtitle = if (isVodActive) {
        listOfNotNull(focusedVodItem?.channelName, focusedVodItem?.programName).distinct().joinToString(" · ").ifBlank { focusedVodItem?.provider?.displayName.orEmpty() }
    } else {
        activeChannel?.name.orEmpty()
    }
    val heroDescription = if (isVodActive) {
        focusedVodItem?.description?.trim().orEmpty()
    } else {
        activeProgram?.description?.trim().orEmpty()
    }
    val heroTimeRange = if (!isVodActive && activeProgram != null && activeProgram.startSeconds > 0) {
        activeProgram.timeRange()
    } else null
    val heroChannelLogoUrl = if (isVodActive) {
        focusedVodItem?.provider?.let { BuildConfig.PROGRAM_GUIDE_API_BASE_URL.trimEnd('/').removeSuffix("/api") + "/ch/" + it.logoPath.trimStart('/') }
    } else {
        activeChannel?.logoUrl
    }

    val continueItems = remember(vodRecentItems, vodWatchedItems, vodProgress, localSeries, localProgress) {
        buildContinueItems(
            vodRecentItems = vodRecentItems,
            vodWatchedItems = vodWatchedItems,
            vodProgress = vodProgress,
            localSeries = localSeries,
            localProgress = localProgress,
        )
    }
    val muteFocusRequester = remember { FocusRequester() }
    val fullScreenFocusRequester = remember { FocusRequester() }
    val liveRowState = rememberLazyListState()
    val focusScope = rememberCoroutineScope()
    val channelFocusRequesters = remember { mutableMapOf<String, FocusRequester>() }
    fun focusRequesterFor(channelId: String, index: Int): FocusRequester {
        return if (index == 0) initialFocusRequester else channelFocusRequesters.getOrPut(channelId) { FocusRequester() }
    }
    val recentVodItems = remember(vodRecentItems, vodWatchedItems) {
        (vodRecentItems + vodWatchedItems)
            .distinctBy { it.episodeId }
            .take(12)
    }

    var hasRequestedInitialFocus by remember { mutableStateOf(false) }

    LaunchedEffect(currentLiveItems.isNotEmpty()) {
        if (currentLiveItems.isNotEmpty() && !hasRequestedInitialFocus) {
            hasRequestedInitialFocus = true
            try {
                initialFocusRequester.requestFocus()
            } catch (_: Exception) {
                for (attempt in 0..4) {
                    kotlinx.coroutines.delay(30L)
                    try {
                        initialFocusRequester.requestFocus()
                        break
                    } catch (_: Exception) {}
                }
            }
        }
    }

    LaunchedEffect(currentLiveItems) {
        if (focusedLiveChannelId != null && currentLiveItems.none { it.channel.id == focusedLiveChannelId }) {
            val targetIndex = lastFocusedLiveChannelIndex.coerceIn(0, (currentLiveItems.size - 1).coerceAtLeast(0))
            val replacement = currentLiveItems.getOrNull(targetIndex)
            if (replacement != null) {
                focusedLiveChannelId = replacement.channel.id
                lastFocusedLiveChannelIndex = targetIndex
                val requester = focusRequesterFor(replacement.channel.id, targetIndex)
                try {
                    requester.requestFocus()
                } catch (_: Exception) {}
            }
        }
    }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0) {
            try {
                val targetIndex = lastFocusedLiveChannelIndex.coerceIn(0, (currentLiveItems.size - 1).coerceAtLeast(0))
                val targetChannel = currentLiveItems.getOrNull(targetIndex)
                val targetRequester = targetChannel?.let { focusRequesterFor(it.channel.id, targetIndex) } ?: initialFocusRequester
                targetRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(liveRowFocusNonce) {
        if (liveRowFocusNonce > 0) {
            try {
                val restoredIndex = restoreLiveChannelId
                    ?.let { channelId -> currentLiveItems.indexOfFirst { it.channel.id == channelId } }
                    ?.takeIf { it >= 0 }
                val targetIndex = (restoredIndex ?: lastFocusedLiveChannelIndex)
                    .coerceIn(0, (currentLiveItems.size - 1).coerceAtLeast(0))
                liveRowState.scrollToItem(targetIndex)
                kotlinx.coroutines.delay(80L)
                val targetChannel = currentLiveItems.getOrNull(targetIndex)
                val targetRequester = targetChannel?.let { focusRequesterFor(it.channel.id, targetIndex) } ?: initialFocusRequester
                targetRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(
        activeChannel?.id,
        focusedVodItem != null,
        playingLiveChannelId,
        playingVodPreviewEpisodeId,
        focusedLiveChannelId,
        backgroundLiveChannelId,
    ) {
        if (focusedVodItem != null || playingVodPreviewEpisodeId != null) return@LaunchedEffect
        val targetChannel = activeChannel ?: return@LaunchedEffect
        val targetProgram = activeProgram
        if (playingLiveChannelId == targetChannel.id && backgroundLiveChannelId == targetChannel.id) return@LaunchedEffect
        if (focusedLiveChannelId != null && focusedLiveChannelId == targetChannel.id && playingLiveChannelId != targetChannel.id) {
            kotlinx.coroutines.delay(350L)
            if (focusedLiveChannelId != targetChannel.id) return@LaunchedEffect
        }
        onPreviewHomeBackground(targetChannel, targetProgram)
    }

    LaunchedEffect(focusedVodItem) {
        val item = focusedVodItem ?: return@LaunchedEffect
        kotlinx.coroutines.delay(600L)
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

    val isLiveRendering = playingLiveChannelId != null &&
        playingLiveChannelId == activeChannel?.id &&
        (playingLiveChannelId == readyBackgroundLiveChannelId || playingLiveChannelId == readyLiveChannelId) &&
        focusedVodItem == null &&
        playingVodPreviewEpisodeId == null

    val isVodRendering = focusedVodItem != null &&
        playingVodPreviewEpisodeId != null &&
        playingVodPreviewEpisodeId == focusedVodItem?.episodeId &&
        readyVodPreviewEpisodeId == playingVodPreviewEpisodeId

    val isVideoRendering = isLiveRendering || isVodRendering

    val backgroundImageUrl = if (focusedVodItem != null) {
        focusedVodItem?.imageUrl ?: activeProgram?.imageUrl ?: activeChannel?.logoUrl
    } else {
        activeProgram?.imageUrl ?: activeChannel?.logoUrl
    }

    TvScreenLayout(
        modifier = modifier,
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
        isLive = !isVodActive,
        showVodBadge = true,
        isMuted = isMuted,
        onToggleMute = onToggleMute,
        muteFocusRequester = muteFocusRequester,
        onOpenFullScreen = {
            if (isVodActive) {
                focusedVodItem?.let(onPlayRecentVod)
            } else {
                activeChannel?.let { ch -> onPlayLiveChannel(ch, activeProgram) }
            }
        },
        fullScreenFocusRequester = fullScreenFocusRequester,
        onNavigateLeft = onNavigateSideRail,
        onNavigateDown = {
            val targetIndex = lastFocusedLiveChannelIndex.coerceIn(0, (currentLiveItems.size - 1).coerceAtLeast(0))
            focusScope.launch {
                liveRowState.scrollToItem(targetIndex)
                kotlinx.coroutines.delay(80L)
                val targetChannel = currentLiveItems.getOrNull(targetIndex)
                val targetRequester = targetChannel?.let { focusRequesterFor(it.channel.id, targetIndex) } ?: initialFocusRequester
                try {
                    targetRequester.requestFocus()
                } catch (_: Exception) {
                    initialFocusRequester.requestFocus()
                }
            }
        },
        onFocusChanged = { isFocused ->
            if (isFocused) {
                focusedLiveChannelId = null
                focusedVodItem = null
            }
        },
        heroPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 36.dp),
        contentPadding = PaddingValues(start = 32.dp, end = 32.dp, bottom = 8.dp),
        spacerAfterHero = 8.dp,
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
                if (currentLiveItems.isNotEmpty()) {
                    item {
                        HomeRow(title = "ערוצים חיים", state = liveRowState) {
                            itemsIndexed(currentLiveItems, key = { _, item -> item.channel.id }) { index, item ->
                                val channel = item.channel
                                val program = item.program
                                LiveChannelCard(
                                    channel = channel,
                                    program = program,
                                    focusRequester = focusRequesterFor(channel.id, index),
                                    onClick = { onPlayLiveChannel(channel, program) },
                                    onFocusChanged = { isFocused ->
                                        if (isFocused) {
                                            onStopVodPreview()
                                            focusedVodItem = null
                                            lastFocusedLiveChannelIndex = index
                                            onLiveChannelFocused(channel.id)
                                            focusedLiveChannelId = channel.id
                                        }
                                    },
                                    onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                                    onNavigateUp = if (isVideoRendering) {
                                        {
                                            try {
                                                fullScreenFocusRequester.requestFocus()
                                            } catch (_: Exception) {
                                                muteFocusRequester.requestFocus()
                                            }
                                        }
                                    } else null,
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
                                            onClick = { onPlayRecentVod(item.item) },
                                            onFocusChanged = { isFocused ->
                                                if (isFocused) {
                                                    onStopLivePreview()
                                                    focusedVodItem = item.item
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
                                            onFocusChanged = { isFocused ->
                                                if (isFocused) {
                                                    onStopLivePreview()
                                                    focusedVodItem = VodRecentItem(
                                                        id = item.episode.id,
                                                        episodeId = item.episode.id,
                                                        title = item.episode.title,
                                                        programId = item.series.id,
                                                        programName = item.series.displayTitle,
                                                        channelName = item.series.displayTitle,
                                                        imageUrl = item.episode.imageUrl ?: item.series.backdropUrl ?: item.series.posterUrl,
                                                        description = item.episode.overview,
                                                        provider = VodProvider.KAN11,
                                                    )
                                                }
                                            },
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
                            itemsIndexed(recentVodItems.take(14), key = { _, item -> "recent_vod:${item.episodeId}" }) { index, item ->
                                VodRecentCard(
                                    item = item,
                                    progress = vodProgress[item.episodeId],
                                    onClick = { onPlayRecentVod(item) },
                                    onFocusChanged = { isFocused ->
                                        if (isFocused) {
                                            onStopLivePreview()
                                            focusedVodItem = item
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
    onClick: () -> Unit,
    onFocusChanged: (Boolean) -> Unit,
    onNavigateLeft: (() -> Unit)?,
    onNavigateUp: (() -> Unit)? = null,
) {
    FocusCard(
        width = 238.dp,
        height = 154.dp,
        focusRequester = focusRequester,
        onClick = onClick,
        onFocusChanged = onFocusChanged,
        onNavigateLeft = onNavigateLeft,
        onNavigateUp = onNavigateUp,
    ) { isFocused ->
        HomeArtwork(
            imageUrl = program?.imageUrl ?: channel.logoUrl,
            title = channel.name,
            modifier = Modifier.fillMaxSize(),
        )
        CardScrim()
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text(channel.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(program?.title ?: "Live", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, style = RtlTextStyle)
            if (program != null) {
                Text(program.timeRange(), color = if (isFocused) Color(0xFF344054) else MutedText, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        LiveBadge(Modifier.align(Alignment.TopStart).padding(9.dp))
        if (channel.logoUrl.isNotBlank()) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(9.dp)
                    .size(28.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xB3080A0C))
                    .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = channel.logoUrl,
                    contentDescription = channel.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}


@Composable
private fun LocalEpisodeCard(
    series: LocalSeries,
    episode: LocalEpisode,
    progress: VodPlaybackProgress?,
    onClick: () -> Unit,
    onFocusChanged: ((Boolean) -> Unit)? = null,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(width = 238.dp, height = 164.dp, onClick = onClick, onFocusChanged = onFocusChanged, onNavigateLeft = onNavigateLeft) { isFocused ->
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
        VodBadge(Modifier.align(Alignment.TopStart).padding(9.dp))
    }
}

@Composable
private fun VodRecentCard(
    item: VodRecentItem,
    progress: VodPlaybackProgress?,
    onClick: () -> Unit,
    onFocusChanged: ((Boolean) -> Unit)? = null,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(width = 238.dp, height = 164.dp, onClick = onClick, onFocusChanged = onFocusChanged, onNavigateLeft = onNavigateLeft) { isFocused ->
        HomeArtwork(imageUrl = item.imageUrl, title = item.title, modifier = Modifier.fillMaxSize())
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
        VodBadge(Modifier.align(Alignment.TopStart).padding(9.dp))
        val providerLogoUrl = remember(item.provider) {
            BuildConfig.PROGRAM_GUIDE_API_BASE_URL.trimEnd('/').removeSuffix("/api") + "/ch/" + item.provider.logoPath.trimStart('/')
        }
        if (providerLogoUrl.isNotBlank()) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(9.dp)
                    .size(28.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xB3080A0C))
                    .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = providerLogoUrl,
                    contentDescription = item.channelName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
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
    onNavigateUp: (() -> Unit)? = null,
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
                onNavigateUp = onNavigateUp,
            ),
    ) {
        content(isFocused)
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
