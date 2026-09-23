package com.tvappv2

import android.view.SoundEffectConstants
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = FocusSoundModule.NAME)
class FocusSoundModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun play() {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      activity.window.decorView.playSoundEffect(SoundEffectConstants.CLICK)
    }
  }

  companion object {
    const val NAME = "FocusSound"
  }
}
