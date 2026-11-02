import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, Text} from 'react-native';
import {resolveLiveChannelStream, selectLiveChannelSource} from '../api/channels';
import {resolveVodStream} from '../api/vod';
import {t} from '../i18n';
import {MediaSurface} from './MediaSurface';
import type {MediaSurfaceProps} from './MediaSurface.types';
import type {MediaItem, MediaStream} from './player';

type Props = Omit<MediaSurfaceProps,
  'streamUrl' | 'streamType' | 'fallbackStreamUrl' | 'fallbackStreamType' | 'isLive'
> & {item: MediaItem; stream: MediaStream};

// Event-driven detection follows the v6 callbacks; these time budgets are our
// policy, not platform defaults. Buffering alone never proves a failed stream.
const RETRY_DELAYS_MS = [0, 1000, 3000, 7000, 15000];
const STALL_MS = 4000;
const EMPTY_BUFFER_MS = 2000;
const SOFT_RECOVERY_MS = 2000;
const STARTUP_MS = 10000;
const MAX_STARTUP_MS = 25000;
const STABLE_MS = 30000;

function createSession(position = 0) {
  return {
    position, previous: undefined as number | undefined,
    lastAdvance: Date.now(), stableSince: 0, attempts: 0, pending: false,
    startedAt: Date.now(), lastData: Date.now(), playableUntil: undefined as number | undefined,
    isPlaying: undefined as boolean | undefined, seekingUntil: 0,
    softAttemptedAt: undefined as number | undefined,
    liveEnd: undefined as number | undefined, liveStart: 0,
    exhausted: false, ended: false, progressed: false,
    bufferSince: 0, edgePending: false, edgeAttempts: 0, lastEdgeSeek: 0,
    resumeTarget: undefined as number | undefined,
  };
}

/** Keeps retries local to each decoder, without publishing every progress tick. */
export function RecoveringMediaSurface(props: Props) {
  const {item, stream, registerSeekHandler, ...surfaceProps} = props;
  const latest = useRef(props);
  latest.current = props;
  const [playback, setPlayback] = useState({
    stream, generation: 0, position: props.startPositionSeconds,
  });
  const [recovering, setRecovering] = useState(false);
  const session = useRef(createSession(props.startPositionSeconds));
  const request = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foreground = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const nativeSeek = useRef<((seconds: number) => void) | null>(null);
  const recover = useRef<() => void>(() => {});

  const cancelPending = useCallback(() => {
    request.current += 1;
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    if (resolveTimer.current !== null) clearTimeout(resolveTimer.current);
    retryTimer.current = resolveTimer.current = null;
    session.current.pending = false;
  }, []);

  useEffect(() => {
    if (!props.paused) return;
    cancelPending();
    session.current.lastAdvance = Date.now();
    session.current.softAttemptedAt = undefined;
    session.current.stableSince = session.current.bufferSince = 0;
    setRecovering(false);
  }, [props.paused, cancelPending]);

  useEffect(() => {
    session.current = createSession(latest.current.startPositionSeconds);
    setPlayback({stream: latest.current.stream, generation: 0, position: latest.current.startPositionSeconds});
    setRecovering(false);
    const allowed = () => foreground.current && !latest.current.paused;
    recover.current = () => {
      const state = session.current;
      if (!allowed() || state.pending || state.exhausted || state.ended) return;
      if (state.attempts >= RETRY_DELAYS_MS.length) {
        state.exhausted = true;
        setRecovering(false);
        latest.current.onError();
        return;
      }
      state.pending = true;
      state.stableSince = 0;
      const delay = RETRY_DELAYS_MS[state.attempts++];
      const token = ++request.current;
      setRecovering(true);
      retryTimer.current = setTimeout(async () => {
        retryTimer.current = null;
        try {
          const current = latest.current;
          const selected = current.item.kind === 'live' && current.stream.sourceId
            ? selectLiveChannelSource(current.item, current.stream.sourceId) ?? current.item
            : current.item;
          const resolution = current.item.kind === 'live'
            ? resolveLiveChannelStream(selected, {useSavedSource: false})
            : resolveVodStream(current.item);
          const refreshed = await Promise.race([
            resolution,
            new Promise<never>((_, reject) => {
              resolveTimer.current = setTimeout(() => reject(new Error('Playback renewal timed out')), 15000);
            }),
          ]);
          if (token !== request.current || !allowed()) return;
          if (resolveTimer.current !== null) clearTimeout(resolveTimer.current);
          resolveTimer.current = null;
          state.pending = false;
          state.lastAdvance = Date.now();
          state.startedAt = state.lastData = Date.now();
          state.playableUntil = undefined;
          state.isPlaying = undefined;
          state.seekingUntil = 0;
          state.softAttemptedAt = undefined;
          state.liveEnd = undefined;
          state.progressed = false;
          state.previous = undefined;
          state.bufferSince = 0;
          state.edgePending = current.item.kind === 'live';
          state.edgeAttempts = 0;
          state.lastEdgeSeek = 0;
          state.resumeTarget = current.item.kind === 'vod' ? state.position : undefined;
          setPlayback(previous => ({
            stream: refreshed, generation: previous.generation + 1,
            position: state.resumeTarget,
          }));
        } catch {
          if (token !== request.current) return;
          if (resolveTimer.current !== null) clearTimeout(resolveTimer.current);
          resolveTimer.current = null;
          state.pending = false;
          recover.current();
        }
      }, delay);
    };
    const interval = setInterval(() => {
      const state = session.current;
      const now = Date.now();
      if (!allowed()) {
        cancelPending();
        state.lastAdvance = state.startedAt = state.lastData = now;
        state.softAttemptedAt = undefined;
        state.stableSince = state.bufferSince = 0;
        return;
      }
      if (state.pending || state.exhausted || state.ended || now < state.seekingUntil) return;
      if (state.softAttemptedAt !== undefined) {
        if (now - state.softAttemptedAt >= SOFT_RECOVERY_MS && now - state.lastAdvance >= SOFT_RECOVERY_MS) {
          recover.current();
        }
        return;
      }
      if (!state.progressed) {
        // Growing buffered data is useful startup work, not a frozen player.
        if ((now - state.lastAdvance >= STARTUP_MS && now - state.lastData >= STARTUP_MS) ||
            now - state.startedAt >= MAX_STARTUP_MS) recover.current();
        return;
      }
      const emptyBuffer = state.playableUntil !== undefined && state.playableUntil - state.position <= 0.5;
      const confirmedBufferStall = state.bufferSince > 0 && state.isPlaying === false && emptyBuffer &&
        now - state.bufferSince >= EMPTY_BUFFER_MS && now - state.lastAdvance >= EMPTY_BUFFER_MS;
      if (confirmedBufferStall || now - state.lastAdvance >= STALL_MS) {
        // Seek without replacing the decoder first. Healthy short rebuffers get
        // a chance to finish; only renew/reload if this fails to advance playback.
        if (nativeSeek.current) {
          state.softAttemptedAt = now;
          setRecovering(true);
          if (latest.current.item.kind === 'live' && state.liveEnd !== undefined) {
            state.edgePending = true;
            state.edgeAttempts = 1;
            state.lastEdgeSeek = now;
            nativeSeek.current(Math.max(state.liveStart, state.liveEnd - 3));
          } else {
            nativeSeek.current(state.position);
          }
        } else {
          recover.current();
        }
      }
    }, 500);
    const subscription = AppState.addEventListener('change', value => {
      foreground.current = value === 'active';
      cancelPending();
      setRecovering(false);
      session.current.lastAdvance = session.current.startedAt = session.current.lastData = Date.now();
      session.current.softAttemptedAt = undefined;
      session.current.stableSince = session.current.bufferSince = 0;
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
      cancelPending();
    };
  }, [item.id, item.kind, stream.url, stream.sourceId, cancelPending]);

  const registerSeek = useCallback((seek: (seconds: number) => void) => {
    nativeSeek.current = seek;
    const release = registerSeekHandler?.(seconds => {
      cancelPending();
      const state = session.current;
      state.position = seconds;
      state.resumeTarget = undefined;
      state.edgePending = state.ended = false;
      state.lastAdvance = Date.now();
      state.seekingUntil = Date.now() + 5000;
      state.softAttemptedAt = undefined;
      state.stableSince = 0;
      setRecovering(false);
      seek(seconds);
    });
    return () => {
      if (nativeSeek.current === seek) nativeSeek.current = null;
      release?.();
    };
  }, [registerSeekHandler, cancelPending]);

  const reportProgress = useCallback<NonNullable<MediaSurfaceProps['onProgress']>>(data => {
    const state = session.current;
    const now = Date.now();
    const {currentTime, playableDuration, seekableDuration, seekableEnd, seekableStart = 0} = data;
    if (!Number.isFinite(currentTime) || currentTime < 0) return;
    // Ignore the new decoder's initial zero until the VOD resume seek lands.
    if (state.resumeTarget !== undefined && currentTime < state.resumeTarget - 2) return;
    state.resumeTarget = undefined;
    state.position = currentTime;
    if (Number.isFinite(playableDuration) && playableDuration >= 0) {
      if (state.playableUntil === undefined || playableDuration > state.playableUntil + 0.1) state.lastData = now;
      state.playableUntil = playableDuration;
    }
    const hasLiveRange = typeof seekableEnd === 'number' && Number.isFinite(seekableEnd) && seekableEnd > seekableStart;
    if (hasLiveRange) {
      state.liveEnd = seekableEnd;
      state.liveStart = seekableStart;
    }
    if (state.edgePending && nativeSeek.current && hasLiveRange) {
      if (seekableEnd! - currentTime <= 6 && currentTime <= seekableEnd! + 1) {
        state.edgePending = false;
      } else if (now - state.lastEdgeSeek >= 2000) {
        if (state.edgeAttempts >= 3) {
          recover.current();
        } else {
          state.edgeAttempts += 1;
          state.lastEdgeSeek = now;
          nativeSeek.current(Math.max(seekableStart, seekableEnd! - 3));
        }
      }
    }
    if (state.previous !== undefined && Math.abs(currentTime - state.previous) > 0.1) {
      if (now - state.lastAdvance >= STALL_MS) state.stableSince = 0;
      state.lastAdvance = now;
      state.progressed = true;
      // Some live sources expose no DVR range. A fresh decoder starts at the
      // source default; still verify/seek the edge if a range becomes available.
      if (!state.edgePending || !hasLiveRange) {
        if (state.pending) cancelPending();
        state.softAttemptedAt = undefined;
        setRecovering(false);
        state.stableSince ||= now;
        if (now - state.stableSince >= STABLE_MS) state.attempts = 0;
      }
    }
    state.previous = currentTime;
    if (latest.current.item.kind === 'vod' && Number.isFinite(seekableDuration) && seekableDuration > 0) {
      state.ended = currentTime >= seekableDuration - 0.75;
    }
    latest.current.onProgress?.(data);
  }, [cancelPending]);

  const reportError = useCallback(() => recover.current(), []);
  const reportBuffer = useCallback((buffering: boolean) => {
    session.current.bufferSince = buffering ? session.current.bufferSince || Date.now() : 0;
    latest.current.onBuffer?.(buffering);
  }, []);
  const reportPlaybackState = useCallback<NonNullable<MediaSurfaceProps['onPlaybackStateChanged']>>(state => {
    session.current.isPlaying = state.isPlaying;
    // ExoPlayer can emit isPlaying=true with isSeeking=true for the final seek
    // event. Do not leave recovery disabled after that event.
    if (state.isPlaying) session.current.seekingUntil = 0;
    else if (state.isSeeking) session.current.seekingUntil = Date.now() + 5000;
    latest.current.onPlaybackStateChanged?.(state);
  }, []);
  const reportEnd = useCallback(() => {
    if (latest.current.item.kind === 'live') recover.current();
    else {
      session.current.ended = true;
      cancelPending();
      setRecovering(false);
    }
    latest.current.onEnd?.();
  }, [cancelPending]);

  return <>
    <MediaSurface
      {...surfaceProps}
      key={`${playback.generation}:${playback.stream.url}`}
      streamUrl={playback.stream.url}
      streamType={playback.stream.type}
      fallbackStreamUrl={playback.stream.fallbackUrl}
      fallbackStreamType={playback.stream.fallbackType}
      isLive={item.kind === 'live'}
      startPositionSeconds={playback.position}
      registerSeekHandler={registerSeek}
      onError={reportError}
      onBuffer={reportBuffer}
      onPlaybackStateChanged={reportPlaybackState}
      onEnd={reportEnd}
      onProgress={reportProgress}
    />
    {recovering ? <Text pointerEvents="none" style={styles.notice}>{t('playerReconnecting')}</Text> : null}
  </>;
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute', bottom: 24, alignSelf: 'center', color: '#fff',
    backgroundColor: 'rgba(7,17,28,0.9)', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8, fontSize: 15,
  },
});
