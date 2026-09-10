package com.tvapp.programguide.data

import com.tvapp.programguide.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class ProgramGuideRepository(
    private val apiBaseUrl: String = BuildConfig.PROGRAM_GUIDE_API_BASE_URL.trimEnd('/'),
) {
    suspend fun loadGuide(): GuideData {
        val now = System.currentTimeMillis() / 1000
        val start = (now - 60 * 60).roundDownToHour()
        val end = start + INITIAL_EPG_WINDOW_SECONDS
        val channels = loadChannels()
        return GuideData(
            channels = channels,
            programsByChannel = loadPrograms(channels, start, end),
            guideStartSeconds = start,
            guideEndSeconds = end,
        )
    }

    suspend fun loadChannels(): List<TvChannel> = withContext(Dispatchers.IO) {
        val playlistStreams = parsePlaylistStreams(get("$apiBaseUrl/playlist.m3u"))
        parseChannels(getJsonArray("$apiBaseUrl/live_channels"), playlistStreams).distinctGuideChannels()
    }

    suspend fun loadPrograms(
        channels: List<TvChannel>,
        startSeconds: Long,
        endSeconds: Long,
    ): Map<String, List<TvProgram>> = withContext(Dispatchers.IO) {
        val start = (startSeconds - EPG_BOUNDARY_LOOKBEHIND_SECONDS).roundDownToHour()
        val end = endSeconds.roundUpToHour()
        val epg = getJsonObject("$apiBaseUrl/epg?start=$start&end=$end")
        channels.associate { channel ->
            val programArray = channel.epgKeys()
                .firstNotNullOfOrNull { key -> epg.optJSONArray(key) }
            channel.id to parsePrograms(programArray, channel.id)
        }
    }

    fun streamUrl(channel: TvChannel): String = channel.streamUrl

    private fun parseChannels(
        array: JSONArray,
        playlistStreams: Map<String, List<PlaylistStream>>,
    ): List<TvChannel> {
        val mimeTypesByChannelId = buildMap {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("channelID", item.optString("id")).trim()
                if (id.isNotEmpty()) {
                    item.streamMimeType()?.let { put(id, it) }
                }
            }
        }
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("channelID", item.optString("id")).trim()
                if (id.isEmpty()) continue
                if (item.optCleanString("type") == "radio" || item.optCleanString("module") == "radio") {
                    continue
                }
                val logo = item.optCleanString("logo")
                val tvgId = item.optCleanString("tvgID")
                val indexNumber = item.optInt("index", 0)
                val name = item.optCleanString("name").ifBlank { id }
                val channelNumber = item.optCleanString("channelNumber")
                val number = channelNumber.ifBlank { indexNumber.takeIf { it > 0 }?.toString().orEmpty() }
                val streamKeys = listOf(tvgId.streamTvgIdKey(), name.streamNameKey())
                    .filter { it.isNotBlank() }
                    .ifEmpty { listOf(number.streamNumberKey()).filter { it.isNotBlank() } }
                val streams = streamKeys
                    .flatMap { key -> playlistStreams[key].orEmpty() }
                    .distinctBy { it.url }
                add(
                    TvChannel(
                        id = id,
                        index = indexNumber,
                        tvgId = tvgId,
                        epgNumber = channelNumber,
                        number = number,
                        name = name,
                        logoUrl = resolveLogoUrl(logo),
                        streamUrl = streams.firstOrNull()?.url.orEmpty(),
                        streamSources = streams.mapIndexed { sourceIndex, stream ->
                            TvStreamSource(
                                id = stream.url,
                                label = stream.label.ifBlank { "מקור ${sourceIndex + 1}" },
                                url = stream.url,
                                mimeType = stream.channelId?.let { mimeTypesByChannelId[it] } ?: stream.mimeType,
                            )
                        },
                    )
                )
            }
        }
    }

    private fun List<TvChannel>.distinctGuideChannels(): List<TvChannel> {
        val seen = mutableSetOf<String>()
        return filter { channel ->
            val guideKey = channel.index.takeIf { it > 0 }?.toString() ?: channel.id
            seen.add(guideKey)
        }
    }

    private data class PlaylistStream(
        val url: String,
        val label: String,
        val channelId: String?,
        val mimeType: String?,
    )

    private fun parsePlaylistStreams(content: String): Map<String, List<PlaylistStream>> {
        val lines = content.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        val streams = linkedMapOf<String, MutableList<PlaylistStream>>()
        var currentKeys = emptyList<String>()
        var currentLabel = ""

        for (line in lines) {
            if (line.startsWith("#EXTINF", ignoreCase = true)) {
                val tvgId = attribute(line, "tvg-id")
                val tvgName = attribute(line, "tvg-name")
                val channelNumber = attribute(line, "tvg-chno")
                val displayName = line.substringAfterLast(',', "").trim()
                currentKeys = listOf(
                    tvgId.streamTvgIdKey(),
                    tvgName.streamNameKey(),
                    channelNumber.streamNumberKey(),
                    displayName.streamNameKey(),
                ).filter { it.isNotBlank() }
                currentLabel = displayName.ifBlank { tvgName }
                continue
            }

            if (!line.startsWith("#") && currentKeys.isNotEmpty()) {
                val streamUrl = line.normalizedLiveStreamUrl()
                val stream = PlaylistStream(
                    url = streamUrl,
                    label = currentLabel,
                    channelId = streamUrl.queryValue("channel_id"),
                    mimeType = streamUrl.streamMimeTypeFromUrl(),
                )
                currentKeys.forEach { key ->
                    val keyStreams = streams.getOrPut(key) { mutableListOf() }
                    if (keyStreams.none { it.url == streamUrl }) {
                        keyStreams.add(stream)
                    }
                }
                currentKeys = emptyList()
                currentLabel = ""
            }
        }

        return streams
    }

    private fun attribute(line: String, name: String): String {
        val marker = "$name=\""
        val start = line.indexOf(marker)
        if (start < 0) return ""
        return line.substring(start + marker.length).substringBefore('"').trim()
    }

    private fun JSONObject.streamMimeType(): String? {
        val linkDetails = optJSONObject("linkDetails")
        val link = linkDetails?.optCleanString("link").orEmpty()
        val live = linkDetails?.optCleanString("live").orEmpty()
        val streamUrl = optCleanString("streamUrl")
        val url = link.ifBlank { live }.ifBlank { streamUrl }
        if (linkDetails?.optBoolean("adaptive", false) == true) return MIME_TYPE_DASH
        return url.streamMimeTypeFromUrl()
    }

    private fun String.streamMimeTypeFromUrl(): String? {
        val lowercase = lowercase()
        return when {
            ".m3u8" in lowercase || "mpegurl" in lowercase -> MIME_TYPE_HLS
            ".mpd" in lowercase || "/livedash/" in lowercase || ".livx" in lowercase -> MIME_TYPE_DASH
            else -> null
        }
    }

    private fun String.normalizedLiveStreamUrl(): String {
        val channelId = queryValue("channel_id").orEmpty()
        val needsKanVpn = channelId in setOf(
            "ch_11",
            "ch_11b",
            "ch_11c",
            "ch_11d",
            "ch_23",
            "ch_23b",
            "ch_33",
            "ch_33b",
        )
        if (!needsKanVpn || queryValue("vpn") == "true") return this
        return this + if ('?' in this) "&vpn=true" else "?vpn=true"
    }

    private fun String.queryValue(name: String): String? {
        val query = substringAfter('?', missingDelimiterValue = "")
        if (query.isBlank()) return null
        return query.split('&')
            .firstNotNullOfOrNull { part ->
                val key = part.substringBefore('=', "")
                val value = part.substringAfter('=', "")
                value.takeIf { key == name && it.isNotBlank() }
            }
    }

    private fun String.streamTvgIdKey(): String =
        trim().takeIf { it.isNotBlank() }?.let { "tvg-id:$it" }.orEmpty()

    private fun String.streamNameKey(): String =
        trim().takeIf { it.isNotBlank() }?.let { "name:$it" }.orEmpty()

    private fun String.streamNumberKey(): String =
        trim().takeIf { it.isNotBlank() }?.let { "number:$it" }.orEmpty()

    private fun parsePrograms(array: JSONArray?, channelId: String): List<TvProgram> {
        if (array == null) return emptyList()

        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val start = item.optLong("start")
                val end = item.optLong("end")
                val title = item.optString("name").trim()
                if (start <= 0L || end <= start || title.isEmpty()) continue
                add(
                    TvProgram(
                        channelId = channelId,
                        startSeconds = start,
                        endSeconds = end,
                        title = title,
                        description = item.optString("description").trim(),
                        imageUrl = item.optString("image").trim().takeIf { it.isNotEmpty() },
                    )
                )
            }
        }.sortedBy { it.startSeconds }
    }

    private fun resolveLogoUrl(logo: String): String {
        if (logo.startsWith("http://") || logo.startsWith("https://")) return logo
        return apiBaseUrl.removeSuffix("/api") + "/ch/" + logo.trimStart('/')
    }

    private fun TvChannel.epgKeys(): List<String> =
        listOf(
            tvgId,
            epgNumber,
            id,
        ).filter { it.isNotBlank() }.distinct()

    private fun JSONObject.optCleanString(name: String): String {
        if (!has(name) || isNull(name)) return ""
        return optString(name).trim().takeUnless { it.equals("null", ignoreCase = true) }.orEmpty()
    }

    private fun getJsonArray(url: String): JSONArray = JSONArray(get(url))

    private fun getJsonObject(url: String): JSONObject = JSONObject(get(url))

    private fun get(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 12_000
        connection.readTimeout = 20_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")

        return try {
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = stream.bufferedReader().use { it.readText() }
            if (code !in 200..299) error("HTTP $code: $body")
            if (body.trimStart().startsWith("<")) {
                error("API returned HTML. Check PROGRAM_GUIDE_API_BASE_URL.")
            }
            body
        } finally {
            connection.disconnect()
        }
    }

    private fun Long.roundDownToHour(): Long =
        this - this.floorMod(3600L)

    private fun Long.roundUpToHour(): Long =
        if (this.floorMod(3600L) == 0L) this else this.roundDownToHour() + 3600L

    private fun Long.floorMod(divisor: Long): Long =
        Math.floorMod(this, divisor)

    private companion object {
        private const val INITIAL_EPG_WINDOW_SECONDS = 6 * 60 * 60L
        private const val EPG_BOUNDARY_LOOKBEHIND_SECONDS = 6 * 60 * 60L
        private const val MIME_TYPE_DASH = "application/dash+xml"
        private const val MIME_TYPE_HLS = "application/vnd.apple.mpegurl"
    }
}
