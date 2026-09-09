package com.tvapp.programguide.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tvapp.programguide.data.LocalEpisode
import com.tvapp.programguide.data.LocalSeries
import com.tvapp.programguide.data.LocalSeriesRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LocalSeriesUiState(
    val series: List<LocalSeries> = emptyList(),
    val selectedSeries: LocalSeries? = null,
    val playingEpisode: LocalEpisode? = null,
    val playingSeries: LocalSeries? = null,
    val query: String = "",
    val total: Int = 0,
    val hasMore: Boolean = true,
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
)

class LocalSeriesViewModel(
    application: Application,
    private val repository: LocalSeriesRepository = LocalSeriesRepository(),
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, LocalSeriesRepository())

    private val _uiState = MutableStateFlow(LocalSeriesUiState())
    val uiState: StateFlow<LocalSeriesUiState> = _uiState.asStateFlow()
    private var loadJob: Job? = null
    private var lastLoadedMs: Long = 0L

    init {
        loadInitial()
    }

    fun refreshIfStale(force: Boolean = false) {
        val state = _uiState.value
        val nowMs = System.currentTimeMillis()
        if (state.selectedSeries != null || state.playingEpisode != null || state.isLoading) return
        if (force || state.series.isEmpty() || nowMs - lastLoadedMs >= LOCAL_SERIES_TTL_MS) {
            loadInitial(state.query)
        }
    }

    fun loadInitial(query: String = _uiState.value.query) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    query = query,
                    isLoading = true,
                    isLoadingMore = false,
                    error = null,
                    hasMore = true,
                )
            }
            runCatching {
                repository.loadSeries(query = query, limit = PAGE_SIZE, offset = 0)
            }.onSuccess { page ->
                lastLoadedMs = System.currentTimeMillis()
                _uiState.update {
                    it.copy(
                        series = page.series,
                        total = page.total,
                        hasMore = page.hasMore,
                        isLoading = false,
                        error = null,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = error.message ?: "שגיאה בטעינת הסדרות",
                    )
                }
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || state.isLoadingMore || !state.hasMore) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }
            runCatching {
                repository.loadSeries(query = state.query, limit = PAGE_SIZE, offset = state.series.size)
            }.onSuccess { page ->
                _uiState.update { current ->
                    val existingIds = current.series.map { it.id }.toSet()
                    current.copy(
                        series = current.series + page.series.filter { it.id !in existingIds },
                        total = page.total,
                        hasMore = page.hasMore,
                        isLoadingMore = false,
                    )
                }
            }.onFailure {
                _uiState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun openSeries(series: LocalSeries) {
        _uiState.update { it.copy(selectedSeries = series) }
    }

    fun closeSeries() {
        _uiState.update { it.copy(selectedSeries = null) }
    }

    fun playEpisode(series: LocalSeries, episode: LocalEpisode) {
        _uiState.update {
            it.copy(
                playingSeries = series,
                playingEpisode = episode,
            )
        }
    }

    fun stopPlayback() {
        _uiState.update {
            it.copy(
                playingSeries = null,
                playingEpisode = null,
            )
        }
    }

    companion object {
        private const val PAGE_SIZE = 48
        private const val LOCAL_SERIES_TTL_MS = 2 * 60 * 1000L
    }
}
