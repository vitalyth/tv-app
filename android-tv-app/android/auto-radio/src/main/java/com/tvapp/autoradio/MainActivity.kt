package com.tvapp.autoradio

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
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
import android.text.Editable
import android.text.TextWatcher
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
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class MainActivity : Activity() {
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

    private lateinit var repository: RadioCatalogRepository
    private lateinit var recentPrefs: SharedPreferences
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null
    private lateinit var filterPanel: LinearLayout
    private lateinit var filterInput: EditText
    private lateinit var statusPanel: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var retryButton: Button
    private lateinit var playerContainer: LinearLayout
    private lateinit var stationsContainer: LinearLayout
    private lateinit var scrollView: ScrollView

    private var allStations: List<RadioStation> = emptyList()
    private var activeStation: RadioStation? = null
    private var playStartedAtMs: Long = 0L
    private var activeElapsedText: TextView? = null
    private var isCatalogLoading = false
    private var isSwitchingStation = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = RadioCatalogRepository(BuildConfig.RADIO_API_BASE_URL)
        recentPrefs = getSharedPreferences("recent_stations", MODE_PRIVATE)

        requestNotificationPermissionIfNeeded()
        buildLayout()
        connectMediaController()
        loadStations()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(timerRunnable)
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
                            if (playbackState == Player.STATE_READY && playWhenReady) {
                                syncPlayingFromController()
                                startElapsedTimer()
                            } else if (playbackState == Player.STATE_ENDED || playbackState == Player.STATE_IDLE) {
                                if (!isSwitchingStation) {
                                    syncStoppedPlaybackFromController()
                                }
                            }
                        }

                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            val mediaController = controller ?: return
                            if (isPlaying) {
                                syncPlayingFromController()
                                startElapsedTimer()
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
                }
            },
            MoreExecutors.directExecutor(),
        )
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }

    private fun buildLayout() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(52), 0, dp(28))
            background = appBackground()
            clipToPadding = false
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        root.addView(headerView())

        playerContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }
        root.addView(playerContainer)

        filterPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(10), dp(20), dp(10))
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
        root.addView(filterPanel)

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
        root.addView(statusPanel)

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
            clipToPadding = false
            isFillViewport = false
            addView(stationsContainer)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        }
        root.addView(scrollView)
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
        }
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
                renderStations()
            }
        }
    }

    private fun renderStations() {
        if (isCatalogLoading) {
            return
        }

        stationsContainer.removeAllViews()
        playerContainer.removeAllViews()
        activeElapsedText = null
        updateFilterPanelChrome()

        val query = filterInput.text?.toString()?.trim()?.lowercase(Locale.getDefault()).orEmpty()
        val visibleStations = if (query.isBlank()) {
            allStations
        } else {
            allStations.filter { station ->
                station.name.lowercase(Locale.getDefault()).contains(query) ||
                    station.id.lowercase(Locale.US).contains(query)
            }
        }.sortedWith(compareByDescending<RadioStation> { recentPrefs.getLong(it.id, 0L) }.thenBy { it.name })

        activeStation?.let { station ->
            playerContainer.visibility = View.VISIBLE
            playerContainer.addView(activePlayerCard(station))
        } ?: run {
            playerContainer.visibility = View.GONE
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

    private fun updateFilterPanelChrome() {
        filterPanel.background = if (activeStation == null) {
            null
        } else {
            TopArchDrawable(Color.rgb(18, 17, 31), 2f, dp(30).toFloat())
        }
    }

    private fun stationRow(station: RadioStation): LinearLayout {
        val shadow = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(6), dp(2), dp(6), dp(12))
            background = roundedRect(Color.rgb(9, 12, 18), 22f)
            elevation = dp(10).toFloat()
            translationZ = dp(3).toFloat()
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = dp(16)
            }
        }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = stationCardBackground()
            elevation = dp(3).toFloat()
            translationZ = dp(1).toFloat()
            foreground = selectableItemBackground()
            isClickable = true
            isFocusable = true
            setOnClickListener { playStation(station) }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }

        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL

            addView(ImageView(this@MainActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = roundedRect(Color.rgb(10, 14, 20), 12f, Color.rgb(58, 68, 84), 1)
                setPadding(dp(2), dp(2), dp(2), dp(2))
                layoutParams = LinearLayout.LayoutParams(dp(54), dp(54)).apply {
                    marginEnd = dp(14)
                }
                loadStationLogo(station, this)
            })

            addView(TextView(this@MainActivity).apply {
                text = "▶"
                textSize = 17f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(accentColor)
                gravity = Gravity.CENTER
                background = roundedRect(Color.rgb(43, 37, 20), 13f)
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
                    includeFontPadding = false
                })
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
                    gravity = Gravity.CENTER
                    includeFontPadding = false
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        bottomMargin = dp(6)
                    }
                })

                activeElapsedText = TextView(this@MainActivity).apply {
                    text = "00:00"
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

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER

                addView(roundIconButton("▶") { playStation(station, refreshLive = true) }, LinearLayout.LayoutParams(dp(58), dp(58)).apply {
                    marginEnd = dp(18)
                })

                addView(roundIconButton("×") { stopPlayback() }, LinearLayout.LayoutParams(dp(48), dp(48)).apply {
                    marginStart = dp(18)
                })
            })
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

    private fun playerScale(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, 0)

            repeat(31) { index ->
                val height = when {
                    index % 9 == 0 -> dp(58)
                    index % 5 == 0 -> dp(42)
                    index % 3 == 0 -> dp(30)
                    else -> dp(18)
                }
                addView(View(this@MainActivity).apply {
                    background = roundedRect(
                        if (index % 2 == 0) accentColor else Color.rgb(235, 64, 64),
                        3f,
                    )
                    layoutParams = LinearLayout.LayoutParams(0, height, 1f).apply {
                        marginStart = dp(2)
                        marginEnd = dp(2)
                    }
                })
            }
        }
    }

    private fun roundIconButton(icon: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = icon
            textSize = if (icon == "▶") 28f else 26f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(inkColor)
            gravity = Gravity.CENTER
            background = if (icon == "▶") {
                roundedRect(Color.rgb(17, 22, 30), 32f, accentColor, 2)
            } else {
                roundedRect(Color.rgb(17, 22, 30), 25f, Color.rgb(99, 109, 124), 1)
            }
            elevation = dp(5).toFloat()
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }
        }
    }

    private fun playStation(station: RadioStation, refreshLive: Boolean = false) {
        hideStatus()
        rememberStation(station)
        activeStation = station
        playStartedAtMs = System.currentTimeMillis()
        renderStations()
        scrollToTop()

        if (refreshLive) {
            showStatus("מרענן תחנה: ${station.name}", showRetry = false)
        }

        val mediaController = controller
        if (mediaController == null) {
            showStatus("הנגן עדיין נטען. נסה שוב בעוד רגע.", showRetry = false)
            return
        }

        isSwitchingStation = true
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

        mediaController.setMediaItem(
            mediaItemBuilder.build()
        )
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

    private fun rememberStation(station: RadioStation) {
        recentPrefs.edit()
            .putLong(station.id, System.currentTimeMillis())
            .apply()
    }

    private fun stopPlayback() {
        controller?.stop()
        activeStation = null
        playStartedAtMs = 0L
        stopElapsedTimer(resetText = true)
        hideStatus()
        renderStations()
    }

    private fun syncStoppedPlaybackFromController() {
        activeStation = null
        playStartedAtMs = 0L
        stopElapsedTimer(resetText = true)
        hideStatus()
        renderStations()
    }

    private fun syncPlayingFromController() {
        val mediaId = controller?.currentMediaItem?.mediaId ?: return
        val station = allStations.firstOrNull { it.id == mediaId } ?: return
        val previousId = activeStation?.id

        activeStation = station
        rememberStation(station)
        if (playStartedAtMs <= 0L || previousId != station.id) {
            playStartedAtMs = System.currentTimeMillis()
        }
        hideStatus()
        renderStations()
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
        if (playStartedAtMs <= 0L || station == null) {
            activeElapsedText?.text = "00:00"
            return
        }

        val elapsedSeconds = ((System.currentTimeMillis() - playStartedAtMs) / 1_000).coerceAtLeast(0)
        val minutes = elapsedSeconds / 60
        val seconds = elapsedSeconds % 60
        activeElapsedText?.text = "%02d:%02d".format(minutes, seconds)
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

    private fun stationCardBackground(): GradientDrawable {
        return GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            intArrayOf(
                Color.rgb(18, 24, 34),
                Color.rgb(26, 34, 46),
                Color.rgb(18, 24, 34),
            ),
        ).apply {
            cornerRadius = dp(18).toFloat()
            setStroke(dp(1), Color.rgb(49, 59, 74))
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
            path.lineTo(right - radius, top)
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
}
