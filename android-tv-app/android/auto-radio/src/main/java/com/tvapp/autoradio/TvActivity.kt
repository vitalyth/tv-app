package com.tvapp.autoradio

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.setPadding
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class TvActivity : AppCompatActivity() {
    private lateinit var repository: RadioCatalogRepository
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null
    private val ioExecutor = Executors.newCachedThreadPool()
    private val logoCache = ConcurrentHashMap<String, Bitmap>()

    private lateinit var root: FrameLayout
    private lateinit var content: LinearLayout
    private lateinit var grid: GridLayout
    private lateinit var title: TextView
    private lateinit var subtitle: TextView
    private lateinit var playerPanel: LinearLayout
    private lateinit var playerLogo: ImageView
    private lateinit var playerTitle: TextView
    private lateinit var playerMeta: TextView
    private lateinit var playPauseButton: TextView

    private var stations: List<RadioStation> = emptyList()
    private var activeStation: RadioStation? = null
    private var isPlaying = false

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLocaleManager.localizedContext(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = RadioCatalogRepository(this, BuildConfig.RADIO_API_BASE_URL)
        buildLayout()
        connectController()
        loadStations()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::controllerFuture.isInitialized) {
            MediaController.releaseFuture(controllerFuture)
        }
        ioExecutor.shutdownNow()
    }

    private fun connectController() {
        val token = SessionToken(this, ComponentName(this, RadioMediaLibraryService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()
        controllerFuture.addListener(
            {
                controller = controllerFuture.get().apply {
                    addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            this@TvActivity.isPlaying = isPlaying
                            renderPlayerState()
                            renderStationSelection()
                        }

                        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                            activeStation = stations.firstOrNull { it.id == mediaItem?.mediaId }
                            renderPlayerState()
                            renderStationSelection()
                        }

                        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
                            renderPlayerState()
                        }
                    })

                    this@TvActivity.isPlaying = isPlaying
                    activeStation = stations.firstOrNull { it.id == currentMediaItem?.mediaId }
                    renderPlayerState()
                    renderStationSelection()
                }
            },
            MoreExecutors.directExecutor(),
        )
    }

    private fun loadStations() {
        showLoading()
        ioExecutor.execute {
            val loaded = repository.getStations()
            runOnUiThread {
                stations = loaded
                activeStation = controller?.currentMediaItem?.mediaId
                    ?.let { mediaId -> stations.firstOrNull { it.id == mediaId } }
                renderStations()
                renderPlayerState()
            }
        }
    }

    private fun buildLayout() {
        root = FrameLayout(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.rgb(39, 38, 45), Color.rgb(16, 17, 24)),
            )
        }

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(56), dp(40), dp(56), dp(40))
        }
        root.addView(content, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        content.addView(header, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(82),
        ))

        val appIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_radio)
            background = rounded(Color.rgb(32, 35, 45), dp(18), strokeColor = Color.rgb(58, 61, 73))
            setPadding(dp(12))
        }
        header.addView(appIcon, LinearLayout.LayoutParams(dp(64), dp(64)))

        title = TextView(this).apply {
            text = getString(R.string.app_name)
            setTextColor(Color.WHITE)
            textSize = 34f
            typeface = Typeface.DEFAULT_BOLD
            includeFontPadding = false
        }
        header.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dp(20)
        })

        subtitle = TextView(this).apply {
            text = getString(R.string.loading_stations)
            setTextColor(Color.rgb(177, 177, 187))
            textSize = 18f
            gravity = Gravity.END
        }
        header.addView(subtitle, LinearLayout.LayoutParams(dp(360), ViewGroup.LayoutParams.WRAP_CONTENT))

        val body = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        content.addView(body, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f,
        ).apply {
            topMargin = dp(24)
        })

        val scroll = ScrollView(this).apply {
            isFillViewport = false
            clipToPadding = false
            overScrollMode = View.OVER_SCROLL_NEVER
            setPadding(0, 0, 0, dp(30))
        }
        body.addView(scroll, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))

        grid = GridLayout(this).apply {
            columnCount = 4
            useDefaultMargins = false
            clipToPadding = false
        }
        scroll.addView(grid, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ))

        playerPanel = playerPanelView()
        body.addView(playerPanel, LinearLayout.LayoutParams(dp(360), ViewGroup.LayoutParams.MATCH_PARENT).apply {
            marginStart = dp(34)
        })

        setContentView(root)
    }

    private fun showLoading() {
        grid.removeAllViews()
        grid.addView(ProgressBar(this), GridLayout.LayoutParams().apply {
            width = dp(96)
            height = dp(96)
            setMargins(dp(28), dp(28), dp(28), dp(28))
        })
    }

    private fun renderStations() {
        subtitle.text = getString(R.string.home_subtitle)
        grid.removeAllViews()

        if (stations.isEmpty()) {
            grid.addView(TextView(this).apply {
                text = getString(R.string.no_stations_retry)
                setTextColor(Color.WHITE)
                textSize = 24f
            })
            return
        }

        stations.forEach { station ->
            grid.addView(stationCard(station), GridLayout.LayoutParams().apply {
                width = dp(214)
                height = dp(244)
                setMargins(dp(12), dp(12), dp(12), dp(26))
            })
        }
        if (activeStation == null && grid.childCount > 0) {
            grid.getChildAt(0).requestFocus()
        }
    }

    private fun renderStationSelection() {
        if (!::grid.isInitialized) return
        for (index in 0 until grid.childCount) {
            val view = grid.getChildAt(index)
            val station = view.tag as? RadioStation ?: continue
            view.background = stationCardBackground(
                isActive = activeStation?.id == station.id,
                isFocused = view.isFocused,
            )
        }
    }

    private fun stationCard(station: RadioStation): LinearLayout {
        return LinearLayout(this).apply {
            tag = station
            orientation = LinearLayout.VERTICAL
            isFocusable = true
            isClickable = true
            setPadding(dp(12))
            background = stationCardBackground(activeStation?.id == station.id, false)
            elevation = dp(10).toFloat()
            stateListAnimator = null
            setOnFocusChangeListener { view, hasFocus ->
                view.animate()
                    .scaleX(if (hasFocus) 1.06f else 1f)
                    .scaleY(if (hasFocus) 1.06f else 1f)
                    .setDuration(120)
                    .start()
                view.background = stationCardBackground(activeStation?.id == station.id, hasFocus)
            }
            setOnClickListener { playStation(station) }

            val logo = ImageView(context).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = rounded(Color.WHITE, dp(22))
                clipToOutline = true
                loadStationLogo(station, this)
            }
            addView(logo, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(150),
            ))

            addView(TextView(context).apply {
                text = station.name
                setTextColor(Color.WHITE)
                textSize = 19f
                typeface = Typeface.DEFAULT_BOLD
                maxLines = 2
                ellipsize = TextUtils.TruncateAt.END
                includeFontPadding = false
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = dp(14)
            })

            addView(TextView(context).apply {
                text = getString(R.string.radio_label)
                setTextColor(Color.rgb(166, 166, 176))
                textSize = 15f
                maxLines = 1
                includeFontPadding = false
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = dp(8)
            })
        }
    }

    private fun playerPanelView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28))
            background = rounded(Color.rgb(25, 25, 34), dp(26), strokeColor = Color.rgb(55, 56, 68))

            playerLogo = ImageView(context).apply {
                setImageResource(R.drawable.ic_radio)
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = rounded(Color.WHITE, dp(26))
                clipToOutline = true
                elevation = dp(12).toFloat()
            }
            addView(playerLogo, LinearLayout.LayoutParams(dp(230), dp(230)).apply {
                topMargin = dp(16)
            })

            playerTitle = TextView(context).apply {
                text = getString(R.string.app_name)
                setTextColor(Color.WHITE)
                textSize = 26f
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                maxLines = 2
                ellipsize = TextUtils.TruncateAt.END
            }
            addView(playerTitle, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = dp(28)
            })

            playerMeta = TextView(context).apply {
                text = getString(R.string.no_info)
                setTextColor(Color.rgb(174, 174, 184))
                textSize = 18f
                gravity = Gravity.CENTER
                maxLines = 3
                ellipsize = TextUtils.TruncateAt.END
            }
            addView(playerMeta, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                topMargin = dp(12)
            })

            val spacer = View(context)
            addView(spacer, LinearLayout.LayoutParams(1, 0, 1f))

            val controls = LinearLayout(context).apply {
                gravity = Gravity.CENTER
                orientation = LinearLayout.HORIZONTAL
            }
            addView(controls, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(110),
            ))

            controls.addView(controlButton("⏮") { skipStation(-1) }, LinearLayout.LayoutParams(dp(76), dp(76)))
            playPauseButton = controlButton("▶") {
                activeStation?.let { station ->
                    if (isPlaying) {
                        controller?.pause()
                    } else {
                        playStation(station)
                    }
                }
            }
            controls.addView(playPauseButton, LinearLayout.LayoutParams(dp(96), dp(96)).apply {
                marginStart = dp(28)
                marginEnd = dp(28)
            })
            controls.addView(controlButton("⏭") { skipStation(1) }, LinearLayout.LayoutParams(dp(76), dp(76)))
        }
    }

    private fun controlButton(label: String, action: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            textSize = 32f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            isFocusable = true
            isClickable = true
            background = controlBackground(false)
            setOnFocusChangeListener { view, hasFocus ->
                view.background = controlBackground(hasFocus)
                view.animate().scaleX(if (hasFocus) 1.08f else 1f).scaleY(if (hasFocus) 1.08f else 1f).setDuration(120).start()
            }
            setOnClickListener { action() }
        }
    }

    private fun playStation(station: RadioStation) {
        activeStation = station
        isPlaying = true
        renderPlayerState()
        renderStationSelection()
        val item = MediaItem.Builder()
            .setMediaId(station.id)
            .setUri(repository.streamUriFor(station.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(station.name)
                    .setArtist(getString(R.string.app_name))
                    .setArtworkUri(station.logo?.takeIf { it.isNotBlank() }?.let { repository.artworkUriFor(it) })
                    .build(),
            )
            .also { builder ->
                repository.streamMimeTypeFor(station.id)?.let { builder.setMimeType(it) }
            }
            .build()

        controller?.apply {
            setMediaItem(item)
            prepare()
            play()
        }
    }

    private fun skipStation(direction: Int) {
        if (stations.isEmpty()) return
        val currentIndex = stations.indexOfFirst { it.id == activeStation?.id }.takeIf { it >= 0 } ?: 0
        val nextIndex = (currentIndex + direction + stations.size) % stations.size
        playStation(stations[nextIndex])
    }

    private fun renderPlayerState() {
        if (!::playerPanel.isInitialized) return
        val station = activeStation
        playerTitle.text = station?.name ?: getString(R.string.app_name)
        playPauseButton.text = if (isPlaying) "⏸" else "▶"
        playerMeta.text = controller?.mediaMetadata?.let { metadata ->
            listOfNotNull(
                metadata.title?.toString()?.takeIf { it.isNotBlank() && it != station?.name },
                metadata.artist?.toString()?.takeIf { it.isNotBlank() && it != getString(R.string.app_name) },
            ).joinToString(" - ").takeIf { it.isNotBlank() }
        } ?: getString(R.string.no_info)

        if (station == null) {
            playerLogo.setImageResource(R.drawable.ic_radio)
        } else {
            loadStationLogo(station, playerLogo)
        }
    }

    private fun loadStationLogo(station: RadioStation, imageView: ImageView) {
        val logo = station.logo?.takeIf { it.isNotBlank() }
        if (logo == null) {
            imageView.setImageResource(R.drawable.ic_radio)
            return
        }

        val logoUrl = repository.artworkUriFor(logo).toString()
        logoCache[logoUrl]?.let {
            imageView.setImageBitmap(it)
            return
        }

        imageView.setImageResource(R.drawable.ic_radio)
        ioExecutor.execute {
            val bitmap = runCatching {
                val connection = URL(logoUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 8_000
                connection.readTimeout = 8_000
                try {
                    connection.inputStream.use(BitmapFactory::decodeStream)
                } finally {
                    connection.disconnect()
                }
            }.getOrNull() ?: return@execute

            logoCache[logoUrl] = bitmap
            runOnUiThread {
                if (!isFinishing && !isDestroyed) {
                    imageView.setImageBitmap(bitmap)
                }
            }
        }
    }

    private fun stationCardBackground(isActive: Boolean, isFocused: Boolean): GradientDrawable {
        val strokeColor = when {
            isActive -> Color.rgb(255, 164, 28)
            isFocused -> Color.WHITE
            else -> Color.TRANSPARENT
        }
        return rounded(Color.rgb(28, 29, 38), dp(28), dp(if (isActive || isFocused) 4 else 0), strokeColor)
    }

    private fun controlBackground(isFocused: Boolean): GradientDrawable {
        return rounded(
            if (isFocused) Color.rgb(255, 164, 28) else Color.rgb(63, 64, 74),
            dp(48),
            dp(2),
            if (isFocused) Color.rgb(255, 199, 92) else Color.rgb(84, 85, 96),
        )
    }

    private fun rounded(
        color: Int,
        radius: Int,
        strokeWidth: Int = 0,
        strokeColor: Int = Color.TRANSPARENT,
    ): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(color)
            cornerRadius = radius.toFloat()
            if (strokeWidth > 0) {
                setStroke(strokeWidth, strokeColor)
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            activeStation?.let {
                if (isPlaying) controller?.pause() else playStation(it)
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }
}
