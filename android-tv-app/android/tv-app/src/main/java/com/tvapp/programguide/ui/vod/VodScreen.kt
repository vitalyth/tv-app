package com.tvapp.programguide.ui.vod

import android.os.SystemClock
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.VodProvider
import com.tvapp.programguide.data.VodSeries
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import com.tvapp.programguide.ui.StablePlayer
import com.tvapp.programguide.ui.StablePlayerView
import com.tvapp.programguide.ui.VodViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Delicate program-grid aligned color palette
private val DarkBg = Color(0xFF080A0C)
private val CardBg = Color(0xFF17181B)
private val FocusedCardBg = Color(0xFFF2F4F7)
private val FocusedCardContent = Color(0xFF0A0E14)
private val MutedText = Color(0xFF8E95A2)
private val SelectedFilterBg = Color(0xFF262932)
private val SelectedProviderAccent = Color(0xFF10D5D9)

enum class VodFocusZone {
    PROVIDER,
    CATEGORY,
    SERIES,
}

private class FocusKeyRef(var key: String? = null)

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
    playerView: StablePlayerView? = null,
    onRegisterFocusRestorer: (((() -> Unit) -> Unit))? = null,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isCatalogActive = uiState.selectedSeriesDetails == null && !uiState.isLoadingDetails && uiState.playingEpisode == null
    var lastFocusedProvider by remember { mutableStateOf(uiState.selectedProvider) }
    val lastFocusedSeriesRef = remember { FocusKeyRef() }
    var suppressDetailsBackCloseUntil by remember { mutableLongStateOf(0L) }
    var catalogFocusRestorer by remember { mutableStateOf<(() -> Unit)?>(null) }
    var detailsFocusRestorer by remember { mutableStateOf<(() -> Unit)?>(null) }
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

    LaunchedEffect(Unit) {
        lastFocusedProvider = uiState.selectedProvider
        lastFocusedSeriesRef.key = null
        if (uiState.seriesList.isEmpty() && !uiState.isLoadingSeries) {
            viewModel.loadInitialSeries(uiState.selectedProvider)
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
                .background(DarkBg)
        ) {
            UnifiedVodCatalogView(
                viewModel = viewModel,
                onNavigateSideRail = onNavigateSideRail,
                initialFocusRequester = initialFocusRequester,
                contentFocusNonce = contentFocusNonce,
                focusedProvider = lastFocusedProvider,
                lastFocusedSeriesRef = lastFocusedSeriesRef,
                modifier = Modifier.focusProperties { canFocus = isCatalogActive },
                onProviderFocused = { provider ->
                    if (isCatalogActive && lastFocusedProvider != provider) {
                        lastFocusedProvider = provider
                        lastFocusedSeriesRef.key = null
                    }
                },
                onSeriesFocused = { lastFocusedSeriesRef.key = "${it.provider.id}:${it.id}" },
                onRegisterFocusRestorer = { catalogFocusRestorer = it },
            )

            // Details Modal / Sheet
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
                    isPlayerActive = uiState.playingEpisode != null,
                    onSeasonSelected = viewModel::selectSeason,
                    onPlayEpisode = viewModel::playEpisode,
                    onClose = viewModel::closeSeriesDetails,
                    onNavigateSideRail = onNavigateSideRail,
                    contentFocusNonce = contentFocusNonce,
                    onRegisterFocusRestorer = { detailsFocusRestorer = it },
                )
            }

            // Active VOD Player Overlay (rendered directly to prevent alpha-layer washing out)
            if (uiState.playingEpisode != null && player != null && playerView != null) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .zIndex(30f)
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
                    )
                }
            }
        }
    }
}

@Composable
private fun UnifiedVodCatalogView(
    viewModel: VodViewModel,
    onNavigateSideRail: () -> Unit,
    initialFocusRequester: FocusRequester,
    contentFocusNonce: Int,
    focusedProvider: VodProvider,
    lastFocusedSeriesRef: FocusKeyRef,
    modifier: Modifier = Modifier,
    onProviderFocused: (VodProvider) -> Unit,
    onSeriesFocused: (VodSeries) -> Unit,
    onRegisterFocusRestorer: (((() -> Unit) -> Unit))? = null,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val providers = listOf(
        VodProvider.KAN11,
        VodProvider.KESHET12,
        VodProvider.RESHET13,
        VodProvider.CHANNEL14,
        VodProvider.I24NEWS,
    )
    val gridState = rememberLazyGridState()
    val coroutineScope = rememberCoroutineScope()
    val providerFocusRequesters = remember { providers.associateWith { FocusRequester() } }
    val allCategoryFocusRequester = remember { FocusRequester() }
    var previousDetailsVisible by remember { mutableStateOf(false) }
    val seriesFirstItemFocusRequester = remember { FocusRequester() }
    val seriesFocusRequesters = remember { mutableMapOf<String, FocusRequester>() }
    val lastFocusedZoneRef = remember { object { var zone = VodFocusZone.SERIES } }

    fun restoreContentFocus() {
        when (lastFocusedZoneRef.zone) {
            VodFocusZone.SERIES -> {
                val key = lastFocusedSeriesRef.key
                val target = key?.let { seriesFocusRequesters[it] } ?: seriesFirstItemFocusRequester
                try {
                    target.requestFocus()
                    return
                } catch (_: Exception) {}
                try {
                    seriesFirstItemFocusRequester.requestFocus()
                    return
                } catch (_: Exception) {}
                val fallbackReq = if (focusedProvider == providers.first()) initialFocusRequester else providerFocusRequesters[focusedProvider]
                try { fallbackReq?.requestFocus() } catch (_: Exception) {}
            }
            VodFocusZone.CATEGORY -> {
                try {
                    allCategoryFocusRequester.requestFocus()
                    return
                } catch (_: Exception) {}
                val fallbackReq = if (focusedProvider == providers.first()) initialFocusRequester else providerFocusRequesters[focusedProvider]
                try { fallbackReq?.requestFocus() } catch (_: Exception) {}
            }
            VodFocusZone.PROVIDER -> {
                val req = if (focusedProvider == providers.first()) initialFocusRequester else providerFocusRequesters[focusedProvider]
                try { req?.requestFocus() } catch (_: Exception) {}
            }
        }
    }

    DisposableEffect(Unit) {
        onRegisterFocusRestorer?.invoke {
            restoreContentFocus()
        }
        onDispose {}
    }

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

    fun requestSeriesFocus(preferredSeriesKey: String? = lastFocusedSeriesRef.key) {
        if (uiState.seriesList.isEmpty()) return
        val key = preferredSeriesKey ?: uiState.seriesList.firstOrNull()?.let { "${it.provider.id}:${it.id}" }
        val target = key?.let { seriesFocusRequesters[it] } ?: seriesFirstItemFocusRequester
        try {
            target.requestFocus()
            return
        } catch (_: Exception) {}

        val targetIndex = key?.let { k ->
            uiState.seriesList.indexOfFirst { "${it.provider.id}:${it.id}" == k }
        }?.coerceAtLeast(0) ?: 0
        coroutineScope.launch {
            if (targetIndex > 0) {
                try {
                    gridState.scrollToItem((targetIndex - 5).coerceAtLeast(0))
                } catch (_: Exception) {}
            }
            try {
                target.requestFocus()
            } catch (_: Exception) {
                try {
                    seriesFirstItemFocusRequester.requestFocus()
                } catch (_: Exception) {}
            }
        }
    }

    fun requestProviderFocus(provider: VodProvider = focusedProvider) {
        val requester = if (provider == providers.first()) {
            initialFocusRequester
        } else {
            providerFocusRequesters[provider]
        }
        try {
            requester?.requestFocus()
        } catch (_: Exception) {
            coroutineScope.launch {
                try {
                    requester?.requestFocus()
                } catch (_: Exception) {}
            }
        }
    }

    fun requestCategoryFocus() {
        try {
            allCategoryFocusRequester.requestFocus()
        } catch (_: Exception) {
            coroutineScope.launch {
                try {
                    allCategoryFocusRequester.requestFocus()
                } catch (_: Exception) {
                    requestSeriesFocus()
                }
            }
        }
    }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0 && uiState.selectedSeriesDetails == null && !uiState.isLoadingDetails && uiState.playingEpisode == null) {
            restoreContentFocus()
        }
    }

    LaunchedEffect(uiState.selectedSeriesDetails, uiState.isLoadingDetails) {
        val detailsVisible = uiState.selectedSeriesDetails != null || uiState.isLoadingDetails
        if (previousDetailsVisible && !detailsVisible) {
            requestSeriesFocus()
        }
        previousDetailsVisible = detailsVisible
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = 18.dp, start = 24.dp, end = 24.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp, vertical = 6.dp),
        ) {
            providers.forEachIndexed { index, provider ->
                ProviderTab(
                    provider = provider,
                    logoUrl = viewModel.getProviderLogoUrl(provider),
                    isSelected = uiState.selectedProvider == provider,
                    focusRequester = if (provider == providers.first()) {
                        initialFocusRequester
                    } else {
                        providerFocusRequesters[provider]
                    },
                    onFocused = {
                        lastFocusedZoneRef.zone = VodFocusZone.PROVIDER
                        onProviderFocused(provider)
                    },
                    onClick = {
                        lastFocusedZoneRef.zone = VodFocusZone.PROVIDER
                        onProviderFocused(provider)
                        viewModel.selectProvider(provider)
                    },
                    onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                    onNavigateDown = {
                        if (uiState.categories.isNotEmpty()) {
                            requestCategoryFocus()
                        } else {
                            requestSeriesFocus()
                        }
                    },
                )
            }
        }

        if (uiState.categories.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(horizontal = 2.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 12.dp),
            ) {
                item {
                    CategoryFilterChip(
                        name = "הכל",
                        isSelected = uiState.selectedCategory == null,
                        onClick = { viewModel.selectCategory(null) },
                        focusRequester = allCategoryFocusRequester,
                        onFocused = { lastFocusedZoneRef.zone = VodFocusZone.CATEGORY },
                        onNavigateUp = { requestProviderFocus() },
                        onNavigateLeft = onNavigateSideRail,
                        onNavigateDown = { requestSeriesFocus() },
                    )
                }

                items(uiState.categories) { category ->
                    CategoryFilterChip(
                        name = category,
                        isSelected = uiState.selectedCategory == category,
                        onClick = { viewModel.selectCategory(category) },
                        onFocused = { lastFocusedZoneRef.zone = VodFocusZone.CATEGORY },
                        onNavigateUp = { requestProviderFocus() },
                        onNavigateDown = { requestSeriesFocus() },
                    )
                }
            }
        } else {
            Spacer(modifier = Modifier.height(12.dp))
        }

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
                            text = "לא נמצאו תוכניות בקטגוריה זו",
                            color = MutedText,
                            fontSize = 16.sp,
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
                            val seriesRequester = if (index == 0) seriesFirstItemFocusRequester else remember(seriesKey) { FocusRequester() }
                            DisposableEffect(seriesKey) {
                                seriesFocusRequesters[seriesKey] = seriesRequester
                                onDispose {
                                    seriesFocusRequesters.remove(seriesKey)
                                }
                            }
                            SeriesCard(
                                series = series,
                                focusRequester = seriesRequester,
                                onFocused = {
                                    lastFocusedZoneRef.zone = VodFocusZone.SERIES
                                    onSeriesFocused(series)
                                },
                                onClick = {
                                    lastFocusedZoneRef.zone = VodFocusZone.SERIES
                                    onSeriesFocused(series)
                                    viewModel.openSeriesDetails(series)
                                },
                                onNavigateLeft = if (index % 5 == 0) onNavigateSideRail else null,
                                onNavigateUp = if (index < 5) {
                                    {
                                        if (uiState.categories.isNotEmpty()) {
                                            requestCategoryFocus()
                                        } else {
                                            requestProviderFocus()
                                        }
                                    }
                                } else null,
                            )
                        }

                        if (uiState.isLoadingMoreSeries) {
                            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(5) }) {
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

@Composable
private fun ProviderTab(
    provider: VodProvider,
    logoUrl: String,
    isSelected: Boolean,
    focusRequester: FocusRequester?,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
    onNavigateDown: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val active = isFocused || isSelected

    val tabBg = when {
        isFocused -> FocusedCardBg
        isSelected -> Color(0x1410D5D9)
        else -> Color.Transparent
    }
    val labelColor = when {
        isFocused -> FocusedCardContent
        isSelected -> Color.White
        else -> MutedText
    }
    val underlineColor = if (isSelected) SelectedProviderAccent else Color.Transparent
    val logoBg = if (active) Color(0xFF20232A) else Color(0xFF121419)

    Column(
        modifier = Modifier
            .width(128.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(tabBg)
            .onFocusChanged {
                if (it.isFocused) onFocused()
            }
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateDown = onNavigateDown,
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(logoBg),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = logoUrl,
                    contentDescription = provider.displayName,
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(6.dp)),
                    contentScale = ContentScale.Fit,
                )
            }

            Text(
                text = provider.displayName,
                color = labelColor,
                fontSize = 13.sp,
                fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Start,
                modifier = Modifier.weight(1f),
            )
        }

        Box(
            modifier = Modifier
                .padding(top = 8.dp)
                .fillMaxWidth()
                .height(if (isSelected) 4.dp else 2.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(underlineColor),
        )
    }
}

/**
 * TV Series Card
 */
@Composable
private fun SeriesCard(
    series: VodSeries,
    focusRequester: FocusRequester?,
    onFocused: () -> Unit,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
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
        modifier = Modifier
            .fillMaxWidth()
            .height(214.dp)
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

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(112.dp)
                .background(SeriesCardGradient),
        )

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

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(10.dp),
        ) {
            Text(
                text = series.title,
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )

            if (series.description.isNotBlank()) {
                Text(
                    text = series.description,
                    color = Color(0xFFD0D5DD),
                    fontSize = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                    style = RtlTextStyle,
                )
            }
        }
    }
}

@Composable
private fun CategoryFilterChip(
    name: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    focusRequester: FocusRequester? = null,
    onFocused: (() -> Unit)? = null,
    onNavigateLeft: (() -> Unit)? = null,
    onNavigateUp: (() -> Unit)? = null,
    onNavigateDown: (() -> Unit)? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val targetBg = when {
        isFocused -> FocusedCardBg
        isSelected -> SelectedFilterBg
        else -> Color.Transparent
    }
    val targetFg = when {
        isFocused -> FocusedCardContent
        isSelected -> Color.White
        else -> MutedText
    }

    val bg = targetBg
    val fg = targetFg

    Box(
        modifier = Modifier
            .clip(SeriesCardShape)
            .background(bg)
            .onFocusChanged {
                if (it.isFocused) onFocused?.invoke()
            }
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateUp = onNavigateUp,
                onNavigateDown = onNavigateDown,
            )
            .padding(horizontal = 14.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name,
            color = fg,
            fontSize = 13.sp,
            fontWeight = if (isSelected || isFocused) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}
