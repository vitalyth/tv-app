package com.tvapp.autoradio

import android.content.Context

enum class RadioCatalogSource {
    ApiProxy,
    StaticFile,
}

object RadioCatalogSettings {
    const val PREFS_NAME = "radio_catalog_settings"
    private const val KEY_SOURCE = "source"
    private const val SOURCE_API_PROXY = "api_proxy"
    private const val SOURCE_STATIC_FILE = "static_file"

    fun getSource(context: Context): RadioCatalogSource {
        val value = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SOURCE, SOURCE_API_PROXY)

        return when (value) {
            SOURCE_STATIC_FILE -> RadioCatalogSource.StaticFile
            else -> RadioCatalogSource.ApiProxy
        }
    }

    fun setSource(context: Context, source: RadioCatalogSource) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(
                KEY_SOURCE,
                when (source) {
                    RadioCatalogSource.ApiProxy -> SOURCE_API_PROXY
                    RadioCatalogSource.StaticFile -> SOURCE_STATIC_FILE
                }
            )
            .apply()
    }
}
