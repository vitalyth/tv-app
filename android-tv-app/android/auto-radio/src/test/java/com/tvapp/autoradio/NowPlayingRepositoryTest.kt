package com.tvapp.autoradio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NowPlayingRepositoryTest {
    private val repository = NowPlayingRepository()

    @Test
    fun parsesStandardArtistTitleStream() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Beyonce - Deja vu';StreamUrl='';")
        assertNotNull(info)
        assertEquals("Deja vu", info?.title)
        assertEquals("Beyonce", info?.artist)
        assertNull(info?.detail)
    }

    @Test
    fun parsesEnDashDelimiter() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Coldplay \u2013 Yellow';")
        assertNotNull(info)
        assertEquals("Yellow", info?.title)
        assertEquals("Coldplay", info?.artist)
    }

    @Test
    fun parsesHebrewArtistAndSong() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='עומר אדם - שני משוגעים';")
        assertNotNull(info)
        assertEquals("שני משוגעים", info?.title)
        assertEquals("עומר אדם", info?.artist)
    }

    @Test
    fun parsesArtistWithHyphenatedName() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Jay-Z - Empire State of Mind';")
        assertNotNull(info)
        assertEquals("Empire State of Mind", info?.title)
        assertEquals("Jay-Z", info?.artist)
    }

    @Test
    fun parsesStationBrandingSuffix() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Beyonce - Deja vu - Radio 100FM';")
        assertNotNull(info)
        assertEquals("Deja vu", info?.title)
        assertEquals("Beyonce", info?.artist)
        assertEquals("Radio 100FM", info?.detail)
    }

    @Test
    fun parsesNowPlayingPrefix() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Now Playing: Dua Lipa - Levitating';")
        assertNotNull(info)
        assertEquals("Levitating", info?.title)
        assertEquals("Dua Lipa", info?.artist)
    }

    @Test
    fun parsesStructuredKeyValueFields() {
        val info = repository.nowPlayingFromMetadataText("title='Deja vu' artist='Beyonce' program='Top 40'")
        assertNotNull(info)
        assertEquals("Deja vu", info?.title)
        assertEquals("Beyonce", info?.artist)
        assertEquals("Top 40", info?.detail)
    }

    @Test
    fun stripsDuplicateArtistFromTitle() {
        val info = repository.nowPlayingFromMetadataText("title='Beyonce - Deja vu' artist='Beyonce'")
        assertNotNull(info)
        assertEquals("Deja vu", info?.title)
        assertEquals("Beyonce", info?.artist)
    }

    @Test
    fun handlesSingleTitleWithoutDelimiter() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='חדשות השעה';")
        assertNotNull(info)
        assertEquals("חדשות השעה", info?.title)
        assertNull(info?.artist)
    }

    @Test
    fun decodesUrlEncodedText() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Beyonce%20-%20Deja%20vu';")
        assertNotNull(info)
        assertEquals("Deja vu", info?.title)
        assertEquals("Beyonce", info?.artist)
    }

    @Test
    fun parsesMultipleDashesInSongTitle() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Coldplay - Fix You - Live in Buenos Aires';")
        assertNotNull(info)
        assertEquals("Coldplay", info?.artist)
        assertEquals("Fix You - Live in Buenos Aires", info?.title)
    }

    @Test
    fun detectsAdvertisement() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Advertisement';")
        assertNotNull(info)
        assertEquals("Advertisement", info?.title)
    }

    @Test
    fun handlesEmptyOrBlankMetadata() {
        assertNull(repository.nowPlayingFromMetadataText(""))
        assertNull(repository.nowPlayingFromMetadataText("   "))
        assertNull(repository.nowPlayingFromMetadataText("StreamTitle='';"))
        assertNull(repository.nowPlayingFromMetadataText("StreamTitle='unknown';"))
    }

    @Test
    fun fullTitleHelperFormatsCorrectly() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Beyonce - Deja vu';")
        assertEquals("Beyonce - Deja vu", info?.fullTitle)
    }

    @Test
    fun parsesPipeDelimiter() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Queen | Bohemian Rhapsody';")
        assertNotNull(info)
        assertEquals("Bohemian Rhapsody", info?.title)
        assertEquals("Queen", info?.artist)
    }

    @Test
    fun parsesMetadataWithStreamUrl() {
        val info = repository.nowPlayingFromMetadataText("StreamTitle='Omer Adam - Modeh Ani';StreamUrl='http://stream.example.com';")
        assertNotNull(info)
        assertEquals("Modeh Ani", info?.title)
        assertEquals("Omer Adam", info?.artist)
    }

    @Test
    fun handlesMojibakeUtf8DecodedAsIso() {
        // "עומר אדם" in UTF-8 bytes decoded as ISO-8859-1: "×¢×××¨ ×××"
        val mojibake = "StreamTitle='×¢×××¨ ××× - ×©× × ××©×××¢××';"
        val info = repository.nowPlayingFromMetadataText(mojibake)
        assertNotNull(info)
        assertEquals("שני משוגעים", info?.title)
        assertEquals("עומר אדם", info?.artist)
    }
}

