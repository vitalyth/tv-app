import { AppState } from 'react-native';
import { getProgramGuide } from '../api/programGuide';
import { currentTimeMs, refreshMediaItemEpg } from '../api/channels';
import { liveEpgStore } from '../state/liveEpg';

/** One foreground refresh loop for every screen, player and channel drawer. */
export function startLiveEpgSync() {
  liveEpgStore.active = true;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRemoteRefresh: number | undefined;
  let inFlight = false;
  const refresh = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      await getProgramGuide();
    } catch {
      // Retain the last usable schedule during a temporary network failure.
    } finally {
      lastRemoteRefresh = Date.now();
      inFlight = false;
    }
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (stopped || AppState.currentState === 'background') return;
    const now = currentTimeMs();
    let delay = 30000;
    for (const channel of liveEpgStore.getSnapshot().channels) {
      const programs = (
        channel.sourcePayload as
          | { programs?: { start: number; end: number }[] }
          | undefined
      )?.programs;
      for (const program of programs ?? []) {
        for (const value of [program.start, program.end]) {
          const boundary = value < 10000000000 ? value * 1000 : value;
          if (boundary > now) delay = Math.min(delay, boundary - now);
        }
      }
    }
    timer = setTimeout(tick, Math.max(50, delay));
  };
  const tick = () => {
    if (stopped || AppState.currentState === 'background') return;
    const { channels } = liveEpgStore.getSnapshot();
    if (channels.length)
      liveEpgStore.publish(channels.map(refreshMediaItemEpg));
    if (
      lastRemoteRefresh === undefined ||
      Date.now() - lastRemoteRefresh >= 60000
    )
      refresh();
    schedule();
  };
  // A newly fetched schedule can have a boundary earlier than the current timer.
  const unsubscribe = liveEpgStore.subscribe(schedule);
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') {
      refresh();
      tick();
    } else if (state === 'background') {
      if (timer !== undefined) clearTimeout(timer);
    }
  });
  tick();
  return () => {
    stopped = true;
    liveEpgStore.active = false;
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe();
    subscription.remove();
  };
}
