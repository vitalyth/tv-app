package com.tvapp.programguide

import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.SoundEffectConstants
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tvapp.programguide.ui.ProgramGuideApp
import com.tvapp.programguide.ui.TvKeyEventBridge

class MainActivity : ComponentActivity() {
    private var lastRemoteSoundAtMs = 0L
    private val audioManager by lazy { getSystemService(AudioManager::class.java) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        volumeControlStream = AudioManager.STREAM_MUSIC
        enableEdgeToEdge()
        setContent {
            ProgramGuideApp()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        playRemoteSoundEffect(event)
        if (TvKeyEventBridge.dispatch(event)) return true
        return super.dispatchKeyEvent(event)
    }

    private fun playRemoteSoundEffect(event: KeyEvent) {
        if (event.action != KeyEvent.ACTION_DOWN) return
        val soundEffect = event.remoteSoundEffect() ?: return
        val nowMs = SystemClock.elapsedRealtime()
        if (nowMs - lastRemoteSoundAtMs < REMOTE_SOUND_MIN_INTERVAL_MS) return
        lastRemoteSoundAtMs = nowMs
        audioManager.playSoundEffect(soundEffect, REMOTE_SOUND_VOLUME)
    }

    private fun KeyEvent.remoteSoundEffect(): Int? {
        val focusDirection = when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> View.FOCUS_UP
            KeyEvent.KEYCODE_DPAD_DOWN -> View.FOCUS_DOWN
            KeyEvent.KEYCODE_DPAD_LEFT -> View.FOCUS_LEFT
            KeyEvent.KEYCODE_DPAD_RIGHT -> View.FOCUS_RIGHT
            else -> null
        }
        if (focusDirection != null) {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                SoundEffectConstants.getConstantForFocusDirection(
                    focusDirection,
                    repeatCount > 0,
                )
            } else {
                SoundEffectConstants.getContantForFocusDirection(focusDirection)
            }
        }

        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER,
            KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_CHANNEL_UP,
            KeyEvent.KEYCODE_CHANNEL_DOWN,
            in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9,
            in KeyEvent.KEYCODE_NUMPAD_0..KeyEvent.KEYCODE_NUMPAD_9 -> SoundEffectConstants.CLICK
            else -> null
        }
    }

    private companion object {
        private const val REMOTE_SOUND_MIN_INTERVAL_MS = 90L
        private const val REMOTE_SOUND_VOLUME = 1f
    }
}
