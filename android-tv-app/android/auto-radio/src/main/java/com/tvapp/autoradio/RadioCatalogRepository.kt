package com.tvapp.autoradio

import android.content.Context
import android.net.Uri
import androidx.media3.common.MimeTypes
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
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
        directStreamUrlFor(stationId)?.let { return Uri.parse(it) }
        stationById(stationId)?.streamUrl?.takeIf { it.isNotBlank() }?.let { return Uri.parse(it) }

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
            "rd_891",
            "rd_kol_ramat_hasharon",
            "rd_hakatze",
            "rd_sahar" -> MimeTypes.AUDIO_MPEG

            "rd_90",
            "rd_91",
            "rd_102",
            "rd_102Eilat",
            "rd_1045",
            "rd_1075",
            "rd_gly",
            "rd_fm995",
            "rd_kol_rega",
            "rd_ashams",
            "rd_radio_nas",
            "rd_kol_hashfela",
            "rd_radio_nahariya",
            "rd_hatahana",
            "rd_local_wcrb",
            "rd_local_wzlx",
            "rd_local_wrko",
            "rd_local_kiss108" -> MimeTypes.AUDIO_AAC

            "rd_local_wbur",
            "rd_local_gbh",
            "rd_local_wers",
            "rd_local_wumb",
            "rd_local_whrb",
            "rd_local_wmbr",
            "rd_local_wxrv" -> MimeTypes.AUDIO_MPEG

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
            "rd_ashams" -> "https://cdna.streamgates.net/Ashams/Live/icecast.audio"
            "rd_radio_nas" -> "https://cdna.streamgates.net/RadioNas/Live-Audio/icecast.audio"
            "rd_kol_hashfela" -> "http://1036kh.cdnwz.net/1036kh"
            "rd_kol_ramat_hasharon" -> "https://radio.streamgates.net/stream/1036"
            "rd_radio_nahariya" -> "https://cast.radionahariya.com:8443/main.mp3"
            "rd_hatahana" -> "https://cdn.cybercdn.live/Hatahana_1015/Live_Audio/icecast.audio"
            "rd_hakatze" -> "https://kzradio.mediacast.co.il/kzradio_live/kzradio/icecast.audio"
            "rd_sahar" -> "https://live.ecast.co.il/stream/sahar/stream"
            "rd_local_wbur" -> "http://wbur-sc.streamguys.com/wbur"
            "rd_local_gbh" -> "https://wgbh-live.streamguys1.com/wgbh.mp3"
            "rd_local_wcrb" -> "https://wgbh-live.streamguys1.com/classical-hi"
            "rd_local_wers" -> "http://marconi.emerson.edu:8000/wers"
            "rd_local_wumb" -> "http://wumb.streamguys1.com/wumb919fast"
            "rd_local_whrb" -> "http://stream.whrb.org:8000/whrb-mp3"
            "rd_local_wmbr" -> "https://wmbr.org:8002/hi"
            "rd_local_wxrv" -> "http://72.13.83.130:8010/;.mp3"
            "rd_local_wzlx" -> "https://stream.revma.ihrhls.com/zc7730"
            "rd_local_wrko" -> "https://stream.revma.ihrhls.com/zc7750"
            "rd_local_kiss108" -> "http://stream.revma.ihrhls.com/zc1097"
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
            val group = item.optString("group")
                .ifBlank { item.optString("scope") }
                .ifBlank { item.optString("stationGroup") }
                .ifBlank { inferStationGroup(id, name) }

            if (id.isBlank() || name.isBlank() || (type.isNotBlank() && type != "radio")) {
                continue
            }

            stations += RadioStation(
                id = id,
                name = name,
                logo = item.optString("logo").ifBlank { item.optString("image") }.ifBlank { null },
                streamUrl = streamUrl.ifBlank { null },
                mimeType = mimeType.ifBlank { null },
                group = normalizeStationGroup(group),
            )
        }

        return stations.sortedBy { it.name }
    }

    private fun normalizeStationGroup(group: String): String {
        return when (group.trim().lowercase(Locale.US)) {
            "local", "locals", "regional", "region" -> "local"
            "israeli", "israel", "israelis", "national" -> "israelis"
            "world", "global", "international", "music" -> "world"
            else -> "israelis"
        }
    }

    private fun inferStationGroup(id: String, name: String): String {
        val normalizedId = id.lowercase(Locale.US)
        val normalizedName = name.lowercase(Locale.getDefault())
        val localIds = setOf(
            "rd_local_wbur",
            "rd_local_gbh",
            "rd_local_wcrb",
            "rd_local_wers",
            "rd_local_wumb",
            "rd_local_whrb",
            "rd_local_wmbr",
            "rd_local_wxrv",
            "rd_local_wzlx",
            "rd_local_wrko",
            "rd_local_kiss108",
        )
        if (normalizedId in localIds) {
            return "local"
        }

        val localNameHints = listOf(
            "boston",
            "cambridge",
            "lexington",
            "massachusetts",
        )
        return if (localNameHints.any { normalizedName.contains(it) }) "local" else "israelis"
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
            RadioStation(id = "rd_world_kiis", name = "102.7 KIIS FM", logo = "https://i.iheart.com/v3/re/assets.brands/2ebe753539305728784b0f3b178eae45?ops=gravity(%22center%22),contain(360,360),quality(80),format(%22png%22)", streamUrl = "https://stream.revma.ihrhls.com/zc185", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_z100", name = "Z100 New York", logo = "https://i.iheart.com/v3/re/assets.brands/5e7b5d50bee47a8a2b396059?ops=gravity(%22center%22),contain(360,360)&quality=80", streamUrl = "http://stream.revma.ihrhls.com/zc1469", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_bbc_radio_1", name = "BBC Radio 1", logo = "https://cdn-radiotime-logos.tunein.com/s24939q.png", streamUrl = "http://a.files.bbci.co.uk/ms6/live/3441A116-B12E-4D2F-ACA8-C1984642FA4B/audio/simulcast/hls/nonuk/pc_hd_abr_v2/ak/bbc_radio_one.m3u8", mimeType = MimeTypes.APPLICATION_M3U8, group = "world"),
            RadioStation(id = "rd_world_capital_london", name = "Capital FM London", logo = "https://imgs.capitalfm.com/images/573609?format=png&signature=fxgDCsRPRQMvt-WaQM8YWFAMFa8=", streamUrl = "http://media-ice.musicradio.com/CapitalMP3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_skyrock", name = "Skyrock", logo = "https://play-lh.googleusercontent.com/dPiQ01OUKZVfRZUbbb-EVK5g9miS_K-xrxHgmBbynGG-GQ53yt3GzFKr0zUTnb-xswQ=s200-rw", streamUrl = "http://icecast.skyrock.net/s/natio_mp3_128k", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_radio_paradise", name = "Radio Paradise", logo = "https://radioparadise.com/apple-touch-icon.png", streamUrl = "http://stream-uk1.radioparadise.com/aac-320", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_kexp", name = "KEXP 90.3 Seattle", logo = "https://www.kexp.org/static/assets/img/favicon-32x32.png", streamUrl = "https://kexp.streamguys1.com/kexp160.aac", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_fip", name = "FIP", logo = "https://upload.wikimedia.org/wikipedia/fr/thumb/d/d5/FIP_logo_2005.svg/1024px-FIP_logo_2005.svg.png", streamUrl = "http://icecast.radiofrance.fr/fip-hifi.aac", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_fun_radio", name = "Fun Radio France", logo = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Logo_Fun_Radio_%282021%29.svg/1280px-Logo_Fun_Radio_%282021%29.svg.png", streamUrl = "http://icecast.funradio.fr/fun-1-44-128", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_swr3", name = "SWR3", logo = "https://swr3.de/assets/swr3/icons/apple-touch-icon.png", streamUrl = "https://liveradio.swr.de/sw282p3/swr3/play.mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_classic_fm", name = "Classic FM UK", logo = "http://www.classicfm.com/assets_v4r/classic/img/favicon-196x196.png", streamUrl = "http://ice-the.musicradio.com/ClassicFMMP3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_virgin_radio_uk", name = "Virgin Radio UK", logo = "https://www.celsoazevedo.com/files/2022/virgin-radio-uk.jpg", streamUrl = "https://radio.virginradio.co.uk/stream", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_swiss_jazz", name = "Radio Swiss Jazz", logo = "http://www.radioswissjazz.ch/favicon.ico", streamUrl = "http://stream.srg-ssr.ch/m/rsj/mp3_128", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_ibiza_global", name = "Ibiza Global Radio", logo = "https://static-media.streema.com/media/cache/3f/59/3f598fc0753b556f206a5c9d80d034ea.jpg", streamUrl = "http://ibizaglobalradio.streaming-pro.com:8024/", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_triple_j", name = "Triple J", logo = "http://www.abc.net.au/core-assets/triplej/favicon-32x32.png", streamUrl = "http://abc.streamguys1.com/live/triplejnsw/icecast.audio", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_npo_3fm", name = "NPO 3FM", logo = "https://www.npo3fm.nl/apple-touch-icon.png", streamUrl = "https://icecast.omroep.nl/3fm-bb-mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_radio_x_london", name = "Radio X London", logo = "http://www.radiox.co.uk/assets_v4r/xfm/img/favicon-196x196.png", streamUrl = "http://media-the.musicradio.com/RadioXLondonMP3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_heart_london", name = "Heart London", logo = "https://cdn-profiles.tunein.com/s2846/images/logoq.jpg", streamUrl = "http://ice-sov.musicradio.com/HeartLondonMP3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_smooth_london", name = "Smooth Radio London", logo = "https://www.smoothradio.com/assets_v4r/smooth/img/favicon-196x196.png", streamUrl = "http://media-the.musicradio.com/SmoothLondonMP3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_los_40", name = "Los 40", logo = "https://los40es00.epimg.net/iconos/v1.x/v1.0/touch-apple.png", streamUrl = "https://playerservices.streamtheworld.com/api/livestream-redirect/Los40.mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_cadena_100", name = "Cadena 100", logo = "https://www.cadena100.es/estaticos/apple-touch-icon-192x192.png", streamUrl = "http://cadena100-streamers-mp3.flumotion.com/cope/cadena100.mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_radio_italia", name = "Radio Italia", logo = "https://www.radioitalia.it/images/logo-radioitalia.png", streamUrl = "https://radioitaliasmi.akamaized.net/hls/live/2093120/RISMI/stream01/streamPlaylist.m3u8", mimeType = MimeTypes.APPLICATION_M3U8, group = "world"),
            RadioStation(id = "rd_world_rai_radio_2", name = "Rai Radio 2", logo = "https://i.imgur.com/gWbnr2R.jpg", streamUrl = "http://icestreaming.rai.it/2.mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_radio_deejay", name = "Radio Deejay", logo = "https://www.deejay.it/favicon.ico", streamUrl = "https://4c4b867c89244861ac216426883d1ad0.msvdn.net/radiodeejay/radiodeejay/master_ma.m3u8", mimeType = MimeTypes.APPLICATION_M3U8, group = "world"),
            RadioStation(id = "rd_world_groove_salad", name = "SomaFM Groove Salad", logo = "https://somafm.com/img3/groovesalad-400.jpg", streamUrl = "https://ice6.somafm.com/groovesalad-128-mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
            RadioStation(id = "rd_world_indie_pop_rocks", name = "SomaFM Indie Pop Rocks", logo = "https://somafm.com/img3/indiepop-400.jpg", streamUrl = "https://ice6.somafm.com/indiepop-128-aac", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_jazz24", name = "Jazz24", logo = "https://npr.brightspotcdn.com/dims4/default/032ce25/2147483647/strip/true/crop/900x900+0+0/resize/1760x1760!/format/webp/quality/90/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F98%2Ff7%2F48229ba341b0b1c8933834130d10%2Fjazz24.jpg", streamUrl = "https://knkx-live-a.edge.audiocdn.com/6285_256k", mimeType = MimeTypes.AUDIO_AAC, group = "world"),
            RadioStation(id = "rd_world_rfi_musique", name = "RFI Musique", logo = "https://musique.rfi.fr//mstile-144x144.png", streamUrl = "http://live02.rfi.fr/rfimusiquemonde-96k.mp3", mimeType = MimeTypes.AUDIO_MPEG, group = "world"),
        ).sortedBy { it.name }
    }
}
