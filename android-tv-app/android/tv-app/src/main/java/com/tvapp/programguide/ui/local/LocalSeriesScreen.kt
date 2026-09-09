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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
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

    fun requestCatalogFocus() {
        try {
            firstSeriesFocusRequester.requestFocus()
        } catch (_: Exception) {
            try {
                initialFocusRequester.requestFocus()
            } catch (_: Exception) {}
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
            uiState.selectedSeries != null -> viewModel.closeSeries()
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
                    onClose = viewModel::closeSeries,
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
                            LocalSeriesCard(
                                series = series,
                                focusRequester = if (index == 0) firstSeriesFocusRequester else remember { FocusRequester() },
                                onClick = { viewModel.openSeries(series) },
                                onFocused = {
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
            if (!imageUrl.isNullOrBlank()) {
                val context = LocalContext.current
                val request = remember(imageUrl) {
                    ImageRequest.Builder(context).data(imageUrl).size(560, 315).crossfade(false).build()
                }
                AsyncImage(
                    model = request,
                    contentDescription = series.displayTitle,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(Icons.Default.CollectionsBookmark, contentDescription = null, tint = MutedText, modifier = Modifier.size(42.dp))
            }

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

    Box(Modifier.fillMaxSize().background(LocalBg)) {
        series.backdropUrl?.let { imageUrl ->
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
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp, vertical = 24.dp),
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

                Spacer(Modifier.height(16.dp))
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
                    series.metadata?.genres.orEmpty().take(2).joinToString(" · ").takeIf { it.isNotBlank() }?.let {
                        Text(it, color = MutedText, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }

                Spacer(Modifier.height(14.dp))
                Text(
                    text = series.displayTitle,
                    color = Color.White,
                    fontSize = 34.sp,
                    lineHeight = 40.sp,
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
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 10.dp),
                        style = RtlTextStyle,
                    )
                }
            }

            Column {
                Text(
                    text = "פרקים (${episodes.size})",
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(start = 12.dp, end = 32.dp, bottom = 16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    itemsIndexed(episodes, key = { _, it -> it.id }) { index, episode ->
                        LocalEpisodeCard(
                            episode = episode,
                            focusRequester = if (index == 0) firstEpisodeFocusRequester else remember { FocusRequester() },
                            onPlay = { onPlayEpisode(episode) },
                            onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            onNavigateUp = { backFocusRequester.requestFocus() },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LocalEpisodeCard(
    episode: LocalEpisode,
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
            .width(230.dp)
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
                .height(130.dp)
                .background(Color(0xFF1B222D)),
            contentAlignment = Alignment.Center,
        ) {
            if (!episode.imageUrl.isNullOrBlank()) {
                val context = LocalContext.current
                val request = remember(episode.imageUrl) {
                    ImageRequest.Builder(context).data(episode.imageUrl).size(440, 260).crossfade(false).build()
                }
                AsyncImage(
                    model = request,
                    contentDescription = episode.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Icon(Icons.Default.PlayArrow, contentDescription = "נגן", tint = Color.White, modifier = Modifier.size(42.dp))
        }

        Column(Modifier.padding(10.dp)) {
            Text(
                text = episode.title,
                color = if (isFocused) FocusedContent else Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = RtlTextStyle,
            )
            episode.overview?.let {
                Text(
                    text = it,
                    color = if (isFocused) Color(0xFF344054) else MutedText,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                    style = RtlTextStyle,
                )
            }
        }
    }
}
