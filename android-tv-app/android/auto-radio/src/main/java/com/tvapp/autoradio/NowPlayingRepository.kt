package com.tvapp.autoradio

import android.os.Build
import android.text.Html
import java.nio.charset.Charset
import java.util.Locale

data class NowPlayingInfo(
    val title: String,
    val detail: String? = null,
)

class NowPlayingRepository {
    fun nowPlayingFromMetadataText(rawMetadata: String?): NowPlayingInfo? {
        return rawMetadata
            ?.repairMetadataEncoding()
            ?.htmlToPlainText()
            ?.parseIcyStreamInfo()
            ?.takeIf { it.title.isUsefulNowPlayingText() }
    }

    private fun String.repairMetadataEncoding(): String {
        if (!looksLikeMetadataMojibake()) {
            return this
        }

        val candidates = mutableListOf(this)
        for (bytes in metadataByteCandidates()) {
            candidates.addDecodedCandidate(bytes, "UTF-8")
            candidates.addDecodedCandidate(bytes, "windows-1255")
        }
        return candidates.maxByOrNull { it.metadataTextScore() } ?: this
    }

    private fun String.looksLikeMetadataMojibake(): Boolean {
        if (any { it == 'Ã' || it == 'Â' || it == '×' || it == '�' }) {
            return true
        }

        val letters = count { it in 'A'..'Z' || it in 'a'..'z' || it in 'À'..'ÿ' }
        if (letters == 0) {
            return false
        }

        val suspiciousLatin = count { it in 'À'..'ÿ' }
        return suspiciousLatin >= 4 && suspiciousLatin.toFloat() / letters >= 0.35f
    }

    private fun String.metadataByteCandidates(): List<ByteArray> {
        val candidates = mutableListOf<ByteArray>()
        runCatching { candidates += toByteArray(Charset.forName("ISO-8859-1")) }
        runCatching { candidates += toByteArray(Charset.forName("windows-1252")) }

        val recovered = ByteArray(length)
        forEachIndexed { index, char ->
            val codepoint = char.code
            if (codepoint <= 0xFF) {
                recovered[index] = codepoint.toByte()
                return@forEachIndexed
            }

            val encoded = runCatching {
                char.toString().toByteArray(Charset.forName("windows-1252"))
            }.getOrNull()
            if (encoded?.size != 1 || (char != '?' && encoded[0] == '?'.code.toByte())) {
                return candidates
            }
            recovered[index] = encoded[0]
        }
        candidates += recovered
        return candidates
    }

    private fun MutableList<String>.addDecodedCandidate(bytes: ByteArray, targetCharset: String) {
        try {
            add(String(bytes, Charset.forName(targetCharset)))
        } catch (_: Exception) {
            // Ignore invalid charset conversions; the original value stays as a candidate.
        }
    }

    private fun String.metadataTextScore(): Int {
        val hebrew = count { it in '\u0590'..'\u05FF' }
        val replacements = count { it == '\uFFFD' }
        val mojibakeMarkers = count { it == 'Ã' || it == 'Â' || it == '×' || it == '�' }
        val suspiciousLatin = count { it in 'À'..'ÿ' }
        val readable = count { it.isLetterOrDigit() || it in '\u0590'..'\u05FF' }
        return hebrew * 8 + readable - replacements * 20 - mojibakeMarkers * 8 - suspiciousLatin * 2
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

        val rawFields = STREAM_KEY_VALUE_REGEX.findAll(compact)
            .associate { match ->
                match.groupValues[1].lowercase(Locale.US) to match.groupValues[3].trim()
            }
        val hasAdvertisementMetadata = rawFields.keys.any { it in ADVERTISEMENT_METADATA_FIELDS } ||
            TECHNICAL_METADATA_PARTS.any { compact.lowercase(Locale.US).contains(it) }
        val fields = rawFields
            .filterKeys { it !in IGNORED_METADATA_FIELDS }
            .mapValues { (_, value) -> value.cleanDisplayMetadata() }
            .filterValues { it.isUsefulNowPlayingText() && !it.isLikelyTechnicalMetadataValue() }
        val program = fields.firstValue("program", "show", "showname", "programname", "program_name")
        val song = fields.firstValue("text", "title", "song", "track", "cue_title")
        val artist = fields.firstValue("artist", "trackartist", "track_artist", "cue_artist")
            ?: compact.substringBeforeFirstField()
                .trim()
                .trimEnd('-', '–', '—', ':', '|')
                .trim()
                .takeIf { it.isUsefulNowPlayingText() && !it.isLikelyTechnicalMetadataValue() }

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
            if (hasAdvertisementMetadata) {
                return NowPlayingInfo(title = ADVERTISEMENT_TEXT)
            }
            return program?.cleanDisplayMetadata()?.let { NowPlayingInfo(title = it) }
        }

        if (cleaned.isLikelyTechnicalMetadataValue() && hasAdvertisementMetadata) {
            return NowPlayingInfo(title = ADVERTISEMENT_TEXT)
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

    private fun String.isLikelyTechnicalMetadataValue(): Boolean {
        val normalized = trim()
        val lower = normalized.lowercase(Locale.US)
        if (TECHNICAL_METADATA_PARTS.any { lower.contains(it) }) {
            return true
        }

        val compact = normalized.replace(Regex("\\s+"), "")
        val base64LikeChars = compact.count {
            it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' || it == '=' || it == '-' || it == '_'
        }
        return compact.length >= 32 && base64LikeChars.toFloat() / compact.length >= 0.95f
    }

    private companion object {
        private val STREAM_KEY_VALUE_REGEX = Regex("""\b([A-Za-z_][A-Za-z0-9_]*)=(["'])(.*?)\2""")
        private val STREAM_KEY_VALUE_FIELDS_REGEX = Regex("""(?:^|\s+)\w+=(["']).*?\1""")
        private const val ADVERTISEMENT_TEXT = "Advertisement"
        private val ADVERTISEMENT_METADATA_FIELDS = setOf(
            "ad",
            "adcontext",
            "adid",
            "adtitle",
            "advertisement",
            "breakid",
            "commercial",
            "spot",
        )
        private val IGNORED_METADATA_FIELDS = setOf(
            "duration",
            "id",
            "url",
        ) + ADVERTISEMENT_METADATA_FIELDS
        private val IGNORED_TITLES = setOf("unknown", "live", "radio")
        private val IGNORED_TITLE_PARTS = listOf(
            "powered by",
            "cdn",
            "multix",
        )
        private val TECHNICAL_METADATA_PARTS = listOf(
            "adcontext",
            "doubleclick",
            "googlesyndication",
            "pubads",
            "vast",
        )
    }
}
