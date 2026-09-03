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
        val start = startSeconds.roundDownToHour()
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
        playlistStreams: Map<String, String>,
    ): List<TvChannel> {
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
                add(
                    TvChannel(
                        id = id,
                        index = indexNumber,
                        tvgId = tvgId,
                        epgNumber = channelNumber,
                        number = number,
                        name = name,
                        logoUrl = resolveLogoUrl(logo),
                        streamUrl = playlistStreams[name]
                            ?: playlistStreams[tvgId]
                            ?: playlistStreams[number]
                            ?: "",
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

    private fun parsePlaylistStreams(content: String): Map<String, String> {
        val lines = content.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        val streams = mutableMapOf<String, String>()
        var currentKeys = emptyList<String>()

        for (line in lines) {
            if (line.startsWith("#EXTINF", ignoreCase = true)) {
                val tvgId = attribute(line, "tvg-id")
                val tvgName = attribute(line, "tvg-name")
                val channelNumber = attribute(line, "tvg-chno")
                val displayName = line.substringAfterLast(',', "").trim()
                currentKeys = listOf(tvgId, tvgName, channelNumber, displayName).filter { it.isNotBlank() }
                continue
            }

            if (!line.startsWith("#") && currentKeys.isNotEmpty()) {
                currentKeys.forEach { streams.putIfAbsent(it, line) }
                currentKeys = emptyList()
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
    }
}
