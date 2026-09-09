package com.tvapp.programguide.data

import com.tvapp.programguide.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class LocalSeriesRepository(
    private val apiBaseUrl: String = BuildConfig.PROGRAM_GUIDE_API_BASE_URL.trimEnd('/'),
) {
    private val siteBaseUrl = apiBaseUrl.removeSuffix("/api")

    suspend fun loadSeries(
        query: String = "",
        limit: Int = 48,
        offset: Int = 0,
    ): LocalSeriesPage = withContext(Dispatchers.IO) {
        val params = buildList {
            add("limit=$limit")
            add("offset=$offset")
            if (query.isNotBlank()) {
                add("q=${URLEncoder.encode(query.trim(), "UTF-8")}")
            }
        }.joinToString("&")

        val response = getJsonObject("$apiBaseUrl/local-series?$params")
        val seriesArray = response.optJSONArray("series") ?: JSONArray()
        val series = buildList {
            for (i in 0 until seriesArray.length()) {
                parseSeries(seriesArray.optJSONObject(i) ?: continue)?.let(::add)
            }
        }
        val total = response.optInt("total", offset + series.size)

        LocalSeriesPage(
            series = series,
            total = total,
            hasMore = response.optBoolean("hasMore", offset + series.size < total),
        )
    }

    fun resolveStreamUrl(streamUrl: String): String {
        if (streamUrl.startsWith("http://") || streamUrl.startsWith("https://")) return streamUrl
        return siteBaseUrl + "/" + streamUrl.trimStart('/')
    }

    private fun parseSeries(item: JSONObject): LocalSeries? {
        val id = item.optString("id").trim()
        if (id.isEmpty()) return null
        val title = item.optString("title").trim().ifEmpty { id }
        val metadata = item.optJSONObject("metadata")?.let(::parseMetadata)
        val episodesArray = item.optJSONArray("episodes") ?: JSONArray()
        val episodes = buildList {
            for (i in 0 until episodesArray.length()) {
                parseEpisode(episodesArray.optJSONObject(i) ?: continue, i)?.let(::add)
            }
        }

        return LocalSeries(
            id = id,
            title = title,
            metadata = metadata,
            episodes = episodes,
        )
    }

    private fun parseMetadata(item: JSONObject): LocalSeriesMetadata {
        return LocalSeriesMetadata(
            name = item.cleanString("name"),
            overview = item.cleanString("overview"),
            poster = resolveImageUrl(item.cleanString("poster")),
            backdrop = resolveImageUrl(item.cleanString("backdrop")),
            rating = item.optDoubleOrNull("rating"),
            genres = item.optJSONArray("genres").toStringList(),
            numberOfSeasons = item.optIntOrNull("numberOfSeasons"),
            numberOfEpisodes = item.optIntOrNull("numberOfEpisodes"),
        )
    }

    private fun parseEpisode(item: JSONObject, index: Int): LocalEpisode? {
        val id = item.optString("id").trim().ifEmpty { item.optString("path").trim() }
        if (id.isEmpty()) return null
        val episodeName = item.cleanString("episodeName")
        val season = item.optIntOrNull("season")
        val episode = item.optIntOrNull("episode")
        val fallbackTitle = when {
            season != null && episode != null -> "עונה $season פרק $episode"
            episode != null -> "פרק $episode"
            else -> "פרק ${index + 1}"
        }

        return LocalEpisode(
            id = id,
            filename = item.cleanString("filename").orEmpty(),
            title = episodeName ?: fallbackTitle,
            overview = item.cleanString("episodeOverview"),
            imageUrl = resolveImageUrl(item.cleanString("episodeImage")),
            season = season,
            episode = episode,
            runtime = item.optIntOrNull("runtime"),
            streamUrl = item.cleanString("streamUrl")?.let(::resolveStreamUrl).orEmpty(),
        )
    }

    private fun resolveImageUrl(image: String?): String? {
        if (image.isNullOrBlank()) return null
        if (image.startsWith("http://") || image.startsWith("https://")) return image
        return siteBaseUrl + "/" + image.trimStart('/')
    }

    private fun getJsonObject(url: String): JSONObject {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
        }
        try {
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }
}

private fun JSONObject.optDoubleOrNull(key: String): Double? =
    if (has(key) && !isNull(key)) optDouble(key) else null

private fun JSONObject.optIntOrNull(key: String): Int? =
    if (has(key) && !isNull(key)) optInt(key) else null

private fun JSONObject.cleanString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    val value = optString(key).trim()
    return value.takeIf { it.isNotEmpty() && !it.equals("null", ignoreCase = true) }
}

private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (i in 0 until length()) {
            optString(i).trim().takeIf { it.isNotEmpty() }?.let(::add)
        }
    }
}
