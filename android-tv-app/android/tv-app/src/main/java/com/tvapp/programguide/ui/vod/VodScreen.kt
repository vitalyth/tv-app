package com.tvapp.programguide.ui.vod

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
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
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.VodProvider
import com.tvapp.programguide.data.VodSeries
import com.tvapp.programguide.ui.StablePlayer
import com.tvapp.programguide.ui.StablePlayerView
import com.tvapp.programguide.ui.VodViewModel
import com.tvapp.programguide.ui.components.TvScreenDarkBg
import com.tvapp.programguide.ui.components.TvScreenLayout
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val DarkBg = Color(0xFF080A0C)
private val CardBg = Color(0xFF17181B)
private val FocusedCardBg = Color(0xFFF2F4F7)
private val FocusedCardContent = Color(0xFF0A0E14)
private val MutedText = Color(0xFF8E95A2)
private val AccentColor = Color(0xFF25D4DE)

private val SeriesCardShape = RoundedCornerShape(8.dp)
private val FocusedSeriesBorderModifier = Modifier.border(3.dp, FocusedCardBg, SeriesCardShape)
private val SeriesCardGradient = Brush.verticalGradient(
    colors = listOf(
        Color.Transparent,
        Color(0xCC080A0C),
        Color(0xF2080A0C),
    ),
)
private val RtlTextStyle = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl)

@Composable
fun VodScreen(
    viewModel: VodViewModel,
    onNavigateSideRail: () -> Unit,
    modifier: Modifier = Modifier,
    initialFocusRequester: FocusRequester = remember { FocusRequester() },
    contentFocusNonce: Int = 0,
    player: StablePlayer? = null,
    inlinePlayerView: StablePlayerView? = null,
    playerView: StablePlayerView? = null,
    onRegisterFocusRestorer: (((() -> Unit) -> Unit))? = null,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isCatalogActive = uiState.selectedSeriesDetails == null && !uiState.isLoadingDetails && uiState.playingEpisode == null
    var suppressDetailsBackCloseUntil by remember { mutableLongStateOf(0L) }
    var catalogFocusRestorer by remember { mutableStateOf<(() -> Unit)?>(null) }
    var detailsFocusRestorer by remember { mutableStateOf<(() -> Unit)?>(null) }
    var lastFocusedSeriesId by remember { mutableStateOf<String?>(null) }

    val latestUiState by rememberUpdatedState(uiState)
    val latestCatalogFocusRestorer by rememberUpdatedState(catalogFocusRestorer)
    val latestDetailsFocusRestorer by rememberUpdatedState(detailsFocusRestorer)

    DisposableEffect(Unit) {
        onRegisterFocusRestorer?.invoke {
            if (latestUiState.selectedSeriesDetails != null || latestUiState.isLoadingDetails) {
                latestDetailsFocusRestorer?.invoke()
            } else {
                latestCatalogFocusRestorer?.invoke()
            }
        }
        onDispose {}
    }

    fun stopVodPlaybackAndReturnToEpisode() {
        suppressDetailsBackCloseUntil = SystemClock.elapsedRealtime() + 900L
        viewModel.stopVodPlayback()
    }

    // Initial load: when entering VOD, load all channels (Requirement 2)
    LaunchedEffect(Unit) {
        if (uiState.seriesList.isEmpty() && !uiState.isLoadingSeries) {
            if (uiState.selectedProvider == null) {
                viewModel.loadAllChannelsInitialSeries()
            } else {
                viewModel.loadInitialSeries(uiState.selectedProvider)
            }
        }
    }

    BackHandler {
        when {
            uiState.playingEpisode != null -> stopVodPlaybackAndReturnToEpisode()
            uiState.selectedSeriesDetails != null || uiState.isLoadingDetails -> {
                val shouldSuppress = SystemClock.elapsedRealtime() < suppressDetailsBackCloseUntil
                suppressDetailsBackCloseUntil = 0L
                if (!shouldSuppress) {
                    viewModel.closeSeriesDetails()
                }
            }
            else -> onNavigateSideRail()
        }
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(DarkBg),
        ) {
            // Main VOD Catalog View
            VodCatalogView(
                viewModel = viewModel,
                onNavigateSideRail = onNavigateSideRail,
                initialFocusRequester = initialFocusRequester,
                contentFocusNonce = contentFocusNonce,
                player = player,
                playerView = inlinePlayerView ?: playerView,
                lastFocusedSeriesId = lastFocusedSeriesId,
                onSeriesClicked = { series ->
                    lastFocusedSeriesId = series.id
                    viewModel.openSeriesDetails(series)
                },
                onSeriesFocused = { series ->
                    lastFocusedSeriesId = series.id
                },
                modifier = Modifier.focusProperties { canFocus = isCatalogActive },
                onRegisterFocusRestorer = { catalogFocusRestorer = it },
            )

            // Program Details Screen (TvScreenLayout based)
            AnimatedVisibility(
                visible = uiState.selectedSeriesDetails != null || uiState.isLoadingDetails,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.zIndex(20f),
            ) {
                VodSeriesDetailsView(
                    details = uiState.selectedSeriesDetails,
                    selectedSeason = uiState.selectedSeason,
                    isLoading = uiState.isLoadingDetails,
                    error = uiState.detailsError,
                    lastPlayedEpisodeId = uiState.lastPlayedEpisodeId,
                    episodeFocusTarget = uiState.episodeFocusTarget,
                    episodeProgress = uiState.episodeProgress,
                    isPlayerActive = uiState.playingEpisode != null,
                    player = player,
                    inlinePlayerView = inlinePlayerView,
                    playerView = playerView,
                    viewModel = viewModel,
                    onSeasonSelected = viewModel::selectSeason,
                    onPlayEpisode = viewModel::playEpisode,
                    onEpisodeFocusRestored = viewModel::consumeEpisodeFocusTarget,
                    onClose = viewModel::closeSeriesDetails,
                    onNavigateSideRail = onNavigateSideRail,
                    contentFocusNonce = contentFocusNonce,
                    onRegisterFocusRestorer = { detailsFocusRestorer = it },
                )
            }

            // Fullscreen VOD Player Overlay
            if (uiState.playingEpisode != null && player != null && playerView != null) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .zIndex(30f),
                ) {
                    VodPlayerOverlay(
                        streamUrl = uiState.playingStreamUrl,
                        episode = uiState.playingEpisode,
                        series = uiState.playingSeries,
                        providerLogoUrl = uiState.playingSeries?.let { viewModel.getProviderLogoUrl(it.provider) },
                        isResolvingStream = uiState.isResolvingStream,
                        error = uiState.streamError,
                        onClose = ::stopVodPlaybackAndReturnToEpisode,
                        player = player,
                        playerView = playerView,
                        resumePositionMs = uiState.resumePositionMs,
                        onSaveProgress = viewModel::savePlaybackProgress,
                    )
                }
            }
        }
    }
}

@Composable
private fun VodCatalogView(
    viewModel: VodViewModel,
    onNavigateSideRail: () -> Unit,
    initialFocusRequester: FocusRequester,
    contentFocusNonce: Int,
    player: StablePlayer?,
    playerView: StablePlayerView?,
    lastFocusedSeriesId: String?,
    onSeriesClicked: (VodSeries) -> Unit,
    onSeriesFocused: (VodSeries) -> Unit,
    modifier: Modifier = Modifier,
    onRegisterFocusRestorer: (((() -> Unit) -> Unit))? = null,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val gridState = rememberLazyGridState()
    val coroutineScope = rememberCoroutineScope()

    val channelCirclesFirstFocusRequester = remember { FocusRequester() }
    val seriesFirstItemFocusRequester = remember { FocusRequester() }
    val seriesFocusRequesters = remember { mutableMapOf<String, FocusRequester>() }

    var focusedSeries by remember { mutableStateOf<VodSeries?>(null) }
    var focusedCircleProvider by remember { mutableStateOf<VodProvider?>(null) }
    var isAllCircleFocused by remember { mutableStateOf(false) }
    var previousDetailsVisible by remember { mutableStateOf(false) }

    // Keep focusedSeries in sync with the first item or remembered item
    LaunchedEffect(uiState.seriesList) {
        if (uiState.seriesList.isNotEmpty()) {
            if (focusedSeries == null || uiState.seriesList.none { it.id == focusedSeries?.id }) {
                val target = lastFocusedSeriesId?.let { id -> uiState.seriesList.firstOrNull { it.id == id } }
                    ?: uiState.seriesList.firstOrNull()
                focusedSeries = target
            }
        } else {
            focusedSeries = null
        }
    }

    // Restore focus when returning from Details (Requirement 9)
    LaunchedEffect(uiState.selectedSeriesDetails, uiState.isLoadingDetails) {
        val detailsVisible = uiState.selectedSeriesDetails != null || uiState.isLoadingDetails
        if (previousDetailsVisible && !detailsVisible) {
            val targetId = lastFocusedSeriesId
            val targetIndex = if (targetId != null) {
                uiState.seriesList.indexOfFirst { it.id == targetId }
            } else 0

            if (targetIndex >= 0 && uiState.seriesList.isNotEmpty()) {
                coroutineScope.launch {
                    try {
                        gridState.scrollToItem(targetIndex.coerceAtLeast(0))
                    } catch (_: Exception) {}
                    for (retryDelay in listOf(60L, 140L, 280L, 450L)) {
                        delay(retryDelay)
                        val requester = targetId?.let { seriesFocusRequesters[it] } ?: seriesFirstItemFocusRequester
                        try {
                            requester.requestFocus()
                            break
                        } catch (_: Exception) {
                            try { seriesFirstItemFocusRequester.requestFocus() } catch (_: Exception) {}
                        }
                    }
                }
            }
        }
        previousDetailsVisible = detailsVisible
    }

    fun restoreFocus() {
        val targetId = lastFocusedSeriesId
        val targetIndex = if (targetId != null) {
            uiState.seriesList.indexOfFirst { it.id == targetId }
        } else 0
        val requester = targetId?.let { seriesFocusRequesters[it] } ?: seriesFirstItemFocusRequester
        try {
            requester.requestFocus()
        } catch (_: Exception) {
            coroutineScope.launch {
                try {
                    gridState.scrollToItem(targetIndex.coerceAtLeast(0))
                } catch (_: Exception) {}
                delay(80)
                try { requester.requestFocus() } catch (_: Exception) {}
            }
        }
    }

    DisposableEffect(Unit) {
        onRegisterFocusRestorer?.invoke {
            restoreFocus()
        }
        onDispose {}
    }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0 && uiState.selectedSeriesDetails == null && !uiState.isLoadingDetails && uiState.playingEpisode == null) {
            restoreFocus()
        }
    }

    // Pagination when scrolling
    LaunchedEffect(gridState) {
        snapshotFlow {
            val total = gridState.layoutInfo.totalItemsCount
            val lastVisible = gridState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            total > 0 && lastVisible >= total - 6
        }.collect { shouldLoadMore ->
            val state = viewModel.uiState.value
            if (shouldLoadMore && state.hasMoreSeries && !state.isLoadingMoreSeries && !state.isLoadingSeries) {
                viewModel.loadMoreSeries()
            }
        }
    }

    val activeSeries = focusedSeries ?: uiState.seriesList.firstOrNull()

    val heroTitle = when {
        isAllCircleFocused -> "ספריית VOD"
        focusedCircleProvider != null -> focusedCircleProvider!!.displayName
        else -> activeSeries?.title
            ?: if (uiState.selectedProvider == null) "תוכניות VOD" else uiState.selectedProvider!!.displayName
    }

    val heroSubtitle = when {
        isAllCircleFocused -> "כל הערוצים · סדרות ותוכניות"
        focusedCircleProvider != null -> "ערוץ VOD · סדרות ותוכניות"
        else -> listOfNotNull(
            activeSeries?.provider?.displayName ?: uiState.selectedProvider?.displayName ?: "כל הערוצים",
            activeSeries?.genre?.takeIf { !it.isNullOrBlank() && it.lowercase() != "null" },
        ).joinToString(" · ")
    }

    val heroDescription = when {
        isAllCircleFocused -> "מבחר תוכניות, סדרות ופרקים מכל הערוצים המובילים בישראל: כאן 11, קשת 12, רשת 13, ערוץ 14 ו-i24NEWS"
        focusedCircleProvider != null -> when (focusedCircleProvider) {
            VodProvider.KAN11 -> "סדרות דרמה, דוקו, קומדיה ותוכניות אקטואליה מבית כאן 11"
            VodProvider.KESHET12 -> "התוכניות והסדרות המובילות של קשת 12 ו-+12 לצפייה ישירה"
            VodProvider.RESHET13 -> "תוכניות הריאליטי, התחקירים והאקטואליה של רשת 13 לצפייה ישירה"
            VodProvider.CHANNEL14 -> "תוכניות האקטואליה, הפטריוטים והמהדורות של ערוץ 14"
            VodProvider.I24NEWS -> "מהדורות החדשות, התוכניות והמגזינים של i24NEWS"
            else -> "תוכניות וסדרות לצפייה ישירה"
        }
        else -> activeSeries?.description?.trim().orEmpty()
    }

    val heroChannelLogoUrl = when {
        isAllCircleFocused -> null
        focusedCircleProvider != null -> viewModel.getProviderLogoUrl(focusedCircleProvider!!)
        else -> (activeSeries?.provider ?: uiState.selectedProvider)?.let {
            viewModel.getProviderLogoUrl(it)
        }
    }

    val genericVodArtwork = "https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?auto=format&fit=crop&w=1920&q=80"

    val backgroundImageUrl = when {
        isAllCircleFocused -> genericVodArtwork
        focusedCircleProvider != null -> {
            uiState.seriesList.firstOrNull { it.provider == focusedCircleProvider }?.imageUrl
                ?: genericVodArtwork
        }
        else -> activeSeries?.imageUrl
    }

    TvScreenLayout(
        player = player ?: StablePlayer(androidx.media3.exoplayer.ExoPlayer.Builder(LocalContext.current).build()),
        playerView = playerView ?: StablePlayerView(androidx.media3.ui.PlayerView(LocalContext.current)),
        isVideoRendering = false,
        isPlayerExpanded = false,
        backgroundImageUrl = backgroundImageUrl,
        artworkTitle = heroTitle,
        heroTitle = heroTitle,
        heroSubtitle = heroSubtitle,
        heroDescription = heroDescription,
        heroTimeRange = null,
        heroChannelLogoUrl = heroChannelLogoUrl,
        isLive = false,
        showVodBadge = true,
        isMuted = false,
        onToggleMute = {},
        onNavigateLeft = onNavigateSideRail,
        onNavigateDown = {
            isAllCircleFocused = false
            focusedCircleProvider = null
            try {
                val targetId = lastFocusedSeriesId
                val targetReq = targetId?.let { seriesFocusRequesters[it] } ?: seriesFirstItemFocusRequester
                targetReq.requestFocus()
            } catch (_: Exception) {}
        },
        // Requirement 3: Channel logo circles in top corner instead of mute icons
        actions = {
            ChannelCirclesRow(
                selectedProvider = uiState.selectedProvider,
                onSelectProvider = { provider ->
                    viewModel.selectProvider(provider)
                },
                getLogoUrl = viewModel::getProviderLogoUrl,
                onAllFocused = {
                    isAllCircleFocused = true
                    focusedCircleProvider = null
                },
                onProviderFocused = { provider ->
                    isAllCircleFocused = false
                    focusedCircleProvider = provider
                },
                onNavigateSideRail = onNavigateSideRail,
                onNavigateDown = {
                    isAllCircleFocused = false
                    focusedCircleProvider = null
                    try {
                        val targetId = lastFocusedSeriesId
                        val targetReq = targetId?.let { seriesFocusRequesters[it] } ?: seriesFirstItemFocusRequester
                        targetReq.requestFocus()
                    } catch (_: Exception) {}
                },
                firstCircleFocusRequester = channelCirclesFirstFocusRequester,
            )
        },
        heroPadding = PaddingValues(start = 32.dp, end = 32.dp, top = 32.dp),
        contentPadding = PaddingValues(start = 32.dp, end = 32.dp, bottom = 16.dp),
        spacerAfterHero = 8.dp,
        modifier = modifier,
    ) {
        // Content Slot: Grid of Series Cards
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            when {
                uiState.isLoadingSeries && uiState.seriesList.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color(0xFFE2E8F0), modifier = Modifier.size(48.dp))
                    }
                }
                uiState.seriesError != null && uiState.seriesList.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = uiState.seriesError.orEmpty(),
                            color = Color(0xFFF04438),
                            fontSize = 16.sp,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                uiState.seriesList.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "לא נמצאו תוכניות",
                            color = MutedText,
                            fontSize = 16.sp,
                            style = RtlTextStyle,
                        )
                    }
                }
                else -> {
                    LazyVerticalGrid(
                        state = gridState,
                        columns = GridCells.Fixed(5),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = PaddingValues(bottom = 32.dp, top = 4.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        itemsIndexed(
                            items = uiState.seriesList,
                            key = { _, it -> "${it.provider.id}:${it.id}" },
                            contentType = { _, _ -> "series_card" },
                        ) { index, series ->
                            val seriesKey = "${series.provider.id}:${series.id}"
                            val seriesRequester = if (index == 0) {
                                seriesFirstItemFocusRequester
                            } else {
                                remember(seriesKey) { FocusRequester() }
                            }

                            DisposableEffect(seriesKey) {
                                seriesFocusRequesters[series.id] = seriesRequester
                                onDispose {
                                    seriesFocusRequesters.remove(series.id)
                                }
                            }

                            SeriesCard(
                                series = series,
                                focusRequester = seriesRequester,
                                onFocused = {
                                    isAllCircleFocused = false
                                    focusedCircleProvider = null
                                    focusedSeries = series
                                    onSeriesFocused(series)
                                },
                                onClick = {
                                    onSeriesClicked(series)
                                },
                                onNavigateLeft = if (index % 5 == 0) onNavigateSideRail else null,
                                onNavigateUp = if (index < 5) {
                                    {
                                        try {
                                            channelCirclesFirstFocusRequester.requestFocus()
                                        } catch (_: Exception) {}
                                    }
                                } else null,
                            )
                        }

                        if (uiState.isLoadingMoreSeries) {
                            item(span = { GridItemSpan(5) }) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(24.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(color = Color(0xFFE2E8F0), modifier = Modifier.size(36.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Requirement 3 & 4: Channel logo icons in circles at the top corner.
 * Clicking on a circle filters to that channel, or clicking "הכל" filters to all channels.
 */
@Composable
private fun ChannelCirclesRow(
    selectedProvider: VodProvider?,
    onSelectProvider: (VodProvider?) -> Unit,
    getLogoUrl: (VodProvider) -> String,
    onAllFocused: () -> Unit,
    onProviderFocused: (VodProvider) -> Unit,
    onNavigateSideRail: () -> Unit,
    onNavigateDown: () -> Unit,
    firstCircleFocusRequester: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val providers = listOf(
        VodProvider.KAN11,
        VodProvider.KESHET12,
        VodProvider.RESHET13,
        VodProvider.CHANNEL14,
        VodProvider.I24NEWS,
    )

    val circleRequesters = remember { providers.associateWith { FocusRequester() } }

    val circleSize = 56.dp

    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier.padding(vertical = 4.dp),
    ) {
        // "הכל" (All Channels) Circle
        val isAllSelected = (selectedProvider == null)
        val allInteractionSource = remember { MutableInteractionSource() }
        val isAllFocused by allInteractionSource.collectIsFocusedAsState()

        LaunchedEffect(isAllFocused) {
            if (isAllFocused) {
                onAllFocused()
            }
        }

        val allBg = when {
            isAllFocused -> FocusedCardBg
            isAllSelected -> Color(0x3325D4DE)
            else -> Color(0x3317181B)
        }
        val allBorder = when {
            isAllFocused -> BorderStroke(3.dp, Color.White)
            isAllSelected -> BorderStroke(2.5.dp, AccentColor)
            else -> BorderStroke(1.5.dp, Color(0x33FFFFFF))
        }

        Box(
            modifier = Modifier
                .size(circleSize)
                .clip(CircleShape)
                .background(allBg)
                .border(allBorder, CircleShape)
                .tvFocusableClickable(
                    onClick = { onSelectProvider(null) },
                    interactionSource = allInteractionSource,
                    focusRequester = firstCircleFocusRequester,
                    onNavigateLeft = onNavigateSideRail,
                    onNavigateDown = onNavigateDown,
                    onNavigateRight = {
                        try {
                            circleRequesters[providers.first()]?.requestFocus()
                        } catch (_: Exception) {}
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "הכל",
                color = if (isAllFocused) FocusedCardContent else Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        // Provider Channel Circles
        providers.forEachIndexed { index, provider ->
            val isSelected = (selectedProvider == provider)
            val interactionSource = remember { MutableInteractionSource() }
            val isFocused by interactionSource.collectIsFocusedAsState()
            val requester = circleRequesters[provider] ?: remember { FocusRequester() }

            LaunchedEffect(isFocused, provider) {
                if (isFocused) {
                    onProviderFocused(provider)
                }
            }

            val bg = when {
                isFocused -> FocusedCardBg
                isSelected -> Color(0x3325D4DE)
                else -> Color(0xFF17181B)
            }
            val border = when {
                isFocused -> BorderStroke(3.dp, Color.White)
                isSelected -> BorderStroke(2.5.dp, AccentColor)
                else -> BorderStroke(1.5.dp, Color(0x33FFFFFF))
            }

            Box(
                modifier = Modifier
                    .size(circleSize)
                    .clip(CircleShape)
                    .background(bg)
                    .border(border, CircleShape)
                    .tvFocusableClickable(
                        onClick = {
                            if (isSelected) {
                                onSelectProvider(null) // Toggle back to all
                            } else {
                                onSelectProvider(provider)
                            }
                        },
                        interactionSource = interactionSource,
                        focusRequester = requester,
                        onNavigateLeft = {
                            if (index == 0) {
                                try { firstCircleFocusRequester.requestFocus() } catch (_: Exception) {}
                            } else {
                                val prev = providers[index - 1]
                                try { circleRequesters[prev]?.requestFocus() } catch (_: Exception) {}
                            }
                        },
                        onNavigateRight = if (index < providers.size - 1) {
                            {
                                val next = providers[index + 1]
                                try { circleRequesters[next]?.requestFocus() } catch (_: Exception) {}
                            }
                        } else null,
                        onNavigateDown = onNavigateDown,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = getLogoUrl(provider),
                    contentDescription = provider.displayName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(CircleShape),
                )
            }
        }
    }
}

/**
 * TV Series Card for VOD Grid.
 */
@Composable
private fun SeriesCard(
    series: VodSeries,
    focusRequester: FocusRequester?,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val context = LocalContext.current
    val imageRequest = remember(series.imageUrl) {
        if (series.imageUrl.isNullOrBlank()) null
        else {
            ImageRequest.Builder(context)
                .data(series.imageUrl)
                .size(380, 214)
                .crossfade(false)
                .build()
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(205.dp)
            .clip(SeriesCardShape)
            .background(CardBg)
            .then(if (isFocused) FocusedSeriesBorderModifier else Modifier)
            .onFocusChanged {
                if (it.isFocused) onFocused()
            }
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateUp = onNavigateUp,
            ),
    ) {
        if (imageRequest != null) {
            AsyncImage(
                model = imageRequest,
                contentDescription = series.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF1B2230)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Movie,
                    contentDescription = null,
                    tint = Color(0x44FFFFFF),
                    modifier = Modifier.size(36.dp),
                )
            }
        }

        // Bottom gradient for title readability
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(110.dp)
                .background(SeriesCardGradient),
        )

        // Episode count badge
        if (series.episodeCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xCC080A0E))
                    .padding(horizontal = 7.dp, vertical = 3.dp),
            ) {
                Text(
                    text = "${series.episodeCount} פרקים",
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }

        // Series details at bottom of card
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            // Provider pill
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xCC080A0E))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Text(
                    text = series.provider.displayName,
                    color = Color(0xFFD0D5DD),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            // Series Title
            Text(
                text = series.title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
        }
    }
}
