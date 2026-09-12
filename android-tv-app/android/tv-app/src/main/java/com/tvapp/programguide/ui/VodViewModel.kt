package com.tvapp.programguide.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tvapp.programguide.data.VodEpisode
import com.tvapp.programguide.data.VodProvider
import com.tvapp.programguide.data.VodRepository
import com.tvapp.programguide.data.VodSeason
import com.tvapp.programguide.data.VodSeries
import com.tvapp.programguide.data.VodSeriesDetails
import java.net.URLEncoder
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

import com.tvapp.programguide.data.VodNavLevel
import com.tvapp.programguide.data.VodPlaybackProgress
import com.tvapp.programguide.data.VodProgressManager
import com.tvapp.programguide.data.VodRecentItem
import com.tvapp.programguide.data.VodSeriesPage

data class VodUiState(
    val navLevel: VodNavLevel = VodNavLevel.CHANNELS_HUB,
    val selectedProvider: VodProvider? = null,
    val recentItems: List<VodRecentItem> = emptyList(),
    val isLoadingRecent: Boolean = false,
    val seriesList: List<VodSeries> = emptyList(),
    val allChannelsSeries: List<VodSeries> = emptyList(),
    val categories: List<String> = emptyList(),
    val selectedCategory: String? = null,
    val searchQuery: String = "",
    val isLoadingSeries: Boolean = false,
    val isLoadingMoreSeries: Boolean = false,
    val hasMoreSeries: Boolean = true,
    val totalSeries: Int = 0,
    val seriesError: String? = null,

    val selectedSeriesDetails: VodSeriesDetails? = null,
    val selectedSeason: VodSeason? = null,
    val isLoadingDetails: Boolean = false,
    val detailsError: String? = null,

    val playingEpisode: VodEpisode? = null,
    val playingSeries: VodSeries? = null,
    val playingStreamUrl: String? = null,
    val isResolvingStream: Boolean = false,
    val streamError: String? = null,
    val lastPlayedEpisodeId: String? = null,
    val episodeProgress: Map<String, VodPlaybackProgress> = emptyMap(),
    val watchedItems: List<VodRecentItem> = emptyList(),
    val resumePositionMs: Long? = null,
    val episodeFocusTarget: VodEpisodeFocusTarget? = null,
)

data class VodEpisodeFocusTarget(
    val seriesId: String,
    val seasonId: String?,
    val episodeId: String,
    val nonce: Int,
)

class VodViewModel(
    application: Application,
    private val repository: VodRepository = VodRepository(),
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, VodRepository())

    private val progressManager = VodProgressManager.getInstance(application)
    private val _uiState = MutableStateFlow(
        VodUiState(
            episodeProgress = progressManager.progressFlow.value,
            watchedItems = progressManager.recentItemsFlow.value,
        )
    )
    val uiState: StateFlow<VodUiState> = _uiState.asStateFlow()

    private var loadSeriesJob: Job? = null
    private var loadDetailsJob: Job? = null
    private var loadRecentJob: Job? = null
    private val seriesPageCache = LinkedHashMap<String, TimedSeriesPage>(16, 0.75f, true)
    private var lastRecentLoadedMs: Long = 0L
    private var episodeFocusNonce: Int = 0

    init {
        loadRecent()
        viewModelScope.launch {
            progressManager.progressFlow.collect { progressMap ->
                _uiState.update { it.copy(episodeProgress = progressMap) }
            }
        }
        viewModelScope.launch {
            progressManager.recentItemsFlow.collect { items ->
                _uiState.update { it.copy(watchedItems = items) }
            }
        }
    }

    fun getProviderLogoUrl(provider: VodProvider): String =
        repository.getProviderLogoUrl(provider)

    fun loadRecent() {
        loadRecentJob?.cancel()
        loadRecentJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoadingRecent = true) }
            runCatching {
                repository.loadRecentItems()
            }.onSuccess { items ->
                lastRecentLoadedMs = System.currentTimeMillis()
                _uiState.update { it.copy(recentItems = items, isLoadingRecent = false) }
            }.onFailure {
                _uiState.update { it.copy(isLoadingRecent = false) }
            }
        }
    }

    val allProviders = listOf(
        VodProvider.KAN11,
        VodProvider.KESHET12,
        VodProvider.RESHET13,
        VodProvider.CHANNEL14,
        VodProvider.I24NEWS,
    )

    fun refreshIfStale(force: Boolean = false) {
        val state = _uiState.value
        val nowMs = System.currentTimeMillis()
        if (force || nowMs - lastRecentLoadedMs >= VOD_RECENT_TTL_MS) {
            loadRecent()
        }
        val provider = state.selectedProvider
        if (provider == null) {
            if (force || state.allChannelsSeries.isEmpty()) {
                loadAllChannelsInitialSeries(forceRefresh = true)
            }
        } else {
            val cachedPage = getCachedSeriesPage(
                provider = provider,
                category = state.selectedCategory,
                query = state.searchQuery,
            )
            if (force || cachedPage == null) {
                loadInitialSeries(
                    provider = provider,
                    category = state.selectedCategory,
                    query = state.searchQuery,
                    forceRefresh = true,
                )
            }
        }
    }

    fun openChannel(provider: VodProvider) {
        selectProvider(provider)
    }

    fun backToChannelsHub() {
        _uiState.update {
            it.copy(
                navLevel = VodNavLevel.CHANNELS_HUB,
                selectedSeriesDetails = null,
                selectedSeason = null,
                detailsError = null,
            )
        }
        loadRecent()
    }

    fun loadAllChannelsInitialSeries(forceRefresh: Boolean = false) {
        if (!forceRefresh && _uiState.value.allChannelsSeries.isNotEmpty()) {
            _uiState.update {
                it.copy(
                    selectedProvider = null,
                    seriesList = it.allChannelsSeries,
                    totalSeries = it.allChannelsSeries.size,
                    hasMoreSeries = false,
                    isLoadingSeries = false,
                    isLoadingMoreSeries = false,
                    seriesError = null,
                )
            }
            return
        }

        loadSeriesJob?.cancel()
        loadSeriesJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    selectedProvider = null,
                    isLoadingSeries = it.allChannelsSeries.isEmpty(),
                    seriesError = null,
                )
            }

            val deferredResults = allProviders.map { p ->
                async {
                    runCatching {
                        repository.loadSeries(
                            provider = p,
                            query = "",
                            category = null,
                            limit = 8,
                            offset = 0,
                        ).series
                    }.getOrDefault(emptyList())
                }
            }

            val channelSeriesList = deferredResults.awaitAll()

            // 1 program from each channel at index 0..4 (Requirement 2)
            val firstOfEach = channelSeriesList.mapNotNull { it.firstOrNull() }
            val remainingSeries = mutableListOf<VodSeries>()
            var maxLen = 0
            channelSeriesList.forEach { if (it.size > maxLen) maxLen = it.size }
            for (i in 1 until maxLen) {
                channelSeriesList.forEach { list ->
                    if (i < list.size) {
                        remainingSeries.add(list[i])
                    }
                }
            }

            val combined = (firstOfEach + remainingSeries).distinctBy { "${it.provider.id}:${it.id}" }

            _uiState.update {
                it.copy(
                    selectedProvider = null,
                    allChannelsSeries = combined,
                    seriesList = combined,
                    totalSeries = combined.size,
                    hasMoreSeries = false,
                    isLoadingSeries = false,
                    isLoadingMoreSeries = false,
                    seriesError = if (combined.isEmpty()) "לא נמצאו תוכניות" else null,
                )
            }
        }
    }

    fun selectProvider(provider: VodProvider?) {
        if (provider == null) {
            loadAllChannelsInitialSeries()
            return
        }

        if (_uiState.value.selectedProvider == provider && _uiState.value.seriesList.isNotEmpty()) {
            loadAllChannelsInitialSeries()
            return
        }

        val cachedPage = getCachedSeriesPage(provider = provider, category = null, query = "")
        if (cachedPage != null) {
            loadSeriesJob?.cancel()
            _uiState.update {
                it.copy(
                    selectedProvider = provider,
                    selectedCategory = null,
                    searchQuery = "",
                    selectedSeriesDetails = null,
                    selectedSeason = null,
                    seriesList = cachedPage.series,
                    categories = cachedPage.categories,
                    hasMoreSeries = cachedPage.hasMore,
                    isLoadingSeries = false,
                    isLoadingMoreSeries = false,
                    totalSeries = cachedPage.total,
                    seriesError = null,
                )
            }
            return
        }

        _uiState.update {
            it.copy(
                selectedProvider = provider,
                selectedCategory = null,
                searchQuery = "",
                selectedSeriesDetails = null,
                selectedSeason = null,
                seriesList = emptyList(),
                categories = emptyList(),
                hasMoreSeries = true,
                isLoadingSeries = true,
                isLoadingMoreSeries = false,
                totalSeries = 0,
                seriesError = null,
            )
        }
        loadInitialSeries(provider = provider, category = null, query = "")
    }

    fun selectCategory(category: String?) {
        val provider = _uiState.value.selectedProvider ?: return
        val next = if (category == "הכל" || category == _uiState.value.selectedCategory) null else category
        if (next == _uiState.value.selectedCategory && _uiState.value.seriesList.isNotEmpty()) return

        _uiState.update {
            it.copy(
                selectedCategory = next,
                seriesList = emptyList(),
                hasMoreSeries = true,
                isLoadingSeries = true,
                isLoadingMoreSeries = false,
                totalSeries = 0,
                seriesError = null,
            )
        }
        loadInitialSeries(
            provider = provider,
            category = next,
            query = _uiState.value.searchQuery,
        )
    }

    fun search(query: String) {
        val provider = _uiState.value.selectedProvider ?: return
        _uiState.update {
            it.copy(
                searchQuery = query,
                seriesList = emptyList(),
                hasMoreSeries = true,
                isLoadingMoreSeries = false,
                totalSeries = 0,
            )
        }
        loadInitialSeries(
            provider = provider,
            category = _uiState.value.selectedCategory,
            query = query,
        )
    }

    fun loadInitialSeries(
        provider: VodProvider? = _uiState.value.selectedProvider,
        category: String? = _uiState.value.selectedCategory,
        query: String = _uiState.value.searchQuery,
        forceRefresh: Boolean = false,
    ) {
        if (provider == null) {
            loadAllChannelsInitialSeries(forceRefresh = forceRefresh)
            return
        }
        loadSeriesJob?.cancel()
        loadSeriesJob = viewModelScope.launch {
            if (!forceRefresh) {
                getCachedSeriesPage(provider, category, query)?.let { cachedPage ->
                    _uiState.update {
                        it.copy(
                            selectedProvider = provider,
                            selectedCategory = category,
                            searchQuery = query,
                            seriesList = cachedPage.series,
                            categories = if (cachedPage.categories.isNotEmpty()) cachedPage.categories else it.categories,
                            hasMoreSeries = cachedPage.hasMore,
                            totalSeries = cachedPage.total,
                            isLoadingSeries = false,
                            isLoadingMoreSeries = false,
                            seriesError = null,
                        )
                    }
                    return@launch
                }
            }

            _uiState.update { it.copy(isLoadingSeries = true, seriesError = null) }
            runCatching {
                repository.loadSeries(
                    provider = provider,
                    query = query,
                    category = category,
                    limit = PAGE_SIZE,
                    offset = 0,
                )
            }.onSuccess { page ->
                putCachedSeriesPage(provider, category, query, page)
                _uiState.update {
                    it.copy(
                        seriesList = page.series,
                        categories = if (page.categories.isNotEmpty()) page.categories else it.categories,
                        hasMoreSeries = page.hasMore,
                        totalSeries = page.total,
                        isLoadingSeries = false,
                        seriesError = null,
                    )
                }
            }.onFailure { error ->
                if (error is CancellationException) return@launch
                _uiState.update {
                    it.copy(
                        isLoadingSeries = false,
                        seriesError = error.message ?: "שגיאה בטעינת תוכניות",
                    )
                }
            }
        }
    }

    fun loadMoreSeries() {
        val state = _uiState.value
        val provider = state.selectedProvider ?: return
        if (state.isLoadingSeries || state.isLoadingMoreSeries || !state.hasMoreSeries) return

        val offset = state.seriesList.size
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMoreSeries = true) }
            runCatching {
                repository.loadSeries(
                    provider = provider,
                    query = state.searchQuery,
                    category = state.selectedCategory,
                    limit = PAGE_SIZE,
                    offset = offset,
                )
            }.onSuccess { page ->
                _uiState.update { current ->
                    val existingIds = current.seriesList.map { it.id }.toSet()
                    val newSeries = page.series.filter { it.id !in existingIds }
                    val nextSeries = current.seriesList + newSeries
                    val nextPage = page.copy(series = nextSeries)
                    putCachedSeriesPage(provider, state.selectedCategory, state.searchQuery, nextPage)
                    current.copy(
                        seriesList = nextSeries,
                        hasMoreSeries = page.hasMore && page.series.isNotEmpty(),
                        totalSeries = page.total,
                        isLoadingMoreSeries = false,
                    )
                }
            }.onFailure {
                _uiState.update { it.copy(isLoadingMoreSeries = false) }
            }
        }
    }

    companion object {
        private const val PAGE_SIZE = 30
        private const val SERIES_CACHE_MAX_ENTRIES = 16
        private const val VOD_SERIES_TTL_MS = 30 * 60 * 1000L
        private const val VOD_RECENT_TTL_MS = 30 * 60 * 1000L
    }

    private fun seriesCacheKey(provider: VodProvider, category: String?, query: String): String =
        "${provider.id}|${category.orEmpty()}|${query.trim()}"

    private fun getCachedSeriesPage(provider: VodProvider, category: String?, query: String): VodSeriesPage? {
        val key = seriesCacheKey(provider, category, query)
        val cached = seriesPageCache[key] ?: return null
        if (System.currentTimeMillis() - cached.loadedAtMs > VOD_SERIES_TTL_MS) {
            seriesPageCache.remove(key)
            return null
        }
        return cached.page
    }

    private fun putCachedSeriesPage(provider: VodProvider, category: String?, query: String, page: VodSeriesPage) {
        seriesPageCache[seriesCacheKey(provider, category, query)] = TimedSeriesPage(
            page = page,
            loadedAtMs = System.currentTimeMillis(),
        )
        if (seriesPageCache.size > SERIES_CACHE_MAX_ENTRIES) {
            val oldest = seriesPageCache.keys.firstOrNull()
            if (oldest != null) seriesPageCache.remove(oldest)
        }
    }

    private data class TimedSeriesPage(
        val page: VodSeriesPage,
        val loadedAtMs: Long,
    )

    fun openSeriesDetails(series: VodSeries) {
        loadDetailsJob?.cancel()
        val lastEpisodeId = progressManager.getLastPlayedEpisodeId(series.id)
        loadDetailsJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingDetails = true,
                    detailsError = null,
                    selectedSeriesDetails = null,
                    selectedSeason = null,
                    lastPlayedEpisodeId = lastEpisodeId,
                )
            }
            runCatching {
                repository.loadSeriesDetails(series.provider, series.id)
            }.onSuccess { details ->
                val targetEpisode = lastEpisodeId?.let { id -> details.episodes.firstOrNull { it.id == id } }
                val initialSeason = if (targetEpisode?.seasonId != null) {
                    details.seasons.firstOrNull { it.seasonId == targetEpisode.seasonId } ?: details.seasons.firstOrNull()
                } else {
                    details.seasons.firstOrNull()
                }
                _uiState.update {
                    it.copy(
                        selectedSeriesDetails = details,
                        selectedSeason = initialSeason,
                        isLoadingDetails = false,
                        detailsError = null,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoadingDetails = false,
                        detailsError = error.message ?: "שגיאה בטעינת פרטי תוכנית",
                    )
                }
            }
        }
    }

    fun closeSeriesDetails() {
        _uiState.update {
            it.copy(
                selectedSeriesDetails = null,
                selectedSeason = null,
                detailsError = null,
            )
        }
    }

    fun selectSeason(season: VodSeason) {
        _uiState.update { it.copy(selectedSeason = season) }
    }

    fun playEpisode(episode: VodEpisode, series: VodSeries) {
        val resumePos = progressManager.getResumePosition(episode.id)
        progressManager.setLastPlayedEpisodeId(series.id, episode.id)
        progressManager.saveRecentItem(
            VodRecentItem(
                id = episode.id,
                episodeId = episode.id,
                title = episode.title,
                programId = series.id,
                programName = series.title,
                channelName = series.provider.displayName,
                imageUrl = episode.imageUrl ?: series.imageUrl,
                description = episode.description.takeIf { it.isNotBlank() } ?: series.description,
                provider = series.provider,
            )
        )
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isResolvingStream = true,
                    streamError = null,
                    playingEpisode = episode,
                    playingSeries = series,
                    playingStreamUrl = null,
                    lastPlayedEpisodeId = episode.id,
                    resumePositionMs = resumePos,
                    episodeFocusTarget = null,
                )
            }
            val streamEndpoint = episode.streamEndpoint
                ?: streamEndpointFor(series.provider, episode.id)

            val directStream = repository.resolveEpisodeStream(
                streamEndpoint = streamEndpoint,
                provider = series.provider,
                fallbackPlayUrl = episode.playUrl,
            )

            if (!directStream.isNullOrBlank()) {
                _uiState.update {
                    it.copy(
                        isResolvingStream = false,
                        playingStreamUrl = directStream,
                        streamError = null,
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        isResolvingStream = false,
                        streamError = "לא נמצא זרם וידאו זמין לפרק זה",
                    )
                }
            }
        }
    }

    fun playRecentItem(recent: VodRecentItem) {
        val programId = recent.programId
        val dummyEpisode = VodEpisode(
            id = recent.episodeId,
            programId = programId ?: recent.id,
            seasonId = null,
            title = recent.title,
            description = recent.description.orEmpty(),
            imageUrl = recent.imageUrl,
            playUrl = null,
            streamEndpoint = streamEndpointFor(recent.provider, recent.episodeId),
            displayOrder = 1,
        )
        val dummySeries = VodSeries(
            id = programId ?: recent.id,
            title = recent.programName ?: recent.channelName ?: recent.provider.displayName,
            description = recent.description.orEmpty(),
            imageUrl = recent.imageUrl,
            episodeCount = 1,
            seasonCount = 1,
            genre = null,
            provider = recent.provider,
        )
        playEpisode(dummyEpisode, dummySeries)
        if (!programId.isNullOrBlank()) {
            loadDetailsForPlayingRecentItem(recent, programId)
        }
    }

    private fun loadDetailsForPlayingRecentItem(recent: VodRecentItem, programId: String) {
        loadDetailsJob?.cancel()
        loadDetailsJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingDetails = true,
                    detailsError = null,
                    selectedSeriesDetails = null,
                    selectedSeason = null,
                    lastPlayedEpisodeId = recent.episodeId,
                )
            }
            runCatching {
                repository.loadSeriesDetails(recent.provider, programId)
            }.onSuccess { details ->
                val targetEpisode = details.episodes.firstOrNull { it.id == recent.episodeId }
                val targetSeason = targetEpisode?.seasonId
                    ?.let { seasonId -> details.seasons.firstOrNull { it.seasonId == seasonId } }
                    ?: details.seasons.firstOrNull()
                _uiState.update { state ->
                    val shouldUpgradePlayingItem =
                        state.playingSeries?.id == programId &&
                            state.playingEpisode?.id == recent.episodeId &&
                            targetEpisode != null
                    state.copy(
                        selectedSeriesDetails = details,
                        selectedSeason = targetSeason,
                        isLoadingDetails = false,
                        detailsError = null,
                        playingSeries = if (state.playingSeries?.id == programId) details.series else state.playingSeries,
                        playingEpisode = if (shouldUpgradePlayingItem) targetEpisode else state.playingEpisode,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoadingDetails = false,
                        detailsError = error.message ?: "שגיאה בטעינת פרטי תוכנית",
                    )
                }
            }
        }
    }

    suspend fun resolveRecentItemPreviewStream(recent: VodRecentItem): String? {
        return repository.resolveEpisodeStream(
            streamEndpoint = streamEndpointFor(recent.provider, recent.episodeId),
            provider = recent.provider,
        )
    }

    suspend fun resolveEpisodePreviewStream(episode: VodEpisode, series: VodSeries): String? {
        val streamEndpoint = episode.streamEndpoint ?: streamEndpointFor(series.provider, episode.id)
        return repository.resolveEpisodeStream(
            streamEndpoint = streamEndpoint,
            provider = series.provider,
            fallbackPlayUrl = episode.playUrl,
        )
    }

    fun getResumePosition(episodeId: String): Long {
        return progressManager.getResumePosition(episodeId)
    }

    fun stopVodPlayback() {
        val current = _uiState.value
        val focusTarget = current.playingEpisode?.let { episode ->
            current.playingSeries?.let { series ->
                VodEpisodeFocusTarget(
                    seriesId = series.id,
                    seasonId = episode.seasonId,
                    episodeId = episode.id,
                    nonce = ++episodeFocusNonce,
                )
            }
        }
        _uiState.update {
            it.copy(
                playingEpisode = null,
                playingSeries = null,
                playingStreamUrl = null,
                isResolvingStream = false,
                streamError = null,
                resumePositionMs = null,
                episodeFocusTarget = focusTarget,
            )
        }
    }

    fun consumeEpisodeFocusTarget(nonce: Int) {
        _uiState.update {
            if (it.episodeFocusTarget?.nonce == nonce) {
                it.copy(episodeFocusTarget = null)
            } else {
                it
            }
        }
    }

    fun savePlaybackProgress(
        episodeId: String,
        seriesId: String?,
        positionMs: Long,
        durationMs: Long,
        forceCompleted: Boolean? = null,
    ) {
        progressManager.saveProgress(
            episodeId = episodeId,
            seriesId = seriesId,
            positionMs = positionMs,
            durationMs = durationMs,
            forceCompleted = forceCompleted,
        )
    }

    fun markEpisodeCompleted(episodeId: String, seriesId: String?, durationMs: Long) {
        progressManager.markCompleted(
            episodeId = episodeId,
            seriesId = seriesId,
            durationMs = durationMs,
        )
    }

    private fun streamEndpointFor(provider: VodProvider, episodeId: String): String {
        val encodedEpisodeId = URLEncoder.encode(episodeId, "UTF-8")
        return "/${provider.endpoint}/stream?episode_id=$encodedEpisodeId"
    }
}
