package com.tvapp.autoradio

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.Configuration
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.sin

class MainActivity : AppCompatActivity() {
    private companion object {
        private const val STATE_ACTIVE_STATION_ID = "active_station_id"
        private const val STATE_PLAY_STARTED_AT_MS = "play_started_at_ms"
        private const val ACTION_DISCONNECT_OUTPUT = "com.tvapp.autoradio.DISCONNECT_OUTPUT"
        private const val ACTION_PAUSE_ACTIVE = "com.tvapp.autoradio.PAUSE_ACTIVE"
        private const val ACTION_PLAY_ACTIVE = "com.tvapp.autoradio.PLAY_ACTIVE"
        private const val ACTION_SHOW_CATALOG_SETTINGS = "com.tvapp.autoradio.SHOW_CATALOG_SETTINGS"
        private const val LOG_TAG = "TVAppRadio"
    }

    private val bgColor = Color.rgb(37, 47, 64)
    private val inkColor = Color.rgb(244, 247, 250)
    private val mutedColor = Color.rgb(154, 164, 178)
    private val surfaceColor = Color.rgb(22, 28, 38)
    private val elevatedSurfaceColor = Color.rgb(30, 38, 50)
    private val borderColor = Color.rgb(48, 58, 72)
    private val accentColor = Color.rgb(242, 201, 76)
    private val liveColor = Color.rgb(235, 64, 64)

    private val executor = Executors.newSingleThreadExecutor()
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

    private lateinit var repository: RadioCatalogRepository
    private lateinit var recentPrefs: SharedPreferences
    private lateinit var favoritePrefs: SharedPreferences
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null
    private lateinit var filterPanel: LinearLayout
    private lateinit var filterInput: EditText
    private lateinit var statusPanel: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var retryButton: Button
    private lateinit var sourceButton: ImageView
    private lateinit var playerContainer: LinearLayout
    private lateinit var stationsContainer: LinearLayout
    private lateinit var scrollView: ScrollView
    private var castContext: CastContext? = null
    private var landscapePlayerPane: LinearLayout? = null
    private var landscapeListPane: LinearLayout? = null

    private var allStations: List<RadioStation> = emptyList()
    private var activeStation: RadioStation? = null
    private var playStartedAtMs: Long = 0L
    private var activeElapsedText: TextView? = null
    private var isCatalogLoading = false
    private var isActiveStationLoading = false
    private var isActiveStationPaused = false
    private var isSwitchingStation = false
    private var isPlayerHiding = false
    private var isUserStoppingPlayback = false
    private var connectedOutputName: String? = null
    private var restoredStationId: String? = null
    private var catalogSourceDialog: AlertDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = RadioCatalogRepository(this, BuildConfig.RADIO_API_BASE_URL)
        recentPrefs = getSharedPreferences("recent_stations", MODE_PRIVATE)
        favoritePrefs = getSharedPreferences("favorite_stations", MODE_PRIVATE)
        restoredStationId = savedInstanceState?.getString(STATE_ACTIVE_STATION_ID)
        playStartedAtMs = savedInstanceState?.getLong(STATE_PLAY_STARTED_AT_MS, 0L) ?: 0L

        requestNotificationPermissionIfNeeded()
        buildLayout()
        initializeOutputConnectionMonitor()
        connectMediaController()
        loadStations()
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        syncControllerStateIntoUi()
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.action == ACTION_SHOW_CATALOG_SETTINGS) {
            mainHandler.post { showCatalogSourceSettings() }
        }
    }

    override fun onResume() {
        super.onResume()
        syncControllerStateIntoUi()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (shouldRestorePlayerState()) {
            activeStation?.let { outState.putString(STATE_ACTIVE_STATION_ID, it.id) }
            outState.putLong(STATE_PLAY_STARTED_AT_MS, playStartedAtMs)
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(timerRunnable)
        castContext?.sessionManager?.removeSessionManagerListener(outputSessionListener, CastSession::class.java)
        if (::controllerFuture.isInitialized) {
            MediaController.releaseFuture(controllerFuture)
        }
        executor.shutdown()
        super.onDestroy()
    }

    private fun connectMediaController() {
        val sessionToken = SessionToken(this, ComponentName(this, RadioMediaLibraryService::class.java))
        controllerFuture = MediaController.Builder(this, sessionToken).buildAsync()
        controllerFuture.addListener(
            {
                controller = controllerFuture.get().apply {
                    addListener(object : Player.Listener {
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

                        override fun onPlayerError(error: PlaybackException) {
                            showStatus("שגיאת ניגון: ${error.message ?: error.errorCodeName}", showRetry = false)
                            stopElapsedTimer(resetText = false)
                        }
                    })
                    if (isPlaying || playWhenReady) {
                        syncPlayingFromController()
                    }
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
        if (mediaController.currentMediaItem != null && mediaController.hasRestorablePlayback()) {
            syncPlayingFromController()
            startElapsedTimer()
        } else if (mediaController.currentMediaItem == null && activeStation != null) {
            syncStoppedPlaybackFromController()
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }

    private fun buildLayout() {
        val landscape = isLandscape()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_LTR
            setPadding(0, if (landscape) dp(22) else dp(52), 0, if (landscape) dp(14) else dp(28))
            background = appBackground()
            clipToPadding = false
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        root.addView(headerView())

        val playerParent: LinearLayout
        val listParent: LinearLayout

        if (landscape) {
            val content = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutDirection = View.LAYOUT_DIRECTION_LTR
                clipChildren = false
                clipToPadding = false
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    0,
                    1f,
                )
            }

            playerParent = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.TOP
                visibility = View.GONE
                clipChildren = false
                clipToPadding = false
                setPadding(dp(8), 0, dp(6), 0)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 0f)
            }

            listParent = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                clipChildren = true
                clipToPadding = true
                setPadding(dp(6), 0, dp(8), 0)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f)
            }

            landscapePlayerPane = playerParent
            landscapeListPane = listParent
            content.addView(playerParent)
            content.addView(listParent)
            root.addView(content)
        } else {
            playerParent = root
            listParent = root
        }

        playerContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                if (landscape) LinearLayout.LayoutParams.MATCH_PARENT else LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }
        playerParent.addView(playerContainer)

        filterPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), if (landscape) 0 else dp(10), dp(20), dp(10))
            background = null
            elevation = dp(12).toFloat()
            translationZ = dp(4).toFloat()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = 0
            }
        }

        filterInput = EditText(this).apply {
            hint = "סנן תחנות"
            textSize = 18f
            setSingleLine(true)
            setTextColor(inkColor)
            setHintTextColor(mutedColor)
            setPadding(dp(18), dp(12), dp(18), dp(12))
            background = roundedRect(Color.rgb(20, 26, 36), 18f, Color.rgb(55, 65, 82), 1)
            elevation = dp(8).toFloat()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    renderStations()
                }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
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
            setPadding(dp(14), dp(10), dp(14), dp(18))
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }

        scrollView = ScrollView(this).apply {
            background = SideRailsDrawable(Color.rgb(18, 17, 31), 2f)
            clipChildren = true
            clipToPadding = true
            isFillViewport = false
            addView(stationsContainer)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        }
        listParent.addView(scrollView)
        setContentView(root)
    }

    private fun headerView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(18))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )

            addView(ImageView(this@MainActivity).apply {
                setImageResource(R.drawable.ic_radio)
                background = roundedRect(Color.rgb(66, 80, 105), 14f, Color.rgb(101, 118, 146), 1)
                setPadding(dp(8), dp(8), dp(8), dp(8))
                layoutParams = LinearLayout.LayoutParams(dp(56), dp(56)).apply {
                    marginEnd = dp(14)
                }
            })

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

                addView(TextView(this@MainActivity).apply {
                    text = getString(R.string.app_name)
                    textSize = 24f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(inkColor)
                    includeFontPadding = false
                })

            })

            sourceButton = ImageView(this@MainActivity).apply {
                setImageResource(R.drawable.ic_settings)
                setColorFilter(accentColor)
                scaleType = ImageView.ScaleType.CENTER
                setPadding(dp(9), dp(9), dp(9), dp(9))
                background = roundedRect(Color.rgb(43, 37, 20), 18f, Color.rgb(92, 78, 38), 1)
                updateCatalogSourceButtonDescription()
                isClickable = true
                isFocusable = true
                setOnClickListener { showCatalogSourceSettings() }
                layoutParams = LinearLayout.LayoutParams(
                    dp(42),
                    dp(42),
                ).apply {
                    marginStart = dp(10)
                    marginEnd = dp(4)
                }
            }
            addView(sourceButton)
        }
    }

    private fun ImageView.updateCatalogSourceButtonDescription() {
        val sourceName = when (RadioCatalogSettings.getSource(this@MainActivity)) {
            RadioCatalogSource.ApiProxy -> "API proxy"
            RadioCatalogSource.StaticFile -> "Static JSON file"
        }
        contentDescription = "Radio source settings: $sourceName"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            tooltipText = contentDescription
        }
    }

    private fun showCatalogSourceSettings() {
        catalogSourceDialog?.takeIf { it.isShowing }?.let {
            return
        }

        val currentSource = RadioCatalogSettings.getSource(this)
        val sources = arrayOf(
            "API proxy",
            "Static JSON file",
        )
        val selectedIndex = when (currentSource) {
            RadioCatalogSource.ApiProxy -> 0
            RadioCatalogSource.StaticFile -> 1
        }

        catalogSourceDialog = AlertDialog.Builder(this)
            .setTitle("Radio source")
            .setSingleChoiceItems(sources, selectedIndex) { dialog, which ->
                val nextSource = when (which) {
                    1 -> RadioCatalogSource.StaticFile
                    else -> RadioCatalogSource.ApiProxy
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
        if (::sourceButton.isInitialized) {
            sourceButton.updateCatalogSourceButtonDescription()
        }
        activeStation = null
        restoredStationId = null
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
                renderStations()
            }
        }
    }

    private fun restoreActiveStationAfterCatalogLoad() {
        val mediaController = controller
        val controllerStationId = mediaController
            ?.currentMediaItem
            ?.mediaId
            ?.takeIf { mediaController.hasRestorablePlayback() }

        val stationId = controllerStationId ?: restoredStationId?.takeIf { shouldRestorePlayerState() }
        val station = allStations.firstOrNull { it.id == stationId } ?: return

        activeStation = station
        if (playStartedAtMs <= 0L) {
            playStartedAtMs = System.currentTimeMillis()
        }
        restoredStationId = null
        if (mediaController?.isPlaying == true) {
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

        stationsContainer.removeAllViews()
        playerContainer.removeAllViews()
        activeElapsedText = null
        if (!animatePlayerIn) {
            updateFilterPanelChrome(if (activeStation == null) 0 else 255)
        }
        updateLandscapePanes(activeStation != null)

        val query = filterInput.text?.toString()?.trim()?.lowercase(Locale.getDefault()).orEmpty()
        val visibleStations = (if (query.isBlank()) {
            allStations
        } else {
            allStations.filter { station ->
                station.name.lowercase(Locale.getDefault()).contains(query) ||
                    station.id.lowercase(Locale.US).contains(query)
            }
        }).sortedByDescending { isFavorite(it) }

        activeStation?.let { station ->
            playerContainer.visibility = View.VISIBLE
            playerContainer.addView(activePlayerCard(station))
            if (animatePlayerIn) {
                if (isLandscape()) {
                    prepareLandscapePlayerIn()
                    animateLandscapePlayerIn()
                } else {
                    val targetHeight = measuredPlayerHeight()
                    playerContainer.layoutParams = playerContainer.layoutParams.apply {
                        height = 0
                    }
                    playerContainer.alpha = 0f
                    playerContainer.translationY = -targetHeight.toFloat()
                    updateFilterPanelChrome(0)
                    animatePlayerIn(targetHeight)
                }
            } else {
                playerContainer.layoutParams = playerContainer.layoutParams.apply {
                    height = LinearLayout.LayoutParams.WRAP_CONTENT
                }
                playerContainer.alpha = 1f
                playerContainer.translationY = 0f
            }
        } ?: run {
            playerContainer.visibility = View.GONE
            playerContainer.layoutParams = playerContainer.layoutParams.apply {
                height = LinearLayout.LayoutParams.WRAP_CONTENT
            }
            playerContainer.alpha = 1f
            playerContainer.translationY = 0f
        }

        if (visibleStations.isEmpty()) {
            stationsContainer.addView(emptyState("אין תחנות שמתאימות לסינון"))
            updateElapsedTime()
            return
        }

        visibleStations.forEach { station ->
            stationsContainer.addView(stationRow(station))
        }

        updateElapsedTime()
    }

    private fun measuredPlayerHeight(): Int {
        val widthSpec = View.MeasureSpec.makeMeasureSpec(resources.displayMetrics.widthPixels, View.MeasureSpec.EXACTLY)
        val heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        playerContainer.measure(widthSpec, heightSpec)
        return playerContainer.measuredHeight.coerceAtLeast(dp(220))
    }

    private fun updateLandscapePanes(hasActivePlayer: Boolean) {
        val playerPane = landscapePlayerPane ?: return
        val listPane = landscapeListPane ?: return

        if (hasActivePlayer) {
            playerPane.visibility = View.VISIBLE
            playerPane.layoutParams = (playerPane.layoutParams as LinearLayout.LayoutParams).apply {
                width = 0
                weight = 0.95f
            }
            listPane.layoutParams = (listPane.layoutParams as LinearLayout.LayoutParams).apply {
                width = 0
                weight = 1.05f
            }
        } else {
            playerPane.visibility = View.GONE
            listPane.layoutParams = (listPane.layoutParams as LinearLayout.LayoutParams).apply {
                width = 0
                weight = 1f
            }
        }
    }

    private fun prepareLandscapePlayerIn() {
        val playerPane = landscapePlayerPane ?: return
        val listPane = landscapeListPane ?: return

        playerPane.visibility = View.VISIBLE
        playerPane.layoutParams = (playerPane.layoutParams as LinearLayout.LayoutParams).apply {
            width = 0
            weight = 0f
        }
        listPane.layoutParams = (listPane.layoutParams as LinearLayout.LayoutParams).apply {
            width = 0
            weight = 1f
        }
        playerContainer.alpha = 0f
        playerContainer.translationX = -resources.displayMetrics.widthPixels.toFloat()
        playerContainer.translationY = 0f
    }

    private fun animateLandscapePlayerIn() {
        val playerPane = landscapePlayerPane ?: return
        val listPane = landscapeListPane ?: return

        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 280L
            addUpdateListener { animation ->
                val progress = animation.animatedValue as Float
                playerPane.layoutParams = (playerPane.layoutParams as LinearLayout.LayoutParams).apply {
                    width = 0
                    weight = 0.95f * progress
                }
                listPane.layoutParams = (listPane.layoutParams as LinearLayout.LayoutParams).apply {
                    width = 0
                    weight = 1f + (0.05f * progress)
                }
            }
            start()
        }

        playerContainer.animate()
            .translationX(0f)
            .alpha(1f)
            .setDuration(280L)
            .start()
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

        if (isLandscape()) {
            hideLandscapePlayerWithAnimation()
            return
        }

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

    private fun hideLandscapePlayerWithAnimation() {
        val playerPane = landscapePlayerPane
        val listPane = landscapeListPane
        if (playerPane == null || listPane == null) {
            clearActivePlaybackState()
            isPlayerHiding = false
            renderStations()
            return
        }

        ValueAnimator.ofFloat(1f, 0f).apply {
            duration = 240L
            addUpdateListener { animation ->
                val progress = animation.animatedValue as Float
                playerPane.layoutParams = (playerPane.layoutParams as LinearLayout.LayoutParams).apply {
                    width = 0
                    weight = 0.95f * progress
                }
                listPane.layoutParams = (listPane.layoutParams as LinearLayout.LayoutParams).apply {
                    width = 0
                    weight = 1f + (0.05f * progress)
                }
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    clearActivePlaybackState()
                    isPlayerHiding = false
                    playerContainer.translationX = 0f
                    playerContainer.alpha = 1f
                    renderStations()
                }
            })
            start()
        }

        playerContainer.animate()
            .translationX(-resources.displayMetrics.widthPixels.toFloat())
            .alpha(0f)
            .setDuration(240L)
            .start()
    }

    private fun clearActivePlaybackState() {
        activeStation = null
        playStartedAtMs = 0L
        isActiveStationLoading = false
        isActiveStationPaused = false
        stopElapsedTimer(resetText = true)
        hideStatus()
    }

    private fun updateFilterPanelChrome(alpha: Int = 255) {
        if (isLandscape()) {
            filterPanel.layoutParams = (filterPanel.layoutParams as LinearLayout.LayoutParams).apply {
                topMargin = 0
            }
            filterPanel.background = null
            return
        }

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
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 0, 0, 0)
            background = null
            elevation = 0f
            translationZ = 0f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(12), dp(8), dp(12), dp(12))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    marginStart = dp(10)
                    marginEnd = dp(10)
                }

                addView(heroArtwork(station))

                addView(TextView(this@MainActivity).apply {
                    text = station.name
                    textSize = 21f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(inkColor)
                    applyStationTextDirection(station.name, alignHebrewRight = false)
                    includeFontPadding = false
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        bottomMargin = dp(6)
                    }
                })

                activeElapsedText = TextView(this@MainActivity).apply {
                    text = if (isActiveStationLoading) "טוען..." else "00:00"
                    textSize = 17f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(accentColor)
                    gravity = Gravity.CENTER
                    background = roundedRect(Color.rgb(15, 20, 28), 20f, Color.rgb(63, 72, 86), 1)
                    setPadding(dp(20), dp(7), dp(20), dp(7))
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        gravity = Gravity.CENTER_HORIZONTAL
                    }
                }
                addView(activeElapsedText)

                connectedOutputName?.let { outputName ->
                    addView(TextView(this@MainActivity).apply {
                        text = "מחובר אל $outputName"
                        textSize = 13f
                        typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.rgb(214, 221, 232))
                        gravity = Gravity.CENTER
                        setPadding(dp(12), dp(5), dp(12), dp(5))
                        background = roundedRect(Color.argb(96, 15, 20, 28), 15f, Color.argb(120, 242, 201, 76), 1)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                        ).apply {
                            gravity = Gravity.CENTER_HORIZONTAL
                            topMargin = dp(8)
                        }
                    })
                }
            })

            addView(playerControlsPanel(station))
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, 0)
            background = null
            elevation = 0f
            translationZ = 0f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = 0
            }
            addView(card)
        }
    }

    private fun stationLogoView(station: RadioStation): FrameLayout {
        return FrameLayout(this).apply {
            background = roundedRect(Color.rgb(10, 14, 20), 12f)
            foreground = roundedRect(Color.TRANSPARENT, 12f, Color.rgb(76, 90, 112), 2)
            setPadding(dp(4), dp(4), dp(4), dp(4))
            clipChildren = true
            clipToPadding = true

            addView(ImageView(this@MainActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = roundedRect(Color.WHITE, 9f)
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
            setPadding(dp(20), dp(14), dp(20), dp(14))
            background = bottomPlayerPanelBackground()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(92),
            )

            addView(FrameLayout(this@MainActivity).apply {
                clipChildren = false
                clipToPadding = false

                addView(LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL

                    addView(controlFavoriteButton(isFavorite(station)) { toggleFavorite(station) }, LinearLayout.LayoutParams(dp(52), dp(58)).apply {
                        marginEnd = dp(12)
                    })
                    addView(outputSwitcherButton(), LinearLayout.LayoutParams(dp(48), dp(48)))
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    Gravity.START or Gravity.CENTER_VERTICAL,
                ))

                addView(roundIconButton(if (isActiveStationPaused) "▶" else "Ⅱ") {
                    toggleActivePlayback(station)
                }, FrameLayout.LayoutParams(
                    dp(58),
                    dp(58),
                    Gravity.CENTER,
                ))

                addView(roundIconButton("×") { stopPlayback() }, FrameLayout.LayoutParams(
                    dp(46),
                    dp(46),
                    Gravity.END or Gravity.CENTER_VERTICAL,
                ))
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT,
            ))
        }
    }

    private fun heroArtwork(station: RadioStation): FrameLayout {
        return FrameLayout(this).apply {
            clipChildren = false
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(120),
            ).apply {
                bottomMargin = dp(8)
            }

            addView(playerScale().apply {
                alpha = 0.95f
            }, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(88),
                Gravity.CENTER,
            ))

            addView(FrameLayout(this@MainActivity).apply {
                clipChildren = false
                clipToPadding = false
                setPadding(dp(2), dp(2), dp(2), dp(2))
                background = roundedRect(Color.rgb(14, 19, 27), 30f, accentColor, 2)
                elevation = dp(8).toFloat()

                addView(RoundedLogoView(this@MainActivity).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    background = roundedRect(Color.WHITE, 32f)
                    setPadding(0, 0, 0, 0)
                    loadStationLogo(station, this)
                }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    Gravity.CENTER,
                ))
            }, FrameLayout.LayoutParams(dp(94), dp(94), Gravity.CENTER))
        }
    }

    private fun playerScale(): View = AnimatedEqualizerView(this, accentColor, Color.rgb(235, 64, 64))

    private fun TextView.applyStationTextDirection(textValue: String, alignHebrewRight: Boolean) {
        val isHebrew = textValue.any { it in '\u0590'..'\u05FF' }
        textDirection = if (isHebrew) View.TEXT_DIRECTION_RTL else View.TEXT_DIRECTION_LTR
        gravity = when {
            !alignHebrewRight -> Gravity.CENTER
            isHebrew -> Gravity.RIGHT
            else -> Gravity.LEFT
        }
    }

    private fun favoriteButton(isFavorite: Boolean, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = if (isFavorite) "★" else "☆"
            textSize = 27f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (isFavorite) accentColor else Color.rgb(214, 221, 232))
            gravity = Gravity.CENTER
            background = null
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }
        }
    }

    private fun controlFavoriteButton(isFavorite: Boolean, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = if (isFavorite) "★" else "☆"
            textSize = 33f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (isFavorite) accentColor else Color.rgb(238, 242, 248))
            gravity = Gravity.CENTER
            background = null
            elevation = dp(4).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }
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

    private fun roundIconButton(icon: String, onClick: () -> Unit): TextView {
        val isPrimary = icon == "▶" || icon == "Ⅱ"
        return TextView(this).apply {
            text = icon
            textSize = if (isPrimary) 28f else 24f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(inkColor)
            gravity = Gravity.CENTER
            background = if (isPrimary) {
                roundedRect(Color.rgb(17, 22, 30), 32f, accentColor, 2)
            } else {
                roundedRect(Color.rgb(17, 22, 30), 25f, Color.rgb(99, 109, 124), 1)
            }
            elevation = dp(if (isPrimary) 8 else 5).toFloat()
            translationZ = dp(if (isPrimary) 3 else 2).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }
        }
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
        activeStation = station
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

    private fun mediaItemFor(station: RadioStation): MediaItem {
        val mediaItemBuilder = MediaItem.Builder()
            .setMediaId(station.id)
            .setUri(repository.streamUriFor(station.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(station.name)
                    .setArtist(getString(R.string.app_name))
                    .setAlbumTitle("רדיו חי")
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
        val mediaId = controller?.currentMediaItem?.mediaId ?: return
        val station = allStations.firstOrNull { it.id == mediaId } ?: return
        activeStation = station
        isActiveStationLoading = true
        isActiveStationPaused = false
        hideStatus()
        renderStations(animatePlayerIn = playerContainer.visibility != View.VISIBLE)
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
        val mediaId = controller?.currentMediaItem?.mediaId ?: return
        val station = allStations.firstOrNull { it.id == mediaId } ?: return
        val previousId = activeStation?.id

        activeStation = station
        rememberStation(station)
        if (playStartedAtMs <= 0L || previousId != station.id) {
            playStartedAtMs = System.currentTimeMillis()
        }
        isActiveStationLoading = false
        hideStatus()
        renderStations(animatePlayerIn = previousId == null || playerContainer.visibility != View.VISIBLE)
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
            imageView.setImageDrawable(logoFallback())
            return
        }

        logoCache[logoUrl]?.let {
            imageView.setImageBitmap(it)
            return
        }

        imageView.setImageDrawable(logoFallback())
        executor.execute {
            try {
                val connection = URL(logoUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 8_000
                connection.readTimeout = 8_000
                connection.requestMethod = "GET"
                connection.inputStream.use { stream ->
                    BitmapFactory.decodeStream(stream)?.let { bitmap ->
                        logoCache[logoUrl] = bitmap
                        mainHandler.post { imageView.setImageBitmap(bitmap) }
                    }
                }
                connection.disconnect()
            } catch (_: Exception) {
                mainHandler.post { imageView.setImageDrawable(logoFallback()) }
            }
        }
    }

    private fun logoFallback(): Drawable {
        return roundedRect(Color.rgb(12, 17, 24), 10f, borderColor, 1)
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
                Color.rgb(91, 108, 140),
                Color.rgb(68, 84, 112),
                Color.rgb(48, 61, 83),
                bgColor,
                Color.rgb(31, 39, 52),
            ),
        )
    }

    private fun playerCardBackground(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(
                Color.rgb(31, 42, 63),
                Color.rgb(33, 31, 23),
                Color.rgb(31, 12, 22),
            ),
        ).apply {
            cornerRadius = dp(38).toFloat()
            setStroke(dp(2), Color.rgb(242, 201, 76))
        }
    }

    private fun bottomPlayerPanelBackground(): GradientDrawable {
        return roundedCorners(
            fill = Color.rgb(18, 17, 31),
            topLeftDp = 34f,
            topRightDp = 34f,
            bottomRightDp = 0f,
            bottomLeftDp = 0f,
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
            GradientDrawable.Orientation.LEFT_RIGHT,
            if (isActive) {
                intArrayOf(
                    Color.rgb(31, 28, 20),
                    Color.rgb(42, 37, 24),
                    Color.rgb(31, 28, 20),
                )
            } else {
                intArrayOf(
                    Color.rgb(18, 24, 34),
                    Color.rgb(26, 34, 46),
                    Color.rgb(18, 24, 34),
                )
            },
        ).apply {
            cornerRadius = dp(18).toFloat()
            setStroke(dp(if (isActive) 2 else 1), if (isActive) accentColor else Color.rgb(49, 59, 74))
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

    private fun isLandscape(): Boolean {
        return resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    }

    private class RoundedLogoView(context: Context) : ImageView(context) {
        private val clipPath = Path()
        private val rect = RectF()

        override fun onDraw(canvas: Canvas) {
            val saveCount = canvas.save()
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            clipPath.reset()
            clipPath.addRoundRect(rect, width * 0.36f, height * 0.36f, Path.Direction.CW)
            canvas.clipPath(clipPath)
            super.onDraw(canvas)
            canvas.restoreToCount(saveCount)
        }
    }

    private class StationCardShadowLayout(context: Context) : LinearLayout(context) {
        private val density = resources.displayMetrics.density
        private val rect = RectF()
        private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(42, 0, 0, 0)
            setShadowLayer(9f * density, 2f * density, 6f * density, Color.argb(150, 0, 0, 0))
        }

        init {
            setWillNotDraw(false)
            setLayerType(View.LAYER_TYPE_SOFTWARE, null)
        }

        override fun onDraw(canvas: Canvas) {
            rect.set(
                paddingLeft.toFloat(),
                paddingTop.toFloat(),
                (width - paddingRight).toFloat(),
                (height - paddingBottom).toFloat(),
            )
            canvas.drawRoundRect(rect, 18f * density, 18f * density, shadowPaint)
            super.onDraw(canvas)
        }
    }

    private class AnimatedEqualizerView(
        context: Context,
        private val accent: Int,
        private val hot: Int,
    ) : View(context) {
        private val density = resources.displayMetrics.density
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()
        private val barCount = 31
        private var isRunning = false

        override fun onAttachedToWindow() {
            super.onAttachedToWindow()
            isRunning = true
            postInvalidateOnAnimation()
        }

        override fun onDetachedFromWindow() {
            isRunning = false
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
                val wave = (
                    abs(sin(time + index * 0.52f)) * 0.62f +
                        abs(sin(time * 0.63f + index * 0.31f)) * 0.38f
                    ).toFloat()
                val barHeight = minBarHeight + (maxBarHeight - minBarHeight) * (0.24f + wave * basePattern * 0.76f)
                val left = index * (barWidth + gap)
                val top = (height - barHeight) / 2f
                rect.set(left, top, left + barWidth, top + barHeight)
                paint.color = if (index % 2 == 0) accent else hot
                canvas.drawRoundRect(rect, 4f * density, 4f * density, paint)
            }

            if (isRunning) {
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
