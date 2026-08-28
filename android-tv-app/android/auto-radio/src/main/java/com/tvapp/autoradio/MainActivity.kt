package com.tvapp.autoradio

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.app.SearchManager
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.annotation.DrawableRes
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.sin

class MainActivity : AppCompatActivity() {
    private companion object {
        private const val STATE_ACTIVE_STATION_ID = "active_station_id"
        private const val STATE_PLAY_STARTED_AT_MS = "play_started_at_ms"
        private const val STATE_ACTIVE_STATION_PAUSED = "active_station_paused"
        private const val ACTION_DISCONNECT_OUTPUT = "com.tvapp.autoradio.DISCONNECT_OUTPUT"
        private const val ACTION_PAUSE_ACTIVE = "com.tvapp.autoradio.PAUSE_ACTIVE"
        private const val ACTION_PLAY_ACTIVE = "com.tvapp.autoradio.PLAY_ACTIVE"
        private const val ACTION_PLAYBACK_STOPPED = "com.tvapp.autoradio.PLAYBACK_STOPPED"
        private const val ACTION_PLAYBACK_STATE_CHANGED = "com.tvapp.autoradio.PLAYBACK_STATE_CHANGED"
        private const val ACTION_SHOW_CATALOG_SETTINGS = "com.tvapp.autoradio.SHOW_CATALOG_SETTINGS"
        private const val ACTION_MEDIA_PLAY_FROM_SEARCH = "android.media.action.MEDIA_PLAY_FROM_SEARCH"
        private const val EXTRA_STATION_ID = "station_id"
        private const val EXTRA_IS_PLAYING = "is_playing"
        private const val EXTRA_HAS_MEDIA_ITEM = "has_media_item"
        private const val EXTRA_UPDATED_AT_MS = "updated_at_ms"
        private const val PLAYBACK_STATE_PREFS = "radio_playback_state"
        private const val SAVED_PLAYBACK_STATE_MAX_AGE_MS = 6 * 60 * 60 * 1_000L
        private const val LOG_TAG = "TVAppRadio"
        private const val DEFAULT_VOICE_STATION_ID = "rd_glglz"
        private const val LIBRARY_TAB_HOME = "home"
        private const val LIBRARY_TAB_FAVORITES = "favorites"
        private const val LIBRARY_TAB_RECENT = "recent"
        private const val STATION_GROUP_ALL = "all"
        private const val STATION_GROUP_LOCAL = "local"
        private const val STATION_GROUP_ISRAELIS = "israelis"
        private const val STATION_GROUP_WORLD = "world"
        private const val NO_INFO_TEXT = "אין מידע"
        private const val INITIAL_VISIBLE_STATION_LIMIT = 24
        private const val VISIBLE_STATION_BATCH_SIZE = 24
        private const val LOAD_MORE_STATIONS_TAG = "load_more_stations"
        private val STATION_ALIASES = mapOf(
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
        private val HEBREW_DIACRITICS_REGEX = Regex("[\\u0591-\\u05C7]")
        private val SEARCH_IGNORED_CHARS_REGEX = Regex("[\\u200E\\u200F\\u202A-\\u202E'\"`׳״\\-_.\\s]+")
    }

    private val bgColor = Color.rgb(28, 29, 36)
    private val inkColor = Color.WHITE
    private val mutedColor = Color.rgb(165, 165, 173)
    private val surfaceColor = Color.rgb(36, 37, 45)
    private val elevatedSurfaceColor = Color.rgb(42, 43, 51)
    private val borderColor = Color.argb(22, 255, 255, 255)
    private val accentColor = Color.rgb(255, 159, 28)
    private val accentSoftColor = Color.rgb(255, 179, 71)
    private val liveColor = Color.rgb(235, 64, 64)

    private val executor = Executors.newSingleThreadExecutor()
    private val logoExecutor = Executors.newFixedThreadPool(4)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val logoCache = ConcurrentHashMap<String, android.graphics.Bitmap>()
    private val timerRunnable = object : Runnable {
        override fun run() {
            updateElapsedTime()
            mainHandler.postDelayed(this, 1_000)
        }
    }
    private val outputSessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) = Unit
        override fun onSessionStartFailed(session: CastSession, error: Int) {
            updateConnectedOutput(null)
        }
        override fun onSessionStarted(session: CastSession, sessionId: String) {
            updateConnectedOutput(session)
        }
        override fun onSessionEnding(session: CastSession) = Unit
        override fun onSessionEnded(session: CastSession, error: Int) {
            updateConnectedOutput(null)
        }
        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
        override fun onSessionResumeFailed(session: CastSession, error: Int) {
            updateConnectedOutput(null)
        }
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            updateConnectedOutput(session)
        }
        override fun onSessionSuspended(session: CastSession, reason: Int) = Unit
    }
    private val playbackStoppedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_PLAYBACK_STOPPED -> handleExternalPlaybackStopped()
                ACTION_PLAYBACK_STATE_CHANGED -> handleExternalPlaybackStateChanged(intent)
            }
        }
    }

    private lateinit var repository: RadioCatalogRepository
    private lateinit var recentPrefs: SharedPreferences
    private lateinit var favoritePrefs: SharedPreferences
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null
    private lateinit var filterPanel: LinearLayout
    private lateinit var filterInput: EditText
    private lateinit var stationGroupFilterContainer: LinearLayout
    private lateinit var statusPanel: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var retryButton: Button
    private lateinit var headerContainer: LinearLayout
    private lateinit var bottomNavContainer: LinearLayout
    private lateinit var miniPlayerShortcut: FrameLayout
    private lateinit var playerContainer: LinearLayout
    private lateinit var stationsContainer: LinearLayout
    private lateinit var scrollView: ScrollView
    private var castContext: CastContext? = null

    private var allStations: List<RadioStation> = emptyList()
    private var activeStation: RadioStation? = null
    private var playStartedAtMs: Long = 0L
    private var activeElapsedText: TextView? = null
    private var activeNowPlayingText: TextView? = null
    private var isCatalogLoading = false
    private var isLoadingStationBatch = false
    private var isActiveStationLoading = false
    private var isActiveStationPaused = false
    private var isSwitchingStation = false
    private var isPlayerHiding = false
    private var isUserStoppingPlayback = false
    private var connectedOutputName: String? = null
    private var restoredStationId: String? = null
    private var restoredStationWasPaused = false
    private var requestedStationId: String? = null
    private var isPlayerPageVisible = false
    private var isPlayerOpening = false
    private var isPlayerPageDismissedByUser = false
    private var selectedLibraryTab = LIBRARY_TAB_HOME
    private var selectedStationGroup = STATION_GROUP_ALL
    private var visibleStationLimit = INITIAL_VISIBLE_STATION_LIMIT
    private var filteredStationCount = 0
    private var catalogSourceDialog: AlertDialog? = null
    private var pendingVoicePlaybackQuery: String? = null
    private var pendingControllerStationId: String? = null
    private val nowPlayingCache = ConcurrentHashMap<String, NowPlayingInfo>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = RadioCatalogRepository(this, BuildConfig.RADIO_API_BASE_URL)
        recentPrefs = getSharedPreferences("recent_stations", MODE_PRIVATE)
        favoritePrefs = getSharedPreferences("favorite_stations", MODE_PRIVATE)
        restoredStationId = savedInstanceState?.getString(STATE_ACTIVE_STATION_ID)
        requestedStationId = restoredStationId
        playStartedAtMs = savedInstanceState?.getLong(STATE_PLAY_STARTED_AT_MS, 0L) ?: 0L
        restoredStationWasPaused = savedInstanceState?.getBoolean(STATE_ACTIVE_STATION_PAUSED, false) == true

        requestNotificationPermissionIfNeeded()
        buildLayout()
        registerPlaybackStoppedReceiver()
        initializeOutputConnectionMonitor()
        connectMediaController()
        loadStations()
        handleIntent(intent, allowPlaybackIntent = savedInstanceState == null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        syncControllerStateIntoUi()
        handleIntent(intent, allowPlaybackIntent = true)
    }

    override fun onBackPressed() {
        if (isPlayerPageVisible) {
            closePlayerPageWithAnimation()
            return
        }
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    private fun handleIntent(intent: Intent?, allowPlaybackIntent: Boolean) {
        when (intent?.action) {
            ACTION_SHOW_CATALOG_SETTINGS -> mainHandler.post { showCatalogSourceSettings() }
            ACTION_MEDIA_PLAY_FROM_SEARCH -> {
                if (allowPlaybackIntent) {
                    handleVoicePlaybackIntent(intent)
                } else {
                    Log.d(LOG_TAG, "Ignoring stale playback intent during activity recreation")
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        syncControllerStateIntoUi()
        syncSavedPlaybackStateIntoUi()
        scheduleControllerStateSync()
        consumePendingVoicePlayback()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!isPlayerHiding && !isUserStoppingPlayback) {
            val stationId = controller?.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() }
                ?: pendingControllerStationId
                ?: requestedStationId
                ?: activeStation?.id
            stationId?.let { outState.putString(STATE_ACTIVE_STATION_ID, it) }
            outState.putLong(STATE_PLAY_STARTED_AT_MS, playStartedAtMs)
            outState.putBoolean(STATE_ACTIVE_STATION_PAUSED, isActiveStationPaused)
        }
    }

    override fun onDestroy() {
        if (isFinishing && !isChangingConfigurations && !isUserStoppingPlayback) {
            startService(Intent(this, RadioMediaLibraryService::class.java).setAction(ACTION_DISCONNECT_OUTPUT))
        }
        mainHandler.removeCallbacks(timerRunnable)
        castContext?.sessionManager?.removeSessionManagerListener(outputSessionListener, CastSession::class.java)
        unregisterReceiver(playbackStoppedReceiver)
        if (::controllerFuture.isInitialized) {
            MediaController.releaseFuture(controllerFuture)
        }
        executor.shutdown()
        logoExecutor.shutdown()
        super.onDestroy()
    }

    private fun connectMediaController() {
        val sessionToken = SessionToken(this, ComponentName(this, RadioMediaLibraryService::class.java))
        controllerFuture = MediaController.Builder(this, sessionToken).buildAsync()
        controllerFuture.addListener(
            {
                controller = controllerFuture.get().apply {
                    addListener(object : Player.Listener {
                        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                            if (mediaItem != null) {
                                syncActiveStationFromController()
                            } else if (!isSwitchingStation) {
                                syncStoppedPlaybackFromController()
                            }
                        }

                        override fun onPlaybackStateChanged(playbackState: Int) {
                            when (playbackState) {
                                Player.STATE_BUFFERING -> syncLoadingFromController()
                                Player.STATE_READY -> {
                                    syncReadyFromController()
                                }
                                Player.STATE_ENDED,
                                Player.STATE_IDLE -> {
                                    if (!isSwitchingStation) {
                                        syncStoppedPlaybackFromController()
                                    }
                                }
                            }
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            val mediaController = controller ?: return
                            if (isPlaying) {
                                syncPlayingFromController()
                                startElapsedTimer()
                            } else if (
                                activeStation != null &&
                                mediaController.currentMediaItem != null &&
                                mediaController.playbackState == Player.STATE_READY
                            ) {
                                syncPausedButActiveFromController()
                            } else if (
                                !isSwitchingStation &&
                                activeStation != null &&
                                (!mediaController.playWhenReady ||
                                    mediaController.playbackState == Player.STATE_IDLE ||
                                    mediaController.playbackState == Player.STATE_ENDED)
                            ) {
                                syncStoppedPlaybackFromController()
                            }
                        }

                        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
                            syncNowPlayingFromControllerMetadata(mediaMetadata)
                        }

                        override fun onPlayerError(error: PlaybackException) {
                            showStatus("שגיאת ניגון: ${error.message ?: error.errorCodeName}", showRetry = false)
                            stopElapsedTimer(resetText = false)
                        }
                    })
                    syncControllerStateIntoUi()
                    syncSavedPlaybackStateIntoUi()
                    scheduleControllerStateSync()
                    consumePendingVoicePlayback()
                }
            },
            MoreExecutors.directExecutor(),
        )
    }

    private fun initializeOutputConnectionMonitor() {
        try {
            castContext = CastContext.getSharedInstance(this).also { context ->
                context.sessionManager.addSessionManagerListener(outputSessionListener, CastSession::class.java)
                updateConnectedOutput(context.sessionManager.currentCastSession?.takeIf { it.isConnected })
            }
        } catch (error: Exception) {
            Log.w(LOG_TAG, "Output connection monitor is not available", error)
        }
    }

    private fun updateConnectedOutput(session: CastSession?) {
        connectedOutputName = session
            ?.takeIf { it.isConnected }
            ?.castDevice
            ?.friendlyName
            ?.takeIf { it.isNotBlank() }

        if (!isCatalogLoading && activeStation != null) {
            mainHandler.post { renderStations(animatePlayerIn = false) }
        }
    }

    private fun syncControllerStateIntoUi() {
        val mediaController = controller ?: return
        if (mediaController.currentMediaItem != null) {
            when {
                mediaController.isPlaying || mediaController.playWhenReady -> {
                    syncPlayingFromController()
                    startElapsedTimer()
                }
                mediaController.playbackState == Player.STATE_BUFFERING -> syncLoadingFromController()
                mediaController.hasRestorablePlayback() -> syncPausedButActiveFromController()
                else -> syncActiveStationFromController()
            }
        } else if (activeStation != null) {
            syncStoppedPlaybackFromController()
        }
    }

    private fun scheduleControllerStateSync() {
        listOf(120L, 450L, 1_200L).forEach { delayMs ->
            mainHandler.postDelayed({
                syncControllerStateIntoUi()
                syncSavedPlaybackStateIntoUi()
            }, delayMs)
        }
    }

    private fun syncSavedPlaybackStateIntoUi() {
        if (isUserStoppingPlayback || isSwitchingStation || isCatalogLoading || allStations.isEmpty()) {
            return
        }

        val prefs = getSharedPreferences(PLAYBACK_STATE_PREFS, MODE_PRIVATE)
        if (!prefs.getBoolean(EXTRA_HAS_MEDIA_ITEM, false)) {
            return
        }

        val updatedAtMs = prefs.getLong(EXTRA_UPDATED_AT_MS, 0L)
        if (updatedAtMs <= 0L || System.currentTimeMillis() - updatedAtMs > SAVED_PLAYBACK_STATE_MAX_AGE_MS) {
            return
        }

        val stationId = prefs.getString(EXTRA_STATION_ID, null)?.takeIf { it.isNotBlank() } ?: return
        val station = allStations.firstOrNull { it.id == stationId } ?: run {
            pendingControllerStationId = stationId
            return
        }

        val controllerMediaId = controller?.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() }
        if (controllerMediaId != null && controllerMediaId != station.id) {
            return
        }

        applyExternalPlaybackState(station, prefs.getBoolean(EXTRA_IS_PLAYING, false))
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }

    private fun buildLayout() {
        val shell = FrameLayout(this).apply {
            background = appBackground()
            clipChildren = false
            clipToPadding = false
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_LTR
            setPadding(dp(18), dp(42), dp(18), dp(24))
            background = appBackground()
            clipToPadding = false
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        headerContainer = headerView()
        root.addView(headerContainer)

        val listParent = root

        playerContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            background = null
            clipChildren = false
            clipToPadding = false
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }

        filterPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(18))
            background = null
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = 0
            }
        }

        filterInput = EditText(this).apply {
            hint = "סנן תחנות"
            textSize = 16f
            setSingleLine(true)
            setTextColor(inkColor)
            setHintTextColor(mutedColor)
            setPadding(dp(18), dp(13), dp(18), dp(13))
            compoundDrawablePadding = dp(10)
            setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_search, 0, 0, 0)
            compoundDrawableTintList = ColorStateList.valueOf(mutedColor)
            background = roundedRect(Color.rgb(22, 22, 29), 18f, borderColor, 1)
            elevation = dp(5).toFloat()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    resetStationBatch()
                    renderStations()
                }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        stationGroupFilterContainer = stationGroupFilterView()
        filterPanel.addView(stationGroupFilterContainer)
        filterPanel.addView(filterInput)
        listParent.addView(filterPanel)

        statusPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(18), dp(18), dp(18), dp(18))
            background = roundedRect(elevatedSurfaceColor, 16f, borderColor, 1)
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                marginStart = dp(8)
                marginEnd = dp(8)
                bottomMargin = dp(14)
            }
        }

        statusText = TextView(this).apply {
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(inkColor)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(10))
        }
        statusPanel.addView(statusText)

        retryButton = Button(this).apply {
            text = getString(R.string.retry)
            isAllCaps = false
            setOnClickListener { loadStations() }
        }
        statusPanel.addView(retryButton)
        listParent.addView(statusPanel)

        stationsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(4), 0, dp(18))
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }

        scrollView = ScrollView(this).apply {
            background = null
            clipChildren = true
            clipToPadding = true
            isFillViewport = false
            addView(stationsContainer)
            setOnScrollChangeListener { _, _, scrollY, _, _ ->
                val content = getChildAt(0) ?: return@setOnScrollChangeListener
                val distanceToBottom = content.bottom - (scrollY + height)
                if (distanceToBottom < dp(280)) {
                    loadNextStationBatch()
                }
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        }
        listParent.addView(scrollView)
        root.addView(bottomNavigationView())
        shell.addView(root, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        ))
        shell.addView(playerContainer, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
        ))
        miniPlayerShortcut = miniPlayerShortcutContainer()
        shell.addView(miniPlayerShortcut)
        setContentView(shell)
    }

    private fun headerView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(20))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )

            addView(ImageView(this@MainActivity).apply {
                setImageResource(R.drawable.ic_radio)
                background = roundedRect(elevatedSurfaceColor, 16f, borderColor, 1)
                setPadding(dp(8), dp(8), dp(8), dp(8))
                layoutParams = LinearLayout.LayoutParams(dp(52), dp(52)).apply {
                    marginEnd = dp(14)
                }
            })

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

                addView(TextView(this@MainActivity).apply {
                    text = getString(R.string.app_name)
                    textSize = 30f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(inkColor)
                    includeFontPadding = false
                })

            })
        }
    }

    private data class BottomNavItem(
        @DrawableRes val iconRes: Int,
        val label: String,
        val target: String,
    )

    private data class StationGroupFilter(
        val label: String,
        val value: String,
    )

    private fun stationGroupFilterView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(11), 0, 0)
            clipChildren = false
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = dp(12)
            }
            populateStationGroupFilter()
        }
    }

    private fun LinearLayout.populateStationGroupFilter() {
        removeAllViews()
        val items = listOf(
            StationGroupFilter("All", STATION_GROUP_ALL),
            StationGroupFilter("Local", STATION_GROUP_LOCAL),
            StationGroupFilter("Israelis", STATION_GROUP_ISRAELIS),
            StationGroupFilter("World", STATION_GROUP_WORLD),
        )

        items.forEach { item ->
            addView(stationGroupChip(item), LinearLayout.LayoutParams(0, dp(38), 1f).apply {
                leftMargin = dp(4)
                rightMargin = dp(4)
            })
        }
    }

    private fun stationGroupChip(item: StationGroupFilter): TextView {
        val isSelected = selectedStationGroup == item.value
        return TextView(this).apply {
            text = item.label
            textSize = 13f
            typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            gravity = Gravity.CENTER
            includeFontPadding = false
            setTextColor(if (isSelected) Color.rgb(31, 24, 18) else mutedColor)
            background = roundedRect(
                if (isSelected) accentColor else Color.argb(42, 255, 255, 255),
                999f,
                if (isSelected) Color.argb(118, 255, 205, 111) else Color.argb(22, 255, 255, 255),
                1,
            )
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener {
                if (selectedStationGroup == item.value) {
                    return@setOnClickListener
                }
                selectedStationGroup = item.value
                resetStationBatch()
                stationGroupFilterContainer.populateStationGroupFilter()
                renderStations()
            }
        }
    }

    private fun bottomNavigationView(): LinearLayout {
        bottomNavContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(7), dp(8), dp(7))
            background = roundedRect(Color.argb(235, 36, 37, 45), 24f, borderColor, 1)
            elevation = dp(14).toFloat()
            translationZ = dp(5).toFloat()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(66),
            ).apply {
                topMargin = dp(10)
            }
        }
        bottomNavContainer.populateBottomNavigation()
        return bottomNavContainer
    }

    private fun miniPlayerShortcutContainer(): FrameLayout {
        return FrameLayout(this).apply {
            visibility = View.GONE
            clipChildren = false
            clipToPadding = false
            layoutParams = FrameLayout.LayoutParams(
                dp(66),
                dp(66),
                Gravity.RIGHT or Gravity.BOTTOM,
            ).apply {
                rightMargin = dp(18)
                bottomMargin = dp(116)
            }
        }
    }

    private fun updateMiniPlayerShortcut(station: RadioStation?, animateIn: Boolean = true) {
        if (!::miniPlayerShortcut.isInitialized) {
            return
        }

        val shouldShow = station != null && !isPlayerPageVisible
        if (!shouldShow) {
            miniPlayerShortcut.animate().cancel()
            miniPlayerShortcut.removeAllViews()
            miniPlayerShortcut.visibility = View.GONE
            return
        }

        val wasHidden = miniPlayerShortcut.visibility != View.VISIBLE
        miniPlayerShortcut.removeAllViews()
        miniPlayerShortcut.visibility = View.VISIBLE
        miniPlayerShortcut.addView(miniPlayerShortcutButton(station!!), FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
            Gravity.CENTER,
        ))

        if (wasHidden && animateIn) {
            miniPlayerShortcut.alpha = 0f
            miniPlayerShortcut.scaleX = 0.84f
            miniPlayerShortcut.scaleY = 0.84f
            miniPlayerShortcut.animate()
                .alpha(1f)
                .scaleX(1f)
                .scaleY(1f)
                .setDuration(180L)
                .start()
        } else {
            miniPlayerShortcut.alpha = 1f
            miniPlayerShortcut.scaleX = 1f
            miniPlayerShortcut.scaleY = 1f
        }
    }

    private fun miniPlayerShortcutButton(station: RadioStation): FrameLayout {
        return FrameLayout(this).apply {
            contentDescription = "חזור לנגן"
            background = roundedRect(Color.rgb(38, 39, 47), 18f, accentColor, 2)
            elevation = dp(14).toFloat()
            translationZ = dp(5).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener {
                isPlayerPageDismissedByUser = false
                isPlayerPageVisible = true
                renderStations(animatePlayerIn = true)
            }

            addView(RoundedLogoView(this@MainActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                alpha = 0.26f
                background = roundedRect(elevatedSurfaceColor, 18f)
                loadStationLogo(station, this)
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))

            addView(View(this@MainActivity).apply {
                background = roundedRect(Color.argb(128, 18, 19, 25), 18f)
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))

            addView(playerScale(isAnimating = shouldAnimateEqualizer()).apply {
                alpha = 1f
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ).apply {
                leftMargin = dp(7)
                rightMargin = dp(7)
                topMargin = dp(10)
                bottomMargin = dp(10)
            })
        }
    }

    private fun LinearLayout.populateBottomNavigation() {
        removeAllViews()
        val items = listOf(
            BottomNavItem(R.drawable.ic_home, "בית", LIBRARY_TAB_HOME),
            BottomNavItem(R.drawable.ic_star, "מועדפים", LIBRARY_TAB_FAVORITES),
            BottomNavItem(R.drawable.ic_history, "לאחרונה", LIBRARY_TAB_RECENT),
            BottomNavItem(R.drawable.ic_settings, "הגדרות", "settings"),
        )

        items.forEach { item ->
            addView(bottomNavigationItem(item), LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.MATCH_PARENT,
                1f,
            ))
        }
    }

    private fun bottomNavigationItem(item: BottomNavItem): LinearLayout {
        val isSettings = item.target == "settings"
        val isSelected = !isSettings && selectedLibraryTab == item.target
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener {
                if (isSettings) {
                    showCatalogSourceSettings()
                    return@setOnClickListener
                }

                selectedLibraryTab = item.target
                isPlayerPageVisible = false
                resetStationBatch()
                if (::bottomNavContainer.isInitialized) {
                    bottomNavContainer.populateBottomNavigation()
                }
                renderStations()
            }

            addView(FrameLayout(this@MainActivity).apply {
                background = roundedRect(
                    if (isSelected) Color.argb(42, 255, 159, 28) else Color.argb(18, 255, 255, 255),
                    999f,
                    if (isSelected) Color.argb(92, 255, 159, 28) else Color.argb(18, 255, 255, 255),
                    1,
                )
                elevation = dp(if (isSelected) 7 else 3).toFloat()
                translationZ = dp(if (isSelected) 3 else 1).toFloat()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    outlineProvider = ViewOutlineProvider.BACKGROUND
                }

                addView(View(this@MainActivity).apply {
                    background = if (isSelected) {
                        roundedRect(Color.argb(18, 255, 220, 150), 999f)
                    } else {
                        null
                    }
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    dp(14),
                    Gravity.TOP or Gravity.CENTER_HORIZONTAL,
                ).apply {
                    leftMargin = dp(8)
                    rightMargin = dp(8)
                    topMargin = dp(3)
                })

                addView(ImageView(this@MainActivity).apply {
                    setImageResource(item.iconRes)
                    setColorFilter(if (isSelected) accentColor else mutedColor)
                    scaleType = ImageView.ScaleType.CENTER_INSIDE
                }, FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER))
            }, LinearLayout.LayoutParams(dp(42), dp(30)))

            addView(TextView(this@MainActivity).apply {
                text = item.label
                textSize = 10f
                typeface = if (isSelected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                setTextColor(if (isSelected) accentColor else Color.rgb(111, 112, 122))
                gravity = Gravity.CENTER
                includeFontPadding = false
                maxLines = 1
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = dp(3)
                }
            })
        }
    }

    private fun topCastButton(): FrameLayout {
        return FrameLayout(this).apply {
            background = null
            elevation = 0f
            translationZ = 0f
            contentDescription = "בחר מכשיר ניגון"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                tooltipText = contentDescription
            }
            addView(outputSwitcherButton(), FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))
        }
    }

    private fun showCatalogSourceSettings() {
        catalogSourceDialog?.takeIf { it.isShowing }?.let {
            return
        }

        val currentSource = RadioCatalogSettings.getSource(this)
        val sources = arrayOf(
            "Static JSON file",
            "API proxy",
        )
        val selectedIndex = when (currentSource) {
            RadioCatalogSource.StaticFile -> 0
            RadioCatalogSource.ApiProxy -> 1
        }

        catalogSourceDialog = AlertDialog.Builder(this)
            .setTitle("Radio source")
            .setSingleChoiceItems(sources, selectedIndex) { dialog, which ->
                val nextSource = when (which) {
                    1 -> RadioCatalogSource.ApiProxy
                    else -> RadioCatalogSource.StaticFile
                }
                updateCatalogSource(nextSource)
                dialog.dismiss()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
            .apply {
                setOnDismissListener { catalogSourceDialog = null }
                show()
            }
    }

    private fun updateCatalogSource(source: RadioCatalogSource) {
        if (RadioCatalogSettings.getSource(this) == source) {
            return
        }

        stopPlayback()
        RadioCatalogSettings.setSource(this, source)
        repository.clearCache()
        activeStation = null
        restoredStationId = null
        requestedStationId = null
        pendingControllerStationId = null
        loadStations()
    }

    private fun loadStations() {
        isCatalogLoading = true
        stationsContainer.removeAllViews()
        showStatus("טוען תחנות...", showRetry = false)

        executor.execute {
            val stations = repository.getStations(forceRefresh = true)
            mainHandler.post {
                isCatalogLoading = false
                allStations = stations

                if (stations.isEmpty()) {
                    showStatus("לא נמצאו תחנות. בדוק שהשרת זמין.", showRetry = true)
                    return@post
                }

                hideStatus()
                restoreActiveStationAfterCatalogLoad()
                syncSavedPlaybackStateIntoUi()
                renderStations()
                syncControllerStateIntoUi()
                scheduleControllerStateSync()
                consumePendingVoicePlayback()
            }
        }
    }

    private fun handleVoicePlaybackIntent(intent: Intent) {
        val query = intent.voiceSearchCandidates()
            .firstOrNull { it.isNotBlank() }
            .orEmpty()

        Log.d(LOG_TAG, "Received voice playback intent query='$query'")
        setIntent(Intent(this, MainActivity::class.java).setAction(Intent.ACTION_MAIN))
        pendingVoicePlaybackQuery = query
        consumePendingVoicePlayback()
        listOf(500L, 1_500L, 3_000L, 6_000L).forEach { delayMs ->
            mainHandler.postDelayed({ consumePendingVoicePlayback() }, delayMs)
        }
    }

    private fun consumePendingVoicePlayback() {
        val query = pendingVoicePlaybackQuery ?: return
        if (controller == null || isCatalogLoading || allStations.isEmpty()) {
            Log.d(
                LOG_TAG,
                "Deferring voice playback query='$query' controllerReady=${controller != null} " +
                    "catalogLoading=$isCatalogLoading stationCount=${allStations.size}",
            )
            return
        }

        pendingVoicePlaybackQuery = null
        val station = resolveVoiceStation(query) ?: defaultVoiceStation()
        if (station == null) {
            Log.d(LOG_TAG, "Voice playback request had no station match and no default station")
            showStatus("לא נמצאה תחנה מתאימה לפקודה הקולית.", showRetry = false)
            return
        }

        Log.d(LOG_TAG, "Voice playback resolved query='$query' station='${station.id}'")
        playStation(station)
    }

    private fun Intent.voiceSearchCandidates(): List<String> {
        return listOfNotNull(
            getStringExtra(SearchManager.QUERY),
            getStringExtra(MediaStore.EXTRA_MEDIA_TITLE),
            getStringExtra(MediaStore.EXTRA_MEDIA_ARTIST),
            getStringExtra(MediaStore.EXTRA_MEDIA_ALBUM),
            getStringExtra(MediaStore.EXTRA_MEDIA_GENRE),
            dataString,
        )
    }

    private fun resolveVoiceStation(query: String): RadioStation? {
        val normalizedQuery = query.normalizedVoiceSearchText()
        if (normalizedQuery.isBlank()) {
            return null
        }

        return allStations.firstOrNull { station -> station.matchesVoiceSearchQuery(normalizedQuery) }
    }

    private fun defaultVoiceStation(): RadioStation? {
        val stationById = allStations.associateBy { it.id }
        return recentPrefs.all
            .mapNotNull { (stationId, playedAt) -> (playedAt as? Long)?.let { stationId to it } }
            .sortedByDescending { it.second }
            .firstNotNullOfOrNull { stationById[it.first] }
            ?: stationById[DEFAULT_VOICE_STATION_ID]
            ?: allStations.firstOrNull()
    }

    private fun RadioStation.matchesVoiceSearchQuery(normalizedQuery: String): Boolean {
        val normalizedValues = buildList {
            add(id.normalizedVoiceSearchText())
            add(name.normalizedVoiceSearchText())
            addAll(STATION_ALIASES[id].orEmpty().map { it.normalizedVoiceSearchText() })
        }.filter { it.isNotBlank() }

        return normalizedValues.any { value ->
            value.contains(normalizedQuery) || normalizedQuery.contains(value)
        }
    }

    private fun String?.normalizedVoiceSearchText(): String {
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

    private fun restoreActiveStationAfterCatalogLoad() {
        val mediaController = controller
        val controllerStationId = mediaController
            ?.currentMediaItem
            ?.mediaId
            ?.takeIf { it.isNotBlank() }

        val stationId = controllerStationId ?: pendingControllerStationId ?: requestedStationId ?: restoredStationId
        val station = allStations.firstOrNull { it.id == stationId } ?: return

        pendingControllerStationId = null
        requestedStationId = station.id
        activeStation = station
        if (playStartedAtMs <= 0L) {
            playStartedAtMs = System.currentTimeMillis()
        }
        restoredStationId = null
        isActiveStationPaused = restoredStationWasPaused || (
            mediaController?.currentMediaItem != null &&
                mediaController.hasRestorablePlayback() &&
                mediaController.isPlaying != true &&
                mediaController.playWhenReady != true
            )
        restoredStationWasPaused = false
        if (mediaController?.isPlaying == true || mediaController?.playWhenReady == true) {
            startElapsedTimer()
        }
    }

    private fun shouldRestorePlayerState(): Boolean {
        if (isPlayerHiding) {
            return false
        }
        val mediaController = controller ?: return false
        return mediaController.hasRestorablePlayback()
    }

    private fun renderStations(animatePlayerIn: Boolean = false) {
        if (isCatalogLoading) {
            return
        }

        val keepOpeningPlayer = isPlayerOpening && isPlayerPageVisible && activeStation != null && !animatePlayerIn
        if (!keepOpeningPlayer) {
            playerContainer.removeAllViews()
        }
        activeElapsedText = null
        activeNowPlayingText = null
        val filteredStations = filteredStationsForCurrentState()
        filteredStationCount = filteredStations.size
        val visibleStations = filteredStations.take(visibleStationLimit)

        if (::bottomNavContainer.isInitialized) {
            bottomNavContainer.populateBottomNavigation()
        }
        if (::stationGroupFilterContainer.isInitialized) {
            stationGroupFilterContainer.populateStationGroupFilter()
        }

        if (isPlayerPageVisible && activeStation != null) {
            updateMiniPlayerShortcut(null)
            val station = activeStation ?: return
            if (keepOpeningPlayer) {
                syncNowPlayingFromControllerMetadata(controller?.mediaMetadata)
                updateElapsedTime()
                return
            }
            bottomNavContainer.visibility = View.VISIBLE
            playerContainer.animate().cancel()
            playerContainer.layoutParams = playerContainer.layoutParams.apply {
                width = ViewGroup.LayoutParams.MATCH_PARENT
                height = ViewGroup.LayoutParams.MATCH_PARENT
            }
            if (animatePlayerIn) {
                isPlayerOpening = true
                playerContainer.alpha = 1f
                playerContainer.translationY = resources.displayMetrics.heightPixels * 0.72f
            } else {
                isPlayerOpening = false
                playerContainer.alpha = 1f
                playerContainer.translationY = 0f
            }
            playerContainer.addView(activePlayerCard(station))
            playerContainer.visibility = View.VISIBLE
            syncNowPlayingFromControllerMetadata(controller?.mediaMetadata)
            if (animatePlayerIn) {
                animatePlayerPageIn()
            }
            updateElapsedTime()
            return
        }

        isPlayerPageVisible = false
        headerContainer.visibility = View.VISIBLE
        filterPanel.visibility = View.VISIBLE
        scrollView.visibility = View.VISIBLE
        bottomNavContainer.visibility = View.VISIBLE
        playerContainer.visibility = View.GONE
        playerContainer.layoutParams = playerContainer.layoutParams.apply {
            width = ViewGroup.LayoutParams.MATCH_PARENT
            height = ViewGroup.LayoutParams.MATCH_PARENT
        }
        playerContainer.alpha = 1f
        playerContainer.translationY = 0f
        updateMiniPlayerShortcut(activeStation)

        stationsContainer.removeAllViews()
        if (filteredStations.isEmpty()) {
            stationsContainer.addView(emptyState("אין תחנות שמתאימות לסינון"))
            updateElapsedTime()
            return
        }

        stationsContainer.addView(stationGrid(visibleStations))
        if (visibleStations.size < filteredStations.size) {
            stationsContainer.addView(loadMoreStationsButton(filteredStations.size - visibleStations.size))
        }

        updateElapsedTime()
    }

    private fun renderCatalogBehindPlayer(animateMiniPlayer: Boolean = true) {
        if (isCatalogLoading) {
            return
        }

        val filteredStations = filteredStationsForCurrentState()
        filteredStationCount = filteredStations.size
        val visibleStations = filteredStations.take(visibleStationLimit)

        headerContainer.visibility = View.VISIBLE
        filterPanel.visibility = View.VISIBLE
        scrollView.visibility = View.VISIBLE
        bottomNavContainer.visibility = View.VISIBLE

        if (::bottomNavContainer.isInitialized) {
            bottomNavContainer.populateBottomNavigation()
        }
        if (::stationGroupFilterContainer.isInitialized) {
            stationGroupFilterContainer.populateStationGroupFilter()
        }

        updateMiniPlayerShortcut(activeStation, animateIn = animateMiniPlayer)

        stationsContainer.removeAllViews()
        if (filteredStations.isEmpty()) {
            stationsContainer.addView(emptyState("אין תחנות שמתאימות לסינון"))
            return
        }

        stationsContainer.addView(stationGrid(visibleStations))
        if (visibleStations.size < filteredStations.size) {
            stationsContainer.addView(loadMoreStationsButton(filteredStations.size - visibleStations.size))
        }
    }

    private fun filteredStationsForCurrentState(): List<RadioStation> {
        val query = filterInput.text?.toString()?.trim()?.lowercase(Locale.getDefault()).orEmpty()
        return (if (query.isBlank()) {
            allStations
        } else {
            allStations.filter { station ->
                station.name.lowercase(Locale.getDefault()).contains(query) ||
                    station.id.lowercase(Locale.US).contains(query)
            }
        }).let { applyStationGroupFilter(it) }
            .let { applyLibraryTabFilter(it) }
            .sortedByDescending { isFavorite(it) }
    }

    private fun animatePlayerPageIn() {
        playerContainer.animate().cancel()
        playerContainer.post {
            playerContainer.animate()
                .translationY(0f)
                .alpha(1f)
                .setDuration(360L)
                .withEndAction {
                    isPlayerOpening = false
                }
                .start()
        }
    }

    private fun closePlayerPageWithAnimation(horizontalDirection: Float = 0f) {
        if (!isPlayerPageVisible || activeStation == null || !::playerContainer.isInitialized) {
            isPlayerPageVisible = false
            renderStations()
            return
        }

        playerContainer.animate().cancel()
        isPlayerOpening = false
        isPlayerHiding = true
        isPlayerPageDismissedByUser = true
        playerContainer.visibility = View.VISIBLE
        playerContainer.alpha = 1f
        playerContainer.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        playerContainer.bringToFront()
        val targetX = when {
            horizontalDirection > dp(42) -> resources.displayMetrics.widthPixels.toFloat()
            horizontalDirection < -dp(42) -> -resources.displayMetrics.widthPixels.toFloat()
            else -> 0f
        }
        val targetY = if (targetX == 0f) {
            resources.displayMetrics.heightPixels.toFloat()
        } else {
            playerContainer.translationY
        }

        playerContainer.post {
            playerContainer.animate()
                .translationX(targetX)
                .translationY(targetY)
                .alpha(1f)
                .setDuration(320L)
                .setInterpolator(AccelerateDecelerateInterpolator())
                .setListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        playerContainer.animate().setListener(null)
                        playerContainer.setLayerType(View.LAYER_TYPE_NONE, null)
                        playerContainer.translationX = 0f
                        playerContainer.translationY = 0f
                        playerContainer.alpha = 1f
                        playerContainer.visibility = View.GONE
                        isPlayerPageVisible = false
                        isPlayerHiding = false
                        renderStations()
                    }

                    override fun onAnimationCancel(animation: Animator) {
                        playerContainer.setLayerType(View.LAYER_TYPE_NONE, null)
                        isPlayerHiding = false
                    }
                })
                .start()
        }
    }

    private fun applyLibraryTabFilter(stations: List<RadioStation>): List<RadioStation> {
        return when (selectedLibraryTab) {
            LIBRARY_TAB_FAVORITES -> stations.filter { isFavorite(it) }
            LIBRARY_TAB_RECENT -> stations
                .filter { recentPrefs.contains(it.id) }
                .sortedByDescending { recentPrefs.getLong(it.id, 0L) }
            else -> stations
        }
    }

    private fun applyStationGroupFilter(stations: List<RadioStation>): List<RadioStation> {
        return when (selectedStationGroup) {
            STATION_GROUP_LOCAL -> stations.filter { it.group == STATION_GROUP_LOCAL }
            STATION_GROUP_ISRAELIS -> stations.filter { it.group == STATION_GROUP_ISRAELIS }
            STATION_GROUP_WORLD -> stations.filter { it.group == STATION_GROUP_WORLD }
            else -> stations
        }
    }

    private fun resetStationBatch() {
        visibleStationLimit = INITIAL_VISIBLE_STATION_LIMIT
    }

    private fun loadNextStationBatch() {
        if (
            isCatalogLoading ||
            isLoadingStationBatch ||
            isPlayerPageVisible ||
            visibleStationLimit >= filteredStationCount
        ) {
            return
        }
        isLoadingStationBatch = true

        stationsContainer.post {
            val filteredStations = filteredStationsForCurrentState()
            filteredStationCount = filteredStations.size
            if (visibleStationLimit >= filteredStations.size) {
                isLoadingStationBatch = false
                return@post
            }

            val previousLimit = visibleStationLimit
            visibleStationLimit = minOf(visibleStationLimit + VISIBLE_STATION_BATCH_SIZE, filteredStations.size)
            appendStationBatch(filteredStations, previousLimit, visibleStationLimit)
            isLoadingStationBatch = false
            updateElapsedTime()
        }
    }

    private fun appendStationBatch(filteredStations: List<RadioStation>, fromIndex: Int, toIndex: Int) {
        val grid = (0 until stationsContainer.childCount)
            .map { stationsContainer.getChildAt(it) }
            .filterIsInstance<GridLayout>()
            .firstOrNull()

        if (grid == null || fromIndex <= 0 || toIndex <= fromIndex) {
            renderStations()
            return
        }

        removeLoadMoreStationsButton()
        val columns = stationGridColumnCount()
        filteredStations.subList(fromIndex, toIndex).forEachIndexed { offset, station ->
            val index = fromIndex + offset
            grid.addView(stationTile(station), GridLayout.LayoutParams(
                GridLayout.spec(GridLayout.UNDEFINED, 1f),
                GridLayout.spec(index % columns, 1f),
            ).apply {
                width = 0
                height = GridLayout.LayoutParams.WRAP_CONTENT
                setMargins(dp(2), dp(3), dp(2), dp(6))
            })
        }

        if (toIndex < filteredStations.size) {
            stationsContainer.addView(loadMoreStationsButton(filteredStations.size - toIndex))
        }
    }

    private fun removeLoadMoreStationsButton() {
        for (index in stationsContainer.childCount - 1 downTo 0) {
            if (stationsContainer.getChildAt(index).tag == LOAD_MORE_STATIONS_TAG) {
                stationsContainer.removeViewAt(index)
            }
        }
    }

    private fun loadMoreStationsButton(remainingCount: Int): TextView {
        val loadCount = minOf(VISIBLE_STATION_BATCH_SIZE, remainingCount)
        return TextView(this).apply {
            tag = LOAD_MORE_STATIONS_TAG
            text = "טען עוד $loadCount תחנות"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setTextColor(accentSoftColor)
            includeFontPadding = false
            background = roundedRect(Color.argb(46, 255, 159, 28), 18f, Color.argb(80, 255, 159, 28), 1)
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setPadding(dp(18), dp(13), dp(18), dp(13))
            setOnClickListener { loadNextStationBatch() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = dp(12)
                leftMargin = dp(8)
                rightMargin = dp(8)
                bottomMargin = dp(18)
            }
        }
    }

    private fun stationGrid(stations: List<RadioStation>): GridLayout {
        val columns = stationGridColumnCount()
        return GridLayout(this).apply {
            columnCount = columns
            useDefaultMargins = false
            alignmentMode = GridLayout.ALIGN_BOUNDS
            clipChildren = false
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )

            stations.forEachIndexed { index, station ->
                addView(stationTile(station), GridLayout.LayoutParams(
                    GridLayout.spec(GridLayout.UNDEFINED, 1f),
                    GridLayout.spec(index % columns, 1f),
                ).apply {
                    width = 0
                    height = GridLayout.LayoutParams.WRAP_CONTENT
                    setMargins(dp(2), dp(3), dp(2), dp(6))
                })
            }
        }
    }

    private fun stationGridColumnCount(): Int {
        val widthDp = resources.configuration.screenWidthDp
        return when {
            widthDp >= 900 -> 4
            widthDp >= 620 -> 3
            else -> 2
        }
    }

    private fun measuredPlayerHeight(): Int {
        val widthSpec = View.MeasureSpec.makeMeasureSpec(resources.displayMetrics.widthPixels, View.MeasureSpec.EXACTLY)
        val heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        playerContainer.measure(widthSpec, heightSpec)
        return playerContainer.measuredHeight.coerceAtLeast(dp(220))
    }

    private fun animatePlayerIn(targetHeight: Int) {
        playerContainer.animate().cancel()
        playerContainer.post {
            val heightAnimator = ValueAnimator.ofInt(0, targetHeight).apply {
                duration = 280L
                addUpdateListener { animation ->
                    playerContainer.layoutParams = playerContainer.layoutParams.apply {
                        height = animation.animatedValue as Int
                    }
                }
                addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        playerContainer.layoutParams = playerContainer.layoutParams.apply {
                            height = LinearLayout.LayoutParams.WRAP_CONTENT
                        }
                    }
                })
            }
            heightAnimator.start()
            animateFilterPanelChrome(0, 255, 280L, clearAtEnd = false)
            playerContainer.animate()
                .translationY(0f)
                .alpha(1f)
                .setDuration(280L)
                .start()
        }
    }

    private fun hideActivePlayerWithAnimation() {
        if (isPlayerHiding) {
            return
        }

        if (activeStation == null || playerContainer.visibility != View.VISIBLE || playerContainer.height == 0) {
            clearActivePlaybackState()
            renderStations()
            return
        }

        isPlayerHiding = true
        playerContainer.animate().cancel()

        val startHeight = playerContainer.height.takeIf { it > 0 } ?: measuredPlayerHeight()
        animateFilterPanelChrome(255, 0, 220L, clearAtEnd = false)
        val heightAnimator = ValueAnimator.ofInt(startHeight, 0).apply {
            duration = 240L
            addUpdateListener { animation ->
                playerContainer.layoutParams = playerContainer.layoutParams.apply {
                    height = animation.animatedValue as Int
                }
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    clearActivePlaybackState()
                    isPlayerHiding = false
                    updateFilterPanelChrome(0)
                    playerContainer.translationY = 0f
                    playerContainer.alpha = 1f
                    playerContainer.layoutParams = playerContainer.layoutParams.apply {
                        height = LinearLayout.LayoutParams.WRAP_CONTENT
                    }
                    renderStations()
                }
            })
        }
        heightAnimator.start()
        playerContainer.animate()
            .translationY(-startHeight.toFloat())
            .alpha(0f)
            .setDuration(240L)
            .start()
    }

    private fun clearActivePlaybackState() {
        activeStation = null
        requestedStationId = null
        pendingControllerStationId = null
        playStartedAtMs = 0L
        isActiveStationLoading = false
        isActiveStationPaused = false
        isPlayerPageVisible = false
        stopElapsedTimer(resetText = true)
        hideStatus()
    }

    private fun updateFilterPanelChrome(alpha: Int = 255) {
        filterPanel.layoutParams = (filterPanel.layoutParams as LinearLayout.LayoutParams).apply {
            topMargin = if (alpha <= 0) 0 else -dp(2)
        }
        filterPanel.background = if (alpha <= 0) {
            null
        } else {
            TopArchDrawable(Color.rgb(18, 17, 31), 2f, dp(30).toFloat()).apply {
                setAlpha(alpha)
            }
        }
    }

    private fun animateFilterPanelChrome(fromAlpha: Int, toAlpha: Int, durationMs: Long, clearAtEnd: Boolean) {
        ValueAnimator.ofInt(fromAlpha, toAlpha).apply {
            duration = durationMs
            addUpdateListener { animation ->
                updateFilterPanelChrome(animation.animatedValue as Int)
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (clearAtEnd || toAlpha <= 0) {
                        updateFilterPanelChrome(0)
                    }
                }
            })
            start()
        }
    }

    private fun stationTile(station: RadioStation): LinearLayout {
        val isActive = activeStation?.id == station.id
        val isFavorite = isFavorite(station)
        val tile = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 0)
            background = stationCardBackground(isActive)
            elevation = dp(if (isActive) 8 else 3).toFloat()
            translationZ = dp(if (isActive) 3 else 1).toFloat()
            clipChildren = true
            clipToPadding = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                clipToOutline = true
            }
            foreground = selectableItemBackground()
            isClickable = true
            isFocusable = true
            setOnClickListener {
                isPlayerPageDismissedByUser = false
                isPlayerPageVisible = true
                if (isActive) {
                    renderStations(animatePlayerIn = true)
                } else {
                    playStation(station)
                }
            }

            addView(FrameLayout(this@MainActivity).apply {
                clipChildren = true
                clipToPadding = true
                background = roundedRect(elevatedSurfaceColor, 28f)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    clipToOutline = true
                }

                addView(stationLogoView(station).apply {
                    background = null
                    foreground = null
                    setPadding(0, 0, 0, 0)
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    Gravity.CENTER,
                ))

                addView(View(this@MainActivity).apply {
                    background = stationTileOverlay()
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    Gravity.CENTER,
                ))

                addView(favoriteButton(isFavorite) {
                    toggleFavorite(station)
                }, FrameLayout.LayoutParams(dp(34), dp(34), Gravity.TOP or Gravity.END).apply {
                    topMargin = dp(8)
                    rightMargin = dp(8)
                })

                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.BOTTOM
                    setPadding(dp(12), 0, dp(12), dp(12))

                    addView(TextView(this@MainActivity).apply {
                        text = station.name
                        textSize = 15f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(inkColor)
                        maxLines = 2
                        includeFontPadding = false
                        applyStationTextDirection(station.name, alignHebrewRight = false)
                    })

                    addView(TextView(this@MainActivity).apply {
                        text = "Radio"
                        textSize = 11f
                        setTextColor(Color.argb(185, 255, 255, 255))
                        maxLines = 1
                        includeFontPadding = false
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                        ).apply {
                            topMargin = dp(4)
                        }
                    })
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    Gravity.BOTTOM,
                ))

                if (isActive) {
                    addView(View(this@MainActivity).apply {
                        background = activeStationTileBorder()
                    }, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        Gravity.CENTER,
                    ))
                }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(194),
            ))
        }

        return StationCardShadowLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(10), dp(16), dp(22))
            background = null
            clipChildren = false
            clipToPadding = false
            addView(tile, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun stationRow(station: RadioStation): LinearLayout {
        val isActive = activeStation?.id == station.id
        val isFavorite = isFavorite(station)
        val shadow = StationCardShadowLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(2), dp(12), dp(14))
            background = null
            elevation = 0f
            translationZ = 0f
            clipChildren = false
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = 0
            }
        }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = stationCardBackground(isActive)
            elevation = dp(2).toFloat()
            translationZ = dp(1).toFloat()
            foreground = selectableItemBackground()
            isClickable = true
            isFocusable = true
            setOnClickListener {
                if (isActive) {
                    stopPlayback()
                } else {
                    playStation(station)
                }
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }

        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL

            addView(stationLogoView(station), LinearLayout.LayoutParams(dp(54), dp(54)).apply {
                marginEnd = dp(14)
            })

            addView(TextView(this@MainActivity).apply {
                text = if (isActive) "■" else "▶"
                textSize = if (isActive) 18f else 17f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(if (isActive) liveColor else accentColor)
                gravity = Gravity.CENTER
                background = if (isActive) {
                    null
                } else {
                    roundedRect(Color.rgb(43, 37, 20), 13f)
                }
                layoutParams = LinearLayout.LayoutParams(dp(30), dp(30)).apply {
                    marginEnd = dp(10)
                }
            })

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

                addView(TextView(this@MainActivity).apply {
                    text = station.name
                    textSize = 18f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(inkColor)
                    applyStationTextDirection(station.name, alignHebrewRight = true)
                    includeFontPadding = false
                })
            })

            addView(favoriteButton(isFavorite) {
                toggleFavorite(station)
            }, LinearLayout.LayoutParams(dp(36), dp(36)).apply {
                marginStart = dp(10)
            })

        })

        shadow.addView(row)
        return shadow
    }

    private fun activePlayerCard(station: RadioStation): LinearLayout {
        var gestureStartX = 0f
        var gestureStartY = 0f
        val closeSwipeListener = View.OnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    gestureStartX = event.rawX
                    gestureStartY = event.rawY
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val deltaX = event.rawX - gestureStartX
                    val deltaY = event.rawY - gestureStartY
                    val shouldCloseDown = deltaY > dp(76) && abs(deltaY) > abs(deltaX) * 0.72f
                    val shouldCloseSide = abs(deltaX) > dp(96) && abs(deltaX) > abs(deltaY) * 0.9f
                    if (shouldCloseDown || shouldCloseSide) {
                        closePlayerPageWithAnimation(if (shouldCloseSide) deltaX else 0f)
                        true
                    } else {
                        false
                    }
                }
                MotionEvent.ACTION_CANCEL -> false
                else -> false
            }
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 0, 0, 0)
            background = null
            clipChildren = false
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT,
            )
            setOnTouchListener(closeSwipeListener)

            val sheetRadius = dp(34).toFloat()
            val shadowInsetTop = dp(38)
            val sheetFrame = FrameLayout(this@MainActivity).apply {
                background = PlayerSheetShadowDrawable(
                    shadow = Color.argb(54, 0, 0, 0),
                    radius = sheetRadius,
                    contentTop = shadowInsetTop.toFloat(),
                )
                setPadding(0, shadowInsetTop, 0, 0)
                clipChildren = false
                clipToPadding = false
                setOnTouchListener(closeSwipeListener)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    0,
                    1f,
                ).apply {
                    topMargin = dp(76)
                }
            }

            val sheet = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(0, 0, 0, dp(14))
                background = PlayerSheetBorderDrawable(
                    fill = Color.rgb(31, 31, 40),
                    stroke = Color.argb(64, 255, 255, 255),
                    strokeWidth = dp(1).toFloat(),
                    radius = sheetRadius,
                )
                elevation = 0f
                translationZ = 0f
                outlineProvider = object : ViewOutlineProvider() {
                    override fun getOutline(view: View, outline: Outline) {
                        outline.setRoundRect(
                            0,
                            0,
                            view.width,
                            view.height + sheetRadius.toInt(),
                            sheetRadius,
                        )
                    }
                }
                clipChildren = false
                clipToPadding = false
                setOnTouchListener(closeSwipeListener)
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ).apply {
                    topMargin = 0
                }
            }

            sheet.addView(FrameLayout(this@MainActivity).apply {
                background = null
                elevation = 0f
                translationZ = 0f
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(64),
                )

                addView(FrameLayout(this@MainActivity).apply {
                    background = null
                    isClickable = true
                    isFocusable = true
                    foreground = selectableItemBackground()
                    setOnClickListener { closePlayerPageWithAnimation() }

                    addView(ImageView(this@MainActivity).apply {
                        setImageResource(R.drawable.ic_keyboard_arrow_down)
                        scaleType = ImageView.ScaleType.CENTER_INSIDE
                    }, FrameLayout.LayoutParams(dp(42), dp(42), Gravity.CENTER))
                }, FrameLayout.LayoutParams(dp(116), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))

                addView(topCastButton(), FrameLayout.LayoutParams(dp(46), dp(46), Gravity.RIGHT or Gravity.CENTER_VERTICAL).apply {
                    rightMargin = dp(18)
                })

                addView(favoriteButton(isFavorite(station)) {
                    toggleFavorite(station)
                }, FrameLayout.LayoutParams(dp(46), dp(46), Gravity.LEFT or Gravity.CENTER_VERTICAL).apply {
                    leftMargin = dp(18)
                })
            })

            sheet.addView(FrameLayout(this@MainActivity).apply {
                clipChildren = false
                clipToPadding = false
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(280),
                ).apply {
                    topMargin = dp(22)
                    bottomMargin = dp(26)
                }

                addView(ArtworkShadowLayout(this@MainActivity).apply {
                    setPadding(dp(24), dp(22), dp(24), dp(30))
                    addView(RoundedLogoView(this@MainActivity).apply {
                        scaleType = ImageView.ScaleType.CENTER_CROP
                        background = roundedRect(elevatedSurfaceColor, 28f)
                        loadStationLogo(station, this)
                    }, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        Gravity.CENTER,
                    ))
                }, FrameLayout.LayoutParams(
                    dp(286),
                    dp(286),
                    Gravity.CENTER,
                ))
            })

            sheet.addView(TextView(this@MainActivity).apply {
                text = station.name
                textSize = 29f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(inkColor)
                gravity = Gravity.CENTER
                maxLines = 2
                includeFontPadding = false
                applyStationTextDirection(station.name, alignHebrewRight = false)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    bottomMargin = dp(9)
                }
            })

            activeNowPlayingText = TextView(this@MainActivity).apply {
                text = nowPlayingTextFor(station) ?: "בודק מה משודר עכשיו..."
                textSize = 13f
                setTextColor(mutedColor)
                gravity = Gravity.CENTER
                maxLines = 1
                includeFontPadding = false
                applyStationTextDirection(text.toString(), alignHebrewRight = false)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    bottomMargin = dp(34)
                }
            }
            sheet.addView(activeNowPlayingText)

            sheet.addView(playerScale(isAnimating = shouldAnimateEqualizer()).apply {
                alpha = 0.95f
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(100),
            ).apply {
                marginStart = dp(18)
                marginEnd = dp(18)
                bottomMargin = dp(22)
            })

            activeElapsedText = TextView(this@MainActivity).apply {
                text = if (isActiveStationLoading) "טוען..." else "00:00"
                textSize = 13f
                setTextColor(mutedColor)
                gravity = Gravity.CENTER
                includeFontPadding = false
            }
            sheet.addView(activeElapsedText)

            sheet.addView(playerControlsPanel(station))
            sheetFrame.addView(sheet)
            addView(sheetFrame)
        }
    }

    private fun stationLogoView(station: RadioStation): FrameLayout {
        return FrameLayout(this).apply {
            background = roundedRect(Color.rgb(10, 14, 20), 28f)
            foreground = roundedRect(Color.TRANSPARENT, 28f, Color.rgb(76, 90, 112), 1)
            setPadding(dp(4), dp(4), dp(4), dp(4))
            clipChildren = true
            clipToPadding = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                clipToOutline = true
            }

            addView(RoundedLogoView(this@MainActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = roundedRect(elevatedSurfaceColor, 28f)
                loadStationLogo(station, this)
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))
        }
    }

    private fun playerControlsPanel(station: RadioStation): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(
                0,
                dp(18),
                0,
                0,
            )
            background = null
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(112),
            )

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER

                addView(playerNavButton(R.drawable.ic_skip_previous, "Prev Station") {
                    playAdjacentStation(-1)
                }, LinearLayout.LayoutParams(dp(82), dp(82)))

                addView(roundIconButton(if (isActiveStationPaused) R.drawable.ic_play else R.drawable.ic_pause) {
                    toggleActivePlayback(station)
                }, LinearLayout.LayoutParams(dp(82), dp(82)).apply {
                    marginStart = dp(22)
                    marginEnd = dp(22)
                })

                addView(playerNavButton(R.drawable.ic_skip_next, "Next Station") {
                    playAdjacentStation(1)
                }, LinearLayout.LayoutParams(dp(82), dp(82)))
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT,
            ))
        }
    }

    private fun shouldAnimateEqualizer(): Boolean {
        return activeStation != null &&
            !isActiveStationPaused &&
            !isActiveStationLoading
    }

    private fun playerScale(isAnimating: Boolean): View = AnimatedEqualizerView(
        context = this,
        low = Color.rgb(116, 95, 58),
        mid = Color.rgb(245, 185, 78),
        peak = accentColor,
        isAnimating = isAnimating,
    )

    private fun TextView.applyStationTextDirection(textValue: String, alignHebrewRight: Boolean) {
        val isHebrew = textValue.any { it in '\u0590'..'\u05FF' }
        textDirection = if (isHebrew) View.TEXT_DIRECTION_RTL else View.TEXT_DIRECTION_LTR
        gravity = when {
            !alignHebrewRight -> Gravity.CENTER
            isHebrew -> Gravity.RIGHT
            else -> Gravity.LEFT
        }
    }

    private fun favoriteButton(isFavorite: Boolean, onClick: () -> Unit): FrameLayout {
        return FrameLayout(this).apply {
            background = roundedRect(Color.argb(if (isFavorite) 36 else 20, 18, 19, 25), 999f)
            elevation = dp(4).toFloat()
            translationZ = dp(1).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }

            addView(ImageView(this@MainActivity).apply {
                setImageResource(if (isFavorite) R.drawable.ic_star_filled else R.drawable.ic_star)
                setColorFilter(if (isFavorite) accentColor else Color.rgb(214, 221, 232))
                scaleType = ImageView.ScaleType.CENTER_INSIDE
            }, FrameLayout.LayoutParams(dp(23), dp(23), Gravity.CENTER))
        }
    }

    private fun controlFavoriteButton(isFavorite: Boolean, onClick: () -> Unit): FrameLayout {
        return FrameLayout(this).apply {
            background = roundedRect(Color.argb(if (isFavorite) 42 else 24, 255, 255, 255), 999f, Color.argb(36, 255, 255, 255), 1)
            elevation = dp(4).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }

            addView(ImageView(this@MainActivity).apply {
                setImageResource(if (isFavorite) R.drawable.ic_star_filled else R.drawable.ic_star)
                setColorFilter(if (isFavorite) accentColor else Color.rgb(238, 242, 248))
                scaleType = ImageView.ScaleType.CENTER_INSIDE
            }, FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER))
        }
    }

    private fun outputSwitcherButton(): FrameLayout {
        val routeButton = MediaRouteButton(ContextThemeWrapper(this, R.style.CastButtonTheme)).apply {
            alpha = 0f
            setAlwaysVisible(true)
            contentDescription = "Output switcher"
            try {
                CastButtonFactory.setUpMediaRouteButton(this@MainActivity.applicationContext, this)
            } catch (error: Exception) {
                Log.w(LOG_TAG, "Output switcher button is not available", error)
            }
        }

        return FrameLayout(this).apply {
            background = null
            elevation = dp(5).toFloat()
            translationZ = dp(2).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            contentDescription = "בחר מכשיר ניגון"
            setPadding(dp(5), dp(5), dp(5), dp(5))

            addView(ImageView(this@MainActivity).apply {
                setImageDrawable(OutputSwitcherIconDrawable(Color.rgb(214, 221, 232)))
                scaleType = ImageView.ScaleType.CENTER
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))
            addView(routeButton, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ))

            setOnClickListener {
                if (!routeButton.performClick()) {
                    showStatus("פתח את בחירת הפלט מנגן המדיה של Android.", showRetry = false)
                }
            }
        }
    }

    private fun roundIconButton(@DrawableRes iconRes: Int, onClick: () -> Unit): FrameLayout {
        return FrameLayout(this).apply {
            background = null
            elevation = dp(22).toFloat()
            translationZ = dp(8).toFloat()
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }

            addView(View(this@MainActivity).apply {
                background = GlossyPlayButtonDrawable(accentColor)
                isClickable = false
                isFocusable = false
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ).apply {
                leftMargin = dp(1)
                topMargin = dp(1)
                rightMargin = dp(1)
                bottomMargin = dp(1)
            })

            addView(ImageView(this@MainActivity).apply {
                setImageResource(iconRes)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
            }, FrameLayout.LayoutParams(dp(34), dp(34), Gravity.CENTER))
        }
    }

    private fun playerNavButton(@DrawableRes iconRes: Int, label: String, onClick: () -> Unit): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }

            addView(FrameLayout(this@MainActivity).apply {
                background = roundedRect(Color.argb(36, 255, 255, 255), 999f, Color.argb(46, 255, 255, 255), 1)
                elevation = dp(5).toFloat()
                translationZ = dp(1).toFloat()

                addView(View(this@MainActivity).apply {
                    background = roundedRect(Color.argb(18, 255, 255, 255), 999f)
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    dp(14),
                    Gravity.TOP or Gravity.CENTER_HORIZONTAL,
                ).apply {
                    leftMargin = dp(8)
                    rightMargin = dp(8)
                    topMargin = dp(5)
                })

                addView(ImageView(this@MainActivity).apply {
                    setImageResource(iconRes)
                    scaleType = ImageView.ScaleType.CENTER_INSIDE
                }, FrameLayout.LayoutParams(dp(25), dp(25), Gravity.CENTER))
            }, LinearLayout.LayoutParams(dp(44), dp(44)))

            addView(TextView(this@MainActivity).apply {
                text = label
                textSize = 8f
                setTextColor(Color.argb(92, 213, 199, 193))
                gravity = Gravity.CENTER
                includeFontPadding = false
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    topMargin = dp(6)
                }
            })
        }
    }

    private fun playAdjacentStation(direction: Int) {
        if (allStations.isEmpty()) {
            return
        }
        val currentId = activeStation?.id
        val currentIndex = allStations.indexOfFirst { it.id == currentId }.takeIf { it >= 0 } ?: 0
        val nextIndex = (currentIndex + direction + allStations.size) % allStations.size
        isPlayerPageDismissedByUser = false
        isPlayerPageVisible = true
        playStation(allStations[nextIndex])
    }

    private fun toggleActivePlayback(station: RadioStation) {
        activeStation = station
        if (isActiveStationPaused) {
            isActiveStationPaused = false
            startService(Intent(this, RadioMediaLibraryService::class.java).setAction(ACTION_PLAY_ACTIVE))
            startElapsedTimer()
        } else {
            isActiveStationPaused = true
            startService(Intent(this, RadioMediaLibraryService::class.java).setAction(ACTION_PAUSE_ACTIVE))
            stopElapsedTimer(resetText = false)
        }
        renderStations()
    }

    private fun playStation(station: RadioStation, refreshLive: Boolean = false) {
        hideStatus()
        rememberStation(station)
        val shouldAnimatePlayerIn = activeStation == null || playerContainer.visibility != View.VISIBLE
        requestedStationId = station.id
        pendingControllerStationId = station.id
        activeStation = station
        clearNowPlayingFor(station)
        isPlayerPageDismissedByUser = false
        isPlayerPageVisible = true
        playStartedAtMs = 0L
        isActiveStationLoading = true
        isActiveStationPaused = false
        stopElapsedTimer(resetText = false)
        renderStations(animatePlayerIn = shouldAnimatePlayerIn)

        if (refreshLive) {
            showStatus("מרענן תחנה: ${station.name}", showRetry = false)
        }

        val mediaController = controller
        if (mediaController == null) {
            showStatus("הנגן עדיין נטען. נסה שוב בעוד רגע.", showRetry = false)
            return
        }

        isSwitchingStation = true
        mediaController.setMediaItem(mediaItemFor(station))
        mediaController.prepare()
        mediaController.play()
        mainHandler.postDelayed({
            isSwitchingStation = false
            if (controller?.isPlaying == true) {
                syncPlayingFromController()
            }
        }, 1_000)
        if (!refreshLive) {
            hideStatus()
        }
    }

    private fun syncNowPlayingFromControllerMetadata(mediaMetadata: MediaMetadata?) {
        val station = activeStation ?: return
        val mediaId = controller?.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() } ?: return
        if (mediaId != station.id) {
            updateActiveNowPlayingText(station)
            return
        }
        val metadata = mediaMetadata ?: return
        val title = metadata
            .artist
            ?.toString()
            ?.takeIf { isRealNowPlayingValue(it) }
        if (title == null) {
            nowPlayingCache.remove(station.id)
            updateActiveNowPlayingText(station)
            return
        }
        val detail = metadata.subtitle
            ?.toString()
            ?.takeIf { isRealNowPlayingValue(it) && it != title }

        val info = NowPlayingInfo(title = title, detail = detail)
        if (nowPlayingCache[station.id] == info) {
            return
        }

        nowPlayingCache[station.id] = info
        updateActiveNowPlayingText(station)
    }

    private fun clearNowPlayingFor(station: RadioStation) {
        nowPlayingCache.remove(station.id)
        if (activeStation?.id == station.id) {
            updateActiveNowPlayingText(station)
        }
    }

    private fun updateActiveNowPlayingText(station: RadioStation) {
        val text = nowPlayingTextFor(station)
        activeNowPlayingText?.run {
            this.text = text ?: NO_INFO_TEXT
            applyStationTextDirection(this.text.toString(), alignHebrewRight = false)
        }
    }

    private fun isRealNowPlayingValue(value: String): Boolean {
        return value.isNotBlank() && value != "Live radio" && value != NO_INFO_TEXT
    }

    private fun nowPlayingTextFor(station: RadioStation): String? {
        val info = nowPlayingCache[station.id] ?: return null
        return buildString {
            append(info.title)
            info.detail?.takeIf { it.isNotBlank() }?.let {
                append(" · ")
                append(it)
            }
        }
    }

    private fun mediaItemFor(station: RadioStation): MediaItem {
        val mediaItemBuilder = MediaItem.Builder()
            .setMediaId(station.id)
            .setUri(repository.streamUriFor(station.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(station.name)
                    .setArtist(NO_INFO_TEXT)
                    .setSubtitle(NO_INFO_TEXT)
                    .setDescription(NO_INFO_TEXT)
                    .setArtworkUri(station.logo?.takeIf { it.isNotBlank() }?.let(Uri::parse))
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .build()
            )

        repository.streamMimeTypeFor(station.id)?.let { mediaItemBuilder.setMimeType(it) }
        return mediaItemBuilder.build()
    }

    private fun rememberStation(station: RadioStation) {
        recentPrefs.edit()
            .putLong(station.id, System.currentTimeMillis())
            .apply()
    }

    private fun isFavorite(station: RadioStation): Boolean {
        return favoritePrefs.getBoolean(station.id, false)
    }

    private fun toggleFavorite(station: RadioStation) {
        favoritePrefs.edit()
            .putBoolean(station.id, !isFavorite(station))
            .apply()
        renderStations()
    }

    private fun stopPlayback() {
        isUserStoppingPlayback = true
        isActiveStationPaused = false
        startService(Intent(this, RadioMediaLibraryService::class.java).setAction(ACTION_DISCONNECT_OUTPUT))
        controller?.run {
            pause()
            stop()
            clearMediaItems()
        }
        hideActivePlayerWithAnimation()
        mainHandler.postDelayed({ isUserStoppingPlayback = false }, 1_000)
    }

    private fun registerPlaybackStoppedReceiver() {
        val filter = IntentFilter().apply {
            addAction(ACTION_PLAYBACK_STOPPED)
            addAction(ACTION_PLAYBACK_STATE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(playbackStoppedReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(playbackStoppedReceiver, filter)
        }
    }

    private fun handleExternalPlaybackStateChanged(intent: Intent) {
        if (isUserStoppingPlayback || isSwitchingStation || isCatalogLoading) {
            return
        }

        val hasMediaItem = intent.getBooleanExtra(EXTRA_HAS_MEDIA_ITEM, false)
        if (!hasMediaItem) {
            handleExternalPlaybackStopped()
            return
        }

        val stationId = intent.getStringExtra(EXTRA_STATION_ID)?.takeIf { it.isNotBlank() } ?: return
        val station = allStations.firstOrNull { it.id == stationId }
        if (station == null) {
            pendingControllerStationId = stationId
            return
        }

        applyExternalPlaybackState(station, intent.getBooleanExtra(EXTRA_IS_PLAYING, false))
    }

    private fun applyExternalPlaybackState(station: RadioStation, isPlaying: Boolean) {
        val wasDifferentStation = activeStation?.id != station.id
        activeStation = station
        requestedStationId = station.id
        pendingControllerStationId = null
        rememberStation(station)
        isActiveStationPaused = !isPlaying
        isActiveStationLoading = false

        if (isPlaying && (playStartedAtMs <= 0L || wasDifferentStation)) {
            playStartedAtMs = System.currentTimeMillis()
            startElapsedTimer()
        } else if (!isPlaying) {
            stopElapsedTimer(resetText = false)
        }

        renderStations(animatePlayerIn = false)
    }

    private fun handleExternalPlaybackStopped() {
        if (isUserStoppingPlayback) {
            return
        }

        clearActivePlaybackState()
        if (::playerContainer.isInitialized && ::stationsContainer.isInitialized && !isCatalogLoading) {
            renderStations()
        }
    }

    private fun MediaController.hasRestorablePlayback(): Boolean {
        return currentMediaItem != null &&
            playbackState != Player.STATE_IDLE &&
            playbackState != Player.STATE_ENDED
    }

    private fun syncStoppedPlaybackFromController() {
        if (!isPlayerHiding) {
            hideActivePlayerWithAnimation()
        }
    }

    private fun syncLoadingFromController() {
        val mediaId = controller?.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() } ?: return
        val station = allStations.firstOrNull { it.id == mediaId }
        if (station == null) {
            pendingControllerStationId = mediaId
            Log.d(LOG_TAG, "Deferring loading station sync for mediaId='$mediaId' stationCount=${allStations.size}")
            return
        }
        pendingControllerStationId = null
        requestedStationId = station.id
        activeStation = station
        isPlayerPageVisible = !isPlayerPageDismissedByUser
        isActiveStationLoading = true
        isActiveStationPaused = false
        hideStatus()
        renderStations(animatePlayerIn = isPlayerPageVisible && playerContainer.visibility != View.VISIBLE)
        showActiveStationLoading()
    }

    private fun syncReadyFromController() {
        isActiveStationLoading = false
        if (controller?.isPlaying == true || !isActiveStationPaused) {
            syncPlayingFromController()
            startElapsedTimer()
        } else {
            syncActiveStationFromController()
        }
    }

    private fun syncPausedButActiveFromController() {
        if (!isActiveStationLoading) {
            syncActiveStationFromController()
            stopElapsedTimer(resetText = false)
        }
    }

    private fun syncPlayingFromController() {
        isActiveStationPaused = false
        syncActiveStationFromController()
    }

    private fun syncActiveStationFromController() {
        val mediaId = controller?.currentMediaItem?.mediaId?.takeIf { it.isNotBlank() } ?: return
        val station = allStations.firstOrNull { it.id == mediaId }
        if (station == null) {
            pendingControllerStationId = mediaId
            Log.d(LOG_TAG, "Deferring controller station sync for mediaId='$mediaId' stationCount=${allStations.size}")
            return
        }
        val previousId = activeStation?.id

        pendingControllerStationId = null
        requestedStationId = station.id
        activeStation = station
        rememberStation(station)
        isPlayerPageVisible = !isPlayerPageDismissedByUser
        if (playStartedAtMs <= 0L || previousId != station.id) {
            playStartedAtMs = System.currentTimeMillis()
        }
        isActiveStationLoading = false
        hideStatus()
        renderStations(animatePlayerIn = isPlayerPageVisible && (previousId == null || playerContainer.visibility != View.VISIBLE))
    }

    private fun scrollToTop() {
        scrollView.post {
            scrollView.smoothScrollTo(0, 0)
        }
    }

    private fun emptyState(message: String): TextView {
        return TextView(this).apply {
            text = message
            textSize = 16f
            setTextColor(mutedColor)
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, dp(24))
        }
    }

    private fun showStatus(message: String, showRetry: Boolean) {
        statusText.text = message
        retryButton.visibility = if (showRetry) View.VISIBLE else View.GONE
        statusPanel.visibility = View.VISIBLE
    }

    private fun hideStatus() {
        statusPanel.visibility = View.GONE
    }

    private fun loadStationLogo(station: RadioStation, imageView: ImageView) {
        val logoUrl = station.logo
        if (logoUrl.isNullOrBlank()) {
            imageView.tag = null
            imageView.setImageDrawable(logoFallback())
            return
        }

        imageView.tag = logoUrl
        logoCache[logoUrl]?.let {
            imageView.setImageBitmap(it)
            return
        }

        imageView.setImageDrawable(logoFallback())
        logoExecutor.execute {
            try {
                val connection = URL(logoUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 8_000
                connection.readTimeout = 8_000
                connection.requestMethod = "GET"
                connection.inputStream.use { stream ->
                    BitmapFactory.decodeStream(stream)?.let { bitmap ->
                        logoCache[logoUrl] = bitmap
                        mainHandler.post {
                            if (imageView.tag == logoUrl) {
                                imageView.setImageBitmap(bitmap)
                            }
                        }
                    }
                }
                connection.disconnect()
            } catch (_: Exception) {
                mainHandler.post {
                    if (imageView.tag == logoUrl) {
                        imageView.setImageDrawable(logoFallback())
                    }
                }
            }
        }
    }

    private fun logoFallback(): Drawable {
        return roundedRect(elevatedSurfaceColor, 18f, borderColor, 1)
    }

    private fun startElapsedTimer() {
        hideStatus()
        mainHandler.removeCallbacks(timerRunnable)
        updateElapsedTime()
        mainHandler.postDelayed(timerRunnable, 1_000)
    }

    private fun stopElapsedTimer(resetText: Boolean) {
        mainHandler.removeCallbacks(timerRunnable)
        if (resetText) {
            activeElapsedText?.text = "00:00"
        }
    }

    private fun updateElapsedTime() {
        val station = activeStation
        if (isActiveStationLoading) {
            showActiveStationLoading()
            return
        }
        if (playStartedAtMs <= 0L || station == null) {
            activeElapsedText?.text = "00:00"
            return
        }

        val elapsedSeconds = ((System.currentTimeMillis() - playStartedAtMs) / 1_000).coerceAtLeast(0)
        val minutes = elapsedSeconds / 60
        val seconds = elapsedSeconds % 60
        activeElapsedText?.text = "%02d:%02d".format(minutes, seconds)
    }

    private fun showActiveStationLoading() {
        activeElapsedText?.text = "טוען..."
    }

    private fun roundedRect(fill: Int, radiusDp: Float, stroke: Int? = null, strokeWidthDp: Int = 0): GradientDrawable {
        return GradientDrawable().apply {
            setColor(fill)
            cornerRadius = dp(radiusDp).toFloat()
            if (stroke != null && strokeWidthDp > 0) {
                setStroke(dp(strokeWidthDp), stroke)
            }
        }
    }

    private fun roundedCorners(
        fill: Int,
        topLeftDp: Float,
        topRightDp: Float,
        bottomRightDp: Float,
        bottomLeftDp: Float,
        stroke: Int? = null,
        strokeWidthDp: Int = 0,
    ): GradientDrawable {
        return GradientDrawable().apply {
            setColor(fill)
            cornerRadii = floatArrayOf(
                dp(topLeftDp).toFloat(), dp(topLeftDp).toFloat(),
                dp(topRightDp).toFloat(), dp(topRightDp).toFloat(),
                dp(bottomRightDp).toFloat(), dp(bottomRightDp).toFloat(),
                dp(bottomLeftDp).toFloat(), dp(bottomLeftDp).toFloat(),
            )
            if (stroke != null && strokeWidthDp > 0) {
                setStroke(dp(strokeWidthDp), stroke)
            }
        }
    }

    private fun appBackground(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.rgb(42, 39, 41),
                Color.rgb(31, 31, 39),
                bgColor,
                Color.rgb(20, 20, 27),
            ),
        )
    }

    private fun playerCardBackground(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.rgb(38, 38, 48),
                Color.rgb(30, 30, 39),
                Color.rgb(24, 24, 32),
            ),
        ).apply {
            cornerRadius = dp(30).toFloat()
            setStroke(dp(1), borderColor)
        }
    }

    private fun playerSheetSurface(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.rgb(35, 35, 44),
                Color.rgb(31, 31, 40),
            ),
        ).apply {
            cornerRadii = floatArrayOf(
                dp(28).toFloat(), dp(28).toFloat(),
                dp(28).toFloat(), dp(28).toFloat(),
                0f, 0f,
                0f, 0f,
            )
        }
    }

    private fun playerSheetBackground(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.rgb(35, 35, 44),
                Color.rgb(28, 28, 37),
                Color.rgb(20, 21, 29),
            ),
        ).apply {
            cornerRadii = floatArrayOf(
                dp(28).toFloat(), dp(28).toFloat(),
                dp(28).toFloat(), dp(28).toFloat(),
                0f, 0f,
                0f, 0f,
            )
            setStroke(dp(1), Color.argb(42, 255, 255, 255))
        }
    }

    private fun bottomPlayerPanelBackground(compact: Boolean): GradientDrawable {
        return roundedCorners(
            fill = Color.rgb(18, 17, 31),
            topLeftDp = 34f,
            topRightDp = 34f,
            bottomRightDp = if (compact) 28f else 0f,
            bottomLeftDp = if (compact) 28f else 0f,
        )
    }

    private fun searchPanelBackground(): GradientDrawable {
        return roundedCorners(
            fill = Color.rgb(18, 17, 31),
            topLeftDp = 30f,
            topRightDp = 30f,
            bottomRightDp = 0f,
            bottomLeftDp = 0f,
            stroke = Color.rgb(18, 17, 31),
            strokeWidthDp = 1,
        )
    }

    private fun stationCardBackground(isActive: Boolean = false): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            if (isActive) {
                intArrayOf(
                    Color.rgb(62, 46, 25),
                    Color.rgb(42, 34, 28),
                    elevatedSurfaceColor,
                )
            } else {
                intArrayOf(
                    Color.rgb(50, 51, 61),
                    elevatedSurfaceColor,
                    surfaceColor,
                )
            },
        ).apply {
            cornerRadius = dp(28).toFloat()
            setStroke(dp(if (isActive) 3 else 1), if (isActive) accentColor else Color.argb(12, 255, 255, 255))
        }
    }

    private fun stationTileOverlay(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.argb(5, 0, 0, 0),
                Color.argb(15, 0, 0, 0),
                Color.argb(145, 0, 0, 0),
                Color.argb(225, 0, 0, 0),
            ),
        )
    }

    private fun activeStationTileBorder(): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(Color.TRANSPARENT)
            cornerRadius = dp(28).toFloat()
            setStroke(dp(3), accentColor)
        }
    }

    private fun selectableItemBackground(): Drawable? {
        val typedArray = obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground))
        return typedArray.getDrawable(0).also {
            typedArray.recycle()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()

    private class RoundedLogoView(context: Context) : ImageView(context) {
        private val clipPath = Path()
        private val rect = RectF()
        private val density = resources.displayMetrics.density

        override fun onDraw(canvas: Canvas) {
            val saveCount = canvas.save()
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            clipPath.reset()
            val radius = 28f * density
            clipPath.addRoundRect(rect, radius, radius, Path.Direction.CW)
            canvas.clipPath(clipPath)
            super.onDraw(canvas)
            canvas.restoreToCount(saveCount)
        }
    }

    private class StationCardShadowLayout(context: Context) : LinearLayout(context) {
        private val density = resources.displayMetrics.density
        private val rect = RectF()
        private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }

        init {
            setWillNotDraw(false)
            setLayerType(View.LAYER_TYPE_SOFTWARE, null)
            clipChildren = false
            clipToPadding = false
        }

        override fun onDraw(canvas: Canvas) {
            val baseLeft = paddingLeft.toFloat()
            val baseTop = paddingTop.toFloat()
            val baseRight = (width - paddingRight).toFloat()
            val baseBottom = (height - paddingBottom).toFloat()
            val radius = 28f * density
            val steps = 18

            for (i in steps downTo 1) {
                val progress = i / steps.toFloat()
                val spread = 16f * density * progress
                val yOffset = 8f * density * progress
                val alpha = (50 * (1f - progress).let { it * it } * 0.72f).toInt().coerceIn(0, 38)
                shadowPaint.color = Color.argb(alpha, 0, 0, 0)
                rect.set(
                    baseLeft - spread,
                    baseTop - spread + yOffset,
                    baseRight + spread,
                    baseBottom + spread + yOffset,
                )
                canvas.drawRoundRect(rect, radius + spread, radius + spread, shadowPaint)
            }

            super.onDraw(canvas)
        }
    }

    private class ArtworkShadowLayout(context: Context) : FrameLayout(context) {
        private val density = resources.displayMetrics.density
        private val rect = RectF()
        private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }

        init {
            setWillNotDraw(false)
            setLayerType(View.LAYER_TYPE_SOFTWARE, null)
            clipChildren = false
            clipToPadding = false
        }

        override fun onDraw(canvas: Canvas) {
            val baseLeft = paddingLeft.toFloat()
            val baseTop = paddingTop.toFloat()
            val baseRight = (width - paddingRight).toFloat()
            val baseBottom = (height - paddingBottom).toFloat()
            val radius = 28f * density
            val steps = 18

            for (i in steps downTo 1) {
                val progress = i / steps.toFloat()
                val spread = 22f * density * progress
                val yOffset = 11f * density * progress
                val alpha = (54 * (1f - progress).let { it * it } * 0.72f).toInt().coerceIn(0, 42)
                shadowPaint.color = Color.argb(alpha, 0, 0, 0)
                rect.set(
                    baseLeft - spread,
                    baseTop - spread + yOffset,
                    baseRight + spread,
                    baseBottom + spread + yOffset,
                )
                canvas.drawRoundRect(rect, radius + spread, radius + spread, shadowPaint)
            }

            super.onDraw(canvas)
        }
    }

    private class GlossyPlayButtonDrawable(
        private val accent: Int,
    ) : Drawable() {
        private val rect = RectF()
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
        }
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.4f
            color = Color.argb(72, 255, 255, 255)
        }

        override fun draw(canvas: Canvas) {
            val size = minOf(bounds.width(), bounds.height()).toFloat()
            val cx = bounds.left + bounds.width() / 2f
            val cy = bounds.top + bounds.height() / 2f
            val radius = size / 2f

            paint.shader = RadialGradient(
                cx - radius * 0.22f,
                cy - radius * 0.32f,
                radius * 1.2f,
                intArrayOf(
                    lighten(accent, 0.42f),
                    accent,
                    darken(accent, 0.08f),
                ),
                floatArrayOf(0f, 0.58f, 1f),
                Shader.TileMode.CLAMP,
            )
            canvas.drawCircle(cx, cy, radius * 0.95f, paint)

            paint.shader = null
            paint.color = Color.argb(34, 0, 0, 0)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = radius * 0.08f
            canvas.drawCircle(cx, cy, radius * 0.89f, paint)

            paint.style = Paint.Style.FILL
            paint.shader = RadialGradient(
                cx - radius * 0.28f,
                cy - radius * 0.55f,
                radius * 0.62f,
                Color.argb(118, 255, 238, 181),
                Color.TRANSPARENT,
                Shader.TileMode.CLAMP,
            )
            rect.set(
                cx - radius * 0.55f,
                cy - radius * 0.78f,
                cx + radius * 0.55f,
                cy - radius * 0.22f,
            )
            canvas.drawOval(rect, paint)

            paint.shader = null
            canvas.drawCircle(cx, cy, radius * 0.94f, strokePaint)
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = 255
            strokePaint.alpha = 255
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
            strokePaint.colorFilter = colorFilter
        }

        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

        private fun lighten(color: Int, amount: Float): Int {
            return Color.rgb(
                (Color.red(color) + (255 - Color.red(color)) * amount).toInt().coerceIn(0, 255),
                (Color.green(color) + (255 - Color.green(color)) * amount).toInt().coerceIn(0, 255),
                (Color.blue(color) + (255 - Color.blue(color)) * amount).toInt().coerceIn(0, 255),
            )
        }

        private fun darken(color: Int, amount: Float): Int {
            return Color.rgb(
                (Color.red(color) * (1f - amount)).toInt().coerceIn(0, 255),
                (Color.green(color) * (1f - amount)).toInt().coerceIn(0, 255),
                (Color.blue(color) * (1f - amount)).toInt().coerceIn(0, 255),
            )
        }
    }

    private class AnimatedEqualizerView(
        context: Context,
        private val low: Int,
        private val mid: Int,
        private val peak: Int,
        private val isAnimating: Boolean,
    ) : View(context) {
        private val density = resources.displayMetrics.density
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()
        private val barCount = 31
        private var isAttached = false

        override fun onAttachedToWindow() {
            super.onAttachedToWindow()
            isAttached = true
            if (isAnimating) {
                postInvalidateOnAnimation()
            }
        }

        override fun onDetachedFromWindow() {
            isAttached = false
            super.onDetachedFromWindow()
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            if (width <= 0 || height <= 0) return

            val gap = 4f * density
            val barWidth = ((width - gap * (barCount - 1)) / barCount).coerceAtLeast(2f * density)
            val maxBarHeight = height * 0.78f
            val minBarHeight = height * 0.16f
            val time = SystemClock.uptimeMillis() / 260f

            repeat(barCount) { index ->
                val basePattern = when {
                    index % 9 == 0 -> 1.0f
                    index % 5 == 0 -> 0.82f
                    index % 3 == 0 -> 0.64f
                    else -> 0.42f
                }
                val wave = if (isAnimating) {
                    (
                        abs(sin(time + index * 0.52f)) * 0.62f +
                            abs(sin(time * 0.63f + index * 0.31f)) * 0.38f
                        ).toFloat()
                } else {
                    0f
                }
                val barHeight = if (isAnimating) {
                    minBarHeight + (maxBarHeight - minBarHeight) * (0.24f + wave * basePattern * 0.76f)
                } else {
                    4f * density
                }
                val left = index * (barWidth + gap)
                val top = (height - barHeight) / 2f
                rect.set(left, top, left + barWidth, top + barHeight)
                paint.color = when {
                    barHeight > height * 0.66f -> peak
                    barHeight > height * 0.42f -> mid
                    else -> low
                }
                canvas.drawRoundRect(rect, 4f * density, 4f * density, paint)
            }

            if (isAttached && isAnimating) {
                postInvalidateOnAnimation()
            }
        }
    }

    private class SideRailsDrawable(
        private val color: Int,
        private val railWidth: Float,
    ) : Drawable() {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = this@SideRailsDrawable.color
        }

        override fun draw(canvas: Canvas) {
            val bounds = bounds
            canvas.drawRect(bounds.left.toFloat(), bounds.top.toFloat(), bounds.left + railWidth, bounds.bottom.toFloat(), paint)
            canvas.drawRect(bounds.right - railWidth, bounds.top.toFloat(), bounds.right.toFloat(), bounds.bottom.toFloat(), paint)
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
        }

        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }

    private class PlayerSheetShadowDrawable(
        private val shadow: Int,
        private val radius: Float,
        private val contentTop: Float,
    ) : Drawable() {
        private val path = Path()
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = shadow
            style = Paint.Style.FILL
        }

        override fun draw(canvas: Canvas) {
            val bounds = bounds
            val left = bounds.left.toFloat()
            val top = bounds.top + contentTop
            val right = bounds.right.toFloat()
            val bottom = bounds.bottom.toFloat()
            val steps = 18

            for (i in steps downTo 1) {
                val progress = i / steps.toFloat()
                val spread = contentTop * progress * 1.45f
                val alpha = (Color.alpha(shadow) * (1f - progress).let { it * it } * 0.72f).toInt().coerceIn(0, 42)
                paint.alpha = alpha

                path.reset()
                path.moveTo(left, bottom)
                path.lineTo(left, top + radius)
                path.quadTo(left, top - spread, left + radius + spread, top - spread)
                path.lineTo(right - radius - spread, top - spread)
                path.quadTo(right, top - spread, right, top + radius)
                path.lineTo(right, bottom)
                path.close()
                canvas.drawPath(path, paint)
            }
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
        }

        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }

    private class PlayerSheetBorderDrawable(
        private val fill: Int,
        private val stroke: Int,
        private val strokeWidth: Float,
        private val radius: Float,
    ) : Drawable() {
        private val fillPath = Path()
        private val strokePath = Path()
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = fill
            style = Paint.Style.FILL
        }
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = stroke
            style = Paint.Style.STROKE
            strokeWidth = this@PlayerSheetBorderDrawable.strokeWidth
        }

        override fun draw(canvas: Canvas) {
            val halfStroke = strokeWidth / 2f
            val left = bounds.left + halfStroke
            val top = bounds.top + halfStroke
            val right = bounds.right - halfStroke
            val bottom = bounds.bottom.toFloat()

            fillPath.reset()
            fillPath.moveTo(left, bottom)
            fillPath.lineTo(left, top + radius)
            fillPath.quadTo(left, top, left + radius, top)
            fillPath.lineTo(right - radius, top)
            fillPath.quadTo(right, top, right, top + radius)
            fillPath.lineTo(right, bottom)
            fillPath.close()
            canvas.drawPath(fillPath, fillPaint)

            strokePath.reset()
            strokePath.moveTo(left, bottom)
            strokePath.lineTo(left, top + radius)
            strokePath.quadTo(left, top, left + radius, top)
            strokePath.lineTo(right - radius, top)
            strokePath.quadTo(right, top, right, top + radius)
            strokePath.lineTo(right, bottom)
            canvas.drawPath(strokePath, strokePaint)
        }

        override fun setAlpha(alpha: Int) {
            fillPaint.alpha = alpha
            strokePaint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            fillPaint.colorFilter = colorFilter
            strokePaint.colorFilter = colorFilter
        }

        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }

    private class TopArchDrawable(
        color: Int,
        strokeWidth: Float,
        private val radius: Float,
    ) : Drawable() {
        private val path = Path()
        private val fillPath = Path()
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            style = Paint.Style.FILL
        }
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            style = Paint.Style.STROKE
            this.strokeWidth = strokeWidth
        }

        override fun draw(canvas: Canvas) {
            val halfStroke = paint.strokeWidth / 2f
            val left = bounds.left + halfStroke
            val top = bounds.top + halfStroke
            val right = bounds.right - halfStroke
            val bottom = bounds.bottom - halfStroke

            fillPath.reset()
            fillPath.moveTo(left, top)
            fillPath.lineTo(left + radius, top)
            fillPath.quadTo(left, top, left, top + radius)
            fillPath.lineTo(left, bottom)
            fillPath.close()
            canvas.drawPath(fillPath, fillPaint)

            fillPath.reset()
            fillPath.moveTo(right - radius, top)
            fillPath.lineTo(right, top)
            fillPath.lineTo(right, bottom)
            fillPath.lineTo(right, top + radius)
            fillPath.quadTo(right, top, right - radius, top)
            fillPath.close()
            canvas.drawPath(fillPath, fillPaint)

            path.reset()
            path.moveTo(left, bottom)
            path.lineTo(left, top + radius)
            path.quadTo(left, top, left + radius, top)
            canvas.drawPath(path, paint)

            path.reset()
            path.moveTo(right - radius, top)
            path.quadTo(right, top, right, top + radius)
            path.lineTo(right, bottom)
            canvas.drawPath(path, paint)
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
            fillPaint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
            fillPaint.colorFilter = colorFilter
        }

        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }

    private class OutputSwitcherIconDrawable(color: Int) : Drawable() {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = color
            style = Paint.Style.STROKE
            strokeWidth = 2.2f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        private val rect = RectF()

        override fun draw(canvas: Canvas) {
            val bounds = bounds
            if (bounds.width() <= 0 || bounds.height() <= 0) return

            val scale = minOf(bounds.width(), bounds.height()) / 48f
            paint.strokeWidth = 2.2f * scale

            val left = bounds.left.toFloat()
            val top = bounds.top.toFloat()

            rect.set(left + 5f * scale, top + 13f * scale, left + 27f * scale, top + 29f * scale)
            canvas.drawRoundRect(rect, 1.6f * scale, 1.6f * scale, paint)
            canvas.drawLine(left + 13f * scale, top + 33f * scale, left + 20f * scale, top + 33f * scale, paint)
            canvas.drawLine(left + 16.5f * scale, top + 29f * scale, left + 16.5f * scale, top + 33f * scale, paint)

            rect.set(left + 29f * scale, top + 9f * scale, left + 43f * scale, top + 37f * scale)
            canvas.drawRoundRect(rect, 1.9f * scale, 1.9f * scale, paint)
            canvas.drawCircle(left + 36f * scale, top + 18f * scale, 2.3f * scale, paint)
            canvas.drawCircle(left + 36f * scale, top + 30f * scale, 2.3f * scale, paint)
        }

        override fun setAlpha(alpha: Int) {
            paint.alpha = alpha
        }

        override fun setColorFilter(colorFilter: ColorFilter?) {
            paint.colorFilter = colorFilter
        }

        override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
    }

}
