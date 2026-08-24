package com.tvapp.autoradio

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.Executors

class RadioMediaLibraryService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var repository: RadioCatalogRepository
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate() {
        super.onCreate()

        setMediaNotificationProvider(
            DefaultMediaNotificationProvider(this).apply {
                setSmallIcon(R.drawable.ic_notification_radio)
            }
        )

        repository = RadioCatalogRepository(BuildConfig.RADIO_API_BASE_URL)
        player = ExoPlayer.Builder(this).build().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true,
            )
            setHandleAudioBecomingNoisy(true)
            repeatMode = Player.REPEAT_MODE_OFF
        }

        session = MediaLibrarySession.Builder(this, player, RadioLibraryCallback())
            .setId("tv-app-radio")
            .setSessionActivity(mainActivityPendingIntent())
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession {
        return session
    }

    override fun onDestroy() {
        session.release()
        player.release()
        executor.shutdown()
        super.onDestroy()
    }

    private inner class RadioLibraryCallback : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem(), params))
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            if (parentId != ROOT_ID) {
                return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
            }

            return Futures.submit<LibraryResult<ImmutableList<MediaItem>>>(
                {
                    val stations = repository.getStations()
                    val items = stations
                        .map { it.toMediaItem() }
                        .let { applyPaging(it, page, pageSize) }

                    LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                },
                executor,
            )
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            return Futures.submit<MutableList<MediaItem>>(
                {
                    val stations = repository.getStations()
                    mediaItems.mapNotNull { requested ->
                        val station = stations.firstOrNull { it.id == requested.mediaId }
                        station?.toMediaItem() ?: requested.takeIf { it.localConfiguration != null }
                    }.toMutableList()
                },
                executor,
            )
        }
    }

    private fun rootItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(ROOT_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(getString(R.string.radio_root_title))
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build()
            )
            .build()
    }

    private fun RadioStation.toMediaItem(): MediaItem {
        val metadataBuilder = MediaMetadata.Builder()
            .setTitle(name)
            .setArtist(getString(R.string.radio_root_title))
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .setExtras(Bundle().apply { putBoolean("is_live", true) })

        logo?.let { metadataBuilder.setArtworkUri(resolveArtworkUri(it)) }

        val mediaItemBuilder = MediaItem.Builder()
            .setMediaId(id)
            .setUri(repository.streamUriFor(id))
            .setMediaMetadata(metadataBuilder.build())

        repository.streamMimeTypeFor(id)?.let { mediaItemBuilder.setMimeType(it) }

        return mediaItemBuilder.build()
    }

    private fun resolveArtworkUri(logo: String): Uri {
        if (logo.startsWith("http://") || logo.startsWith("https://")) {
            return Uri.parse(logo)
        }

        return Uri.parse("${BuildConfig.RADIO_API_BASE_URL.trimEnd('/')}/ch/$logo")
    }

    private fun mainActivityPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun applyPaging(items: List<MediaItem>, page: Int, pageSize: Int): List<MediaItem> {
        if (page < 0 || pageSize <= 0) {
            return items
        }

        val fromIndex = page * pageSize
        if (fromIndex >= items.size) {
            return emptyList()
        }

        return items.subList(fromIndex, minOf(fromIndex + pageSize, items.size))
    }

    private companion object {
        const val ROOT_ID = "radio_root"
    }
}
