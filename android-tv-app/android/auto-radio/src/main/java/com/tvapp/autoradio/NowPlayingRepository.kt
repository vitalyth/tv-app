package com.tvapp.autoradio

import android.os.Build
import android.text.Html
import java.io.BufferedInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.Charset
import java.nio.charset.StandardCharsets
import java.util.Locale

data class NowPlayingInfo(
    val title: String,
    val detail: String? = null,
)

class NowPlayingRepository(
    private val catalogRepository: RadioCatalogRepository,
) {
    fun nowPlayingFor(station: RadioStation): NowPlayingInfo? {
        return stationPageNowPlaying(station.id) ?: streamMetadataNowPlaying(station)
    }

    private fun stationPageNowPlaying(stationId: String): NowPlayingInfo? {
        val url = when (stationId) {
            "rd_103" -> "https://103fm.maariv.co.il/include/OnLineView.aspx"
            "rd_1045" -> "https://1045fm.maariv.co.il/include/OnLineView.aspx"
            "rd_glglz" -> "https://glz.co.il/%D7%92%D7%9C%D7%92%D7%9C%D7%A6/"
            "rd_glz" -> "https://glz.co.il/"
            else -> return null
        }

        val body = fetchText(url)
        if (body.contains("_Incapsula_Resource") || body.contains("Request unsuccessful. Incapsula")) {
            return null
        }

        if (stationId == "rd_glglz" || stationId == "rd_glz") {
            return extractGlzNowPlaying(body)
        }

        val title = extractClassText(body, "play_now_title") ?: return null
        val detail = extractClassText(body, "play_now_info")

        return NowPlayingInfo(
            title = title,
            detail = detail,
        ).takeIf { it.title.isUsefulNowPlayingText() }
    }

    private fun streamMetadataNowPlaying(station: RadioStation): NowPlayingInfo? {
        val streamUrl = catalogRepository.streamUriFor(station.id).toString()
        return fetchIcyStreamTitle(streamUrl)
            ?.takeIf { it.isUsefulNowPlayingText() }
            ?.let { NowPlayingInfo(title = it) }
    }

    private fun fetchText(url: String): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", USER_AGENT)
        }

        return connection.inputStream.use { input ->
            input.reader(StandardCharsets.UTF_8).readText()
        }
    }

    private fun fetchIcyStreamTitle(url: String): String? {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("Icy-MetaData", "1")
        }

        val metadataInterval = connection.getHeaderField("icy-metaint")?.toIntOrNull() ?: return null
        if (metadataInterval <= 0) {
            return null
        }

        BufferedInputStream(connection.inputStream).use { input ->
            var remainingAudioBytes = metadataInterval
            while (remainingAudioBytes > 0) {
                val skipped = input.skip(remainingAudioBytes.toLong()).toInt()
                if (skipped <= 0) {
                    if (input.read() == -1) return null
                    remainingAudioBytes -= 1
                } else {
                    remainingAudioBytes -= skipped
                }
            }

            val metadataLength = input.read()
            if (metadataLength <= 0) {
                return null
            }

            val metadataBytes = ByteArray(metadataLength * 16)
            var offset = 0
            while (offset < metadataBytes.size) {
                val read = input.read(metadataBytes, offset, metadataBytes.size - offset)
                if (read == -1) {
                    break
                }
                offset += read
            }

            val metadata = metadataBytes.decodeBestEffort().trimEnd(Char(0))
            return STREAM_TITLE_REGEX.find(metadata)
                ?.groupValues
                ?.getOrNull(1)
                ?.htmlToPlainText()
                ?.trim()
        }
    }

    private fun extractGlzNowPlaying(body: String): NowPlayingInfo? {
        val lines = body.htmlToPlainLines()
        val nextProgramIndex = lines.indexOfFirst { it.contains("התוכנית הבאה") }
            .takeIf { it >= 0 }
            ?: return null

        val preceding = lines
            .take(nextProgramIndex)
            .filter { it.isUsefulGlzLine() }
            .takeLast(12)

        val liveIndex = preceding.indexOfLast { it.startsWith("חי ") }
        if (liveIndex >= 0) {
            val title = preceding
                .take(liveIndex)
                .lastOrNull { it.isUsefulNowPlayingText() }
                ?: return null
            val detail = preceding[liveIndex]
                .removePrefix("חי")
                .trim()
                .takeIf { it.isUsefulNowPlayingText() }

            return NowPlayingInfo(title = title, detail = detail)
        }

        return preceding
            .lastOrNull { it.isUsefulNowPlayingText() }
            ?.let { NowPlayingInfo(title = it) }
    }

    private fun extractClassText(body: String, className: String): String? {
        val regex = Regex(
            "<[^>]*class=[\"'][^\"']*${Regex.escape(className)}[^\"']*[\"'][^>]*>(.*?)</[^>]+>",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )

        return regex.find(body)
            ?.groupValues
            ?.getOrNull(1)
            ?.htmlToPlainText()
            ?.trim()
            ?.takeIf { it.isNotBlank() }
    }

    private fun ByteArray.decodeBestEffort(): String {
        val utf8 = String(this, StandardCharsets.UTF_8)
        return if (utf8.contains('\uFFFD')) {
            String(this, Charset.forName("windows-1255"))
        } else {
            utf8
        }
    }

    private fun String.htmlToPlainText(): String {
        val compact = replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
        val spanned = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Html.fromHtml(compact, Html.FROM_HTML_MODE_LEGACY)
        } else {
            @Suppress("DEPRECATION")
            Html.fromHtml(compact)
        }
        return spanned.toString()
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun String.htmlToPlainLines(): List<String> {
        val withoutScripts = replace(
            Regex("<(script|style)[^>]*>.*?</\\1>", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)),
            " ",
        )
        return withoutScripts
            .replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
            .replace(Regex("</(div|p|h[1-6]|li|section|article|span|a)>", RegexOption.IGNORE_CASE), "\n")
            .htmlToPlainText()
            .lines()
            .map { it.trim() }
            .filter { it.isNotBlank() }
    }

    private fun String.isUsefulNowPlayingText(): Boolean {
        val normalized = lowercase(Locale.US).trim()
        return normalized.isNotBlank() &&
            normalized !in IGNORED_TITLES &&
            IGNORED_TITLE_PARTS.none { normalized.contains(it) }
    }

    private fun String.isUsefulGlzLine(): Boolean {
        if (isBlank()) {
            return false
        }
        return this !in IGNORED_GLZ_LINES &&
            IGNORED_GLZ_LINE_PARTS.none { contains(it, ignoreCase = true) }
    }

    private companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 7_000
        private const val USER_AGENT = "TVAppRadio/1.0"
        private val STREAM_TITLE_REGEX = Regex("StreamTitle='([^']*)'", RegexOption.IGNORE_CASE)
        private val IGNORED_TITLES = setOf("unknown", "live", "radio")
        private val IGNORED_TITLE_PARTS = listOf(
            "powered by",
            "cdn",
            "multix",
        )
        private val IGNORED_GLZ_LINES = setOf(
            "Image",
            "חיפוש",
            "חיפוש חופשי",
            "הקלידו מילות חיפוש",
            "הכל (0)",
            "אייטמים (0)",
            "פרקים ואוספים (0)",
            "תכניות (0)",
            "אנשי התחנה (0)",
        )
        private val IGNORED_GLZ_LINE_PARTS = listOf(
            "Button:",
            "Input",
            "למעבר לאתר",
            "תכניות ושדרנים",
            "לכל לוח",
        )
    }
}
