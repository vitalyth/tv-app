package com.tvapp.autoradio

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Color
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
    private val bgColor = Color.rgb(10, 14, 20)
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
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null
    private lateinit var filterInput: EditText
    private lateinit var statusPanel: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var retryButton: Button
    private lateinit var stationsContainer: LinearLayout

    private var allStations: List<RadioStation> = emptyList()
    private var activeStation: RadioStation? = null
    private var playStartedAtMs: Long = 0L
    private var activeElapsedText: TextView? = null
    private var isCatalogLoading = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = RadioCatalogRepository(BuildConfig.RADIO_API_BASE_URL)

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
                                startElapsedTimer()
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
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(52), dp(22), dp(28))
            setBackgroundColor(bgColor)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }

        content.addView(headerView())

        filterInput = EditText(this).apply {
            hint = "סנן תחנות"
            textSize = 18f
            setSingleLine(true)
            setTextColor(inkColor)
            setHintTextColor(mutedColor)
            setPadding(dp(18), dp(12), dp(18), dp(12))
            background = roundedRect(elevatedSurfaceColor, 14f, borderColor, 1)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = dp(14)
            }
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    renderStations()
                }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        content.addView(filterInput)

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
        content.addView(statusPanel)

        stationsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
        }
        content.addView(stationsContainer)

        setContentView(ScrollView(this).apply {
            setBackgroundColor(bgColor)
            addView(content)
        })
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
                background = roundedRect(elevatedSurfaceColor, 14f, borderColor, 1)
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

                addView(TextView(this@MainActivity).apply {
                    text = "רדיו חי"
                    textSize = 14f
                    setTextColor(mutedColor)
                    includeFontPadding = false
                    setPadding(0, dp(6), 0, 0)
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
        activeElapsedText = null

        val query = filterInput.text?.toString()?.trim()?.lowercase(Locale.getDefault()).orEmpty()
        val visibleStations = if (query.isBlank()) {
            allStations
        } else {
            allStations.filter { station ->
                station.name.lowercase(Locale.getDefault()).contains(query) ||
                    station.id.lowercase(Locale.US).contains(query)
            }
        }

        if (visibleStations.isEmpty()) {
            stationsContainer.addView(emptyState("אין תחנות שמתאימות לסינון"))
            return
        }

        visibleStations.forEach { station ->
            stationsContainer.addView(stationRow(station, isActive = activeStation?.id == station.id))
        }

        updateElapsedTime()
    }

    private fun stationRow(station: RadioStation, isActive: Boolean): LinearLayout {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), if (isActive) dp(18) else dp(16), dp(18), if (isActive) dp(18) else dp(16))
            background = if (isActive) {
                roundedRect(Color.rgb(35, 31, 20), 18f, accentColor, 2)
            } else {
                roundedRect(surfaceColor, 16f, borderColor, 1)
            }
            foreground = selectableItemBackground()
            isClickable = true
            isFocusable = true
            setOnClickListener { playStation(station) }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = dp(12)
            }
        }

        row.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL

            addView(ImageView(this@MainActivity).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = roundedRect(Color.rgb(12, 17, 24), 10f, borderColor, 1)
                setPadding(dp(2), dp(2), dp(2), dp(2))
                val logoSize = if (isActive) dp(68) else dp(54)
                layoutParams = LinearLayout.LayoutParams(logoSize, logoSize).apply {
                    marginEnd = dp(14)
                }
                loadStationLogo(station, this)
            })

            addView(TextView(this@MainActivity).apply {
                text = if (isActive) "ON\nAIR" else "▶"
                textSize = if (isActive) 10f else 17f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(if (isActive) liveColor else accentColor)
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(if (isActive) dp(38) else dp(28), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    marginEnd = dp(10)
                }
            })

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

                addView(TextView(this@MainActivity).apply {
                    text = station.name
                    textSize = if (isActive) 20f else 18f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(inkColor)
                    includeFontPadding = false
                })

                addView(TextView(this@MainActivity).apply {
                    text = station.id
                    textSize = 12f
                    setTextColor(mutedColor)
                    includeFontPadding = false
                    setPadding(0, dp(6), 0, 0)
                })
            })

            addView(liveBadge())
        })

        if (isActive) {
            row.addView(activeControls(station))
        }

        return row
    }

    private fun activeControls(station: RadioStation): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(16), 0, 0)

            activeElapsedText = TextView(this@MainActivity).apply {
                text = "LIVE • 00:00"
                textSize = 16f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                background = roundedRect(liveColor, 14f)
                setPadding(dp(16), dp(8), dp(16), dp(8))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                    gravity = Gravity.CENTER_HORIZONTAL
                    bottomMargin = dp(14)
                }
            }
            addView(activeElapsedText)

            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER

                addView(controlButton("עצור", "■") { stopPlayback() }, LinearLayout.LayoutParams(0, dp(52), 1f).apply {
                    marginEnd = dp(8)
                })

                addView(controlButton("רענן לייב", "↻") { playStation(station, refreshLive = true) }, LinearLayout.LayoutParams(0, dp(52), 1f).apply {
                    marginStart = dp(8)
                })
            })
        }
    }

    private fun controlButton(label: String, icon: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = "$icon  $label"
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(inkColor)
            gravity = Gravity.CENTER
            background = roundedRect(Color.rgb(18, 23, 31), 12f, borderColor, 1)
            isClickable = true
            isFocusable = true
            foreground = selectableItemBackground()
            setOnClickListener { onClick() }
        }
    }

    private fun playStation(station: RadioStation, refreshLive: Boolean = false) {
        hideStatus()
        activeStation = station
        playStartedAtMs = System.currentTimeMillis()
        renderStations()

        if (refreshLive) {
            showStatus("מרענן לייב: ${station.name}", showRetry = false)
        }

        val mediaController = controller
        if (mediaController == null) {
            showStatus("הנגן עדיין נטען. נסה שוב בעוד רגע.", showRetry = false)
            return
        }

        mediaController.stop()
        mediaController.setMediaItem(
            MediaItem.Builder()
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
                .build()
        )
        mediaController.prepare()
        mediaController.play()
        if (!refreshLive) {
            hideStatus()
        }
    }

    private fun stopPlayback() {
        controller?.stop()
        activeStation = null
        playStartedAtMs = 0L
        stopElapsedTimer(resetText = true)
        hideStatus()
        renderStations()
    }

    private fun liveBadge(): TextView {
        return TextView(this).apply {
            text = "LIVE"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = roundedRect(liveColor, 10f)
            setPadding(dp(9), dp(4), dp(9), dp(4))
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
            activeElapsedText?.text = "LIVE • 00:00"
        }
    }

    private fun updateElapsedTime() {
        val station = activeStation
        if (playStartedAtMs <= 0L || station == null) {
            activeElapsedText?.text = "LIVE • 00:00"
            return
        }

        val elapsedSeconds = ((System.currentTimeMillis() - playStartedAtMs) / 1_000).coerceAtLeast(0)
        val minutes = elapsedSeconds / 60
        val seconds = elapsedSeconds % 60
        activeElapsedText?.text = "LIVE • %02d:%02d".format(minutes, seconds)
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

    private fun selectableItemBackground(): Drawable? {
        val typedArray = obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground))
        return typedArray.getDrawable(0).also {
            typedArray.recycle()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()
}
