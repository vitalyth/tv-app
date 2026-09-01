package com.tvapp.programguide.data

import com.tvapp.programguide.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class ProgramGuideRepository(
    private val apiBaseUrl: String = BuildConfig.PROGRAM_GUIDE_API_BASE_URL.trimEnd('/'),
) {
    suspend fun loadGuide(): GuideData = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis() / 1000
        val start = now - 60 * 60
        val end = now + 6 * 60 * 60
        val playlistStreams = parsePlaylistStreams(get("$apiBaseUrl/playlist.m3u"))
        val channels = parseChannels(getJsonArray("$apiBaseUrl/live_channels"), playlistStreams)
        val epg = getJsonObject("$apiBaseUrl/epg?start=$start&end=$end")
        val programs = channels.associate { channel ->
            val epgKey = channel.tvgId.ifBlank { channel.id }
            channel.id to parsePrograms(epg.optJSONArray(epgKey), channel.id)
        }

        GuideData(channels = channels.distinctGuideChannels(), programsByChannel = programs)
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
                val logo = item.optString("logo").trim()
                val tvgId = item.optString("tvgID").trim()
                val name = item.optString("name").ifBlank { id }
                val number = item.optString("channelNumber", item.optString("index")).trim()
                add(
                    TvChannel(
                        id = id,
                        tvgId = tvgId,
                        number = number,
                        name = name,
                        logoUrl = resolveLogoUrl(logo),
                        streamUrl = playlistStreams[name]
                            ?: playlistStreams[tvgId]
                            ?: playlistStreams[number]
                            ?: "$apiBaseUrl/stream?channel_id=${encode(id)}",
                    )
                )
            }
        }
    }

    private fun List<TvChannel>.distinctGuideChannels(): List<TvChannel> {
        val seen = mutableSetOf<String>()
        return filter { channel ->
            val guideKey = channel.tvgId.ifBlank { channel.number.ifBlank { channel.id } }
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
                currentKeys.forEach { streams[it] = line }
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

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name())
}
