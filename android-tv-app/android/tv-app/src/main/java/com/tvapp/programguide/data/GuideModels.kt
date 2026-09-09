package com.tvapp.programguide.data

import androidx.compose.runtime.Immutable

@Immutable
data class TvChannel(
    val id: String,
    val index: Int,
    val tvgId: String,
    val epgNumber: String,
    val number: String,
    val name: String,
    val logoUrl: String,
    val streamUrl: String,
    val streamSources: List<TvStreamSource> = streamUrl.takeIf { it.isNotBlank() }?.let { listOf(TvStreamSource(url = it)) }.orEmpty(),
)

@Immutable
data class TvStreamSource(
    val url: String,
    val id: String = url,
    val label: String = "",
    val mimeType: String? = null,
)

@Immutable
data class TvProgram(
    val channelId: String,
    val startSeconds: Long,
    val endSeconds: Long,
    val title: String,
    val description: String,
    val imageUrl: String?,
)

@Immutable
data class GuideData(
    val channels: List<TvChannel>,
    val programsByChannel: Map<String, List<TvProgram>>,
    val guideStartSeconds: Long,
    val guideEndSeconds: Long,
)
