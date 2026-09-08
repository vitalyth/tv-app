package com.tvapp.programguide.ui.vod

import android.view.KeyEvent as AndroidKeyEvent
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import com.tvapp.programguide.data.VodEpisode
import com.tvapp.programguide.data.VodSeries
import com.tvapp.programguide.ui.StablePlayer
import com.tvapp.programguide.ui.StablePlayerView
import com.tvapp.programguide.ui.TvKeyEventBridge
import com.tvapp.programguide.ui.components.UnifiedPlayerControlsOverlay
import kotlinx.coroutines.delay

private val PlayerAccentColor = Color(0xFFF2F4F7)
private val PlayerTextDark = Color(0xFF0A0E14)

@OptIn(UnstableApi::class)
@Composable
fun VodPlayerOverlay(
    streamUrl: String?,
    episode: VodEpisode?,
    series: VodSeries?,
    providerLogoUrl: String? = null,
    isResolvingStream: Boolean,
    error: String?,
    onClose: () -> Unit,
    player: StablePlayer,
    playerView: StablePlayerView,
    modifier: Modifier = Modifier,
) {
    val actualPlayer = player.value
    val actualPlayerView = playerView.value
    val focusRequester = remember { FocusRequester() }

    var isControlsVisible by remember { mutableStateOf(true) }
    var lastInteractionNonce by remember { mutableLongStateOf(0L) }
    var playbackError by remember { mutableStateOf<String?>(null) }

    // When stream changes, reset errors and show controls
    LaunchedEffect(streamUrl) {
        if (!streamUrl.isNullOrBlank()) {
            playbackError = null
            isControlsVisible = true
            lastInteractionNonce++
        }
    }

    // Attach listener to shared player
    DisposableEffect(actualPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(playbackException: PlaybackException) {
                playbackError = "שגיאה בטעינת הפרק"
            }
        }
        actualPlayer.addListener(listener)
        onDispose {
            actualPlayer.removeListener(listener)
        }
    }

    // Detach player view when overlay leaves composition
    DisposableEffect(actualPlayerView) {
        onDispose {
            (actualPlayerView.parent as? ViewGroup)?.removeView(actualPlayerView)
        }
    }

    // Auto-hide controls after 4 seconds of inactivity
    LaunchedEffect(lastInteractionNonce, isControlsVisible) {
        if (isControlsVisible) {
            delay(4000)
            isControlsVisible = false
        }
    }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    fun handleKey(keyCode: Int): Boolean {
        lastInteractionNonce++
        isControlsVisible = true

        return when (keyCode) {
            AndroidKeyEvent.KEYCODE_BACK -> {
                onClose()
                true
            }
            AndroidKeyEvent.KEYCODE_DPAD_CENTER,
            AndroidKeyEvent.KEYCODE_ENTER -> {
                if (!isControlsVisible) {
                    isControlsVisible = true
                } else {
                    if (actualPlayer.isPlaying) {
                        actualPlayer.pause()
                    } else {
                        actualPlayer.play()
                    }
                }
                true
            }
            AndroidKeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                if (actualPlayer.isPlaying) actualPlayer.pause() else actualPlayer.play()
                true
            }
            AndroidKeyEvent.KEYCODE_MEDIA_PLAY -> {
                actualPlayer.play()
                true
            }
            AndroidKeyEvent.KEYCODE_MEDIA_PAUSE -> {
                actualPlayer.pause()
                true
            }
            AndroidKeyEvent.KEYCODE_DPAD_RIGHT,
            AndroidKeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                val dur = actualPlayer.duration.coerceAtLeast(0L)
                val newPos = (actualPlayer.currentPosition + 10_000L).coerceAtMost(if (dur > 0) dur else Long.MAX_VALUE)
                actualPlayer.seekTo(newPos)
                true
            }
            AndroidKeyEvent.KEYCODE_DPAD_LEFT,
            AndroidKeyEvent.KEYCODE_MEDIA_REWIND -> {
                val newPos = (actualPlayer.currentPosition - 10_000L).coerceAtLeast(0L)
                actualPlayer.seekTo(newPos)
                true
            }
            AndroidKeyEvent.KEYCODE_DPAD_UP,
            AndroidKeyEvent.KEYCODE_DPAD_DOWN -> {
                true
            }
            else -> false
        }
    }

    DisposableEffect(Unit) {
        TvKeyEventBridge.setHandler { event ->
            if (event.action == AndroidKeyEvent.ACTION_DOWN) {
                handleKey(event.keyCode)
            } else {
                false
            }
        }
        onDispose {
            TvKeyEventBridge.setHandler(null)
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focusRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.key) {
                        Key.Back -> {
                            onClose()
                            true
                        }
                        Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> {
                            handleKey(AndroidKeyEvent.KEYCODE_DPAD_CENTER)
                            true
                        }
                        Key.DirectionRight -> {
                            handleKey(AndroidKeyEvent.KEYCODE_DPAD_RIGHT)
                            true
                        }
                        Key.DirectionLeft -> {
                            handleKey(AndroidKeyEvent.KEYCODE_DPAD_LEFT)
                            true
                        }
                        else -> false
                    }
                } else {
                    false
                }
            }
    ) {
        // Video Surface
        AndroidView(
            factory = {
                (actualPlayerView.parent as? ViewGroup)?.removeView(actualPlayerView)
                actualPlayerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                actualPlayerView.useController = false
                actualPlayerView.layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                actualPlayerView
            },
            update = {
                if (it.player !== actualPlayer) {
                    it.player = actualPlayer
                }
                it.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                it.useController = false
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Loading or Resolving indicator
        if (isResolvingStream || streamUrl == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFFE2E8F0), modifier = Modifier.size(56.dp))
            }
        }

        // Error message or playback failure dialog (borderless, clean dark card)
        val activeError = error ?: playbackError
        if (activeError != null) {
            val errorInteractionSource = remember { MutableInteractionSource() }
            val isErrorFocused by errorInteractionSource.collectIsFocusedAsState()

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xEE05080E)),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier
                        .background(Color(0xFF141922), RoundedCornerShape(12.dp))
                        .padding(horizontal = 36.dp, vertical = 28.dp),
                ) {
                    Text(
                        text = "לא ניתן לנגן פרק זה",
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "שגיאת מקור בשרת הערוץ (ייתכן שהקישור אינו זמין עוד).\nאנא בחר פרק אחר לצפייה.",
                        color = Color(0xFF8E95A2),
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isErrorFocused) PlayerAccentColor else Color(0xFF171920))
                            .tvFocusableClickable(
                                onClick = onClose,
                                interactionSource = errorInteractionSource,
                            )
                            .padding(horizontal = 24.dp, vertical = 10.dp),
                    ) {
                        Text(
                            text = "חזרה לרשימת הפרקים",
                            color = if (isErrorFocused) PlayerTextDark else Color(0xFFE2E8F0),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }

        // Unified Controls Overlay (Exact same component as Live TV Player)
        AnimatedVisibility(
            visible = isControlsVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize(),
        ) {
            val provider = series?.provider
            val headerText = when {
                provider == null -> null
                provider.displayName.contains(provider.channelNumber) -> provider.displayName
                else -> "${provider.channelNumber}  ${provider.displayName}"
            }

            UnifiedPlayerControlsOverlay(
                player = player,
                title = episode?.title.orEmpty(),
                subtitle = listOfNotNull(series?.title, series?.provider?.displayName).joinToString("  |  "),
                badgeText = "VOD",
                isLive = false,
                logoUrl = providerLogoUrl,
                providerDisplayName = series?.provider?.displayName,
                previewImageUrl = episode?.imageUrl ?: series?.imageUrl,
                headerChannelText = headerText,
                showMetadataPanel = true,
                onInteraction = {
                    lastInteractionNonce++
                    isControlsVisible = true
                },
            )
        }
    }
}
