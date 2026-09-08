package com.tvapp.programguide.ui.vod

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.VodNavLevel
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

@Composable
fun VodScreen(
    viewModel: VodViewModel,
    onNavigateSideRail: () -> Unit,
    modifier: Modifier = Modifier,
    initialFocusRequester: FocusRequester = remember { FocusRequester() },
    contentFocusNonce: Int = 0,
    player: StablePlayer? = null,
    playerView: StablePlayerView? = null,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var lastFocusedProvider by remember { mutableStateOf(VodProvider.KAN11) }
    var lastFocusedSeriesKey by remember { mutableStateOf<String?>(null) }

    // Back button handling across the whole hierarchy
    BackHandler {
        when {
            uiState.playingEpisode != null -> viewModel.stopVodPlayback()
            uiState.selectedSeriesDetails != null || uiState.isLoadingDetails -> viewModel.closeSeriesDetails()
            uiState.navLevel == VodNavLevel.SERIES_LIST -> viewModel.backToChannelsHub()
            else -> onNavigateSideRail()
        }
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(DarkBg)
        ) {
            when (uiState.navLevel) {
                VodNavLevel.CHANNELS_HUB -> {
                    ChannelsHubView(
                        viewModel = viewModel,
                        onNavigateSideRail = onNavigateSideRail,
                        initialFocusRequester = initialFocusRequester,
                        focusedProvider = lastFocusedProvider,
                        onProviderFocused = { lastFocusedProvider = it },
                        onProviderSelected = {
                            lastFocusedProvider = it
                            lastFocusedSeriesKey = null
                            viewModel.openChannel(it)
                        },
                    )
                }
                VodNavLevel.SERIES_LIST -> {
                    SeriesCatalogView(
                        viewModel = viewModel,
                        onBackToChannels = viewModel::backToChannelsHub,
                        onNavigateSideRail = onNavigateSideRail,
                        initialFocusRequester = initialFocusRequester,
                        focusedSeriesKey = lastFocusedSeriesKey,
                        onSeriesFocused = { lastFocusedSeriesKey = "${it.provider.id}:${it.id}" },
                    )
                }
            }

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
                        onClose = viewModel::stopVodPlayback,
                        player = player,
                        playerView = playerView,
                    )
                }
            }
        }
    }
}

/**
 * Screen 1: Main VOD Hub showing ONLY the 5 channels (Kan 11, Keshet 12, Reshet 13, Channel 14, i24NEWS)
 */
@Composable
private fun ChannelsHubView(
    viewModel: VodViewModel,
    onNavigateSideRail: () -> Unit,
    initialFocusRequester: FocusRequester,
    focusedProvider: VodProvider,
    onProviderFocused: (VodProvider) -> Unit,
    onProviderSelected: (VodProvider) -> Unit,
) {
    val providers = listOf(
        VodProvider.KAN11,
        VodProvider.KESHET12,
        VodProvider.RESHET13,
        VodProvider.CHANNEL14,
        VodProvider.I24NEWS,
    )
    val providerFocusRequesters = remember {
        providers.associateWith { FocusRequester() }
    }

    LaunchedEffect(focusedProvider) {
        delay(24)
        try {
            val requester = if (focusedProvider == providers.first()) {
                initialFocusRequester
            } else {
                providerFocusRequesters[focusedProvider]
            }
            requester?.requestFocus()
        } catch (_: Exception) {}
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 28.dp, start = 28.dp, end = 28.dp),
    ) {
        // Header
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF171920)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Movie,
                    contentDescription = null,
                    tint = Color(0xFFD0D5DD),
                    modifier = Modifier.size(20.dp),
                )
            }

            Column {
                Text(
                    text = "ספריית VOD",
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "בחר ערוץ לצפייה בסדרות ובתוכניות",
                    color = MutedText,
                    fontSize = 13.sp,
                )
            }
        }

        Spacer(modifier = Modifier.height(36.dp))

        // 5 Channels Grid (TV Cards)
        LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            horizontalArrangement = Arrangement.spacedBy(18.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            contentPadding = PaddingValues(vertical = 12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            itemsIndexed(providers) { index, provider ->
                ChannelHubCard(
                    provider = provider,
                    logoUrl = viewModel.getProviderLogoUrl(provider),
                    initialFocusRequester = if (provider == providers.first()) {
                        initialFocusRequester
                    } else {
                        providerFocusRequesters[provider]
                    },
                    onClick = { onProviderSelected(provider) },
                    onFocused = { onProviderFocused(provider) },
                    onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                )
            }
        }
    }
}

/**
 * TV Focusable Card for a VOD Channel
 */
@Composable
private fun ChannelHubCard(
    provider: VodProvider,
    logoUrl: String,
    initialFocusRequester: FocusRequester?,
    onClick: () -> Unit,
    onFocused: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val cardShape = RoundedCornerShape(8.dp)

    val bgColor by animateColorAsState(
        targetValue = if (isFocused) FocusedCardBg else CardBg,
        animationSpec = tween(150),
        label = "card_bg",
    )
    val contentColor by animateColorAsState(
        targetValue = if (isFocused) FocusedCardContent else Color.White,
        animationSpec = tween(150),
        label = "card_fg",
    )
    val promptColor by animateColorAsState(
        targetValue = if (isFocused) Color(0xFF344054) else MutedText,
        animationSpec = tween(150),
        label = "card_prompt",
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .scale(if (isFocused) 1.02f else 1f)
            .clip(cardShape)
            .background(bgColor)
            .onFocusChanged {
                if (it.isFocused) onFocused()
            }
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = initialFocusRequester,
                onNavigateLeft = onNavigateLeft,
            )
            .padding(14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxSize(),
        ) {
            // Top: Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isFocused) Color(0xFFE2E6EC) else Color(0xFF262832)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = provider.channelNumber,
                        color = if (isFocused) Color(0xFF0A0E14) else Color.White,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Text(
                    text = "VOD",
                    color = if (isFocused) Color(0xFF475467) else MutedText,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            }

            // Center: Channel Logo
            Box(
                modifier = Modifier
                    .size(86.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isFocused) Color(0x0D000000) else Color(0x14FFFFFF))
                    .padding(8.dp),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = logoUrl,
                    contentDescription = provider.displayName,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            }

            // Bottom: Channel Name & Prompt
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = provider.displayName,
                    color = contentColor,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = if (isFocused) "לחץ לכניסה" else "ספריית תוכניות",
                    color = promptColor,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

/**
 * Screen 2: Series Catalog for the Selected Channel
 */
@Composable
private fun SeriesCatalogView(
    viewModel: VodViewModel,
    onBackToChannels: () -> Unit,
    onNavigateSideRail: () -> Unit,
    initialFocusRequester: FocusRequester,
    focusedSeriesKey: String?,
    onSeriesFocused: (VodSeries) -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val provider = uiState.selectedProvider
    val gridState = rememberLazyGridState()
    val coroutineScope = rememberCoroutineScope()
    val backFocusRequester = remember { FocusRequester() }
    var previousDetailsVisible by remember { mutableStateOf(false) }
    val seriesFocusRequesters = remember(uiState.seriesList) {
        uiState.seriesList.associate { "${it.provider.id}:${it.id}" to FocusRequester() }
    }
    val preferredSeriesKey = focusedSeriesKey
        ?.takeIf { key -> uiState.seriesList.any { "${it.provider.id}:${it.id}" == key } }
        ?: uiState.seriesList.firstOrNull()?.let { "${it.provider.id}:${it.id}" }

    fun requestSeriesFocus(seriesKey: String? = preferredSeriesKey) {
        if (seriesKey == null || uiState.seriesList.isEmpty()) return
        val targetIndex = uiState.seriesList.indexOfFirst { "${it.provider.id}:${it.id}" == seriesKey }
        if (targetIndex < 0) return
        coroutineScope.launch {
            try {
                gridState.animateScrollToItem(targetIndex)
            } catch (_: Exception) {}
            delay(24)
            try {
                val requester = if (seriesKey == preferredSeriesKey) {
                    initialFocusRequester
                } else {
                    seriesFocusRequesters[seriesKey]
                }
                requester?.requestFocus()
            } catch (_: Exception) {
                try {
                    backFocusRequester.requestFocus()
                } catch (_: Exception) {}
            }
        }
    }

    LaunchedEffect(uiState.isLoadingSeries, uiState.seriesList.size, provider) {
        if (!uiState.isLoadingSeries && uiState.seriesList.isNotEmpty() && uiState.selectedSeriesDetails == null && !uiState.isLoadingDetails) {
            requestSeriesFocus()
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
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 20.dp, start = 24.dp, end = 24.dp),
    ) {
        // Top Bar: Back Button, Channel Title, and Category Pills
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // Left: Back to Channels button + Channel Logo/Title
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                BackButton(
                    onClick = onBackToChannels,
                    focusRequester = backFocusRequester,
                    onNavigateLeft = onNavigateSideRail,
                )

                AsyncImage(
                    model = viewModel.getProviderLogoUrl(provider),
                    contentDescription = null,
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Fit,
                )

                Text(
                    text = "${provider.displayName} - תוכניות וסדרות",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Categories Filter Chips
        if (uiState.categories.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(horizontal = 2.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 14.dp),
            ) {
                item {
                    CategoryFilterChip(
                        name = "הכל",
                        isSelected = uiState.selectedCategory == null,
                        onClick = { viewModel.selectCategory(null) },
                    )
                }

                items(uiState.categories) { category ->
                    CategoryFilterChip(
                        name = category,
                        isSelected = uiState.selectedCategory == category,
                        onClick = { viewModel.selectCategory(category) },
                    )
                }
            }
        }

        // Series 5-Column Grid
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
                        itemsIndexed(uiState.seriesList, key = { _, it -> "${it.provider.id}:${it.id}" }) { index, series ->
                            if (index >= uiState.seriesList.size - 10 && uiState.hasMoreSeries && !uiState.isLoadingMoreSeries) {
                                LaunchedEffect(index) {
                                    viewModel.loadMoreSeries()
                                }
                            }

                            SeriesCard(
                                series = series,
                                focusRequester = if ("${series.provider.id}:${series.id}" == preferredSeriesKey) {
                                    initialFocusRequester
                                } else {
                                    seriesFocusRequesters["${series.provider.id}:${series.id}"]
                                },
                                onFocused = { onSeriesFocused(series) },
                                onClick = {
                                    onSeriesFocused(series)
                                    viewModel.openSeriesDetails(series)
                                },
                                onNavigateLeft = if (index % 5 == 0) onNavigateSideRail else null,
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

/**
 * TV Back Button to return from series catalog to the 5 channels
 */
@Composable
private fun BackButton(
    onClick: () -> Unit,
    focusRequester: FocusRequester,
    onNavigateLeft: (() -> Unit)?,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val shape = RoundedCornerShape(8.dp)

    val bg by animateColorAsState(if (isFocused) FocusedCardBg else Color(0xFF171920), label = "back_btn_bg")
    val contentColor by animateColorAsState(if (isFocused) FocusedCardContent else Color(0xFFE2E8F0), label = "back_btn_fg")

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .clip(shape)
            .background(bg)
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
            )
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = null,
            tint = contentColor,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = "חזרה לערוצים",
            color = contentColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
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
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val cardShape = RoundedCornerShape(8.dp)

    val bg by animateColorAsState(if (isFocused) FocusedCardBg else CardBg, label = "series_card_bg")
    val titleColor by animateColorAsState(if (isFocused) FocusedCardContent else Color.White, label = "series_card_title")
    val descColor by animateColorAsState(if (isFocused) Color(0xFF344054) else MutedText, label = "series_card_desc")

    val context = LocalContext.current
    val imageRequest = remember(series.imageUrl) {
        if (series.imageUrl.isNullOrBlank()) null
        else {
            ImageRequest.Builder(context)
                .data(series.imageUrl)
                .size(440, 260)
                .crossfade(false)
                .build()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .scale(if (isFocused) 1.02f else 1f)
            .clip(cardShape)
            .background(bg)
            .onFocusChanged {
                if (it.isFocused) onFocused()
            }
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
            ),
    ) {
        // Thumbnail
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(130.dp)
                .background(Color(0xFF1B2230)),
        ) {
            if (imageRequest != null) {
                AsyncImage(
                    model = imageRequest,
                    contentDescription = series.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.Movie,
                        contentDescription = null,
                        tint = Color(0x44FFFFFF),
                        modifier = Modifier.size(36.dp),
                    )
                }
            }

            // Episode Count Badge
            if (series.episodeCount > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(6.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xCC080A0E))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = "${series.episodeCount} פרקים",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        // Title and description
        Column(modifier = Modifier.padding(10.dp)) {
            Text(
                text = series.title,
                color = titleColor,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
            )

            if (series.description.isNotBlank()) {
                Text(
                    text = series.description,
                    color = descColor,
                    fontSize = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                    style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
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

    val bg by animateColorAsState(targetBg, label = "chip_bg")
    val fg by animateColorAsState(targetFg, label = "chip_fg")

    val shape = RoundedCornerShape(8.dp)

    Box(
        modifier = Modifier
            .clip(shape)
            .background(bg)
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
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
