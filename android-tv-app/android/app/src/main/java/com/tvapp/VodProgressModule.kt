package com.tvapp

import android.content.Context
import com.facebook.react.bridge.*
import org.json.JSONObject

class VodProgressModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "VodProgressModule"

    private val prefs by lazy {
        reactContext.getSharedPreferences("vod_playback_progress", Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun saveProgress(
        episodeId: String,
        seriesId: String?,
        positionMs: Double,
        durationMs: Double,
        itemJson: String?,
        promise: Promise
    ) {
        try {
            if (episodeId.isBlank()) {
                promise.resolve(false)
                return
            }
            val pos = positionMs.toLong()
            val dur = durationMs.toLong()
            val ratio = if (dur > 0L) pos.toFloat() / dur.toFloat() else 0f
            val isCompleted = (dur > 0L && ratio >= 0.92f) || (dur > 0L && (dur - pos) <= 25_000L)

            val progressJson = JSONObject().apply {
                put("episodeId", episodeId)
                put("seriesId", seriesId ?: "")
                put("positionMs", if (isCompleted && dur > 0L) dur else pos.coerceAtLeast(0L))
                put("durationMs", dur)
                put("lastWatchedAt", System.currentTimeMillis())
                put("isCompleted", isCompleted)
            }

            val editor = prefs.edit()
            editor.putString("ep_$episodeId", progressJson.toString())
            if (!seriesId.isNullOrBlank()) {
                editor.putString("series_last_$seriesId", episodeId)
            }
            if (!itemJson.isNullOrBlank()) {
                editor.putString("recent_item_$episodeId", itemJson)
            }
            editor.apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getProgress(episodeId: String, promise: Promise) {
        try {
            val jsonStr = prefs.getString("ep_$episodeId", null)
            if (jsonStr != null) {
                val json = JSONObject(jsonStr)
                val map = Arguments.createMap().apply {
                    putString("episodeId", json.optString("episodeId"))
                    putString("seriesId", json.optString("seriesId"))
                    putDouble("positionMs", json.optLong("positionMs", 0L).toDouble())
                    putDouble("durationMs", json.optLong("durationMs", 0L).toDouble())
                    putDouble("lastWatchedAt", json.optLong("lastWatchedAt", 0L).toDouble())
                    putBoolean("isCompleted", json.optBoolean("isCompleted", false))
                }
                promise.resolve(map)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("GET_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getContinueWatching(promise: Promise) {
        try {
            val result = Arguments.createArray()
            val all = prefs.all

            val items = mutableListOf<WritableMap>()

            for ((key, value) in all) {
                if (key.startsWith("ep_") && value is String) {
                    try {
                        val pJson = JSONObject(value)
                        val epId = pJson.optString("episodeId")
                        val pos = pJson.optLong("positionMs", 0L)
                        val dur = pJson.optLong("durationMs", 0L)
                        val isCompleted = pJson.optBoolean("isCompleted", false)
                        val lastWatched = pJson.optLong("lastWatchedAt", 0L)
                        val ratio = if (dur > 0L) pos.toFloat() / dur.toFloat() else 0f

                        val isInProgress = !isCompleted && pos > 1000L && (dur <= 0L || ratio < 0.92f)
                        if (isInProgress) {
                            val itemJsonStr = prefs.getString("recent_item_$epId", null)
                            val map = Arguments.createMap().apply {
                                putString("episodeId", epId)
                                putDouble("positionMs", pos.toDouble())
                                putDouble("durationMs", dur.toDouble())
                                putDouble("progressPercentage", ratio.toDouble())
                                putDouble("lastWatchedAt", lastWatched.toDouble())

                                if (itemJsonStr != null) {
                                    val iJson = JSONObject(itemJsonStr)
                                    putString("title", iJson.optString("title", iJson.optString("name", "")))
                                    putString("seriesTitle", iJson.optString("seriesTitle", iJson.optString("programName", "")))
                                    putString("seriesId", iJson.optString("seriesId", iJson.optString("programId", "")))
                                    putString("imageUrl", iJson.optString("imageUrl", iJson.optString("episodeImage", iJson.optString("logo", ""))))
                                    putString("channelLogo", iJson.optString("channelLogo", ""))
                                    putString("channelName", iJson.optString("channelName", ""))
                                    putString("description", iJson.optString("description", iJson.optString("desc", "")))
                                    putString("playUrl", iJson.optString("playUrl", iJson.optString("streamUrl", "")))
                                    putString("rawJson", itemJsonStr)
                                }
                            }
                            items.add(map)
                        }
                    } catch (_: Exception) {}
                }
            }

            items.sortByDescending { it.getDouble("lastWatchedAt") }

            for (item in items) {
                result.pushMap(item)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_CONTINUE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun saveRecentChannel(channelId: String, promise: Promise) {
        try {
            if (channelId.isBlank()) {
                promise.resolve(false)
                return
            }
            val listStr = prefs.getString("recent_channel_ids", "[]")
            val list = org.json.JSONArray(listStr)
            val newList = org.json.JSONArray()
            newList.put(channelId)
            for (i in 0 until list.length()) {
                val id = list.getString(i)
                if (id != channelId && newList.length() < 20) {
                    newList.put(id)
                }
            }
            prefs.edit().putString("recent_channel_ids", newList.toString()).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_RECENT_CH_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getRecentChannels(promise: Promise) {
        try {
            val listStr = prefs.getString("recent_channel_ids", "[]")
            val list = org.json.JSONArray(listStr)
            val array = Arguments.createArray()
            for (i in 0 until list.length()) {
                array.pushString(list.getString(i))
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("GET_RECENT_CH_ERROR", e.message)
        }
    }

    @ReactMethod
    fun saveMutePreference(isMuted: Boolean, promise: Promise) {
        try {
            prefs.edit().putBoolean("is_muted_pref", isMuted).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_MUTE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getMutePreference(promise: Promise) {
        try {
            val isMuted = prefs.getBoolean("is_muted_pref", false)
            promise.resolve(isMuted)
        } catch (e: Exception) {
            promise.reject("GET_MUTE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestViewFocus(tag: Double, promise: Promise) {
        reactContext.runOnUiQueueThread {
            try {
                val tagInt = tag.toInt()
                var view: android.view.View? = null
                try {
                    val uiManager = com.facebook.react.uimanager.UIManagerHelper.getUIManagerForReactTag(reactContext, tagInt)
                    view = uiManager?.resolveView(tagInt)
                } catch (_: Exception) {}

                if (view == null) {
                    val activity = reactContext.currentActivity
                    view = activity?.findViewById<android.view.View>(tagInt)
                }

                if (view != null) {
                    view.isFocusable = true
                    view.isFocusableInTouchMode = true
                    val success = view.requestFocus()
                    android.util.Log.d("VodProgress", "requestViewFocus tag=$tagInt, success=$success")
                    promise.resolve(success)
                } else {
                    android.util.Log.w("VodProgress", "requestViewFocus: view not found for tag=$tagInt")
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                promise.reject("FOCUS_ERR", e.message)
            }
        }
    }

    @ReactMethod
    fun setFocusBoundaries(
        tag: Double,
        lockUp: Boolean,
        lockDown: Boolean,
        lockLeft: Boolean,
        lockRight: Boolean,
        promise: Promise
    ) {
        reactContext.runOnUiQueueThread {
            try {
                val tagInt = tag.toInt()
                var view: android.view.View? = null
                try {
                    val uiManager = com.facebook.react.uimanager.UIManagerHelper.getUIManagerForReactTag(reactContext, tagInt)
                    view = uiManager?.resolveView(tagInt)
                } catch (_: Exception) {}

                if (view == null) {
                    val activity = reactContext.currentActivity
                    view = activity?.findViewById<android.view.View>(tagInt)
                }

                if (view != null) {
                    if (view.id == android.view.View.NO_ID) {
                        view.id = tagInt
                    }
                    view.nextFocusUpId = if (lockUp) view.id else android.view.View.NO_ID
                    view.nextFocusDownId = if (lockDown) view.id else android.view.View.NO_ID
                    view.nextFocusLeftId = if (lockLeft) view.id else android.view.View.NO_ID
                    view.nextFocusRightId = if (lockRight) view.id else android.view.View.NO_ID
                    promise.resolve(true)
                } else {
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                promise.reject("BOUNDARIES_ERR", e.message)
            }
        }
    }
}

