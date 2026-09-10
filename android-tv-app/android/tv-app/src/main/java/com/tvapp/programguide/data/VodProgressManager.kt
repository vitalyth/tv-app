package com.tvapp.programguide.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

class VodProgressManager private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _progressFlow = MutableStateFlow<Map<String, VodPlaybackProgress>>(emptyMap())
    val progressFlow: StateFlow<Map<String, VodPlaybackProgress>> = _progressFlow.asStateFlow()

    private val _recentItemsFlow = MutableStateFlow<List<VodRecentItem>>(emptyList())
    val recentItemsFlow: StateFlow<List<VodRecentItem>> = _recentItemsFlow.asStateFlow()

    init {
        loadAllProgress()
        loadAllRecentItems()
    }

    private fun loadAllProgress() {
        val loaded = mutableMapOf<String, VodPlaybackProgress>()
        val allEntries = prefs.all
        for ((key, value) in allEntries) {
            if (key.startsWith(PREFIX_EPISODE) && value is String) {
                deserialize(value)?.let { progress ->
                    loaded[progress.episodeId] = progress
                }
            }
        }
        _progressFlow.value = loaded
    }

    private fun loadAllRecentItems() {
        _recentItemsFlow.value = prefs.all
            .mapNotNull { (key, value) ->
                if (key.startsWith(PREFIX_RECENT_ITEM) && value is String) {
                    deserializeRecentItem(value)
                } else {
                    null
                }
            }
            .sortedByDescending { item -> _progressFlow.value[item.episodeId]?.lastWatchedAt ?: 0L }
            .take(MAX_RECENT_ITEMS)
    }

    @Synchronized
    fun getProgress(episodeId: String): VodPlaybackProgress? {
        return _progressFlow.value[episodeId]
    }

    @Synchronized
    fun saveProgress(
        episodeId: String,
        seriesId: String?,
        positionMs: Long,
        durationMs: Long,
        forceCompleted: Boolean? = null,
    ) {
        if (episodeId.isBlank()) return

        val existing = _progressFlow.value[episodeId]
        val effectiveDuration = if (durationMs > 0L) durationMs else (existing?.durationMs ?: 0L)
        val progressRatio = if (effectiveDuration > 0L) (positionMs.toFloat() / effectiveDuration.toFloat()) else 0f

        val completed = forceCompleted ?: (
            (effectiveDuration > 0L && progressRatio >= 0.92f) ||
            (effectiveDuration > 0L && (effectiveDuration - positionMs) <= 25_000L)
        )

        val updatedProgress = VodPlaybackProgress(
            episodeId = episodeId,
            seriesId = seriesId ?: existing?.seriesId,
            positionMs = if (completed && effectiveDuration > 0L) effectiveDuration else positionMs.coerceAtLeast(0L),
            durationMs = effectiveDuration,
            lastWatchedAt = System.currentTimeMillis(),
            isCompleted = completed,
        )

        val updatedMap = _progressFlow.value.toMutableMap()
        updatedMap[episodeId] = updatedProgress
        _progressFlow.value = updatedMap

        val editor = prefs.edit()
        editor.putString(PREFIX_EPISODE + episodeId, serialize(updatedProgress))
        if (!seriesId.isNullOrBlank()) {
            editor.putString(PREFIX_SERIES_LAST + seriesId, episodeId)
        }
        editor.apply()
    }

    @Synchronized
    fun markCompleted(episodeId: String, seriesId: String?, durationMs: Long) {
        saveProgress(
            episodeId = episodeId,
            seriesId = seriesId,
            positionMs = durationMs,
            durationMs = durationMs,
            forceCompleted = true,
        )
    }

    fun getResumePosition(episodeId: String): Long {
        val progress = getProgress(episodeId) ?: return 0L
        if (progress.isCompleted) return 0L
        if (progress.positionMs > 1000L) return progress.positionMs
        return 0L
    }

    fun getLastPlayedEpisodeId(seriesId: String): String? {
        if (seriesId.isBlank()) return null
        return prefs.getString(PREFIX_SERIES_LAST + seriesId, null)
    }

    fun setLastPlayedEpisodeId(seriesId: String, episodeId: String) {
        if (seriesId.isBlank() || episodeId.isBlank()) return
        prefs.edit().putString(PREFIX_SERIES_LAST + seriesId, episodeId).apply()
    }

    @Synchronized
    fun saveRecentItem(item: VodRecentItem) {
        if (item.episodeId.isBlank()) return

        val existing = _recentItemsFlow.value.filter { it.episodeId != item.episodeId }
        val updated = (listOf(item) + existing).take(MAX_RECENT_ITEMS)
        _recentItemsFlow.value = updated

        val editor = prefs.edit()
        editor.putString(PREFIX_RECENT_ITEM + item.episodeId, serializeRecentItem(item))
        val keepKeys = updated.map { PREFIX_RECENT_ITEM + it.episodeId }.toSet()
        prefs.all.keys
            .filter { it.startsWith(PREFIX_RECENT_ITEM) && it !in keepKeys }
            .forEach(editor::remove)
        editor.apply()
    }

    private fun serialize(item: VodPlaybackProgress): String {
        val json = JSONObject()
        json.put("episodeId", item.episodeId)
        json.put("seriesId", item.seriesId.orEmpty())
        json.put("positionMs", item.positionMs)
        json.put("durationMs", item.durationMs)
        json.put("lastWatchedAt", item.lastWatchedAt)
        json.put("isCompleted", item.isCompleted)
        return json.toString()
    }

    private fun deserialize(str: String): VodPlaybackProgress? {
        return try {
            val json = JSONObject(str)
            val episodeId = json.getString("episodeId")
            val seriesId = json.optString("seriesId").takeIf { it.isNotEmpty() }
            val positionMs = json.optLong("positionMs", 0L)
            val durationMs = json.optLong("durationMs", 0L)
            val lastWatchedAt = json.optLong("lastWatchedAt", 0L)
            val isCompleted = json.optBoolean("isCompleted", false)
            VodPlaybackProgress(
                episodeId = episodeId,
                seriesId = seriesId,
                positionMs = positionMs,
                durationMs = durationMs,
                lastWatchedAt = lastWatchedAt,
                isCompleted = isCompleted,
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun serializeRecentItem(item: VodRecentItem): String {
        val json = JSONObject()
        json.put("id", item.id)
        json.put("episodeId", item.episodeId)
        json.put("title", item.title)
        json.put("programId", item.programId.orEmpty())
        json.put("programName", item.programName.orEmpty())
        json.put("channelName", item.channelName.orEmpty())
        json.put("imageUrl", item.imageUrl.orEmpty())
        json.put("description", item.description.orEmpty())
        json.put("provider", item.provider.id)
        return json.toString()
    }

    private fun deserializeRecentItem(str: String): VodRecentItem? {
        return try {
            val json = JSONObject(str)
            val episodeId = json.getString("episodeId")
            VodRecentItem(
                id = json.optString("id", episodeId).ifBlank { episodeId },
                episodeId = episodeId,
                title = json.optString("title", "פרק"),
                programId = json.optString("programId").takeIf { it.isNotBlank() },
                programName = json.optString("programName").takeIf { it.isNotBlank() },
                channelName = json.optString("channelName").takeIf { it.isNotBlank() },
                imageUrl = json.optString("imageUrl").takeIf { it.isNotBlank() },
                description = json.optString("description").takeIf { it.isNotBlank() },
                provider = VodProvider.fromId(json.optString("provider")),
            )
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val PREFS_NAME = "vod_playback_progress"
        private const val PREFIX_EPISODE = "ep_"
        private const val PREFIX_SERIES_LAST = "series_last_"
        private const val PREFIX_RECENT_ITEM = "recent_item_"
        private const val MAX_RECENT_ITEMS = 60

        @Volatile
        private var instance: VodProgressManager? = null

        fun getInstance(context: Context): VodProgressManager {
            return instance ?: synchronized(this) {
                instance ?: VodProgressManager(context.applicationContext).also { instance = it }
            }
        }
    }
}
