package com.tvapp.programguide.ui.vod

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.VodEpisode
import com.tvapp.programguide.data.VodPlaybackProgress
import com.tvapp.programguide.data.VodSeason
import com.tvapp.programguide.data.VodSeries
import com.tvapp.programguide.data.VodSeriesDetails
import com.tvapp.programguide.ui.StablePlayer
import com.tvapp.programguide.ui.StablePlayerView
import com.tvapp.programguide.ui.VodEpisodeFocusTarget
import com.tvapp.programguide.ui.VodViewModel
import com.tvapp.programguide.ui.components.TvScreenDarkBg
import com.tvapp.programguide.ui.components.TvScreenLayout
import com.tvapp.programguide.ui.components.VodBadge
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val DetailsBg = Color(0xFF080A0C)
private val CardBg = Color(0xFF17181B)
private val FocusedCardBg = Color(0xFFF2F4F7)
private val FocusedCardContent = Color(0xFF0A0E14)
private val MutedText = Color(0xFF8E95A2)
private val SelectedFilterBg = Color(0xFF262932)

@Composable
fun VodSeriesDetailsView(
    details: VodSeriesDetails?,
    selectedSeason: VodSeason?,
    isLoading: Boolean,
    error: String?,
    lastPlayedEpisodeId: String? = null,
    episodeFocusTarget: VodEpisodeFocusTarget? = null,
    episodeProgress: Map<String, VodPlaybackProgress> = emptyMap(),
    isPlayerActive: Boolean = false,
    player: StablePlayer? = null,
    inlinePlayerView: StablePlayerView? = null,
    playerView: StablePlayerView? = null,
    viewModel: VodViewModel? = null,
    onSeasonSelected: (VodSeason) -> Unit,
    onPlayEpisode: (VodEpisode, VodSeries) -> Unit,
    onEpisodeFocusRestored: (Int) -> Unit = {},
    onClose: () -> Unit,
    onNavigateSideRail: () -> Unit,
    contentFocusNonce: Int = 0,
    onRegisterFocusRestorer: (((() -> Unit) -> Unit))? = null,
    modifier: Modifier = Modifier,
) {
    if (isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(DetailsBg),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = Color(0xFFE2E8F0))
        }
        return
    }

    if (error != null) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(DetailsBg),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = error,
                    color = Color(0xFFF04438),
                    fontSize = 16.sp,
                )
                val backInteractionSource = remember { MutableInteractionSource() }
                val isBackFocused by backInteractionSource.collectIsFocusedAsState()
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isBackFocused) FocusedCardBg else Color(0x33FFFFFF))
                        .tvFocusableClickable(
                            onClick = onClose,
                            interactionSource = backInteractionSource,
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text(
                        text = "חזרה",
                        color = if (isBackFocused) FocusedCardContent else Color.White,
                        fontSize = 14.sp,
                    )
                }
            }
        }
        return
    }

    val series = details?.series ?: return

    val distinctSeasonIds = remember(details.episodes) {
        details.episodes.mapNotNull { it.seasonId }.distinct()
    }
    val effectiveSeasons = remember(details.seasons, distinctSeasonIds, series.id) {
        when {
            details.seasons.isNotEmpty() -> details.seasons
            distinctSeasonIds.size > 1 -> distinctSeasonIds.mapIndexed { idx, sId ->
                VodSeason(
                    seasonId = sId,
                    programId = series.id,
                    title = "עונה ${idx + 1}",
                    seasonNumber = idx + 1,
                )
            }
            else -> listOf(
                VodSeason(
                    seasonId = "season-1",
                    programId = series.id,
                    title = "עונה 1",
                    seasonNumber = 1,
                )
            )
        }
    }

    val currentSeason = selectedSeason ?: effectiveSeasons.firstOrNull()

    val currentSeasonEpisodes = remember(details.episodes, currentSeason?.seasonId, effectiveSeasons.size) {
        if (currentSeason != null && effectiveSeasons.size > 1) {
            val filtered = details.episodes.filter { it.seasonId == currentSeason.seasonId }
            if (filtered.isNotEmpty()) filtered else details.episodes
        } else {
            details.episodes
        }
    }

    val episodesListState = rememberLazyListState()
    val backFocusRequester = remember { FocusRequester() }
    val fullScreenFocusRequester = remember { FocusRequester() }
    val muteFocusRequester = remember { FocusRequester() }
    val seasonFocusRequesters = remember(effectiveSeasons) {
        effectiveSeasons.associate { it.seasonId to FocusRequester() }
    }
    val episodeFocusRequesters = remember(currentSeasonEpisodes) {
        currentSeasonEpisodes.associate { it.id to FocusRequester() }
    }

    val coroutineScope = rememberCoroutineScope()
    var focusedEpisodeId by remember(series.id) { mutableStateOf<String?>(null) }
    var pendingEpisodeFocusTarget by remember(series.id) { mutableStateOf<VodEpisodeFocusTarget?>(null) }
    var isBackgroundEpisodePlaying by remember { mutableStateOf(false) }
    var backgroundPreviewEpisodeId by remember { mutableStateOf<String?>(null) }
    var backgroundPreviewStreamUrl by remember { mutableStateOf<String?>(null) }
    var isMuted by remember { mutableStateOf(false) }

    fun rememberedEpisodeId(): String? {
        val lastPlayedId = lastPlayedEpisodeId?.takeIf { id -> currentSeasonEpisodes.any { it.id == id } }
        val inProgressId = currentSeasonEpisodes.firstOrNull { episodeProgress[it.id]?.isInProgress == true }?.id
        val focusedId = focusedEpisodeId?.takeIf { id -> currentSeasonEpisodes.any { it.id == id } }
        return lastPlayedId ?: inProgressId ?: focusedId ?: currentSeasonEpisodes.firstOrNull()?.id
    }

    fun requestEpisodeFocus(episodeId: String? = rememberedEpisodeId()) {
        if (episodeId == null || currentSeasonEpisodes.isEmpty()) return
        val targetIndex = currentSeasonEpisodes.indexOfFirst { it.id == episodeId }
        if (targetIndex < 0) return
        val primaryReq = episodeFocusRequesters[episodeId]
        val fallbackReq = currentSeasonEpisodes.firstOrNull()?.id?.let { episodeFocusRequesters[it] }
        coroutineScope.launch {
            try {
                episodesListState.scrollToItem(targetIndex.coerceAtLeast(0))
            } catch (_: Exception) {}
            for (retryDelay in listOf(50L, 120L, 250L, 400L)) {
                delay(retryDelay)
                try {
                    primaryReq?.requestFocus()
                    break
                } catch (_: Exception) {
                    try { fallbackReq?.requestFocus() } catch (_: Exception) {}
                }
            }
        }
    }

    val latestFocusRestorer by rememberUpdatedState<() -> Unit>({ requestEpisodeFocus() })

    DisposableEffect(Unit) {
        onRegisterFocusRestorer?.invoke {
            latestFocusRestorer()
        }
        onDispose {}
    }

    LaunchedEffect(episodeFocusTarget?.nonce, series.id) {
        val target = episodeFocusTarget ?: return@LaunchedEffect
        if (details.series.id != target.seriesId) return@LaunchedEffect

        val targetEpisode = details.episodes.firstOrNull { it.id == target.episodeId }
        val targetSeasonId = target.seasonId ?: targetEpisode?.seasonId
        if (targetSeasonId != null && effectiveSeasons.size > 1 && selectedSeason?.seasonId != targetSeasonId) {
            effectiveSeasons.firstOrNull { it.seasonId == targetSeasonId }?.let { matchingSeason ->
                pendingEpisodeFocusTarget = target
                onSeasonSelected(matchingSeason)
                return@LaunchedEffect
            }
        }
        pendingEpisodeFocusTarget = target
    }

    LaunchedEffect(pendingEpisodeFocusTarget?.nonce, selectedSeason?.seasonId, currentSeasonEpisodes.size) {
        val target = pendingEpisodeFocusTarget ?: return@LaunchedEffect
        if (details.series.id != target.seriesId) {
            pendingEpisodeFocusTarget = null
            onEpisodeFocusRestored(target.nonce)
            return@LaunchedEffect
        }

        val targetEpisode = details.episodes.firstOrNull { it.id == target.episodeId }
        val targetSeasonId = target.seasonId ?: targetEpisode?.seasonId
        if (targetSeasonId != null && effectiveSeasons.size > 1 && selectedSeason?.seasonId != targetSeasonId) {
            effectiveSeasons.firstOrNull { it.seasonId == targetSeasonId }?.let { matchingSeason ->
                onSeasonSelected(matchingSeason)
            }
            return@LaunchedEffect
        }

        if (currentSeasonEpisodes.none { it.id == target.episodeId }) return@LaunchedEffect

        focusedEpisodeId = target.episodeId
        delay(110)
        requestEpisodeFocus(target.episodeId)
        pendingEpisodeFocusTarget = null
        onEpisodeFocusRestored(target.nonce)
    }

    // Initial focus on episode
    LaunchedEffect(series.id, currentSeasonEpisodes.size) {
        if (currentSeasonEpisodes.isNotEmpty() && !isPlayerActive) {
            delay(140)
            requestEpisodeFocus()
        }
    }

    LaunchedEffect(selectedSeason?.seasonId) {
        if (pendingEpisodeFocusTarget != null) return@LaunchedEffect
        val targetId = lastPlayedEpisodeId?.takeIf { id -> currentSeasonEpisodes.any { it.id == id } }
            ?: currentSeasonEpisodes.firstOrNull()?.id
        focusedEpisodeId = targetId
        if (!isPlayerActive && targetId != null) {
            delay(120)
            requestEpisodeFocus(targetId)
        }
    }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0 && currentSeasonEpisodes.isNotEmpty() && !isPlayerActive) {
            requestEpisodeFocus()
        }
    }

    // Requirement 8: 2-second debounced background preview playback
    LaunchedEffect(focusedEpisodeId, series.id, isPlayerActive) {
        isBackgroundEpisodePlaying = false
        if (isPlayerActive) return@LaunchedEffect

        backgroundPreviewEpisodeId = null
        backgroundPreviewStreamUrl = null
        try {
            player?.value?.stop()
            player?.value?.clearMediaItems()
        } catch (_: Exception) {}

        val epId = focusedEpisodeId ?: return@LaunchedEffect
        val targetEp = currentSeasonEpisodes.firstOrNull { it.id == epId } ?: return@LaunchedEffect
        if (viewModel == null || player == null) return@LaunchedEffect

        delay(2000L) // Wait 2 seconds of focus on the episode!

        if (focusedEpisodeId != epId || isPlayerActive) return@LaunchedEffect

        val streamUrl = viewModel.resolveEpisodePreviewStream(targetEp, series)
        if (!streamUrl.isNullOrBlank() && focusedEpisodeId == epId && !isPlayerActive) {
            try {
                val mediaItem = when {
                    streamUrl.contains(".mpd", ignoreCase = true) || streamUrl.contains(".livx", ignoreCase = true) -> {
                        MediaItem.Builder()
                            .setUri(streamUrl)
                            .setMimeType(MimeTypes.APPLICATION_MPD)
                            .build()
                    }
                    streamUrl.contains(".m3u8", ignoreCase = true) -> {
                        MediaItem.Builder()
                            .setUri(streamUrl)
                            .setMimeType(MimeTypes.APPLICATION_M3U8)
                            .build()
                    }
                    streamUrl.contains(".mp4", ignoreCase = true) -> {
                        MediaItem.Builder()
                            .setUri(streamUrl)
                            .setMimeType(MimeTypes.APPLICATION_MP4)
                            .build()
                    }
                    else -> {
                        MediaItem.Builder()
                            .setUri(streamUrl)
                            .setMimeType(MimeTypes.APPLICATION_M3U8)
                            .build()
                    }
                }
                player.value.stop()
                player.value.clearMediaItems()
                val resumePos = viewModel.getResumePosition(targetEp.id)
                if (resumePos > 2000L) {
                    player.value.setMediaItem(mediaItem, resumePos)
                    player.value.seekTo(resumePos)
                } else {
                    player.value.setMediaItem(mediaItem, 0L)
                }
                player.value.volume = if (isMuted) 0f else 1f
                player.value.prepare()
                player.value.playWhenReady = true
                backgroundPreviewEpisodeId = epId
                backgroundPreviewStreamUrl = streamUrl
            } catch (_: Exception) {}
        }
    }

    DisposableEffect(player) {
        val actualPlayer = player?.value
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() {
                isBackgroundEpisodePlaying = true
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_READY -> {
                        val previewEpisodeId = backgroundPreviewEpisodeId
                        coroutineScope.launch {
                            delay(350L)
                            if (!isPlayerActive &&
                                previewEpisodeId != null &&
                                previewEpisodeId == backgroundPreviewEpisodeId &&
                                player?.value?.playbackState == Player.STATE_READY
                            ) {
                                isBackgroundEpisodePlaying = true
                            }
                        }
                    }
                    Player.STATE_IDLE,
                    Player.STATE_ENDED -> {
                        isBackgroundEpisodePlaying = false
                    }
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                isBackgroundEpisodePlaying = false
            }
        }
        actualPlayer?.addListener(listener)
        onDispose {
            actualPlayer?.removeListener(listener)
            actualPlayer?.stop()
            actualPlayer?.clearMediaItems()
            isBackgroundEpisodePlaying = false
        }
    }

    val focusedEpisode = remember(focusedEpisodeId, currentSeasonEpisodes) {
        currentSeasonEpisodes.firstOrNull { it.id == focusedEpisodeId }
            ?: currentSeasonEpisodes.firstOrNull()
    }

    val heroTitle = remember(focusedEpisode, series) {
        if (focusedEpisode != null && !focusedEpisode.title.contains(series.title) && focusedEpisode.title.isNotBlank()) {
            "${series.title} · ${focusedEpisode.title}"
        } else {
            focusedEpisode?.title?.takeIf { it.isNotBlank() } ?: series.title
        }
    }

    val heroSubtitle = remember(series, currentSeason, focusedEpisode) {
        listOfNotNull(
            series.provider.displayName,
            currentSeason?.title ?: "עונה 1",
            series.genre.takeIf { !it.isNullOrBlank() && it.lowercase() != "null" },
        ).joinToString(" · ")
    }

    val heroDescription = remember(focusedEpisode, series) {
        focusedEpisode?.description?.trim()?.takeIf { it.isNotBlank() } ?: series.description
    }

    val backgroundImageUrl = remember(focusedEpisode, series) {
        focusedEpisode?.imageUrl ?: series.imageUrl
    }

    LaunchedEffect(isPlayerActive) {
        if (!isPlayerActive) {
            val targetEpisodeId = lastPlayedEpisodeId ?: focusedEpisodeId ?: currentSeasonEpisodes.firstOrNull()?.id
            if (targetEpisodeId != null) {
                for (waitMs in listOf(60L, 140L, 280L)) {
                    delay(waitMs)
                    requestEpisodeFocus(targetEpisodeId)
                }
            }
        }
    }

    val channelLogoUrl = remember(series.provider, viewModel) {
        viewModel?.getProviderLogoUrl(series.provider)
    }

    fun openFullscreenEpisode(episode: VodEpisode) {
        val previewUrl = backgroundPreviewStreamUrl
            ?.takeIf { backgroundPreviewEpisodeId == episode.id && it.isNotBlank() }
        if (previewUrl != null && viewModel != null && player != null) {
            viewModel.playResolvedEpisode(
                episode = episode,
                series = series,
                resolvedStreamUrl = previewUrl,
                currentPositionMs = player.value.currentPosition,
            )
        } else {
            onPlayEpisode(episode, series)
        }
    }

    val effectiveInlinePlayerView = inlinePlayerView ?: playerView
    if (player != null && effectiveInlinePlayerView != null) {
        TvScreenLayout(
            player = player,
            playerView = effectiveInlinePlayerView,
            isVideoRendering = isBackgroundEpisodePlaying,
            isPlayerExpanded = isPlayerActive,
            backgroundImageUrl = backgroundImageUrl,
            artworkTitle = series.title,
            heroTitle = heroTitle,
            heroSubtitle = heroSubtitle,
            heroDescription = heroDescription,
            heroTimeRange = null,
            heroChannelLogoUrl = channelLogoUrl,
            isLive = false,
            showVodBadge = true,
            isMuted = isMuted,
            onToggleMute = {
                isMuted = !isMuted
                player.value.volume = if (isMuted) 0f else 1f
            },
            muteFocusRequester = muteFocusRequester,
            onOpenFullScreen = {
                focusedEpisode?.let(::openFullscreenEpisode)
            },
            fullScreenFocusRequester = fullScreenFocusRequester,
            onNavigateLeft = onNavigateSideRail,
            onNavigateDown = {
                if (effectiveSeasons.size > 1) {
                    val fr = currentSeason?.let { seasonFocusRequesters[it.seasonId] }
                    try { fr?.requestFocus() } catch (_: Exception) { requestEpisodeFocus() }
                } else {
                    requestEpisodeFocus()
                }
            },
            heroPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 32.dp),
            contentPadding = PaddingValues(start = 32.dp, end = 32.dp, bottom = 16.dp),
            spacerAfterHero = 10.dp,
            modifier = modifier,
        ) {
            // Requirement: Episodes + Seasons + Back always at the bottom of the page
            Spacer(modifier = Modifier.weight(1f))

            // Header Row: Back button
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(bottom = 12.dp),
            ) {
                val backInteractionSource = remember { MutableInteractionSource() }
                val isBackFocused by backInteractionSource.collectIsFocusedAsState()
                val backBg = if (isBackFocused) FocusedCardBg else Color(0x26FFFFFF)
                val backFg = if (isBackFocused) FocusedCardContent else Color(0xFFF2F4F7)

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(backBg)
                        .tvFocusableClickable(
                            onClick = onClose,
                            interactionSource = backInteractionSource,
                            focusRequester = backFocusRequester,
                            onNavigateDown = {
                                if (effectiveSeasons.size > 1) {
                                    val fr = currentSeason?.let { seasonFocusRequesters[it.seasonId] }
                                    try { fr?.requestFocus() } catch (_: Exception) { requestEpisodeFocus() }
                                } else {
                                    requestEpisodeFocus()
                                }
                            },
                            onNavigateLeft = onNavigateSideRail,
                        )
                        .padding(horizontal = 14.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "חזרה",
                            tint = backFg,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = "חזרה",
                            color = backFg,
                            fontSize = 13.sp,
                            fontWeight = if (isBackFocused) FontWeight.Bold else FontWeight.Medium,
                        )
                    }
                }
            }

            // Requirement 7: Seasons row
            if (effectiveSeasons.size > 1) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.padding(bottom = 12.dp),
                ) {
                    items(effectiveSeasons, key = { it.seasonId }) { season ->
                        val isSelected = season.seasonId == currentSeason?.seasonId
                        val fr = seasonFocusRequesters[season.seasonId] ?: remember(season.seasonId) { FocusRequester() }
                        SeasonChip(
                            season = season,
                            isSelected = isSelected,
                            focusRequester = fr,
                            onClick = { onSeasonSelected(season) },
                            onNavigateUp = {
                                if (isBackgroundEpisodePlaying) {
                                    try { fullScreenFocusRequester.requestFocus() } catch (_: Exception) {
                                        try { backFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                } else {
                                    try { backFocusRequester.requestFocus() } catch (_: Exception) {}
                                }
                            },
                            onNavigateDown = { requestEpisodeFocus() },
                            onNavigateLeft = if (season == effectiveSeasons.firstOrNull()) onNavigateSideRail else null,
                        )
                    }
                }
            }

            // Episodes Header & Row
            Text(
                text = "פרקים (${currentSeasonEpisodes.size})",
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp),
            )

            if (currentSeasonEpisodes.isEmpty()) {
                Text(
                    text = "אין פרקים זמינים בעונה זו",
                    color = MutedText,
                    fontSize = 14.sp,
                )
            } else {
                LazyRow(
                    state = episodesListState,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    contentPadding = PaddingValues(end = 32.dp, bottom = 12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    itemsIndexed(currentSeasonEpisodes, key = { _, it -> it.id }) { index, episode ->
                        val fr = episodeFocusRequesters[episode.id] ?: remember(episode.id) { FocusRequester() }
                        val progress = episodeProgress[episode.id]
                        EpisodeCard(
                            episode = episode,
                            series = series,
                            channelLogoUrl = channelLogoUrl,
                            focusRequester = fr,
                            isLastPlayed = (episode.id == lastPlayedEpisodeId),
                            progress = progress,
                            onPlay = { openFullscreenEpisode(episode) },
                            onFocused = { focusedEpisodeId = episode.id },
                            onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            onNavigateUp = {
                                if (effectiveSeasons.size > 1) {
                                    val targetSeason = currentSeason ?: effectiveSeasons.firstOrNull()
                                    val targetFr = targetSeason?.let { seasonFocusRequesters[it.seasonId] }
                                    try { targetFr?.requestFocus() } catch (_: Exception) {
                                        try { backFocusRequester.requestFocus() } catch (_: Exception) {}
                                    }
                                } else {
                                    try { backFocusRequester.requestFocus() } catch (_: Exception) {}
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SeasonChip(
    season: VodSeason,
    isSelected: Boolean,
    focusRequester: FocusRequester,
    onClick: () -> Unit,
    onNavigateUp: () -> Unit,
    onNavigateDown: () -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val targetBg = when {
        isFocused -> FocusedCardBg
        isSelected -> SelectedFilterBg
        else -> Color(0x1AFFFFFF)
    }
    val targetFg = when {
        isFocused -> FocusedCardContent
        isSelected -> Color.White
        else -> MutedText
    }

    val shape = RoundedCornerShape(8.dp)

    Box(
        modifier = Modifier
            .clip(shape)
            .background(targetBg)
            .then(
                if (isSelected && !isFocused) Modifier.border(1.5.dp, Color(0xFF25D4DE), shape)
                else if (isFocused) Modifier.border(2.5.dp, Color.White, shape)
                else Modifier
            )
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateUp = onNavigateUp,
                onNavigateDown = onNavigateDown,
                onNavigateLeft = onNavigateLeft,
            )
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Text(
            text = season.title,
            color = targetFg,
            fontSize = 13.sp,
            fontWeight = if (isFocused) FontWeight.Bold else if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
        )
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
private fun EpisodeCard(
    episode: VodEpisode,
    series: VodSeries,
    channelLogoUrl: String?,
    focusRequester: FocusRequester,
    onPlay: () -> Unit,
    isLastPlayed: Boolean = false,
    progress: VodPlaybackProgress? = null,
    onFocused: () -> Unit = {},
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateUp: () -> Unit = {},
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    LaunchedEffect(isFocused) {
        if (isFocused) {
            onFocused()
        }
    }

    val shape = RoundedCornerShape(12.dp)

    Box(
        modifier = Modifier
            .width(238.dp)
            .height(164.dp)
            .clip(shape)
            .background(if (isFocused) FocusedCardBg else CardBg)
            .then(if (isFocused) Modifier.border(3.dp, Color.White, shape) else Modifier)
            .tvFocusableClickable(
                onClick = onPlay,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateUp = onNavigateUp,
                onNavigateDown = {},
            ),
    ) {
        val imageUrl = episode.imageUrl ?: series.imageUrl
        if (!imageUrl.isNullOrBlank()) {
            AsyncImage(
                model = imageUrl,
                contentDescription = episode.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF1B222D)),
            )
        }

        CardScrim()

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(12.dp),
        ) {
            Text(
                text = episode.title,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
            )
            val subtitleText = episode.description?.trim()?.takeIf { it.isNotBlank() }
                ?: listOfNotNull(series.title, episode.seasonId?.let { "עונה $it" }).joinToString(" · ")
            Text(
                text = subtitleText,
                color = if (isFocused) Color(0xFF344054) else MutedText,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
            )
        }

        if (progress != null && (progress.positionMs > 1000L || progress.isCompleted)) {
            val fraction = if (progress.isCompleted) 1f else progress.progressPercentage.coerceIn(0.04f, 1f)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(5.dp)
                    .background(Color(0x66232A38)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction)
                        .height(5.dp)
                        .background(Color(0xFFFF2B44)),
                )
            }
        }

        VodBadge(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(9.dp)
        )

        if (!channelLogoUrl.isNullOrBlank()) {
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
                    model = channelLogoUrl,
                    contentDescription = series.provider.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}
