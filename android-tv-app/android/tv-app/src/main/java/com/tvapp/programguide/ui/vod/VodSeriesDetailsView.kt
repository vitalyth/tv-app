package com.tvapp.programguide.ui.vod

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
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
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.VodEpisode
import com.tvapp.programguide.data.VodSeason
import com.tvapp.programguide.data.VodSeries
import com.tvapp.programguide.data.VodSeriesDetails
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Delicate program-grid aligned color palette without harsh borders
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
    isPlayerActive: Boolean = false,
    onSeasonSelected: (VodSeason) -> Unit,
    onPlayEpisode: (VodEpisode, VodSeries) -> Unit,
    onClose: () -> Unit,
    onNavigateSideRail: () -> Unit,
    contentFocusNonce: Int = 0,
    modifier: Modifier = Modifier,
) {
    val episodesListState = rememberLazyListState()
    val backFocusRequester = remember { FocusRequester() }
    val series = details?.series
    val seasons = details?.seasons.orEmpty()
    val episodes = if (details != null && selectedSeason != null && seasons.size > 1) {
        details.episodes.filter { it.seasonId == selectedSeason.seasonId }
    } else {
        details?.episodes.orEmpty()
    }

    // Pre-associate focus requesters to guarantee they are never null during key navigation
    val seasonFocusRequesters = remember(seasons) {
        seasons.associate { it.seasonId to FocusRequester() }
    }
    val episodeFocusRequesters = remember(episodes) {
        episodes.associate { it.id to FocusRequester() }
    }
    var focusedEpisodeId by remember { mutableStateOf<String?>(null) }
    var prevPlayerActive by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    fun safeRequestFocus(primary: FocusRequester?, fallback: FocusRequester? = null) {
        var succeeded = false
        if (primary != null) {
            try {
                primary.requestFocus()
                succeeded = true
            } catch (_: Exception) {}
        }
        if (!succeeded && fallback != null) {
            try {
                fallback.requestFocus()
            } catch (_: Exception) {}
        }
    }

    fun rememberedEpisodeId(): String? {
        val focusedId = focusedEpisodeId?.takeIf { id -> episodes.any { it.id == id } }
        val lastPlayedId = lastPlayedEpisodeId?.takeIf { id -> episodes.any { it.id == id } }
        return focusedId ?: lastPlayedId ?: episodes.firstOrNull()?.id
    }

    fun requestEpisodeFocus(episodeId: String? = rememberedEpisodeId()) {
        if (episodeId == null || episodes.isEmpty()) return
        val targetIndex = episodes.indexOfFirst { it.id == episodeId }
        if (targetIndex < 0) return
        coroutineScope.launch {
            try {
                episodesListState.animateScrollToItem((targetIndex - 1).coerceAtLeast(0))
            } catch (_: Exception) {}
            delay(90)
            safeRequestFocus(
                primary = episodeFocusRequesters[episodeId],
                fallback = episodes.firstOrNull()?.id?.let { episodeFocusRequesters[it] } ?: backFocusRequester,
            )
        }
    }

    // When returning from player, restore focus to the episode that was played
    LaunchedEffect(isPlayerActive) {
        if (prevPlayerActive && !isPlayerActive) {
            val targetId = rememberedEpisodeId()
            if (targetId != null && episodes.isNotEmpty()) {
                val targetIndex = episodes.indexOfFirst { it.id == targetId }
                if (targetIndex >= 0) {
                    requestEpisodeFocus(targetId)
                }
            }
        }
        prevPlayerActive = isPlayerActive
    }

    // Initial focus when details view loads
    LaunchedEffect(details?.series?.id, episodes.size) {
        if (details != null && episodes.isNotEmpty() && !isPlayerActive) {
            delay(140)
            requestEpisodeFocus()
        }
    }

    LaunchedEffect(selectedSeason?.seasonId) {
        focusedEpisodeId = episodes.firstOrNull()?.id
    }

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0 && details != null && episodes.isNotEmpty() && !isPlayerActive) {
            requestEpisodeFocus()
        }
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(DetailsBg)
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Back) {
                        onClose()
                        true
                    } else {
                        false
                    }
                }
        ) {
            if (isLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color(0xFFE2E8F0))
                }
                return@Box
            }

            if (error != null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = error,
                        color = Color(0xFFF04438),
                        fontSize = 16.sp,
                    )
                }
                return@Box
            }

            if (details == null || series == null) return@Box

            // Background Backdrop with Gradient Overlay
            if (!series.imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = series.imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .scale(1.1f),
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    Color(0xE6080A0C),
                                    Color(0xF5080A0C),
                                    Color(0xFF080A0C),
                                )
                            )
                        )
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.horizontalGradient(
                                listOf(
                                    Color(0xDD080A0C),
                                    Color(0xBB080A0C),
                                    Color(0x66080A0C),
                                )
                            )
                        )
                )
            }

            // Main Layout: Details on left/top, Episodes on bottom
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 32.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                // Header / Metadata
                Column(modifier = Modifier.fillMaxWidth(0.65f)) {
                    // Top row: Back button & Genre/Channel Badges
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val backInteractionSource = remember { MutableInteractionSource() }
                        val isBackFocused by backInteractionSource.collectIsFocusedAsState()
                        val backBg by animateColorAsState(
                            targetValue = if (isBackFocused) FocusedCardBg else Color(0x26FFFFFF),
                            label = "back_bg",
                        )
                        val backFg by animateColorAsState(
                            targetValue = if (isBackFocused) FocusedCardContent else Color(0xFFF2F4F7),
                            label = "back_fg",
                        )

                        Box(
                            modifier = Modifier
                                .scale(if (isBackFocused) 1.08f else 1.0f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(backBg)
                                .tvFocusableClickable(
                                    onClick = onClose,
                                    interactionSource = backInteractionSource,
                                    focusRequester = backFocusRequester,
                                    onNavigateDown = {
                                        if (seasons.size > 1) {
                                            val targetSeason = selectedSeason ?: seasons.firstOrNull()
                                            val targetFr = targetSeason?.let { seasonFocusRequesters[it.seasonId] }
                                            safeRequestFocus(
                                                primary = targetFr,
                                                fallback = rememberedEpisodeId()?.let { episodeFocusRequesters[it] },
                                            )
                                        } else {
                                            requestEpisodeFocus()
                                        }
                                    },
                                    onNavigateUp = {
                                        // Keep focus on Back button, trap focus inside modal
                                    },
                                    onNavigateLeft = {
                                        // Trap focus, prevent accidentally jumping to side nav rail
                                    },
                                )
                                .padding(horizontal = 18.dp, vertical = 9.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                    contentDescription = "חזרה",
                                    tint = backFg,
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(
                                    text = "חזרה",
                                    color = backFg,
                                    fontSize = 15.sp,
                                    fontWeight = if (isBackFocused) FontWeight.Bold else FontWeight.SemiBold,
                                )
                            }
                        }

                        Box(
                            modifier = Modifier
                                .background(SelectedFilterBg, RoundedCornerShape(6.dp))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text(
                                text = series.provider.displayName,
                                color = Color(0xFFE2E8F0),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }

                        if (!series.genre.isNullOrBlank() && series.genre.trim().lowercase() != "null") {
                            Text(
                                text = series.genre,
                                color = MutedText,
                                fontSize = 13.sp,
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Series Title
                    Text(
                        text = series.title,
                        color = Color.White,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Series Description
                    Text(
                        text = series.description,
                        color = Color(0xFFCBD5E1),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
                    )
                }

                // Seasons & Episodes Section
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Seasons Row (if more than 1 season)
                    if (seasons.size > 1) {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.padding(bottom = 16.dp),
                        ) {
                            items(seasons, key = { it.seasonId }) { season ->
                                val isSelected = season.seasonId == selectedSeason?.seasonId
                                val fr = seasonFocusRequesters[season.seasonId] ?: remember { FocusRequester() }
                                SeasonChip(
                                    season = season,
                                    isSelected = isSelected,
                                    focusRequester = fr,
                                    onClick = { onSeasonSelected(season) },
                                    onNavigateUp = { safeRequestFocus(backFocusRequester) },
                                    onNavigateDown = {
                                        requestEpisodeFocus()
                                    },
                                )
                            }
                        }
                    }

                    // Episodes Row
                    Text(
                        text = "פרקים (${episodes.size})",
                        color = Color.White,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )

                    if (episodes.isEmpty()) {
                        Text(
                            text = "אין פרקים זמינים בעונה זו",
                            color = MutedText,
                            fontSize = 14.sp,
                        )
                    } else {
                        LazyRow(
                            state = episodesListState,
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            contentPadding = PaddingValues(start = 12.dp, end = 32.dp, bottom = 16.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            itemsIndexed(episodes, key = { _, it -> it.id }) { index, episode ->
                                val fr = episodeFocusRequesters[episode.id] ?: remember { FocusRequester() }
                                EpisodeCard(
                                    episode = episode,
                                    focusRequester = fr,
                                    onPlay = { onPlayEpisode(episode, series) },
                                    onFocused = { focusedEpisodeId = episode.id },
                                    onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                                    onNavigateUp = {
                                        if (seasons.size > 1) {
                                            val targetSeason = selectedSeason ?: seasons.firstOrNull()
                                            val targetFr = targetSeason?.let { seasonFocusRequesters[it.seasonId] }
                                            safeRequestFocus(
                                                primary = targetFr,
                                                fallback = backFocusRequester,
                                            )
                                        } else {
                                            safeRequestFocus(backFocusRequester)
                                        }
                                    },
                                )
                            }
                        }
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
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val targetBg by animateColorAsState(
        targetValue = when {
            isFocused -> FocusedCardBg
            isSelected -> SelectedFilterBg
            else -> Color(0x14FFFFFF)
        },
        label = "season_bg",
    )
    val targetFg by animateColorAsState(
        targetValue = when {
            isFocused -> FocusedCardContent
            isSelected -> Color.White
            else -> MutedText
        },
        label = "season_fg",
    )

    val shape = RoundedCornerShape(8.dp)

    Box(
        modifier = Modifier
            .scale(if (isFocused) 1.05f else 1f)
            .clip(shape)
            .background(targetBg)
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateUp = onNavigateUp,
                onNavigateDown = onNavigateDown,
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
private fun EpisodeCard(
    episode: VodEpisode,
    focusRequester: FocusRequester,
    onPlay: () -> Unit,
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

    val shape = RoundedCornerShape(8.dp)

    val bg by animateColorAsState(if (isFocused) FocusedCardBg else CardBg, label = "ep_bg")
    val titleColor by animateColorAsState(if (isFocused) FocusedCardContent else Color.White, label = "ep_title")
    val descColor by animateColorAsState(if (isFocused) Color(0xFF344054) else MutedText, label = "ep_desc")

    val context = LocalContext.current
    val imageRequest = remember(episode.imageUrl) {
        if (episode.imageUrl.isNullOrBlank()) null
        else {
            ImageRequest.Builder(context)
                .data(episode.imageUrl)
                .size(440, 260)
                .crossfade(false)
                .build()
        }
    }

    Column(
        modifier = Modifier
            .width(230.dp)
            .scale(if (isFocused) 1.04f else 1.0f)
            .clip(shape)
            .background(bg)
            .tvFocusableClickable(
                onClick = onPlay,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
                onNavigateUp = onNavigateUp,
                onNavigateDown = {
                    // Stay on episode, prevent losing focus downwards
                },
            )
    ) {
        // Thumbnail
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(130.dp)
                .background(Color(0xFF1B222D)),
            contentAlignment = Alignment.Center,
        ) {
            if (imageRequest != null) {
                AsyncImage(
                    model = imageRequest,
                    contentDescription = episode.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            // Play Icon overlay
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0x99000000)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "נגן",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
        }

        // Title and description
        Column(modifier = Modifier.padding(10.dp)) {
            Text(
                text = episode.title,
                color = titleColor,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
            )

            if (!episode.description.isNullOrBlank()) {
                Text(
                    text = episode.description,
                    color = descColor,
                    fontSize = 11.sp,
                    lineHeight = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                    style = androidx.compose.ui.text.TextStyle(textDirection = TextDirection.Rtl),
                )
            }
        }
    }
}
