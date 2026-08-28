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
        return streamMetadataNowPlaying(station)
    }

    fun nowPlayingFromMetadataText(rawMetadata: String?): NowPlayingInfo? {
        return rawMetadata
            ?.htmlToPlainText()
            ?.parseIcyStreamInfo()
            ?.takeIf { it.title.isUsefulNowPlayingText() }
    }

    private fun streamMetadataNowPlaying(station: RadioStation): NowPlayingInfo? {
        val streamUrl = catalogRepository.streamUriFor(station.id).toString()
        return fetchIcyStreamInfo(streamUrl)
            ?.takeIf { it.title.isUsefulNowPlayingText() }
    }

    private fun fetchIcyStreamInfo(url: String): NowPlayingInfo? {
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
                ?.let(::nowPlayingFromMetadataText)
        }
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

    private fun String.isUsefulNowPlayingText(): Boolean {
        val normalized = lowercase(Locale.US).trim()
        return normalized.isNotBlank() &&
            normalized !in IGNORED_TITLES &&
            IGNORED_TITLE_PARTS.none { normalized.contains(it) }
    }

    private fun String.parseIcyStreamInfo(): NowPlayingInfo? {
        val compact = replace(Regex("\\s+"), " ").trim()
        if (compact.isBlank()) {
            return null
        }

        val fields = STREAM_KEY_VALUE_REGEX.findAll(compact)
            .associate { match ->
                match.groupValues[1].lowercase(Locale.US) to match.groupValues[2].trim()
            }
        val program = fields.firstValue("program", "show", "showname", "programname", "program_name")
        val song = fields.firstValue("text", "title", "song", "track", "cue_title")
        val artist = fields.firstValue("artist", "trackartist", "track_artist", "cue_artist")
            ?: compact.substringBeforeFirstField()
                .trim()
                .trimEnd('-', '–', '—', ':', '|')
                .trim()
                .takeIf { it.isUsefulNowPlayingText() }

        if (!song.isNullOrBlank()) {
            val title = listOfNotNull(artist, song)
                .filter { it.isNotBlank() }
                .joinToString(" - ")
                .cleanDisplayMetadata()
            return NowPlayingInfo(
                title = title,
                detail = program?.cleanDisplayMetadata(),
            )
        }

        val cleaned = compact
            .replace(STREAM_KEY_VALUE_FIELDS_REGEX, "")
            .cleanDisplayMetadata()
        if (cleaned.isBlank()) {
            return program?.cleanDisplayMetadata()?.let { NowPlayingInfo(title = it) }
        }

        return NowPlayingInfo(
            title = cleaned,
            detail = program?.cleanDisplayMetadata(),
        )
    }

    private fun Map<String, String>.firstValue(vararg keys: String): String? {
        return keys.firstNotNullOfOrNull { key ->
            get(key)?.takeIf { it.isNotBlank() }
        }
    }

    private fun String.substringBeforeFirstField(): String {
        val firstField = STREAM_KEY_VALUE_REGEX.find(this)?.range?.first ?: return this
        return substring(0, firstField)
    }

    private fun String.cleanDisplayMetadata(): String {
        return replace(Regex("\\s+[-–—|:]\\s*$"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
            .trimEnd('-', '–', '—')
            .trim()
    }

    private companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 7_000
        private const val USER_AGENT = "TVAppRadio/1.0"
        private val STREAM_TITLE_REGEX = Regex("StreamTitle='([^']*)'", RegexOption.IGNORE_CASE)
        private val STREAM_KEY_VALUE_REGEX = Regex("""\b([A-Za-z_][A-Za-z0-9_]*)=["']([^"']*)["']""")
        private val STREAM_KEY_VALUE_FIELDS_REGEX = Regex("""\s+\w+=["'][^"']*["']""")
        private val IGNORED_TITLES = setOf("unknown", "live", "radio")
        private val IGNORED_TITLE_PARTS = listOf(
            "powered by",
            "cdn",
            "multix",
        )
    }
}
