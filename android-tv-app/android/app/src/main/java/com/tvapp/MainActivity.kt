package com.tvapp

import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.SoundEffectConstants
import android.view.View
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {
    private var lastRemoteSoundAtMs = 0L
    private val audioManager by lazy { getSystemService(AudioManager::class.java) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        volumeControlStream = AudioManager.STREAM_MUSIC
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        playRemoteSoundEffect(event)

        if (event.action == KeyEvent.ACTION_DOWN) {
            try {
                val reactContext = (application as? com.facebook.react.ReactApplication)?.reactHost?.currentReactContext
                if (reactContext != null && reactContext.hasActiveReactInstance()) {
                    val params = Arguments.createMap().apply {
                        putInt("keyCode", event.keyCode)
                        putInt("repeatCount", event.repeatCount)
                    }
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        ?.emit("onTvRemoteKey", params)
                }
            } catch (_: Throwable) {
                // Ignore if React context is not yet initialized
            }
        }

        return super.dispatchKeyEvent(event)
    }

    private fun playRemoteSoundEffect(event: KeyEvent) {
        if (event.action != KeyEvent.ACTION_DOWN) return
        val soundEffect = event.remoteSoundEffect() ?: return
        val nowMs = SystemClock.elapsedRealtime()
        if (nowMs - lastRemoteSoundAtMs < REMOTE_SOUND_MIN_INTERVAL_MS) return
        lastRemoteSoundAtMs = nowMs
        audioManager?.playSoundEffect(soundEffect, REMOTE_SOUND_VOLUME)
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
                @Suppress("DEPRECATION")
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

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "tvapp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    private companion object {
        private const val REMOTE_SOUND_MIN_INTERVAL_MS = 90L
        private const val REMOTE_SOUND_VOLUME = 1f
    }
}
