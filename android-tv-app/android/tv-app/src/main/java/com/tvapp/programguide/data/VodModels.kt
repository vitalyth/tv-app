package com.tvapp.programguide.data

import androidx.compose.runtime.Immutable

enum class VodProvider(
    val id: String,
    val endpoint: String,
    val displayName: String,
    val channelNumber: String,
    val logoPath: String,
) {
    KAN11(
        id = "kan-vod",
        endpoint = "kan-vod",
        displayName = "כאן 11",
        channelNumber = "11",
        logoPath = "kan.jpg",
    ),
    KESHET12(
        id = "keshet-vod",
        endpoint = "keshet-vod",
        displayName = "קשת 12",
        channelNumber = "12",
        logoPath = "mako.png",
    ),
    RESHET13(
        id = "reshet-vod",
        endpoint = "reshet-vod",
        displayName = "רשת 13",
        channelNumber = "13",
        logoPath = "13.jpg",
    ),
    CHANNEL14(
        id = "c14-vod",
        endpoint = "c14-vod",
        displayName = "עכשיו 14",
        channelNumber = "14",
        logoPath = "14tv.png",
    ),
    I24NEWS(
        id = "i24-vod",
        endpoint = "i24-vod",
        displayName = "i24NEWS",
        channelNumber = "15",
        logoPath = "i24news.png",
    );

    companion object {
        fun fromId(id: String): VodProvider =
            entries.firstOrNull { it.id.equals(id, ignoreCase = true) || it.endpoint.equals(id, ignoreCase = true) } ?: KAN11
    }
}

@Immutable
data class VodSeries(
    val id: String,
    val title: String,
    val description: String,
    val imageUrl: String?,
    val episodeCount: Int,
    val seasonCount: Int,
    val genre: String?,
    val provider: VodProvider,
)

@Immutable
data class VodSeriesPage(
    val series: List<VodSeries>,
    val categories: List<String>,
    val total: Int,
    val hasMore: Boolean,
)

@Immutable
data class VodSeason(
    val seasonId: String,
    val programId: String,
    val title: String,
    val seasonNumber: Int?,
)

@Immutable
data class VodEpisode(
    val id: String,
    val programId: String,
    val seasonId: String?,
    val title: String,
    val description: String,
    val imageUrl: String?,
    val playUrl: String?,
    val streamEndpoint: String?,
    val displayOrder: Int,
)

@Immutable
data class VodSeriesDetails(
    val series: VodSeries,
    val seasons: List<VodSeason>,
    val episodes: List<VodEpisode>,
)

@Immutable
data class VodRecentItem(
    val id: String,
    val episodeId: String,
    val title: String,
    val programId: String?,
    val programName: String?,
    val channelName: String?,
    val imageUrl: String?,
    val description: String?,
    val provider: VodProvider,
)

enum class VodNavLevel {
    CHANNELS_HUB,
    SERIES_LIST,
}

enum class AppDestination(
    val titleHebrew: String,
) {
    LIVE_TV("שידור חי"),
    VOD("ספריית VOD"),
    LOCAL_SERIES("סדרות"),
}

enum class VodWatchStatus {
    NOT_WATCHED,
    IN_PROGRESS,
    COMPLETED,
}

@Immutable
data class VodPlaybackProgress(
    val episodeId: String,
    val seriesId: String? = null,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val lastWatchedAt: Long = System.currentTimeMillis(),
    val isCompleted: Boolean = false,
) {
    val progressPercentage: Float
        get() = if (durationMs > 0L) (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f

    val isInProgress: Boolean
        get() = !isCompleted && positionMs > 1000L && (durationMs <= 0L || progressPercentage < 0.92f)

    val status: VodWatchStatus
        get() = when {
            isCompleted -> VodWatchStatus.COMPLETED
            isInProgress -> VodWatchStatus.IN_PROGRESS
            else -> VodWatchStatus.NOT_WATCHED
        }
}
