package com.tvapp.programguide.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.ProgramGuideRepository
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GuideUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val guideData: GuideData? = null,
    val selectedChannel: TvChannel? = null,
    val selectedProgram: TvProgram? = null,
    val playingChannel: TvChannel? = null,
    val playingProgram: TvProgram? = null,
    val isMiniPlayerPlaying: Boolean = false,
    val isPlayerExpanded: Boolean = false,
)

class GuideViewModel(
    private val repository: ProgramGuideRepository = ProgramGuideRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(GuideUiState())
    val uiState: StateFlow<GuideUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            runCatching { repository.loadGuide() }
                .onSuccess { data ->
                    val channel = data.channels.firstOrNull()
                    _uiState.value = GuideUiState(
                        loading = false,
                        guideData = data,
                        selectedChannel = channel,
                        selectedProgram = channel?.let { currentProgram(data, it) },
                    )
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            error = error.message ?: "Guide failed to load",
                        )
                    }
                }
        }
    }

    fun selectProgram(channel: TvChannel, program: TvProgram) {
        _uiState.update {
            it.copy(selectedChannel = channel, selectedProgram = program)
        }
    }

    fun selectChannel(channel: TvChannel, program: TvProgram?) {
        _uiState.update {
            it.copy(selectedChannel = channel, selectedProgram = program)
        }
    }

    fun playChannel(channel: TvChannel, program: TvProgram?) {
        _uiState.update {
            it.copy(
                selectedChannel = channel,
                selectedProgram = program,
                playingChannel = channel,
                playingProgram = program,
                isMiniPlayerPlaying = true,
            )
        }
    }

    fun playNextChannel() {
        playAdjacentChannel(offset = 1)
    }

    fun playPreviousChannel() {
        playAdjacentChannel(offset = -1)
    }

    fun expandPlayer() {
        _uiState.update {
            val channel = it.playingChannel ?: it.selectedChannel
            it.copy(
                playingChannel = channel,
                playingProgram = it.playingProgram ?: it.selectedProgram,
                isMiniPlayerPlaying = channel != null,
                isPlayerExpanded = channel != null,
            )
        }
    }

    fun collapsePlayer() {
        _uiState.update { it.copy(isPlayerExpanded = false) }
    }

    fun streamUrl(channel: TvChannel): String = repository.streamUrl(channel)

    private fun playAdjacentChannel(offset: Int) {
        _uiState.update { state ->
            val data = state.guideData ?: return@update state
            val channels = data.channels
            if (channels.isEmpty()) return@update state

            val currentChannel = state.playingChannel ?: state.selectedChannel ?: channels.first()
            val currentIndex = channels.indexOfFirst { it.id == currentChannel.id }.let {
                if (it >= 0) it else 0
            }
            val nextIndex = Math.floorMod(currentIndex + offset, channels.size)
            val nextChannel = channels[nextIndex]
            val nextProgram = currentProgram(data, nextChannel)

            state.copy(
                selectedChannel = nextChannel,
                selectedProgram = nextProgram,
                playingChannel = nextChannel,
                playingProgram = nextProgram,
                isMiniPlayerPlaying = true,
            )
        }
    }

    private fun currentProgram(data: GuideData, channel: TvChannel): TvProgram? {
        val now = System.currentTimeMillis() / 1000
        return data.programsByChannel[channel.id]
            ?.firstOrNull { now in it.startSeconds until it.endSeconds }
            ?: data.programsByChannel[channel.id]?.firstOrNull()
    }
}
