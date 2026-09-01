package com.tvapp.programguide.data

data class TvChannel(
    val id: String,
    val tvgId: String,
    val number: String,
    val name: String,
    val logoUrl: String,
    val streamUrl: String,
)

data class TvProgram(
    val channelId: String,
    val startSeconds: Long,
    val endSeconds: Long,
    val title: String,
    val description: String,
    val imageUrl: String?,
)

data class GuideData(
    val channels: List<TvChannel>,
    val programsByChannel: Map<String, List<TvProgram>>,
)
