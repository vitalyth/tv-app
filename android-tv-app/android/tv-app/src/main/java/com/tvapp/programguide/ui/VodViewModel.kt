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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

import com.tvapp.programguide.data.VodNavLevel
import com.tvapp.programguide.data.VodRecentItem
import com.tvapp.programguide.data.VodSeriesPage

data class VodUiState(
    val navLevel: VodNavLevel = VodNavLevel.CHANNELS_HUB,
    val selectedProvider: VodProvider = VodProvider.KAN11,
    val recentItems: List<VodRecentItem> = emptyList(),
    val isLoadingRecent: Boolean = false,
    val seriesList: List<VodSeries> = emptyList(),
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
)

class VodViewModel(
    application: Application,
    private val repository: VodRepository = VodRepository(),
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, VodRepository())

    private val _uiState = MutableStateFlow(VodUiState())
    val uiState: StateFlow<VodUiState> = _uiState.asStateFlow()

    private var loadSeriesJob: Job? = null
    private var loadDetailsJob: Job? = null
    private var loadRecentJob: Job? = null
    private val seriesPageCache = LinkedHashMap<String, VodSeriesPage>(16, 0.75f, true)

    init {
        loadRecent()
    }

    fun getProviderLogoUrl(provider: VodProvider): String =
        repository.getProviderLogoUrl(provider)

    fun loadRecent() {
        loadRecentJob?.cancel()
        loadRecentJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoadingRecent = true) }
            val items = repository.loadRecentItems()
            _uiState.update { it.copy(recentItems = items, isLoadingRecent = false) }
        }
    }

    fun openChannel(provider: VodProvider) {
        _uiState.update {
            it.copy(
                navLevel = VodNavLevel.SERIES_LIST,
                selectedProvider = provider,
                selectedCategory = null,
                searchQuery = "",
                selectedSeriesDetails = null,
                selectedSeason = null,
                seriesList = emptyList(),
                categories = emptyList(),
                hasMoreSeries = true,
                isLoadingMoreSeries = false,
                totalSeries = 0,
            )
        }
        loadInitialSeries(provider = provider)
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

    fun selectProvider(provider: VodProvider) {
        if (_uiState.value.selectedProvider == provider && _uiState.value.seriesList.isNotEmpty()) return

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
            provider = _uiState.value.selectedProvider,
            category = next,
            query = _uiState.value.searchQuery,
        )
    }

    fun search(query: String) {
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
            provider = _uiState.value.selectedProvider,
            category = _uiState.value.selectedCategory,
            query = query,
        )
    }

    fun loadInitialSeries(
        provider: VodProvider = _uiState.value.selectedProvider,
        category: String? = _uiState.value.selectedCategory,
        query: String = _uiState.value.searchQuery,
    ) {
        loadSeriesJob?.cancel()
        loadSeriesJob = viewModelScope.launch {
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
        if (state.isLoadingSeries || state.isLoadingMoreSeries || !state.hasMoreSeries) return

        val offset = state.seriesList.size
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMoreSeries = true) }
            runCatching {
                repository.loadSeries(
                    provider = state.selectedProvider,
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
                    putCachedSeriesPage(state.selectedProvider, state.selectedCategory, state.searchQuery, nextPage)
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
    }

    private fun seriesCacheKey(provider: VodProvider, category: String?, query: String): String =
        "${provider.id}|${category.orEmpty()}|${query.trim()}"

    private fun getCachedSeriesPage(provider: VodProvider, category: String?, query: String): VodSeriesPage? =
        seriesPageCache[seriesCacheKey(provider, category, query)]

    private fun putCachedSeriesPage(provider: VodProvider, category: String?, query: String, page: VodSeriesPage) {
        seriesPageCache[seriesCacheKey(provider, category, query)] = page
        if (seriesPageCache.size > SERIES_CACHE_MAX_ENTRIES) {
            val oldest = seriesPageCache.keys.firstOrNull()
            if (oldest != null) seriesPageCache.remove(oldest)
        }
    }

    fun openSeriesDetails(series: VodSeries) {
        loadDetailsJob?.cancel()
        loadDetailsJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingDetails = true,
                    detailsError = null,
                    selectedSeriesDetails = null,
                    selectedSeason = null,
                )
            }
            runCatching {
                repository.loadSeriesDetails(series.provider, series.id)
            }.onSuccess { details ->
                _uiState.update {
                    it.copy(
                        selectedSeriesDetails = details,
                        selectedSeason = details.seasons.firstOrNull(),
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
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isResolvingStream = true,
                    streamError = null,
                    playingEpisode = episode,
                    playingSeries = series,
                    playingStreamUrl = null,
                    lastPlayedEpisodeId = episode.id,
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
        val dummyEpisode = VodEpisode(
            id = recent.episodeId,
            programId = recent.programId ?: recent.id,
            seasonId = null,
            title = recent.title,
            description = recent.description.orEmpty(),
            imageUrl = recent.imageUrl,
            playUrl = null,
            streamEndpoint = streamEndpointFor(recent.provider, recent.episodeId),
            displayOrder = 1,
        )
        val dummySeries = VodSeries(
            id = recent.programId ?: recent.id,
            title = recent.programName ?: recent.channelName ?: recent.provider.displayName,
            description = recent.description.orEmpty(),
            imageUrl = recent.imageUrl,
            episodeCount = 1,
            seasonCount = 1,
            genre = null,
            provider = recent.provider,
        )
        playEpisode(dummyEpisode, dummySeries)
    }

    fun stopVodPlayback() {
        _uiState.update {
            it.copy(
                playingEpisode = null,
                playingSeries = null,
                playingStreamUrl = null,
                isResolvingStream = false,
                streamError = null,
            )
        }
    }

    private fun streamEndpointFor(provider: VodProvider, episodeId: String): String {
        val encodedEpisodeId = URLEncoder.encode(episodeId, "UTF-8")
        return "/${provider.endpoint}/stream?episode_id=$encodedEpisodeId"
    }
}
