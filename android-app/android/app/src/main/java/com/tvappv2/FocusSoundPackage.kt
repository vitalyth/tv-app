package com.tvappv2

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class FocusSoundPackage : BaseReactPackage() {
  override fun getModule(
      name: String,
      reactContext: ReactApplicationContext,
  ): NativeModule? =
      if (name == FocusSoundModule.NAME) FocusSoundModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        FocusSoundModule.NAME to
            ReactModuleInfo(
                FocusSoundModule.NAME,
                FocusSoundModule::class.java.name,
                false,
                false,
                false,
                false,
            )
    )
  }
}
