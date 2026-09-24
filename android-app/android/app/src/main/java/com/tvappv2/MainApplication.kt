@file:Suppress("DEPRECATION")

package com.tvappv2

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.config.ReactFeatureFlags
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(FocusSoundPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    ReactFeatureFlags.enableKeyDownEvents = true
    loadReactNative(this)
  }
}
