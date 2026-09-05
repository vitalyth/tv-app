package com.tvapp.programguide.ui

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tvapp.programguide.data.GuideData
import com.tvapp.programguide.data.ProgramGuideRepository
import com.tvapp.programguide.data.TvChannel
import com.tvapp.programguide.data.TvProgram
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

data class GuideDataUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val guideData: GuideData? = null,
    val selectedChannel: TvChannel? = null,
    val selectedProgram: TvProgram? = null,
    val playingChannel: TvChannel? = null,
)

data class GuidePlaybackUiState(
    val selectedChannel: TvChannel? = null,
    val selectedProgram: TvProgram? = null,
    val playingChannel: TvChannel? = null,
    val playingProgram: TvProgram? = null,
    val isMiniPlayerPlaying: Boolean = false,
    val isPlayerExpanded: Boolean = false,
)

class GuideViewModel(
    application: Application,
    private val repository: ProgramGuideRepository = ProgramGuideRepository(),
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, ProgramGuideRepository())

    private val _uiState = MutableStateFlow(GuideUiState())
    val uiState: StateFlow<GuideUiState> = _uiState.asStateFlow()
    val guideState: StateFlow<GuideDataUiState> = _uiState
        .map { state ->
            GuideDataUiState(
                loading = state.loading,
                error = state.error,
                guideData = state.guideData,
                selectedChannel = state.selectedChannel,
                selectedProgram = state.selectedProgram,
                playingChannel = state.playingChannel,
            )
        }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GuideDataUiState())

    val playbackState: StateFlow<GuidePlaybackUiState> = _uiState
        .map { state ->
            GuidePlaybackUiState(
                selectedChannel = state.selectedChannel,
                selectedProgram = state.selectedProgram,
                playingChannel = state.playingChannel,
                playingProgram = state.playingProgram,
                isMiniPlayerPlaying = state.isMiniPlayerPlaying,
                isPlayerExpanded = state.isPlayerExpanded,
            )
        }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GuidePlaybackUiState())
    private val loadingGuideRanges = mutableSetOf<GuideRange>()
    private val playbackPrefs = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true, error = null) }
            runCatching { repository.loadGuide() }
                .onSuccess { data ->
                    val channel = data.lastPlayableChannel() ?: data.channels.firstOrNull()
                    val program = channel?.let { currentProgram(data, it) }
                    val shouldAutoPlay = channel?.hasStream() == true
                    _uiState.value = GuideUiState(
                        loading = false,
                        guideData = data,
                        selectedChannel = channel,
                        selectedProgram = program,
                        playingChannel = channel.takeIf { shouldAutoPlay },
                        playingProgram = program.takeIf { shouldAutoPlay },
                        isMiniPlayerPlaying = shouldAutoPlay,
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
        if (!channel.hasStream()) return
        saveLastChannel(channel)
        _uiState.update { state ->
            state.copy(
                selectedChannel = channel,
                selectedProgram = program,
                playingChannel = channel,
                playingProgram = program,
                isMiniPlayerPlaying = true,
                isPlayerExpanded = false,
            )
        }
    }

    fun playChannelExpanded(channel: TvChannel, program: TvProgram?) {
        if (!channel.hasStream()) return
        saveLastChannel(channel)
        _uiState.update {
            it.copy(
                selectedChannel = channel,
                selectedProgram = program,
                playingChannel = channel,
                playingProgram = program,
                isMiniPlayerPlaying = true,
                isPlayerExpanded = true,
            )
        }
    }

    fun playNextChannel() {
        playAdjacentChannel(offset = 1)
    }

    fun playPreviousChannel() {
        playAdjacentChannel(offset = -1)
    }

    fun playChannelNumberExpanded(number: String): Boolean {
        val state = _uiState.value
        val data = state.guideData ?: return false
        val channel = data.channels.firstOrNull { it.hasStream() && it.normalizedNumber() == normalizedChannelNumber(number) }
            ?: return false
        val program = currentProgram(data, channel)
        saveLastChannel(channel)
        _uiState.update {
            it.copy(
                selectedChannel = channel,
                selectedProgram = program,
                playingChannel = channel,
                playingProgram = program,
                isMiniPlayerPlaying = true,
                isPlayerExpanded = true,
            )
        }
        return true
    }

    fun hasPlayableChannelNumberPrefix(prefix: String): Boolean {
        val data = _uiState.value.guideData ?: return false
        val normalizedPrefix = normalizedChannelNumber(prefix)
        return data.channels.any { channel ->
            channel.hasStream() && channel.normalizedNumber().startsWith(normalizedPrefix)
        }
    }

    fun expandPlayer() {
        _uiState.update {
            val channel = it.playingChannel ?: it.selectedChannel
            if (channel?.hasStream() != true) return@update it
            it.copy(
                playingChannel = channel,
                playingProgram = it.playingProgram ?: it.selectedProgram,
                isMiniPlayerPlaying = true,
                isPlayerExpanded = true,
            )
        }
    }

    fun collapsePlayer() {
        _uiState.update { it.copy(isPlayerExpanded = false) }
    }

    fun stopPlayback() {
        _uiState.update {
            it.copy(
                playingChannel = null,
                playingProgram = null,
                isMiniPlayerPlaying = false,
                isPlayerExpanded = false,
            )
        }
    }

    fun streamUrl(channel: TvChannel): String = repository.streamUrl(channel)

    fun ensureGuideRange(visibleStartSeconds: Long, visibleEndSeconds: Long) {
        val state = _uiState.value
        val data = state.guideData ?: return

        val missingStart = visibleStartSeconds < data.guideStartSeconds
        val missingEnd = visibleEndSeconds > data.guideEndSeconds
        val range = when {
            missingStart && missingEnd -> GuideRange(visibleStartSeconds, visibleEndSeconds)
            missingStart -> GuideRange(visibleStartSeconds, data.guideStartSeconds)
            missingEnd -> GuideRange(data.guideEndSeconds, visibleEndSeconds)
            else -> return
        }
        if (range.endSeconds <= range.startSeconds) return
        if (!loadingGuideRanges.add(range)) return

        viewModelScope.launch(Dispatchers.Default) {
            runCatching {
                withContext(Dispatchers.IO) {
                    repository.loadPrograms(data.channels, range.startSeconds, range.endSeconds)
                }
            }
                .onSuccess { newPrograms ->
                    _uiState.update { current ->
                        val latestData = current.guideData ?: return@update current
                        val mergeResult = latestData.mergePrograms(newPrograms, range)
                        if (!mergeResult.changed) return@update current
                        current.copy(
                            guideData = latestData.copy(
                                programsByChannel = mergeResult.programsByChannel,
                                guideStartSeconds = mergeResult.startSeconds,
                                guideEndSeconds = mergeResult.endSeconds,
                            )
                        )
                    }
                }
                .also {
                    loadingGuideRanges.remove(range)
                }
        }
    }

    private fun playAdjacentChannel(offset: Int) {
        _uiState.update { state ->
            val data = state.guideData ?: return@update state
            val channels = data.channels
            if (channels.isEmpty()) return@update state

            val currentChannel = state.playingChannel ?: state.selectedChannel ?: channels.first()
            val currentIndex = channels.indexOfFirst { it.id == currentChannel.id }.let {
                if (it >= 0) it else 0
            }
            val nextIndex = nextPlayableChannelIndex(channels, currentIndex, offset)
                ?: return@update state
            val nextChannel = channels[nextIndex]
            val nextProgram = currentProgram(data, nextChannel)
            saveLastChannel(nextChannel)

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
            ?.filter { now in it.startSeconds until it.endSeconds }
            ?.maxByOrNull { it.startSeconds }
            ?: data.programsByChannel[channel.id]?.firstOrNull()
    }

    private fun nextPlayableChannelIndex(
        channels: List<TvChannel>,
        currentIndex: Int,
        offset: Int,
    ): Int? {
        for (step in 1..channels.size) {
            val index = Math.floorMod(currentIndex + offset * step, channels.size)
            if (channels[index].hasStream()) return index
        }
        return null
    }

    private fun TvChannel.hasStream(): Boolean = streamUrl.isNotBlank()

    private fun TvChannel.normalizedNumber(): String = normalizedChannelNumber(number)

    private fun normalizedChannelNumber(number: String): String =
        number.filter { it.isDigit() }.trimStart('0').ifBlank { "0" }

    private fun GuideData.lastPlayableChannel(): TvChannel? {
        val lastChannelId = playbackPrefs.getString(KEY_LAST_CHANNEL_ID, null)
        return channels.firstOrNull { it.id == lastChannelId && it.hasStream() }
            ?: channels.firstOrNull { it.hasStream() }
    }

    private fun saveLastChannel(channel: TvChannel) {
        playbackPrefs.edit().putString(KEY_LAST_CHANNEL_ID, channel.id).apply()
    }

    private data class GuideRange(
        val startSeconds: Long,
        val endSeconds: Long,
    )

    private data class ProgramMergeResult(
        val programsByChannel: Map<String, List<TvProgram>>,
        val startSeconds: Long,
        val endSeconds: Long,
        val changed: Boolean,
    )

    private fun GuideData.mergePrograms(
        incomingPrograms: Map<String, List<TvProgram>>,
        range: GuideRange,
    ): ProgramMergeResult {
        var programsChanged = false
        val mergedPrograms = channels.associate { channel ->
            val existing = programsByChannel[channel.id].orEmpty()
            val incoming = incomingPrograms[channel.id].orEmpty()
            val merged = (existing + incoming)
                .distinctBy { it.identityKey() }
                .sortedBy { it.startSeconds }

            if (merged.size != existing.size || !merged.hasSameProgramOrder(existing)) {
                programsChanged = true
            }
            channel.id to merged
        }

        val nextStart = minOf(guideStartSeconds, range.startSeconds)
        val nextEnd = maxOf(guideEndSeconds, range.endSeconds)
        val rangeChanged = nextStart != guideStartSeconds || nextEnd != guideEndSeconds

        return ProgramMergeResult(
            programsByChannel = mergedPrograms,
            startSeconds = nextStart,
            endSeconds = nextEnd,
            changed = programsChanged || rangeChanged,
        )
    }

    private fun List<TvProgram>.hasSameProgramOrder(other: List<TvProgram>): Boolean {
        if (size != other.size) return false
        return indices.all { index -> this[index].identityKey() == other[index].identityKey() }
    }

    private fun TvProgram.identityKey(): String =
        "$channelId:$startSeconds:$endSeconds:$title"

    private companion object {
        const val PREFS_NAME = "program_guide_playback"
        const val KEY_LAST_CHANNEL_ID = "last_channel_id"
    }
}
