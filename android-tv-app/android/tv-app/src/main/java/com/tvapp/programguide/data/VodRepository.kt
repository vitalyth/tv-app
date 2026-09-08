package com.tvapp.programguide.data

import com.tvapp.programguide.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class VodRepository(
    private val apiBaseUrl: String = BuildConfig.PROGRAM_GUIDE_API_BASE_URL.trimEnd('/'),
) {
    private val seriesDetailsCache = LinkedHashMap<String, VodSeriesDetails>(32, 0.75f, true)

    fun getProviderLogoUrl(provider: VodProvider): String {
        return apiBaseUrl.removeSuffix("/api") + "/ch/" + provider.logoPath.trimStart('/')
    }

    fun resolveImageUrl(image: String?, isBackdrop: Boolean = false): String? {
        if (image.isNullOrBlank()) return null
        val fullUrl = if (image.startsWith("http://") || image.startsWith("https://")) {
            image
        } else {
            apiBaseUrl.removeSuffix("/api") + "/" + image.trimStart('/')
        }

        val targetWidth = if (isBackdrop) 1280 else 480
        val targetHeight = if (isBackdrop) 720 else 270
        val targetQuality = if (isBackdrop) 85 else 78

        try {
            if (fullUrl.contains("images.frp1.ott.kaltura.com")) {
                var cleaned = fullUrl
                    .replace(Regex("/width/\\d+", RegexOption.IGNORE_CASE), "/width/$targetWidth")
                    .replace(Regex("/height/\\d+", RegexOption.IGNORE_CASE), "/height/$targetHeight")
                    .replace(Regex("/quality/\\d+", RegexOption.IGNORE_CASE), "/quality/$targetQuality")
                if (!cleaned.contains("/width/")) {
                    cleaned = cleaned.trimEnd('/') + "/width/$targetWidth/height/$targetHeight/quality/$targetQuality"
                }
                return cleaned
            }

            if (fullUrl.contains("media3.reshet.tv/image/upload/")) {
                val uploadMarker = "/image/upload/"
                val idx = fullUrl.indexOf(uploadMarker)
                if (idx != -1) {
                    val prefix = fullUrl.substring(0, idx + uploadMarker.length)
                    val suffix = fullUrl.substring(idx + uploadMarker.length)
                    if (!suffix.startsWith("c_") && !suffix.startsWith("w_")) {
                        return "${prefix}c_fill,g_auto,w_${targetWidth},h_${targetHeight},q_${targetQuality},f_auto/$suffix"
                    }
                }
            }
        } catch (_: Exception) {
            return fullUrl
        }

        return fullUrl
    }

    suspend fun loadSeries(
        provider: VodProvider,
        query: String = "",
        category: String? = null,
        limit: Int = 40,
        offset: Int = 0,
    ): VodSeriesPage = withContext(Dispatchers.IO) {
        val queryParams = buildList {
            add("limit=$limit")
            add("offset=$offset")
            if (query.isNotBlank()) {
                add("q=${URLEncoder.encode(query.trim(), "UTF-8")}")
            }
            if (!category.isNullOrBlank() && category != "הכל") {
                add("category=${URLEncoder.encode(category.trim(), "UTF-8")}")
            }
        }.joinToString("&")

        val url = "$apiBaseUrl/${provider.endpoint}?$queryParams"
        val response = getJsonObject(url)

        val categoriesList = mutableListOf<String>()
        val catArray = response.optJSONArray("categories")
        if (catArray != null) {
            for (i in 0 until catArray.length()) {
                val cat = catArray.optString(i).trim()
                if (cat.isNotEmpty()) categoriesList.add(cat)
            }
        }

        val seriesArray = response.optJSONArray("series") ?: JSONArray()
        val seriesList = mutableListOf<VodSeries>()
        for (i in 0 until seriesArray.length()) {
            val item = seriesArray.optJSONObject(i) ?: continue
            val id = item.optString("id").trim()
            if (id.isEmpty()) continue
            val title = item.optString("title").trim()
            val description = item.optString("description").trim()
            val image = resolveImageUrl(item.optString("image").trim().takeIf { it.isNotEmpty() })
            val episodeCount = item.optInt("episodeCount", 0)
            val seasonCount = item.optInt("seasonCount", 0)
            val genre = item.optString("program_genre").trim().takeIf { it.isNotEmpty() }
                ?: item.optString("program_format").trim().takeIf { it.isNotEmpty() }

            seriesList.add(
                VodSeries(
                    id = id,
                    title = title,
                    description = description,
                    imageUrl = image,
                    episodeCount = episodeCount,
                    seasonCount = seasonCount,
                    genre = genre,
                    provider = provider,
                )
            )
        }

        val total = response.optInt("total", offset + seriesList.size)
        val hasMore = response.optBoolean("hasMore", seriesList.size >= limit && (offset + seriesList.size < total))

        VodSeriesPage(
            series = seriesList,
            categories = categoriesList,
            total = total,
            hasMore = hasMore,
        )
    }

    suspend fun loadSeriesDetails(
        provider: VodProvider,
        programId: String,
    ): VodSeriesDetails = withContext(Dispatchers.IO) {
        val cacheKey = "${provider.id}:$programId"
        synchronized(seriesDetailsCache) {
            seriesDetailsCache[cacheKey]?.let { return@withContext it }
        }

        val encodedId = URLEncoder.encode(programId, "UTF-8")
        val url = "$apiBaseUrl/${provider.endpoint}/$encodedId"
        val response = getJsonObject(url)

        val id = response.optString("id", programId).trim()
        val title = response.optString("title").trim()
        val description = response.optString("description").trim()
        val image = resolveImageUrl(response.optString("image").trim().takeIf { it.isNotEmpty() }, isBackdrop = true)
        val episodeCount = response.optInt("episodeCount", 0)
        val seasonCount = response.optInt("seasonCount", 0)
        val genre = response.optString("program_genre").trim().takeIf { it.isNotEmpty() }

        val series = VodSeries(
            id = id,
            title = title,
            description = description,
            imageUrl = image,
            episodeCount = episodeCount,
            seasonCount = seasonCount,
            genre = genre,
            provider = provider,
        )

        val seasonsList = mutableListOf<VodSeason>()
        val seasonsArray = response.optJSONArray("seasons")
        if (seasonsArray != null) {
            for (i in 0 until seasonsArray.length()) {
                val sItem = seasonsArray.optJSONObject(i) ?: continue
                val sId = sItem.optString("season_id").trim()
                if (sId.isEmpty()) continue
                val sTitle = sItem.optString("title").trim().ifEmpty { "עונה ${i + 1}" }
                val sNumber = sItem.optInt("season_number", i + 1)
                seasonsList.add(
                    VodSeason(
                        seasonId = sId,
                        programId = id,
                        title = sTitle,
                        seasonNumber = sNumber,
                    )
                )
            }
        }

        val episodesList = mutableListOf<VodEpisode>()
        val epArray = response.optJSONArray("episodes")
        if (epArray != null) {
            for (i in 0 until epArray.length()) {
                val eItem = epArray.optJSONObject(i) ?: continue
                val eId = eItem.optString("id").trim()
                if (eId.isEmpty()) continue
                val eSeasonId = eItem.optString("season_id").trim().takeIf { it.isNotEmpty() }
                val eTitle = eItem.optString("title", eItem.optString("episodeName")).trim()
                val eDesc = eItem.optString("description", eItem.optString("episodeOverview")).trim()
                val eImage = resolveImageUrl(
                    eItem.optString("image", eItem.optString("episodeImage")).trim().takeIf { it.isNotEmpty() }
                )
                val ePlayUrl = eItem.optString("play_url", eItem.optString("playUrl")).trim().takeIf { it.isNotEmpty() }
                val eStreamEndpoint = eItem.optString("streamEndpoint").trim().takeIf { it.isNotEmpty() }
                val eOrder = eItem.optInt("display_order", i + 1)

                episodesList.add(
                    VodEpisode(
                        id = eId,
                        programId = id,
                        seasonId = eSeasonId,
                        title = eTitle,
                        description = eDesc,
                        imageUrl = eImage,
                        playUrl = ePlayUrl,
                        streamEndpoint = eStreamEndpoint,
                        displayOrder = eOrder,
                    )
                )
            }
        }

        val details = VodSeriesDetails(
            series = series,
            seasons = seasonsList,
            episodes = episodesList,
        )

        synchronized(seriesDetailsCache) {
            seriesDetailsCache[cacheKey] = details
            if (seriesDetailsCache.size > 32) {
                val oldest = seriesDetailsCache.keys.firstOrNull()
                if (oldest != null) seriesDetailsCache.remove(oldest)
            }
        }

        details
    }

    fun buildPlaybackStreamUrl(rawStreamUrl: String, provider: VodProvider): String {
        val cleanUrl = rawStreamUrl.trim()
        if (cleanUrl.isBlank()) return cleanUrl

        if (cleanUrl.contains("/proxy?url=") || cleanUrl.contains("/v/proxy?url=")) {
            return cleanUrl
        }

        val kanVpnMode = BuildConfig.KAN_VOD_VPN_MODE.trim().lowercase()
        val kanVodRequiresVpn = when (kanVpnMode) {
            "direct", "off", "false", "0", "no" -> false
            else -> provider == VodProvider.KAN11
        }
        val forceKanDirect = provider == VodProvider.KAN11 && kanVpnMode in setOf("direct", "off", "false", "0", "no")
        val requiresVpn = !forceKanDirect && (
                kanVodRequiresVpn ||
                        provider == VodProvider.RESHET13 ||
                        cleanUrl.contains("cdn-redge") ||
                        cleanUrl.contains("redge.media") ||
                        cleanUrl.contains("kancdn")
                )

        val referer = when (provider) {
            VodProvider.KAN11 -> "https://www.kan.org.il/"
            VodProvider.RESHET13 -> "https://13tv.co.il/"
            VodProvider.KESHET12 -> "https://www.mako.co.il/"
            VodProvider.CHANNEL14 -> "https://www.c14.co.il/"
            VodProvider.I24NEWS -> "https://www.i24news.tv/"
        }

        val proxyEndpoint = if (requiresVpn) "/v/proxy" else "/proxy"
        val vpnParam = when {
            requiresVpn -> "&vpn=true"
            forceKanDirect -> "&vpn=false"
            else -> ""
        }
        val encodedUrl = URLEncoder.encode(cleanUrl, "UTF-8")
        val encodedReferer = URLEncoder.encode(referer, "UTF-8")

        return "$apiBaseUrl$proxyEndpoint?url=$encodedUrl&referer=$encodedReferer$vpnParam"
    }

    suspend fun resolveEpisodeStream(
        streamEndpoint: String?,
        provider: VodProvider = VodProvider.KAN11,
        fallbackPlayUrl: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        var rawStream: String? = null

        if (!streamEndpoint.isNullOrBlank()) {
            val cleanEndpoint = streamEndpoint.trim()
            val url = when {
                cleanEndpoint.startsWith("http://") || cleanEndpoint.startsWith("https://") -> cleanEndpoint
                cleanEndpoint.startsWith("/api/") -> apiBaseUrl.removeSuffix("/api") + cleanEndpoint
                cleanEndpoint.startsWith("api/") -> apiBaseUrl.removeSuffix("/api") + "/" + cleanEndpoint
                cleanEndpoint.startsWith("/") -> "$apiBaseUrl$cleanEndpoint"
                else -> "$apiBaseUrl/$cleanEndpoint"
            }

            try {
                val response = getJsonObject(url)
                val stream = response.optString("stream").trim()
                if (stream.isNotEmpty()) {
                    rawStream = stream
                }
            } catch (_: Exception) {
            }
        }

        if (rawStream.isNullOrBlank()) {
            rawStream = fallbackPlayUrl?.trim()?.takeIf { it.isNotEmpty() }
        }

        if (rawStream.isNullOrBlank()) {
            return@withContext null
        }

        buildPlaybackStreamUrl(rawStream, provider)
    }

    suspend fun loadRecentItems(): List<VodRecentItem> = withContext(Dispatchers.IO) {
        try {
            val url = "$apiBaseUrl/vod_recent"
            val jsonArray = JSONArray(get(url))
            val items = mutableListOf<VodRecentItem>()
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.optJSONObject(i) ?: continue
                val id = obj.optString("id").trim()
                val episodeId = obj.optString("episodeId", id).trim()
                val title = obj.optString("name").trim().takeIf { it.isNotEmpty() }
                    ?: obj.optString("title").trim()
                val programId = obj.optString("programId").trim().takeIf { it.isNotEmpty() }
                val programName = obj.optString("programName").trim().takeIf { it.isNotEmpty() }
                val channelName = obj.optString("channelName").trim().takeIf { it.isNotEmpty() }
                    ?: obj.optString("vodChannelName").trim().takeIf { it.isNotEmpty() }
                val description = obj.optString("description").trim().takeIf { it.isNotEmpty() }
                    ?: obj.optString("plot").trim().takeIf { it.isNotEmpty() }
                val image = resolveImageUrl(
                    obj.optString("logo").trim().takeIf { it.isNotEmpty() }
                        ?: obj.optString("episodeImage").trim().takeIf { it.isNotEmpty() }
                        ?: obj.optString("programImage").trim().takeIf { it.isNotEmpty() }
                )
                val module = obj.optString("module").trim()
                val provider = when {
                    module.contains("keshet") -> VodProvider.KESHET12
                    module.contains("reshet") -> VodProvider.RESHET13
                    module.contains("14") || module.contains("c14") -> VodProvider.CHANNEL14
                    module.contains("i24") -> VodProvider.I24NEWS
                    else -> VodProvider.KAN11
                }
                items.add(
                    VodRecentItem(
                        id = id,
                        episodeId = episodeId,
                        title = title,
                        programId = programId,
                        programName = programName,
                        channelName = channelName,
                        imageUrl = image,
                        description = description,
                        provider = provider,
                    )
                )
            }
            items
        } catch (e: Exception) {
            emptyList()
        }
    }

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
            body
        } finally {
            connection.disconnect()
        }
    }
}
