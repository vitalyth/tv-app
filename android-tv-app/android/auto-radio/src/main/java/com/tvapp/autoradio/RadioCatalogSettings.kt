package com.tvapp.autoradio

import android.content.Context

enum class RadioCatalogSource {
    ApiProxy,
    StaticFile,
}

object RadioCatalogSettings {
    const val PREFS_NAME = "radio_catalog_settings"
    private const val KEY_SOURCE = "source"
    private const val KEY_REACTIVE_EQUALIZER = "reactive_equalizer"
    private const val KEY_LANGUAGE = "language"
    private const val SOURCE_API_PROXY = "api_proxy"
    private const val SOURCE_STATIC_FILE = "static_file"

    fun getSource(context: Context): RadioCatalogSource {
        val value = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SOURCE, SOURCE_STATIC_FILE)

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
            .commit()
    }

    fun isReactiveEqualizerEnabled(context: Context): Boolean {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_REACTIVE_EQUALIZER, true)
    }

    fun setReactiveEqualizerEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_REACTIVE_EQUALIZER, enabled)
            .commit()
    }

    fun getLanguageTag(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_LANGUAGE, AppLocaleManager.DEFAULT_LANGUAGE_TAG)
            ?: AppLocaleManager.DEFAULT_LANGUAGE_TAG
    }

    fun setLanguageTag(context: Context, languageTag: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LANGUAGE, languageTag)
            .commit()
    }
}
