package com.tvapp.autoradio

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Metadata
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.extractor.metadata.icy.IcyInfo
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaConstants
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionResult
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata as CastMediaMetadata
import com.google.android.gms.cast.SessionState
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.Session
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.SessionTransferCallback
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class RadioMediaLibraryService : MediaLibraryService() {
    private data class CachedNowPlaying(
        val info: NowPlayingInfo?,
        val loadedAtMs: Long,
    )

    private data class StationMediaEntry(
        val station: RadioStation,
        val groupTitle: String? = null,
    )

    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var repository: RadioCatalogRepository
    private lateinit var nowPlayingRepository: NowPlayingRepository
    private val executor = Executors.newSingleThreadExecutor()
    private val playbackRetryHandler = Handler(Looper.getMainLooper())
    private val nowPlayingCache = ConcurrentHashMap<String, CachedNowPlaying>()
    private var castContext: CastContext? = null
    private var castSession: CastSession? = null
    private var remoteToLocalStation: RadioStation? = null
    private var remoteClientToStop: RemoteMediaClient? = null
    private var isRemoteToLocalTransferInProgress = false
    private var isMovingPlaybackToRemote = false
    private var isStoppingPlayback = false
    private var previousNowPlayingInfo: NowPlayingInfo? = null
    private var currentMediaItemChangedAtMs: Long = 0L
    private var playbackRetryCount = 0
    private var pendingPlaybackRetry: Runnable? = null
    private val castSessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) {
            Log.d(LOG_TAG, "Cast session starting")
        }

        override fun onSessionStartFailed(session: CastSession, error: Int) {
            Log.d(LOG_TAG, "Cast session start failed: $error")
            isMovingPlaybackToRemote = false
        }

        override fun onSessionStarted(session: CastSession, sessionId: String) {
            Log.d(LOG_TAG, "Cast session started: $sessionId")
            attachCastSession(session)
            moveLocalPlaybackToCast(session)
        }

        override fun onSessionEnding(session: CastSession) {
            Log.d(LOG_TAG, "Cast session ending, remoteToLocal=$isRemoteToLocalTransferInProgress")
            remoteClientToStop = session.remoteMediaClient ?: remoteClientToStop
        }

        override fun onSessionEnded(session: CastSession, error: Int) {
            Log.d(LOG_TAG, "Cast session ended: error=$error remoteToLocal=$isRemoteToLocalTransferInProgress")
            val remoteClient = session.remoteMediaClient ?: remoteClientToStop
            detachCastSession()
            if (!isRemoteToLocalTransferInProgress) {
                stopRemotePlayback(remoteClient)
                stopLocalPlayback()
                clearCastTransferState()
            }
        }

        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit

        override fun onSessionResumeFailed(session: CastSession, error: Int) {
            Log.d(LOG_TAG, "Cast session resume failed: $error")
            detachCastSession()
            clearCastTransferState()
        }

        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            Log.d(LOG_TAG, "Cast session resumed, suspended=$wasSuspended")
            attachCastSession(session)
            moveLocalPlaybackToCast(session)
        }

        override fun onSessionSuspended(session: CastSession, reason: Int) {
            Log.d(LOG_TAG, "Cast session suspended: $reason")
        }
    }
    private val sessionTransferCallback = object : SessionTransferCallback() {
        override fun onTransferring(transferType: Int) {
            Log.d(LOG_TAG, "Session transferring: type=$transferType")
            if (transferType == TRANSFER_TYPE_FROM_REMOTE_TO_LOCAL) {
                isRemoteToLocalTransferInProgress = true
                remoteToLocalStation = currentCastStation() ?: currentLocalStation()
                remoteClientToStop =
                    castSession?.remoteMediaClient ?: castContext?.sessionManager?.currentCastSession?.remoteMediaClient
            }
        }

        override fun onTransferred(transferType: Int, sessionState: SessionState) {
            Log.d(LOG_TAG, "Session transferred: type=$transferType")
            if (transferType == TRANSFER_TYPE_FROM_REMOTE_TO_LOCAL) {
                val station = stationFromSessionState(sessionState) ?: remoteToLocalStation ?: currentLocalStation()
                stopRemotePlayback(remoteClientToStop)
                clearCastTransferState()
                station?.let(::resumeLocalPlayback)
            }
        }

        override fun onTransferFailed(transferType: Int, transferFailedReason: Int) {
            Log.d(LOG_TAG, "Session transfer failed: type=$transferType reason=$transferFailedReason")
            if (transferType == TRANSFER_TYPE_FROM_REMOTE_TO_LOCAL) {
                clearCastTransferState()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()

        setShowNotificationForIdlePlayer(SHOW_NOTIFICATION_FOR_IDLE_PLAYER_NEVER)
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider(this).apply {
                setSmallIcon(R.drawable.ic_notification_radio)
            }
        )

        repository = RadioCatalogRepository(this, BuildConfig.RADIO_API_BASE_URL)
        nowPlayingRepository = NowPlayingRepository()
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
            addListener(object : Player.Listener {
                override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                    clearCurrentNowPlaying(mediaItem)
                    notifyPlaybackStateChanged()
                    moveCurrentStationToCastIfConnected()
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_READY -> {
                            clearPendingPlaybackRetry(resetCount = true)
                            moveCurrentStationToCastIfConnected()
                            notifyPlaybackStateChanged()
                        }
                        Player.STATE_IDLE -> {
                            notifyPlaybackStateChanged()
                            stopActivePlaybackIfRemoteIsConnected()
                        }
                        Player.STATE_ENDED -> {
                            val willRetry = schedulePlaybackRetry("stream ended")
                            if (!willRetry) {
                                notifyPlaybackStateChanged()
                                stopActivePlaybackIfRemoteIsConnected()
                            }
                        }
                    }
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (isPlaying) {
                        moveCurrentStationToCastIfConnected()
                    }
                    notifyPlaybackStateChanged()
                }

                override fun onMetadata(metadata: Metadata) {
                    handlePlayerMetadata(metadata)
                }

                override fun onPlayerError(error: PlaybackException) {
                    Log.w(LOG_TAG, "Playback error: ${error.errorCodeName}", error)
                    val willRetry = schedulePlaybackRetry("playback error ${error.errorCodeName}")
                    if (!willRetry) {
                        notifyPlaybackStateChanged()
                    }
                }
            })
        }

        session = MediaLibrarySession.Builder(this, player, RadioLibraryCallback())
            .setId("tv-app-radio")
            .setSessionActivity(mainActivityPendingIntent())
            .build()

        initializeOutputSwitcher()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession {
        return session
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISCONNECT_OUTPUT -> stopActivePlayback(stopService = true)
            ACTION_PAUSE_ACTIVE -> pauseActivePlayback()
            ACTION_PLAY_ACTIVE -> playActivePlayback()
        }
        return super.onStartCommand(intent, flags, startId)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopActivePlayback(stopService = true)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        clearPendingPlaybackRetry(resetCount = true)
        if (!isStoppingPlayback && !isRemoteToLocalTransferInProgress) {
            disconnectCast()
        }
        castContext?.removeSessionTransferCallback(sessionTransferCallback)
        castContext?.sessionManager?.removeSessionManagerListener(castSessionListener, CastSession::class.java)
        detachCastSession()
        session.release()
        player.release()
        executor.shutdown()
        super.onDestroy()
    }

    private fun initializeOutputSwitcher() {
        try {
            castContext = CastContext.getSharedInstance(this).also { context ->
                Log.d(LOG_TAG, "Output Switcher initialized")
                context.addSessionTransferCallback(sessionTransferCallback)
                context.sessionManager.addSessionManagerListener(castSessionListener, CastSession::class.java)
                context.sessionManager.currentCastSession?.takeIf { it.isConnected }?.let(::attachCastSession)
            }
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Output Switcher Cast context is not available", error)
        }
    }

    private fun attachCastSession(session: CastSession) {
        castSession = session
        remoteClientToStop = session.remoteMediaClient
    }

    private fun detachCastSession() {
        castSession = null
    }

    private fun moveLocalPlaybackToCast(session: CastSession) {
        if (isRemoteToLocalTransferInProgress || isMovingPlaybackToRemote) {
            return
        }

        val station = currentLocalStation() ?: return
        val remoteClient = session.remoteMediaClient ?: return
        Log.d(LOG_TAG, "Moving local playback to Cast: ${station.id}")
        remoteClientToStop = remoteClient
        isMovingPlaybackToRemote = true

        if (loadStationOnCast(remoteClient, station)) {
            Log.d(LOG_TAG, "Cast load succeeded, pausing local playback")
            pauseLocalPlaybackForCast()
        }

        isMovingPlaybackToRemote = false
    }

    private fun moveCurrentStationToCastIfConnected() {
        val session = castSession?.takeIf { it.isConnected }
            ?: castContext?.sessionManager?.currentCastSession?.takeIf { it.isConnected }
            ?: return

        attachCastSession(session)
        moveLocalPlaybackToCast(session)
    }

    private fun loadStationOnCast(remoteClient: RemoteMediaClient, station: RadioStation): Boolean {
        val nowPlaying = nowPlayingCache[station.id]?.info
        val metadata = CastMediaMetadata(CastMediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
            putString(CastMediaMetadata.KEY_TITLE, station.name)
            putString(CastMediaMetadata.KEY_ARTIST, nowPlaying?.title ?: NO_INFO_TEXT)
            station.logo?.takeIf { it.isNotBlank() }?.let { logo ->
                addImage(WebImage(resolveArtworkUri(logo)))
            }
        }

        val mediaInfo = MediaInfo.Builder(repository.streamUriFor(station.id).toString())
            .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
            .setContentType(repository.streamMimeTypeFor(station.id) ?: "audio/mpeg")
            .setMetadata(metadata)
            .build()

        val request = MediaLoadRequestData.Builder()
            .setMediaInfo(mediaInfo)
            .setAutoplay(true)
            .build()

        return try {
            remoteClient.load(request)
            true
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to load station on Cast", error)
            false
        }
    }

    private fun currentLocalStation(): RadioStation? {
        val mediaId = player.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() } ?: return null
        return stationById(mediaId)
    }

    private fun currentCastStation(): RadioStation? {
        val contentId = castSession?.remoteMediaClient?.mediaInfo?.contentId ?: return null
        return stationByStreamUrl(contentId)
    }

    private fun stationFromSessionState(sessionState: SessionState): RadioStation? {
        val contentId = sessionState.loadRequestData?.mediaInfo?.contentId ?: return null
        return stationByStreamUrl(contentId)
    }

    private fun stationById(stationId: String): RadioStation? {
        return try {
            repository.getStations().firstOrNull { it.id == stationId }
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to find station by id", error)
            null
        }
    }

    private fun stationByStreamUrl(streamUrl: String): RadioStation? {
        return try {
            repository.getStations().firstOrNull { station ->
                repository.streamUriFor(station.id).toString() == streamUrl
            }
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to find station by stream URL", error)
            null
        }
    }

    private fun resumeLocalPlayback(station: RadioStation) {
        Log.d(LOG_TAG, "Resuming local playback: ${station.id}")
        clearPendingPlaybackRetry(resetCount = true)
        player.setMediaItem(station.toMediaItem())
        player.prepare()
        player.play()
    }

    private fun stopLocalPlayback() {
        Log.d(LOG_TAG, "Stopping local playback")
        clearPendingPlaybackRetry(resetCount = true)
        player.pause()
        player.stop()
        player.clearMediaItems()
    }

    private fun pauseLocalPlaybackForCast() {
        Log.d(LOG_TAG, "Pausing local playback for Cast")
        clearPendingPlaybackRetry(resetCount = true)
        player.pause()
        player.playWhenReady = false
    }

    private fun schedulePlaybackRetry(reason: String): Boolean {
        val station = currentLocalStation() ?: return false
        if (!shouldRetryLocalPlayback()) {
            clearPendingPlaybackRetry(resetCount = true)
            return false
        }
        if (playbackRetryCount >= MAX_PLAYBACK_RETRIES) {
            Log.w(LOG_TAG, "Playback retry limit reached for ${station.id}; reason=$reason")
            clearPendingPlaybackRetry(resetCount = true)
            return false
        }

        pendingPlaybackRetry?.let(playbackRetryHandler::removeCallbacks)
        playbackRetryCount += 1
        val retryStationId = station.id
        val retryDelayMs = PLAYBACK_RETRY_DELAY_MS * playbackRetryCount
        val retry = Runnable {
            pendingPlaybackRetry = null
            val currentStation = currentLocalStation()
            if (currentStation?.id != retryStationId || !shouldRetryLocalPlayback()) {
                return@Runnable
            }

            Log.d(
                LOG_TAG,
                "Retrying playback for $retryStationId after $reason (${playbackRetryCount}/$MAX_PLAYBACK_RETRIES)",
            )
            player.prepare()
            player.play()
        }
        pendingPlaybackRetry = retry
        playbackRetryHandler.postDelayed(retry, retryDelayMs)
        return true
    }

    private fun shouldRetryLocalPlayback(): Boolean {
        val hasRemoteSession = castSession?.isConnected == true ||
            castContext?.sessionManager?.currentCastSession?.isConnected == true ||
            remoteClientToStop != null

        return player.currentMediaItem != null &&
            player.playWhenReady &&
            !hasRemoteSession &&
            !isStoppingPlayback &&
            !isRemoteToLocalTransferInProgress &&
            !isMovingPlaybackToRemote
    }

    private fun clearPendingPlaybackRetry(resetCount: Boolean = false) {
        pendingPlaybackRetry?.let(playbackRetryHandler::removeCallbacks)
        pendingPlaybackRetry = null
        if (resetCount) {
            playbackRetryCount = 0
        }
    }

    private fun stopActivePlaybackIfRemoteIsConnected() {
        if (isStoppingPlayback || isRemoteToLocalTransferInProgress || isMovingPlaybackToRemote) {
            return
        }

        val hasRemoteSession = castSession?.isConnected == true ||
            castContext?.sessionManager?.currentCastSession?.isConnected == true ||
            remoteClientToStop != null

        if (hasRemoteSession) {
            Log.d(LOG_TAG, "Local playback stopped while remote is connected; stopping remote output")
            stopActivePlayback(stopService = true)
        }
    }

    private fun stopActivePlayback(stopService: Boolean) {
        if (isStoppingPlayback) {
            return
        }

        isStoppingPlayback = true
        disconnectCast()
        stopLocalPlayback()
        notifyPlaybackStopped()
        if (stopService) {
            stopSelf()
        }
        isStoppingPlayback = false
    }

    private fun notifyPlaybackStopped() {
        savePlaybackState(stationId = null, isPlaying = false, hasMediaItem = false)
        sendBroadcast(
            Intent(ACTION_PLAYBACK_STOPPED).apply {
                setPackage(packageName)
            }
        )
    }

    private fun notifyPlaybackStateChanged() {
        val stationId = player.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() }
        val hasMediaItem = player.currentMediaItem != null
        savePlaybackState(stationId, player.isPlaying, hasMediaItem)
        sendBroadcast(
            Intent(ACTION_PLAYBACK_STATE_CHANGED).apply {
                setPackage(packageName)
                stationId?.let { putExtra(EXTRA_STATION_ID, it) }
                putExtra(EXTRA_IS_PLAYING, player.isPlaying)
                putExtra(EXTRA_HAS_MEDIA_ITEM, hasMediaItem)
            }
        )
    }

    private fun savePlaybackState(stationId: String?, isPlaying: Boolean, hasMediaItem: Boolean) {
        getSharedPreferences(PLAYBACK_STATE_PREFS, MODE_PRIVATE)
            .edit()
            .putString(EXTRA_STATION_ID, stationId)
            .putBoolean(EXTRA_IS_PLAYING, isPlaying)
            .putBoolean(EXTRA_HAS_MEDIA_ITEM, hasMediaItem)
            .putLong(EXTRA_UPDATED_AT_MS, System.currentTimeMillis())
            .apply()
    }

    private fun pauseActivePlayback() {
        Log.d(LOG_TAG, "Pausing active playback")
        clearPendingPlaybackRetry(resetCount = true)
        try {
            val remoteClient = castSession?.remoteMediaClient
                ?: castContext?.sessionManager?.currentCastSession?.remoteMediaClient
            remoteClient?.pause()
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to pause remote playback", error)
        }
        player.pause()
        player.playWhenReady = false
    }

    private fun playActivePlayback() {
        Log.d(LOG_TAG, "Playing active playback")
        val activeCastSession = castSession?.takeIf { it.isConnected }
            ?: castContext?.sessionManager?.currentCastSession?.takeIf { it.isConnected }

        if (activeCastSession != null) {
            attachCastSession(activeCastSession)
            val remoteClient = activeCastSession.remoteMediaClient
            val station = currentCastStation() ?: currentLocalStation()
            if (remoteClient != null && station != null) {
                try {
                    if (remoteClient.mediaInfo == null) {
                        loadStationOnCast(remoteClient, station)
                    } else {
                        remoteClient.play()
                    }
                    pauseLocalPlaybackForCast()
                    return
                } catch (error: Exception) {
                    Log.w(LOG_TAG, "Failed to resume remote playback", error)
                }
            }
        }

        if (player.currentMediaItem != null) {
            clearPendingPlaybackRetry(resetCount = true)
            player.prepare()
            player.play()
        }
    }

    private fun stopRemotePlayback(remoteClient: RemoteMediaClient?) {
        try {
            Log.d(LOG_TAG, "Stopping remote playback: hasClient=${remoteClient != null}")
            remoteClient?.stop()
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to stop Cast playback", error)
        }
    }

    private fun disconnectCast() {
        stopRemotePlayback(castSession?.remoteMediaClient ?: remoteClientToStop)
        try {
            castContext?.sessionManager?.endCurrentSession(true)
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to end Cast session", error)
        }
        detachCastSession()
        clearCastTransferState()
    }

    private fun clearCastTransferState() {
        isRemoteToLocalTransferInProgress = false
        isMovingPlaybackToRemote = false
        remoteToLocalStation = null
        remoteClientToStop = null
    }

    private inner class RadioLibraryCallback : MediaLibrarySession.Callback {
        override fun onPostConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ) {
            if (controller.isAutomotiveController()) {
                Log.d(LOG_TAG, "Android Auto controller connected: ${controller.packageName}")
            }
        }

        override fun onDisconnected(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ) {
            if (!controller.isAutomotiveController()) {
                return
            }

            Log.d(LOG_TAG, "Android Auto controller disconnected: ${controller.packageName}")
        }

        override fun onPlayerCommandRequest(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            playerCommand: Int,
        ): Int {
            if (playerCommand == Player.COMMAND_STOP) {
                Log.d(LOG_TAG, "Received stop command from controller=${controller.packageName}")
                stopActivePlayback(stopService = true)
                return SessionResult.RESULT_SUCCESS
            }

            return SessionResult.RESULT_SUCCESS
        }

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
            if (parentId == ROOT_ID) {
                return Futures.immediateFuture(
                    LibraryResult.ofItemList(
                        ImmutableList.of(stationsItem(), favoritesItem(), recentlyPlayedItem(), settingsItem()),
                        params,
                    )
                )
            }

            if (parentId == FAVORITES_ID) {
                return Futures.submit<LibraryResult<ImmutableList<MediaItem>>>(
                    {
                        val favoriteIds = favoriteStationIds()
                        val items = repository.getStations()
                            .filter { it.id in favoriteIds }
                            .let { applyPaging(it, page, pageSize) }
                            .map {
                                it.toMediaItem(
                                    contentStyle = MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM,
                                )
                            }

                        LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                    },
                    executor,
                )
            }

            if (parentId == RECENTLY_PLAYED_ID) {
                return Futures.submit<LibraryResult<ImmutableList<MediaItem>>>(
                    {
                        val recentIds = recentStationIds()
                        val items = repository.getStations()
                            .associateBy { it.id }
                            .let { stationById ->
                                recentIds.mapNotNull { stationById[it] }
                            }
                            .let { applyPaging(it, page, pageSize) }
                            .map {
                                it.toMediaItem(
                                    contentStyle = MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM,
                                )
                            }

                        LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                    },
                    executor,
                )
            }

            if (parentId != STATIONS_ID) {
                return handleSettingsChildren(parentId, params)
            }

            return Futures.submit<LibraryResult<ImmutableList<MediaItem>>>(
                {
                    val stations = repository.getStations()
                    val favoriteIds = favoriteStationIds()
                    val favoriteStations = stations.filter { it.id in favoriteIds }
                    val otherStations = stations.filterNot { it.id in favoriteIds }
                    val entries = buildList {
                        addAll(
                            favoriteStations.map { StationMediaEntry(it, FAVORITES_GROUP_TITLE) }
                        )
                        addAll(
                            otherStations.map { StationMediaEntry(it, ALL_STATIONS_GROUP_TITLE) }
                        )
                    }
                        .let { applyPaging(it, page, pageSize) }
                    val items = entries.map { entry ->
                        entry.station.toMediaItem(
                            contentStyle = MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_GRID_ITEM,
                            groupTitle = entry.groupTitle,
                        )
                    }

                    LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                },
                executor,
            )
        }

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<Void>> {
            return Futures.submit<LibraryResult<Void>>(
                {
                    val itemCount = searchStations(query).size
                    Log.d(LOG_TAG, "Search query='$query' itemCount=$itemCount")
                    session.notifySearchResultChanged(browser, query, itemCount, params)
                    LibraryResult.ofVoid(params)
                },
                executor,
            )
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            return Futures.submit<LibraryResult<ImmutableList<MediaItem>>>(
                {
                    val items = searchStations(query)
                        .let { applyPaging(it, page, pageSize) }
                        .map {
                            it.toMediaItem(
                                contentStyle = MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }

                    Log.d(LOG_TAG, "Search results query='$query' page=$page pageSize=$pageSize count=${items.size}")
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
                        val station = resolveRequestedStation(requested, stations)
                        if (station != null) {
                            Log.d(LOG_TAG, "Resolved requested media item '${requested.mediaId}' to station '${station.id}'")
                            rememberStation(station)
                            station.toMediaItem()
                        } else {
                            requested.takeIf { it.localConfiguration != null }
                        }
                    }.toMutableList()
                },
                executor,
            )
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            return Futures.submit<MediaSession.MediaItemsWithStartPosition>(
                {
                    val stations = repository.getStations()
                    val resolvedItems = mediaItems.mapNotNull { requested ->
                        val station = resolveRequestedStation(requested, stations)
                        if (station != null) {
                            Log.d(LOG_TAG, "Resolved setMediaItems request '${requested.mediaId}' to station '${station.id}'")
                            rememberStation(station)
                            station.toMediaItem()
                        } else {
                            requested.takeIf { it.localConfiguration != null }
                        }
                    }

                    val playableItems = resolvedItems.ifEmpty {
                        defaultVoiceStation(stations)?.let { station ->
                            Log.d(LOG_TAG, "Using default voice station '${station.id}'")
                            rememberStation(station)
                            listOf(station.toMediaItem())
                        } ?: emptyList()
                    }

                    MediaSession.MediaItemsWithStartPosition(
                        playableItems,
                        if (playableItems.isEmpty()) C.INDEX_UNSET else 0,
                        C.TIME_UNSET,
                    )
                },
                executor,
            )
        }
    }

    private fun handleSettingsChildren(
        parentId: String,
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        return when (parentId) {
            SETTINGS_ID -> Futures.immediateFuture(
                LibraryResult.ofItemList(
                    ImmutableList.of(openSettingsOnPhoneItem()),
                    params,
                )
            )
            OPEN_SETTINGS_ON_PHONE_ID -> {
                openSettingsOnPhone()
                Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
            }
            else -> Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
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
                    .setExtras(
                        Bundle().apply {
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_PLAYABLE,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }
                    )
                    .build()
            )
            .build()
    }

    private fun recentlyPlayedItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(RECENTLY_PLAYED_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("לאחרונה")
                    .setSubtitle("תחנות שנוגנו לאחרונה")
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setArtworkUri(Uri.parse("android.resource://$packageName/${R.drawable.ic_history}"))
                    .setExtras(
                        Bundle().apply {
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }
                    )
                    .build()
            )
            .build()
    }

    private fun stationsItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(STATIONS_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("ראשי")
                    .setSubtitle("כל תחנות הרדיו")
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setArtworkUri(Uri.parse("android.resource://$packageName/${R.drawable.ic_home}"))
                    .setExtras(
                        Bundle().apply {
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }
                    )
                    .build()
            )
            .build()
    }

    private fun favoritesItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(FAVORITES_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("מועדפים")
                    .setSubtitle("תחנות שסומנו בטלפון")
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setArtworkUri(Uri.parse("android.resource://$packageName/${R.drawable.ic_star}"))
                    .setExtras(
                        Bundle().apply {
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }
                    )
                    .build()
            )
            .build()
    }

    private fun settingsItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(SETTINGS_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("הגדרות")
                    .setSubtitle("ניהול ההגדרות מתבצע בטלפון")
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setArtworkUri(settingsIconUri())
                    .setExtras(
                        Bundle().apply {
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }
                    )
                    .build()
            )
            .build()
    }

    private fun openSettingsOnPhoneItem(): MediaItem {
        return MediaItem.Builder()
            .setMediaId(OPEN_SETTINGS_ON_PHONE_ID)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("פתח הגדרות בטלפון")
                    .setSubtitle("ניהול הגדרות האפליקציה מתבצע במכשיר הטלפון שלך")
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setArtworkUri(settingsIconUri())
                    .setExtras(
                        Bundle().apply {
                            putInt(
                                MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM,
                                MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
                            )
                        }
                    )
                    .build()
            )
            .build()
    }

    private fun openSettingsOnPhone() {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_SHOW_CATALOG_SETTINGS
            addCategory(Intent.CATEGORY_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        try {
            startActivity(intent)
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Failed to open settings on phone", error)
        }
    }

    private fun settingsIconUri(): Uri {
        return Uri.parse("android.resource://$packageName/${R.drawable.ic_settings}")
    }

    private fun RadioStation.toMediaItem(
        contentStyle: Int = MediaConstants.EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM,
        groupTitle: String? = null,
        includeNowPlaying: Boolean = false,
        nowPlayingOverride: NowPlayingInfo? = null,
        useNowPlayingOverride: Boolean = false,
    ): MediaItem {
        val nowPlaying = if (useNowPlayingOverride) {
            nowPlayingOverride
        } else {
            null
        }
        val subtitle = nowPlaying?.title ?: if (includeNowPlaying || useNowPlayingOverride) NO_INFO_TEXT else null
        val description = nowPlayingText(nowPlaying) ?: subtitle
        val metadataBuilder = MediaMetadata.Builder()
            .setTitle(name)
            .setArtist(subtitle)
            .setSubtitle(nowPlaying?.detail ?: subtitle)
            .setDescription(description)
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .setExtras(
                Bundle().apply {
                    putBoolean("is_live", true)
                    putInt(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM, contentStyle)
                    groupTitle?.let {
                        putString(MediaConstants.EXTRAS_KEY_CONTENT_STYLE_GROUP_TITLE, it)
                    }
                }
            )

        logo?.let { metadataBuilder.setArtworkUri(resolveArtworkUri(it)) }

        val mediaItemBuilder = MediaItem.Builder()
            .setMediaId(id)
            .setUri(repository.streamUriFor(id))
            .setMediaMetadata(metadataBuilder.build())

        repository.streamMimeTypeFor(id)?.let { mediaItemBuilder.setMimeType(it) }

        return mediaItemBuilder.build()
    }

    private fun handlePlayerMetadata(metadata: Metadata) {
        val station = currentLocalStation() ?: return
        val info = (0 until metadata.length())
            .asSequence()
            .map { metadata[it] }
            .filterIsInstance<IcyInfo>()
            .firstNotNullOfOrNull { icyInfo ->
                nowPlayingRepository.nowPlayingFromMetadataText(icyInfo.title)
            } ?: return

        val isLikelyPreviousStationMetadata = previousNowPlayingInfo == info &&
            nowPlayingCache[station.id]?.info == null &&
            System.currentTimeMillis() - currentMediaItemChangedAtMs < METADATA_TRANSITION_IGNORE_MS
        if (isLikelyPreviousStationMetadata) {
            return
        }

        val currentInfo = nowPlayingCache[station.id]?.info
        if (currentInfo == info) {
            return
        }

        nowPlayingCache[station.id] = CachedNowPlaying(info, System.currentTimeMillis())
        updateCurrentMediaItemMetadata(station, info)
    }

    private fun clearCurrentNowPlaying(mediaItem: MediaItem?) {
        val mediaId = mediaItem?.mediaId?.takeIf { it.isNotBlank() } ?: return
        previousNowPlayingInfo = nowPlayingCache.values
            .maxByOrNull { it.loadedAtMs }
            ?.info
        nowPlayingCache.remove(mediaId)
        currentMediaItemChangedAtMs = System.currentTimeMillis()
        stationById(mediaId)?.let { station ->
            updateCurrentMediaItemMetadata(station, null)
        }
    }

    private fun updateCurrentMediaItemMetadata(station: RadioStation, nowPlaying: NowPlayingInfo?) {
        val currentItem = player.currentMediaItem ?: return
        if (currentItem.mediaId != station.id) {
            return
        }

        val updatedItem = station.toMediaItem(
            includeNowPlaying = true,
            nowPlayingOverride = nowPlaying,
            useNowPlayingOverride = true,
        )
        val currentDescription = currentItem.mediaMetadata.description?.toString()
        val updatedDescription = updatedItem.mediaMetadata.description?.toString()
        val currentSubtitle = currentItem.mediaMetadata.subtitle?.toString()
        val updatedSubtitle = updatedItem.mediaMetadata.subtitle?.toString()
        if (currentDescription == updatedDescription && currentSubtitle == updatedSubtitle) {
            return
        }

        val currentIndex = player.currentMediaItemIndex
        if (currentIndex >= 0) {
            player.replaceMediaItem(currentIndex, updatedItem)
        }
    }

    private fun nowPlayingText(info: NowPlayingInfo?): String? {
        info ?: return null
        return buildString {
            append(info.title)
            info.detail?.takeIf { it.isNotBlank() }?.let {
                append(" · ")
                append(it)
            }
        }
    }

    private fun favoriteStationIds(): Set<String> {
        return getSharedPreferences(FAVORITE_STATIONS_PREFS, MODE_PRIVATE)
            .all
            .filterValues { it == true }
            .keys
    }

    private fun recentStationIds(): List<String> {
        return getSharedPreferences(RECENT_STATIONS_PREFS, MODE_PRIVATE)
            .all
            .mapNotNull { (stationId, playedAt) ->
                (playedAt as? Long)?.let { stationId to it }
            }
            .sortedByDescending { it.second }
            .take(MAX_RECENT_STATIONS)
            .map { it.first }
    }

    private fun rememberStation(station: RadioStation) {
        getSharedPreferences(RECENT_STATIONS_PREFS, MODE_PRIVATE)
            .edit()
            .putLong(station.id, System.currentTimeMillis())
            .apply()
    }

    private fun resolveArtworkUri(logo: String): Uri {
        if (logo.startsWith("http://") || logo.startsWith("https://")) {
            return Uri.parse(logo)
        }

        return repository.artworkUriFor(logo)
    }

    private fun mainActivityPendingIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
        }

        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun <T> applyPaging(items: List<T>, page: Int, pageSize: Int): List<T> {
        if (page < 0 || pageSize <= 0) {
            return items
        }

        val fromIndex = page * pageSize
        if (fromIndex >= items.size) {
            return emptyList()
        }

        return items.subList(fromIndex, minOf(fromIndex + pageSize, items.size))
    }

    private fun searchStations(query: String): List<RadioStation> {
        val normalizedQuery = query.normalizedSearchText()
        if (normalizedQuery.isBlank()) {
            return emptyList()
        }

        val favoriteIds = favoriteStationIds()
        return repository.getStations()
            .filter { station -> station.matchesSearchQuery(normalizedQuery) }
            .sortedWith(
                compareByDescending<RadioStation> { it.id in favoriteIds }
                    .thenBy { it.name }
            )
    }

    private fun resolveRequestedStation(requested: MediaItem, stations: List<RadioStation>): RadioStation? {
        stations.firstOrNull { it.id == requested.mediaId }?.let { return it }

        val queries = requested.searchQueryCandidates()
            .map { it.normalizedSearchText() }
            .filter { it.isNotBlank() }
            .distinct()

        if (queries.isEmpty()) {
            return null
        }

        Log.d(LOG_TAG, "Resolving media request '${requested.mediaId}' queries=$queries")

        return queries.firstNotNullOfOrNull { query ->
            stations.firstOrNull { station -> station.matchesSearchQuery(query) }
        }
    }

    private fun MediaSession.ControllerInfo.controllerKey(): String {
        return "$packageName:$uid"
    }

    private fun MediaSession.ControllerInfo.isAutomotiveController(): Boolean {
        val normalizedPackage = packageName.lowercase(Locale.US)
        return normalizedPackage == "com.google.android.projection.gearhead" ||
            normalizedPackage.contains("android.projection") ||
            normalizedPackage.contains("android.car") ||
            normalizedPackage.contains("automotive") ||
            normalizedPackage.contains("gearhead")
    }

    private fun defaultVoiceStation(stations: List<RadioStation>): RadioStation? {
        val stationById = stations.associateBy { it.id }
        return recentStationIds().firstNotNullOfOrNull { stationById[it] }
            ?: stationById[DEFAULT_VOICE_STATION_ID]
            ?: stations.firstOrNull()
    }

    private fun MediaItem.searchQueryCandidates(): List<String> {
        val metadata = mediaMetadata
        return listOfNotNull(
            requestMetadata.searchQuery,
            metadata.title?.toString(),
            metadata.displayTitle?.toString(),
            metadata.station?.toString(),
            metadata.artist?.toString(),
            metadata.albumArtist?.toString(),
            metadata.subtitle?.toString(),
            metadata.description?.toString(),
            mediaId.takeIf { it.isNotBlank() },
        )
    }

    private fun RadioStation.matchesSearchQuery(normalizedQuery: String): Boolean {
        val normalizedValues = buildList {
            add(id.normalizedSearchText())
            add(name.normalizedSearchText())
            addAll(STATION_ALIASES[id].orEmpty().map { it.normalizedSearchText() })
        }.filter { it.isNotBlank() }

        return normalizedValues.any { value ->
            value.contains(normalizedQuery) || normalizedQuery.contains(value)
        }
    }

    private fun String?.normalizedSearchText(): String {
        if (this.isNullOrBlank()) {
            return ""
        }

        return Normalizer.normalize(this, Normalizer.Form.NFKD)
            .lowercase(Locale.ROOT)
            .replace(HEBREW_DIACRITICS_REGEX, "")
            .map { char ->
                when (char) {
                    'ך' -> 'כ'
                    'ם' -> 'מ'
                    'ן' -> 'נ'
                    'ף' -> 'פ'
                    'ץ' -> 'צ'
                    else -> char
                }
            }
            .joinToString("")
            .replace(SEARCH_IGNORED_CHARS_REGEX, "")
            .trim()
    }

    private companion object {
        const val ACTION_DISCONNECT_OUTPUT = "com.tvapp.autoradio.DISCONNECT_OUTPUT"
        const val ACTION_PAUSE_ACTIVE = "com.tvapp.autoradio.PAUSE_ACTIVE"
        const val ACTION_PLAY_ACTIVE = "com.tvapp.autoradio.PLAY_ACTIVE"
        const val ACTION_PLAYBACK_STOPPED = "com.tvapp.autoradio.PLAYBACK_STOPPED"
        const val ACTION_PLAYBACK_STATE_CHANGED = "com.tvapp.autoradio.PLAYBACK_STATE_CHANGED"
        const val EXTRA_STATION_ID = "station_id"
        const val EXTRA_IS_PLAYING = "is_playing"
        const val EXTRA_HAS_MEDIA_ITEM = "has_media_item"
        const val EXTRA_UPDATED_AT_MS = "updated_at_ms"
        const val PLAYBACK_STATE_PREFS = "radio_playback_state"
        const val LOG_TAG = "TVAppRadioService"
        const val ROOT_ID = "radio_root"
        const val STATIONS_ID = "radio_stations"
        const val FAVORITES_ID = "radio_favorites"
        const val RECENTLY_PLAYED_ID = "radio_recently_played"
        const val SETTINGS_ID = "radio_settings"
        const val OPEN_SETTINGS_ON_PHONE_ID = "radio_open_settings_on_phone"
        const val ACTION_SHOW_CATALOG_SETTINGS = "com.tvapp.autoradio.SHOW_CATALOG_SETTINGS"
        const val FAVORITE_STATIONS_PREFS = "favorite_stations"
        const val RECENT_STATIONS_PREFS = "recent_stations"
        const val MAX_RECENT_STATIONS = 20
        const val METADATA_TRANSITION_IGNORE_MS = 2_000L
        const val PLAYBACK_RETRY_DELAY_MS = 1_500L
        const val MAX_PLAYBACK_RETRIES = 3
        const val NO_INFO_TEXT = "אין מידע"
        const val DEFAULT_VOICE_STATION_ID = "rd_glglz"
        const val FAVORITES_GROUP_TITLE = "מועדפים"
        const val ALL_STATIONS_GROUP_TITLE = "כל השאר"
        val STATION_ALIASES = mapOf(
            "rd_glglz" to listOf(
                "galgalaz",
                "galgalatz",
                "glglz",
                "גלגלצ",
                "גלגל״צ",
                "גלגל צ",
            ),
            "rd_glz" to listOf(
                "galei tzahal",
                "glz",
                "גלי צהל",
                "גלי צה״ל",
                "גלצ",
            ),
            "rd_103" to listOf(
                "103fm",
                "103 fm",
                "radio lelo hafsaka",
                "רדיו ללא הפסקה",
                "ללא הפסקה",
            ),
            "rd_88" to listOf(
                "kan 88",
                "kan eighty eight",
                "כאן שמונים ושמונה",
            ),
        )
        val HEBREW_DIACRITICS_REGEX = Regex("[\\u0591-\\u05C7]")
        val SEARCH_IGNORED_CHARS_REGEX = Regex("[\\u200E\\u200F\\u202A-\\u202E'\"`׳״\\-_.\\s]+")
    }
}
