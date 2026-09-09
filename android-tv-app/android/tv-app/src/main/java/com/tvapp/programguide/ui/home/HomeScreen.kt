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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tvapp.programguide.data.AppDestination
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import com.tvapp.programguide.data.VodPlaybackProgress
import com.tvapp.programguide.data.VodProvider
import com.tvapp.programguide.data.VodRecentItem
import com.tvapp.programguide.ui.vod.tvFocusableClickable
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
    vodProgress: Map<String, VodPlaybackProgress>,
    nowSeconds: Long,
    modifier: Modifier = Modifier,
    initialFocusRequester: FocusRequester = remember { FocusRequester() },
    contentFocusNonce: Int = 0,
    onPlayLiveChannel: (TvChannel, TvProgram?) -> Unit,
    onPlayRecentVod: (VodRecentItem) -> Unit,
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
    val heroChannel = recentLiveChannels.firstOrNull()
    val heroProgram = heroChannel?.let { currentPrograms[it.id].orEmpty().currentProgram(nowSeconds) }
    val continueItems = remember(vodRecentItems, vodProgress) {
        val recentByEpisode = vodRecentItems.associateBy { it.episodeId }
        vodProgress.values
            .filter { it.isInProgress }
            .sortedByDescending { it.lastWatchedAt }
            .mapNotNull { progress -> recentByEpisode[progress.episodeId]?.let { it to progress } }
            .take(12)
    }
    val firstFocusRequester = initialFocusRequester

    LaunchedEffect(contentFocusNonce) {
        if (contentFocusNonce > 0) {
            try {
                firstFocusRequester.requestFocus()
            } catch (_: Exception) {}
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(ScreenBg),
    ) {
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
                )
            }

            if (recentLiveChannels.isNotEmpty()) {
                item {
                    HomeRow(title = "ערוצים חיים שנוגנו לאחרונה") {
                        itemsIndexed(recentLiveChannels, key = { _, channel -> channel.id }) { index, channel ->
                            val program = currentPrograms[channel.id].orEmpty().currentProgram(nowSeconds)
                            LiveChannelCard(
                                channel = channel,
                                program = program,
                                onClick = { onPlayLiveChannel(channel, program) },
                                onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            )
                        }
                    }
                }
            }

            if (continueItems.isNotEmpty()) {
                item {
                    HomeRow(title = "המשך צפייה") {
                        itemsIndexed(continueItems, key = { _, item -> item.first.episodeId }) { index, (recent, progress) ->
                            VodRecentCard(
                                item = recent,
                                progress = progress,
                                onClick = { onPlayRecentVod(recent) },
                                onNavigateLeft = if (index == 0) onNavigateSideRail else null,
                            )
                        }
                    }
                }
            }

            if (vodRecentItems.isNotEmpty()) {
                item {
                    HomeRow(title = "תכני VOD חדשים") {
                        itemsIndexed(vodRecentItems.take(14), key = { _, item -> item.id }) { index, item ->
                            VodRecentCard(
                                item = item,
                                progress = vodProgress[item.episodeId],
                                onClick = { onPlayRecentVod(item) },
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
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val imageUrl = program?.imageUrl ?: channel?.logoUrl

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(258.dp)
            .clip(CardShape)
            .background(CardBg)
            .then(if (isFocused) Modifier.border(3.dp, FocusedBg, CardShape) else Modifier)
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
                focusRequester = focusRequester,
                onNavigateLeft = onNavigateLeft,
            ),
    ) {
        HomeArtwork(imageUrl = imageUrl, title = program?.title ?: channel?.name.orEmpty(), modifier = Modifier.fillMaxSize())
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xE6080A0C),
                        0.48f to Color(0xA6080A0C),
                        1f to Color(0x33080A0C),
                    )
                )
        )
        Column(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 34.dp, end = 34.dp)
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
        }
    }
}

@Composable
private fun HomeRow(
    title: String,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    Column {
        Text(title, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
        LazyRow(
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
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(width = 238.dp, height = 154.dp, onClick = onClick, onNavigateLeft = onNavigateLeft) { isFocused ->
        HomeArtwork(
            imageUrl = program?.imageUrl ?: channel.logoUrl,
            title = channel.name,
            modifier = Modifier.fillMaxSize(),
        )
        CardScrim()
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text(channel.name, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(program?.title ?: "Live", color = if (isFocused) Color(0xFF344054) else MutedText, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, style = RtlTextStyle)
        }
        LiveBadge(Modifier.align(Alignment.TopStart).padding(9.dp))
    }
}

@Composable
private fun VodRecentCard(
    item: VodRecentItem,
    progress: VodPlaybackProgress?,
    onClick: () -> Unit,
    onNavigateLeft: (() -> Unit)?,
) {
    FocusCard(width = 238.dp, height = 164.dp, onClick = onClick, onNavigateLeft = onNavigateLeft) { isFocused ->
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
    onClick: () -> Unit,
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
            .tvFocusableClickable(
                onClick = onClick,
                interactionSource = interactionSource,
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
    filter { nowSeconds in it.startSeconds until it.endSeconds }
        .maxByOrNull { it.startSeconds }
        ?: firstOrNull()

private fun TvProgram.timeRange(): String {
    val zoneId = ZoneId.systemDefault()
    return "${TimeFormatter.format(Instant.ofEpochSecond(startSeconds).atZone(zoneId))} - ${TimeFormatter.format(Instant.ofEpochSecond(endSeconds).atZone(zoneId))}"
}
