package com.tvapp.autoradio

import android.content.Context
import android.net.Uri
import androidx.media3.common.MimeTypes
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicReference

class RadioCatalogRepository(
    context: Context,
    private val baseUrl: String,
) {
    private val appContext = context.applicationContext
    private val cachedStations = AtomicReference<List<RadioStation>>(emptyList())
    private val cachedSource = AtomicReference<RadioCatalogSource?>(null)

    fun getStations(forceRefresh: Boolean = false): List<RadioStation> {
        val source = RadioCatalogSettings.getSource(appContext)
        val cached = cachedStations.get()
        if (!forceRefresh && cachedSource.get() == source && cached.isNotEmpty()) {
            return cached
        }

        return when (source) {
            RadioCatalogSource.ApiProxy -> getApiProxyStations(cached)
            RadioCatalogSource.StaticFile -> getStaticFileStations(cached)
        }.also {
            cachedSource.set(source)
        }
    }

    fun clearCache() {
        cachedStations.set(emptyList())
        cachedSource.set(null)
    }

    private fun getApiProxyStations(cached: List<RadioStation>): List<RadioStation> {
        val fallbackStations = fallbackStations()
        return try {
            val connection = URL("${baseUrl.trimEnd('/')}/radio_channels").openConnection() as HttpURLConnection
            connection.connectTimeout = 8_000
            connection.readTimeout = 12_000
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")

            try {
                val responseCode = connection.responseCode
                if (responseCode !in 200..299) {
                    return cached.ifEmpty { fallbackStations }
                }

                val body = connection.inputStream.bufferedReader().use(BufferedReader::readText)
                val stations = parseStations(body)
                if (stations.isEmpty()) {
                    return cached.ifEmpty { fallbackStations }
                }
                cachedStations.set(stations)
                stations
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            cached.ifEmpty { fallbackStations }
        }
    }

    private fun getStaticFileStations(cached: List<RadioStation>): List<RadioStation> {
        return try {
            val body = appContext.resources.openRawResource(R.raw.radio_channels)
                .bufferedReader()
                .use(BufferedReader::readText)
            val stations = parseStations(body)
            if (stations.isEmpty()) {
                cached.ifEmpty { fallbackStations() }
            } else {
                cachedStations.set(stations)
                stations
            }
        } catch (_: Exception) {
            cached.ifEmpty { fallbackStations() }
        }
    }

    fun streamUriFor(stationId: String): Uri {
        stationById(stationId)?.streamUrl?.takeIf { it.isNotBlank() }?.let { return Uri.parse(it) }
        directStreamUrlFor(stationId)?.let { return Uri.parse(it) }

        return Uri.parse("${baseUrl.trimEnd('/')}/stream")
            .buildUpon()
            .appendQueryParameter("channel_id", stationId)
            .build()
    }

    fun streamMimeTypeFor(stationId: String): String? {
        stationById(stationId)?.mimeType?.takeIf { it.isNotBlank() }?.let { return it }

        return when (stationId) {
            "rd_88",
            "rd_bet",
            "rd_gimel",
            "rd_culture",
            "rd_music",
            "rd_moreshet",
            "rd_kankids",
            "rd_reka",
            "rd_makan" -> MimeTypes.APPLICATION_MPD

            "rd_100",
            "rd_sport5",
            "rd_1064" -> MimeTypes.APPLICATION_M3U8

            "rd_97",
            "rd_1015",
            "rd_103",
            "rd_glz",
            "rd_glglz",
            "rd_891" -> MimeTypes.AUDIO_MPEG

            "rd_90",
            "rd_91",
            "rd_102",
            "rd_102Eilat",
            "rd_1045",
            "rd_1075",
            "rd_gly",
            "rd_fm995" -> MimeTypes.AUDIO_AAC

            else -> null
        }
    }

    fun artworkUriFor(logo: String): Uri {
        if (logo.startsWith("http://") || logo.startsWith("https://")) {
            return Uri.parse(logo)
        }

        return Uri.parse("${baseUrl.trimEnd('/')}/ch/$logo")
    }

    private fun stationById(stationId: String): RadioStation? {
        return getStations().firstOrNull { it.id == stationId }
    }

    private fun directStreamUrlFor(stationId: String): String? {
        return when (stationId) {
            "rd_90" -> "https://cdn.cybercdn.live/Emtza_Haderech/Live_Audio/icecast.audio"
            "rd_91" -> "https://cdn.cybercdn.live/Lev_Hamedina/Audio/icecast.audio"
            "rd_97" -> "https://cdn.cybercdn.live/Darom_97FM/Live/icecast.audio"
            "rd_101" -> "https://radio.streamgates.net/stream/101fm"
            "rd_1015" -> "https://cdn.cybercdn.live/Darom_1015FM/Live/icecast.audio"
            "rd_102" -> "https://cdn88.mediacast.co.il/102-tlv-live/102fm_aac/icecast.audio"
            "rd_102Eilat" -> "https://cdn.cybercdn.live/Eilat_Radio/Live/icecast.audio"
            "rd_1045" -> "https://cdn.cybercdn.live/Tzafon_NonStop/Live_Audio/icecast.audio"
            "rd_1075" -> "https://1075.livecdn.biz/radiohaifa"
            "rd_891" -> "https://cdn.cybercdn.live/Pervoia/Audio/icecast.audio"
            "rd_gly" -> "https://cdn.cybercdn.live/Galei_Israel/Live/icecast.audio"
            "rd_fm995" -> "https://995.livecdn.biz/995fm"
            else -> null
        }
    }

    private fun parseStations(body: String): List<RadioStation> {
        val array = parseStationArray(body)
        val stations = mutableListOf<RadioStation>()

        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val id = item.optString("id").ifBlank { item.optString("channelID") }
            val name = item.optString("name")
            val type = item.optString("type")
            val streamUrl = item.optString("streamUrl")
                .ifBlank { item.optString("stream_url") }
                .ifBlank { item.optString("url") }
                .ifBlank { item.optString("link") }
                .ifBlank { item.optJSONObject("linkDetails")?.optString("link").orEmpty() }
                .ifBlank { item.optJSONObject("linkDetails")?.optString("live").orEmpty() }
            val mimeType = item.optString("mimeType")
                .ifBlank { item.optString("mime_type") }
                .ifBlank { item.optString("contentType") }

            if (id.isBlank() || name.isBlank() || (type.isNotBlank() && type != "radio")) {
                continue
            }

            stations += RadioStation(
                id = id,
                name = name,
                logo = item.optString("logo").ifBlank { item.optString("image") }.ifBlank { null },
                streamUrl = streamUrl.ifBlank { null },
                mimeType = mimeType.ifBlank { null },
            )
        }

        return stations.sortedBy { it.name }
    }

    private fun parseStationArray(body: String): JSONArray {
        val trimmed = body.trim()
        if (trimmed.startsWith("[")) {
            return JSONArray(trimmed)
        }

        val root = JSONObject(trimmed)
        return root.optJSONArray("radio_channels")
            ?: root.optJSONArray("channels")
            ?: root.optJSONArray("stations")
            ?: JSONArray()
    }

    private fun fallbackStations(): List<RadioStation> {
        return listOf(
            RadioStation(id = "rd_glglz", name = "גלגל\"צ", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/glglz.jpg"),
            RadioStation(id = "rd_88", name = "כאן 88", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/88fm.png"),
            RadioStation(id = "rd_90", name = "90FM רדיו תשעים", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/90fm.jpg"),
            RadioStation(id = "rd_91", name = "91FM רדיו לב המדינה", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/91fm.jpg"),
            RadioStation(id = "rd_97", name = "97FM רדיו דרום", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/97fm.jpg"),
            RadioStation(id = "rd_99", name = "ECO 99FM", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/99fm.png"),
            RadioStation(id = "rd_100", name = "100FM רדיוס", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/100fm.jpg"),
            RadioStation(id = "rd_101", name = "101FM רדיו ירושלים", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/101fm.png"),
            RadioStation(id = "rd_1015", name = "101.5FM רדיו דרום", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/1015fm.jpg"),
            RadioStation(id = "rd_102", name = "102FM רדיו תל אביב", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/102fm.jpg"),
            RadioStation(id = "rd_102Eilat", name = "102FM רדיו קול הים האדום", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/102Eilatfm.jpg"),
            RadioStation(id = "rd_103", name = "103FM רדיו ללא הפסקה", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/103fm.png"),
            RadioStation(id = "rd_1045", name = "104.5FM רדיו צפון", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/1045fm.jpg"),
            RadioStation(id = "rd_1075", name = "107.5FM רדיו חיפה", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/1075fm.jpg"),
            RadioStation(id = "rd_glz", name = "גלי צה\"ל", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/glz.jpg"),
            RadioStation(id = "rd_bet", name = "כאן ב", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/bet.png"),
            RadioStation(id = "rd_gimel", name = "כאן גימל", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/gimel.png"),
            RadioStation(id = "rd_culture", name = "כאן תרבות", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/culture.png"),
            RadioStation(id = "rd_music", name = "כאן קול המוסיקה", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/music.png"),
            RadioStation(id = "rd_moreshet", name = "כאן מורשת", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/moreshet.png"),
            RadioStation(id = "rd_kankids", name = "כאן ילדים", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/23tv.jpg"),
            RadioStation(id = "rd_sport5", name = "ספורט 5 אתר", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/Sport5.png"),
            RadioStation(id = "rd_reka", name = "כאן Reka", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/reka.png"),
            RadioStation(id = "rd_891", name = "Первое Радио 89.1FM", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/891fm.png"),
            RadioStation(id = "rd_1064", name = "Лучшее Радио 106.4FM", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/1064fm.jpg"),
            RadioStation(id = "rd_makan", name = "כאן مكان", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/makan.png"),
            RadioStation(id = "rd_mizrahit", name = "קול הים התיכון", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/mizrahit.png"),
            RadioStation(id = "rd_kolhay", name = "93FM קול חי", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/kolhay.jpg"),
            RadioStation(id = "rd_kolhaymusic", name = "קול חי מיוזיק", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/kolhaymusic.jpg"),
            RadioStation(id = "rd_kolbarama", name = "קול ברמה", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/kolbarama.jpg"),
            RadioStation(id = "rd_kolplay", name = "קול Play", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/kolplay.png"),
            RadioStation(id = "rd_gly", name = "גלי ישראל", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/gly.jpg"),
            RadioStation(id = "rd_fm995", name = "99.5FM רדיו", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/fm95.5.png"),
            RadioStation(id = "rd_noshmim_mizrahit", name = "רדיו נושמים מזרחית", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/noshmim.jpg"),
            RadioStation(id = "rd_diki", name = "רדיו שירי דיכאון", logo = "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/diki.jpg"),
        ).sortedBy { it.name }
    }
}
