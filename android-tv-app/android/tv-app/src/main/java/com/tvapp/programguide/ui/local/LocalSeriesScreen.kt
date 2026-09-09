package com.tvapp.programguide.ui.local

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CollectionsBookmark
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.LocalEpisode
import com.tvapp.programguide.data.LocalSeries
import com.tvapp.programguide.ui.LocalSeriesViewModel
import com.tvapp.programguide.ui.vod.tvFocusableClickable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val LocalBg = Color(0xFF080A0C)
private val CardBg = Color(0xFF17181B)
private val FocusedBg = Color(0xFFF2F4F7)
private val FocusedContent = Color(0xFF0A0E14)
private val MutedText = Color(0xFF8E95A2)
private val Accent = Color(0xFF10D5D9)
private val RtlTextStyle = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl)

@Composable
fun LocalSeriesScreen(
    viewModel: LocalSeriesViewModel,
    onNavigateSideRail: () -> Unit,
    modifier: Modifier = Modifier,
    initialFocusRequester: FocusRequester = remember { FocusRequester() },
    contentFocusNonce: Int = 0,
    onRegisterFocusRestorer: (((() -> Unit) -> Unit))? = null,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val gridState = rememberLazyGridState()
    val coroutineScope = rememberCoroutineScope()
    val firstSeriesFocusRequester = remember { FocusRequester() }
    val backFocusRequester = remember { FocusRequester() }
    val firstEpisodeFocusRequester = remember { FocusRequester() }
    val seriesFocusRequesters = remember { mutableMapOf<String, FocusRequester>() }
    var focusedSeriesId by remember { mutableStateOf<String?>(null) }

    fun requestCatalogFocus(seriesId: String? = focusedSeriesId) {
        val target = seriesId?.let { seriesFocusRequesters[it] } ?: firstSeriesFocusRequester
        try {
            target.requestFocus()
        } catch (_: Exception) {
            try {
                firstSeriesFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    fun closeSeriesAndRestoreCatalogFocus() {
        val targetSeriesId = focusedSeriesId ?: uiState.selectedSeries?.id
        viewModel.closeSeries()
        coroutineScope.launch {
            delay(140)
            val targetIndex = uiState.series.indexOfFirst { it.id == targetSeriesId }
            if (targetIndex >= 0) {
                try {
                    gridState.scrollToItem(targetIndex)
                } catch (_: Exception) {}
                delay(80)
            }
            requestCatalogFocus(targetSeriesId)
            delay(120)
            requestCatalogFocus(targetSeriesId)
        }
    }

    fun requestEpisodeFocus() {
        try {
            firstEpisodeFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    val latestRestorer by rememberUpdatedState<() -> Unit>({
        if (uiState.selectedSeries == null) requestCatalogFocus() else requestEpisodeFocus()
    })

    DisposableEffect(Unit) {
        onRegisterFocusRestorer?.invoke { latestRestorer() }
        onDispose {}
    }

    BackHandler {
        when {
            uiState.playingEpisode != null -> viewModel.stopPlayback()
            uiState.selectedSeries != null -> closeSeriesAndRestoreCatalogFocus()
            else -> onNavigateSideRail()
        }
    }

    LaunchedEffect(uiState.series.size, uiState.selectedSeries?.id) {
        delay(120)
        if (uiState.selectedSeries == null) requestCatalogFocus() else requestEpisodeFocus()
    }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0) latestRestorer()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(LocalBg),
    ) {
        when {
            uiState.selectedSeries != null -> {
                LocalSeriesDetails(
                    series = uiState.selectedSeries!!,
                    backFocusRequester = backFocusRequester,
                    firstEpisodeFocusRequester = firstEpisodeFocusRequester,
                    onClose = ::closeSeriesAndRestoreCatalogFocus,
                    onPlayEpisode = { episode -> viewModel.playEpisode(uiState.selectedSeries!!, episode) },
                    onNavigateSideRail = onNavigateSideRail,
                )
            }

            uiState.isLoading && uiState.series.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            }

            uiState.error != null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(uiState.error ?: "שגיאה בטעינה", color = Color(0xFFF04438), fontSize = 16.sp)
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 24.dp, end = 24.dp, top = 22.dp),
                ) {
                    LocalSeriesHeader(
                        total = uiState.total,
                        isLoading = uiState.isLoadingMore,
                    )

                    Spacer(Modifier.height(18.dp))

                    LazyVerticalGrid(
                        state = gridState,
                        columns = GridCells.Fixed(4),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        contentPadding = PaddingValues(bottom = 24.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .focusRequester(initialFocusRequester)
                            .focusProperties { canFocus = false },
                    ) {
                        itemsIndexed(uiState.series, key = { _, it -> it.id }) { index, series ->
                            val focusRequester = if (index == 0) {
                                firstSeriesFocusRequester
                            } else {
                                seriesFocusRequesters.getOrPut(series.id) { FocusRequester() }
                            }
                            LocalSeriesCard(
                                series = series,
                                focusRequester = focusRequester,
                                onClick = {
                                    focusedSeriesId = series.id
                                    viewModel.openSeries(series)
                                },
                                onFocused = {
                                    focusedSeriesId = series.id
                                    if (uiState.hasMore && index >= uiState.series.lastIndex - 8) {
                                        viewModel.loadMore()
                                    }
                                },
                                onNavigateLeft = if (index % 4 == 0) onNavigateSideRail else null,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LocalSeriesHeader(total: Int, isLoading: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(
                Brush.horizontalGradient(
                    listOf(Color(0xFF12151C), Color(0xFF101219), Color(0xFF080A0C))
                )
            )
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x1AFFFFFF)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.CollectionsBookmark, contentDescription = null, tint = Accent, modifier = Modifier.size(30.dp))
            }
            Column {
                Text("סדרות", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, style = RtlTextStyle)
                Text("הספרייה המקומית שלך", color = MutedText, fontSize = 13.sp, style = RtlTextStyle)
            }
        }

        Text(
            text = if (isLoading) "טוען עוד" else if (total > 0) "$total סדרות" else "",
            color = Color(0xFFD0D5DD),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            style = RtlTextStyle,
        )
    }
}

@Composable
private fun LocalSeriesCard(
    series: LocalSeries,
    focusRequester: FocusRequester,
    onClick: () -> Unit,
    onFocused: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val shape = RoundedCornerShape(8.dp)
    val bg = if (isFocused) FocusedBg else CardBg
    val titleColor = if (isFocused) FocusedContent else Color.White
    val textColor = if (isFocused) Color(0xFF344054) else MutedText
    val imageUrl = series.posterUrl

    LaunchedEffect(isFocused) {
        if (isFocused) onFocused()
    }

    Column(
        modifier = Modifier
            .width(286.dp)
            .clip(shape)
            .background(bg)
            .then(if (isFocused) Modifier.border(3.dp, FocusedBg, shape) else Modifier)
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(158.dp)
                .background(Color(0xFF1B222D)),
            contentAlignment = Alignment.Center,
        ) {
            LocalArtwork(
                imageUrl = imageUrl,
                title = series.displayTitle,
                modifier = Modifier.fillMaxSize(),
            )

            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .height(76.dp)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xD0080A0C)))),
            )

            Text(
                text = "${series.episodes.size} פרקים",
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(10.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0x99000000))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }

        Column(Modifier.padding(12.dp)) {
            Text(
                text = series.displayTitle,
                color = titleColor,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
            val genres = series.metadata?.genres.orEmpty().take(2).joinToString(" · ")
            val meta = buildList {
                if (genres.isNotBlank()) add(genres)
                series.metadata?.rating?.let { add("%.1f".format(it)) }
            }.joinToString("  ")
            if (meta.isNotBlank()) {
                Text(meta, color = textColor, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun LocalSeriesDetails(
    series: LocalSeries,
    backFocusRequester: FocusRequester,
    firstEpisodeFocusRequester: FocusRequester,
    onClose: () -> Unit,
    onPlayEpisode: (LocalEpisode) -> Unit,
    onNavigateSideRail: () -> Unit,
) {
    val episodes = series.episodes.sortedWith(compareBy<LocalEpisode> { it.season ?: 0 }.thenBy { it.episode ?: 0 })
    val seasonNumbers = remember(series.id, episodes) {
        episodes.map { it.season ?: 1 }.distinct().sorted()
    }
    val showSeasonTabs = seasonNumbers.isNotEmpty()
    var selectedSeason by remember(series.id) { mutableStateOf(seasonNumbers.firstOrNull() ?: 1) }
    val seasonFocusRequester = remember(series.id) { FocusRequester() }
    val detailsCoroutineScope = rememberCoroutineScope()
    val selectedEpisodes = remember(episodes, selectedSeason) {
        episodes.filter { (it.season ?: 1) == selectedSeason }
    }
    val fallbackImageUrl = series.backdropUrl ?: series.posterUrl

    LaunchedEffect(seasonNumbers) {
        if (seasonNumbers.isNotEmpty() && selectedSeason !in seasonNumbers) {
            selectedSeason = seasonNumbers.first()
        }
    }

    Box(Modifier.fillMaxSize().background(LocalBg)) {
        if (!series.backdropUrl.isNullOrBlank()) {
            val imageUrl = series.backdropUrl
            val context = LocalContext.current
            val request = remember(imageUrl) {
                ImageRequest.Builder(context).data(imageUrl).size(1280, 720).crossfade(false).build()
            }
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = 0.72f },
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xB3080A0C), Color(0xD9080A0C), Color(0xFF080A0C))
                        )
                    ),
            )
        } else {
            LocalBackdropFallback(title = series.displayTitle)
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.fillMaxWidth(0.7f)) {
                val backInteractionSource = remember { MutableInteractionSource() }
                val isBackFocused by backInteractionSource.collectIsFocusedAsState()
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isBackFocused) FocusedBg else Color(0x26FFFFFF))
                        .tvFocusableClickable(
                            onClick = onClose,
                            interactionSource = backInteractionSource,
                            focusRequester = backFocusRequester,
                            onNavigateLeft = onNavigateSideRail,
                            onNavigateDown = { firstEpisodeFocusRequester.requestFocus() },
                        )
                        .padding(horizontal = 18.dp, vertical = 9.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "חזרה",
                            tint = if (isBackFocused) FocusedContent else Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            "חזרה",
                            color = if (isBackFocused) FocusedContent else Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    series.metadata?.rating?.let {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(999.dp))
                                .background(Color(0x24FFFFFF))
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = Accent, modifier = Modifier.size(13.dp))
                            Text("%.1f".format(it), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text("${episodes.size} פרקים", color = Color(0xFFE2E8F0), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    if (seasonNumbers.size > 1) {
                        Text("${seasonNumbers.size} עונות", color = Color(0xFFE2E8F0), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    series.metadata?.genres.orEmpty().take(2).joinToString(" · ").takeIf { it.isNotBlank() }?.let {
                        Text(it, color = MutedText, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }

                Spacer(Modifier.height(8.dp))
                Text(
                    text = series.displayTitle,
                    color = Color.White,
                    fontSize = 30.sp,
                    lineHeight = 36.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = RtlTextStyle,
                )
                series.metadata?.overview?.let {
                    Text(
                        text = it,
                        color = Color(0xFFCBD5E1),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 10.dp),
                        style = RtlTextStyle,
                    )
                }
            }

            Column {
                if (showSeasonTabs) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(start = 12.dp, end = 32.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp),
                    ) {
                        itemsIndexed(seasonNumbers, key = { _, season -> season }) { index, season ->
                            LocalSeasonTab(
                                season = season,
                                selected = season == selectedSeason,
                                focusRequester = if (index == 0) seasonFocusRequester else remember { FocusRequester() },
                                onClick = {
                                    selectedSeason = season
                                    detailsCoroutineScope.launch {
                                        delay(90)
                                        firstEpisodeFocusRequester.requestFocus()
                                    }
                                },
                                onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                                onNavigateUp = { backFocusRequester.requestFocus() },
                                onNavigateDown = { firstEpisodeFocusRequester.requestFocus() },
                            )
                        }
                    }
                }

                Text(
                    text = "פרקים (${selectedEpisodes.size})",
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(start = 12.dp, end = 32.dp, bottom = 8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(250.dp),
                ) {
                    itemsIndexed(selectedEpisodes, key = { _, it -> it.id }) { index, episode ->
                        LocalEpisodeCard(
                            episode = episode,
                            fallbackImageUrl = fallbackImageUrl,
                            focusRequester = if (index == 0) firstEpisodeFocusRequester else remember { FocusRequester() },
                            onPlay = { onPlayEpisode(episode) },
                            onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            onNavigateUp = {
                                if (showSeasonTabs) {
                                    seasonFocusRequester.requestFocus()
                                } else {
                                    backFocusRequester.requestFocus()
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
private fun LocalSeasonTab(
    season: Int,
    selected: Boolean,
    focusRequester: FocusRequester,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
    onNavigateUp: () -> Unit,
    onNavigateDown: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val textColor = when {
        selected -> Color.White
        isFocused -> FocusedContent
        else -> Color(0xFFB8C1CC)
    }
    val background = when {
        isFocused -> FocusedBg
        selected -> Color(0x26FFFFFF)
        else -> Color.Transparent
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateUp = onNavigateUp,
                onNavigateDown = onNavigateDown,
            )
            .padding(horizontal = 18.dp, vertical = 7.dp),
    ) {
        Text(
            text = "עונה $season",
            color = textColor,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .width(30.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(if (selected || isFocused) Accent else Color.Transparent),
        )
    }
}

@Composable
private fun LocalEpisodeCard(
    episode: LocalEpisode,
    fallbackImageUrl: String?,
    focusRequester: FocusRequester,
    onPlay: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
    onNavigateUp: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val shape = RoundedCornerShape(8.dp)

    Column(
        modifier = Modifier
            .width(222.dp)
            .height(236.dp)
            .clip(shape)
            .background(if (isFocused) FocusedBg else CardBg)
            .then(if (isFocused) Modifier.border(2.5.dp, FocusedBg, shape) else Modifier)
            .tvFocusableClickable(
                onClick = onPlay,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateUp = onNavigateUp,
                onNavigateDown = {},
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(112.dp)
                .background(Color(0xFF1B222D)),
            contentAlignment = Alignment.Center,
        ) {
            LocalArtwork(
                imageUrl = episode.imageUrl ?: fallbackImageUrl,
                title = episode.title,
                modifier = Modifier.fillMaxSize(),
            )
            Icon(Icons.Default.PlayArrow, contentDescription = "נגן", tint = Color.White, modifier = Modifier.size(42.dp))
        }

        Column(Modifier.padding(10.dp)) {
            Text(
                text = episode.title,
                color = if (isFocused) FocusedContent else Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
            episode.overview?.let {
                Text(
                    text = it,
                    color = if (isFocused) Color(0xFF344054) else MutedText,
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                    style = RtlTextStyle,
                )
            }
        }
    }
}

@Composable
private fun LocalArtwork(
    imageUrl: String?,
    title: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.background(
            Brush.linearGradient(
                listOf(
                    Color(0xFF1C2533),
                    Color(0xFF152029),
                    Color(0xFF301A35),
                )
            )
        ),
        contentAlignment = Alignment.Center,
    ) {
        if (!imageUrl.isNullOrBlank()) {
            val context = LocalContext.current
            val request = remember(imageUrl) {
                ImageRequest.Builder(context).data(imageUrl).size(560, 315).crossfade(false).build()
            }
            AsyncImage(
                model = request,
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(18.dp),
            ) {
                Icon(
                    Icons.Default.CollectionsBookmark,
                    contentDescription = null,
                    tint = Color(0xFFB8C1CC),
                    modifier = Modifier.size(38.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = title,
                    color = Color(0xFFE7EBF2),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    style = RtlTextStyle,
                )
            }
        }
    }
}

@Composable
private fun LocalBackdropFallback(title: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    listOf(
                        Color(0x66353B55),
                        Color(0xFF080A0C),
                    )
                )
            ),
        contentAlignment = Alignment.TopEnd,
    ) {
        Text(
            text = title,
            color = Color(0x14FFFFFF),
            fontSize = 82.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 48.dp, end = 56.dp),
        )
    }
}
