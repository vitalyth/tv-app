package com.tvapp.autoradio

import android.content.Context
import android.content.res.Configuration
import org.xmlpull.v1.XmlPullParser
import java.util.Locale

data class SupportedAppLanguage(
    val tag: String,
    val displayName: String,
)

object AppLocaleManager {
    const val DEFAULT_LANGUAGE_TAG = "en"

    fun selectedLanguageTag(context: Context): String {
        return RadioCatalogSettings.getLanguageTag(context)
    }

    fun setLanguage(context: Context, languageTag: String) {
        RadioCatalogSettings.setLanguageTag(context, languageTag)
    }

    fun supportedLanguages(context: Context): List<SupportedAppLanguage> {
        val parser = context.resources.getXml(R.xml.locales_config)
        return try {
            buildList {
                while (parser.next() != XmlPullParser.END_DOCUMENT) {
                    if (parser.eventType == XmlPullParser.START_TAG && parser.name == "locale") {
                        val tag = parser.getAttributeValue("http://schemas.android.com/apk/res/android", "name")
                        if (!tag.isNullOrBlank()) {
                            add(SupportedAppLanguage(tag, displayNameFor(tag)))
                        }
                    }
                }
            }.ifEmpty {
                listOf(SupportedAppLanguage(DEFAULT_LANGUAGE_TAG, displayNameFor(DEFAULT_LANGUAGE_TAG)))
            }
        } finally {
            parser.close()
        }
    }

    fun localizedContext(context: Context): Context {
        val locale = Locale.forLanguageTag(selectedLanguageTag(context))
        val config = Configuration(context.resources.configuration).apply {
            setLocale(locale)
            setLayoutDirection(locale)
        }
        return context.createConfigurationContext(config)
    }

    private fun displayNameFor(languageTag: String): String {
        val locale = Locale.forLanguageTag(languageTag)
        return locale.getDisplayName(locale).replaceFirstChar { first ->
            if (first.isLowerCase()) first.titlecase(locale) else first.toString()
        }
    }
}
