package com.tvapp.programguide.data

import androidx.compose.runtime.Immutable

@Immutable
data class LocalSeriesMetadata(
    val name: String?,
    val overview: String?,
    val poster: String?,
    val backdrop: String?,
    val rating: Double?,
    val genres: List<String>,
    val numberOfSeasons: Int?,
    val numberOfEpisodes: Int?,
)

@Immutable
data class LocalEpisode(
    val id: String,
    val filename: String,
    val title: String,
    val overview: String?,
    val imageUrl: String?,
    val season: Int?,
    val episode: Int?,
    val runtime: Int?,
    val streamUrl: String,
)

@Immutable
data class LocalSeries(
    val id: String,
    val title: String,
    val metadata: LocalSeriesMetadata?,
    val episodes: List<LocalEpisode>,
) {
    val displayTitle: String
        get() = metadata?.name?.takeIf { it.isNotBlank() } ?: title

    val posterUrl: String?
        get() = metadata?.poster?.takeIf { it.isNotBlank() } ?: metadata?.backdrop?.takeIf { it.isNotBlank() }

    val backdropUrl: String?
        get() = metadata?.backdrop?.takeIf { it.isNotBlank() } ?: metadata?.poster?.takeIf { it.isNotBlank() }
}

@Immutable
data class LocalSeriesPage(
    val series: List<LocalSeries>,
    val total: Int,
    val hasMore: Boolean,
)
