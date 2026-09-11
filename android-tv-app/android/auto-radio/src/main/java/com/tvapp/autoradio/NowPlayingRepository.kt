package com.tvapp.autoradio

import android.os.Build
import android.text.Html
import java.net.URLDecoder
import java.nio.charset.Charset
import java.util.Locale

data class NowPlayingInfo(
    val title: String,
    val artist: String? = null,
    val detail: String? = null,
) {
    val fullTitle: String
        get() = if (!artist.isNullOrBlank()) "$artist - $title" else title
}

class NowPlayingRepository {
    fun nowPlayingFromMetadataText(rawMetadata: String?): NowPlayingInfo? {
        return rawMetadata
            ?.repairMetadataEncoding()
            ?.htmlToPlainText()
            ?.decodeUrlIfNeeded()
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
        if (any { it == 'Ã' || it == 'Â' || it == '×' || it == '\uFFFD' }) {
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
        val mojibakeMarkers = count { it == 'Ã' || it == 'Â' || it == '×' || it == '\uFFFD' }
        val suspiciousLatin = count { it in 'À'..'ÿ' }
        val readable = count { it.isLetterOrDigit() || it in '\u0590'..'\u05FF' }
        return hebrew * 8 + readable - replacements * 20 - mojibakeMarkers * 8 - suspiciousLatin * 2
    }

    private fun String.htmlToPlainText(): String {
        val compact = replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
        val decoded = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Html.fromHtml(compact, Html.FROM_HTML_MODE_LEGACY).toString()
            } else {
                @Suppress("DEPRECATION")
                Html.fromHtml(compact).toString()
            }
        } catch (_: Throwable) {
            compact.replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&apos;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&nbsp;", " ")
        }
        return decoded
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun String.decodeUrlIfNeeded(): String {
        return if (contains('%')) {
            runCatching { URLDecoder.decode(this, "UTF-8") }.getOrDefault(this)
        } else {
            this
        }
    }

    private fun String.isUsefulNowPlayingText(): Boolean {
        val normalized = lowercase(Locale.US).trim()
        if (normalized.isBlank()) return false
        if (none { it.isLetterOrDigit() || it in '\u0590'..'\u05FF' }) return false
        return normalized !in IGNORED_TITLES &&
            IGNORED_TITLE_PARTS.none { normalized.contains(it) }
    }

    private data class ParsedTrackInfo(
        val title: String,
        val artist: String? = null,
        val detail: String? = null,
    )

    private fun splitArtistAndTitle(raw: String): ParsedTrackInfo {
        var text = raw.cleanDisplayMetadata()
        if (text.isBlank()) {
            return ParsedTrackInfo(title = "")
        }

        text = text.replace(PREFIX_STRIP_REGEX, "").trim()

        val parts = text.split(TRACK_ARTIST_SEPARATOR_REGEX)
        if (parts.size >= 2) {
            val candidateArtist = parts[0].cleanDisplayMetadata()
            if (parts.size == 3 && parts[2].looksLikeStationBranding()) {
                val candidateTitle = parts[1].cleanDisplayMetadata()
                val branding = parts[2].cleanDisplayMetadata()
                if (candidateArtist.isUsefulNowPlayingText() && candidateTitle.isUsefulNowPlayingText()) {
                    return ParsedTrackInfo(
                        title = candidateTitle,
                        artist = candidateArtist,
                        detail = branding,
                    )
                }
            }

            val candidateTitle = parts.drop(1).joinToString(" - ").cleanDisplayMetadata()
            if (candidateArtist.isUsefulNowPlayingText() && candidateTitle.isUsefulNowPlayingText()) {
                return ParsedTrackInfo(
                    title = candidateTitle,
                    artist = candidateArtist,
                )
            }
        }

        return ParsedTrackInfo(title = text)
    }

    private fun String.stripDuplicateArtistPrefix(artist: String): String {
        val trimmedArtist = artist.trim()
        if (trimmedArtist.isBlank()) return this
        if (startsWith(trimmedArtist, ignoreCase = true)) {
            val remainder = substring(trimmedArtist.length).trim()
            val stripped = remainder.replace(Regex("""^[-–—|:]\s*"""), "").trim()
            if (stripped.isNotBlank()) {
                return stripped
            }
        }
        return this
    }

    private fun String.looksLikeStationBranding(): Boolean {
        val lower = lowercase(Locale.US).trim()
        return lower.contains("fm") ||
            lower.contains("radio") ||
            lower.contains(".co") ||
            lower.contains(".com") ||
            lower.contains("רדיו") ||
            lower.contains("תחנה")
    }

    private fun String.parseIcyStreamInfo(): NowPlayingInfo? {
        val compact = replace(Regex("\\s+"), " ").trim()
        if (compact.isBlank()) {
            return null
        }

        val rawFields = STREAM_KEY_VALUE_REGEX.findAll(compact)
            .associate { match ->
                val key = match.groupValues[1].lowercase(Locale.US)
                val quoted = match.groupValues[3]
                val unquoted = match.groupValues[4]
                val value = (if (quoted.isNotEmpty()) quoted else unquoted).trim()
                key to value
            } + compact.queryMetadataFields()

        val hasAdvertisementMetadata = rawFields["songtype"]?.equals("A", ignoreCase = true) == true ||
            rawFields.keys.any { it in ADVERTISEMENT_METADATA_FIELDS } ||
            TECHNICAL_METADATA_PARTS.any { compact.lowercase(Locale.US).contains(it) }

        val fields = rawFields
            .filterKeys { it !in IGNORED_METADATA_FIELDS }
            .mapValues { (_, value) -> value.cleanDisplayMetadata() }
            .filterValues { it.isUsefulNowPlayingText() && !it.isLikelyTechnicalMetadataValue() }

        val program = fields.firstValue("program", "show", "showname", "programname", "program_name")
        val song = fields.firstValue("streamtitle", "stream_title", "title", "song", "track", "text", "cue_title")
        val artist = fields.firstValue("streamartist", "stream_artist", "artist", "trackartist", "track_artist", "cue_artist")
            ?: compact.substringBeforeFirstField()
                .trim()
                .trimEnd('-', '–', '—', ':', '|')
                .trim()
                .takeIf { it.isUsefulNowPlayingText() && !it.isLikelyTechnicalMetadataValue() }

        val cleanProgram = program?.cleanDisplayMetadata()

        if (!song.isNullOrBlank()) {
            val cleanSong = song.cleanDisplayMetadata()
            val cleanArtist = artist?.cleanDisplayMetadata()

            if (!cleanArtist.isNullOrBlank()) {
                val finalTitle = cleanSong.stripDuplicateArtistPrefix(cleanArtist).ifBlank { cleanSong }
                return NowPlayingInfo(
                    title = finalTitle,
                    artist = cleanArtist,
                    detail = cleanProgram,
                )
            } else {
                val parsed = splitArtistAndTitle(cleanSong)
                return NowPlayingInfo(
                    title = parsed.title,
                    artist = parsed.artist,
                    detail = cleanProgram ?: parsed.detail,
                )
            }
        }

        if (!artist.isNullOrBlank()) {
            val cleanArtist = artist.cleanDisplayMetadata()
            val parsed = splitArtistAndTitle(cleanArtist)
            return NowPlayingInfo(
                title = parsed.title,
                artist = parsed.artist,
                detail = cleanProgram ?: parsed.detail,
            )
        }

        val cleaned = compact
            .replace(STREAM_KEY_VALUE_FIELDS_REGEX, "")
            .cleanDisplayMetadata()

        if (cleaned.isBlank()) {
            if (hasAdvertisementMetadata) {
                return NowPlayingInfo(title = ADVERTISEMENT_TEXT)
            }
            return cleanProgram?.let { NowPlayingInfo(title = it) }
        }

        if (cleaned.isLikelyTechnicalMetadataValue() && hasAdvertisementMetadata) {
            return NowPlayingInfo(title = ADVERTISEMENT_TEXT)
        }

        val parsed = splitArtistAndTitle(cleaned)
        return NowPlayingInfo(
            title = parsed.title,
            artist = parsed.artist,
            detail = cleanProgram ?: parsed.detail,
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

    private fun String.queryMetadataFields(): Map<String, String> {
        val query = queryMetadataText() ?: return emptyMap()
        return query
            .split('&')
            .mapNotNull { part ->
                val separatorIndex = part.indexOf('=')
                if (separatorIndex <= 0) {
                    return@mapNotNull null
                }

                val key = part.substring(0, separatorIndex)
                    .trim()
                    .lowercase(Locale.US)
                    .takeIf { it.isNotBlank() }
                    ?: return@mapNotNull null
                val value = part.substring(separatorIndex + 1).decodeQueryField().trim()
                if (value.isBlank()) null else key to value
            }
            .toMap()
    }

    private fun String.queryMetadataText(): String? {
        if (!contains('?') && !contains('&')) {
            return null
        }
        val queryStart = indexOf('?').takeIf { it >= 0 }?.plus(1) ?: 0
        val candidate = substring(queryStart)
        return candidate.takeIf { candidate.contains('&') && QUERY_METADATA_REGEX.containsMatchIn(candidate) }
    }

    private fun String.decodeQueryField(): String {
        return runCatching { URLDecoder.decode(this, "UTF-8") }.getOrDefault(this)
    }

    private fun String.cleanDisplayMetadata(): String {
        return replace(Regex("\\s+[-–—|:;]\\s*$"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
            .trimEnd('-', '–', '—', ':', '|', ';')
            .trim('"', '\'', '“', '”', '‘', '’', ' ', ';')
    }

    private fun String.isLikelyTechnicalMetadataValue(): Boolean {
        val normalized = trim()
        val lower = normalized.lowercase(Locale.US)
        if (TECHNICAL_METADATA_PARTS.any { lower.contains(it) }) {
            return true
        }

        if (normalized.contains(" ")) {
            return false
        }

        if (normalized.length >= 32) {
            val hasDigits = normalized.any { it.isDigit() }
            val hasLetters = normalized.any { it in 'A'..'Z' || it in 'a'..'z' }
            val hasBase64Symbols = normalized.any { it == '+' || it == '/' || it == '=' }
            if (hasDigits && (hasLetters || hasBase64Symbols)) {
                return true
            }
        }

        return false
    }

    companion object {
        private val TRACK_ARTIST_SEPARATOR_REGEX = Regex("""\s+[-–—|~]\s*|\s*[-–—|~]\s+""")
        private val PREFIX_STRIP_REGEX = Regex("""^(?:now playing|now_playing|np|playing|live|on air)\s*[:\-–—|]\s*""", RegexOption.IGNORE_CASE)
        private val STREAM_KEY_VALUE_REGEX = Regex("""\b([A-Za-z_][A-Za-z0-9_]*)=(?:(["'])(.*?)\2|([^;'&]+))""")
        private val STREAM_KEY_VALUE_FIELDS_REGEX = Regex("""(?:^|\s+|;)\s*\w+=(?:(["']).*?\1|[^;'&]+)\s*;?""")
        const val ADVERTISEMENT_TEXT = "Advertisement"
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
            "buycd",
            "overlay",
            "picture",
            "streamurl",
            "url",
            "website",
        ) + ADVERTISEMENT_METADATA_FIELDS
        private val IGNORED_TITLES = setOf("unknown", "live", "radio", "unknown artist", "various artists", "n/a", "none", "null")
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
        private val QUERY_METADATA_REGEX = Regex("""(?:^|[?&])[A-Za-z_][A-Za-z0-9_]*=""")
    }
}
