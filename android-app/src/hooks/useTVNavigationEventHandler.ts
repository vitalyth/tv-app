import {useCallback, useEffect, useRef} from 'react';
import {AppState, useTVEventHandler, type HWEvent} from 'react-native';

const HOLD_REPEAT_MS = 120;
const heldDirections: Record<string, string> = {
  longUp: 'up',
  longDown: 'down',
  longLeft: 'left',
  longRight: 'right',
};

/** Share held-arrow behavior across screens with manual remote navigation. */
export function useTVNavigationEventHandler(handler: (event: HWEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  const held = useRef<HWEvent | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    held.current = null;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        stop();
      }
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [stop]);

  useTVEventHandler(event => {
    const direction = heldDirections[event.eventType];
    if (event.eventKeyAction === 1) {
      if ((direction || event.eventType) === held.current?.eventType) {
        stop();
      }
      latest.current(direction ? {...event, eventType: direction} : event);
      return;
    }
    if (direction) {
      const normalized = {...event, eventType: direction};
      // Android sends one long-arrow DOWN followed by UP, rather than repeats.
      // Runtimes without key actions already deliver their own repeat events.
      if (event.eventKeyAction === 0) {
        if (held.current?.eventType === direction) {
          return;
        }
        stop();
        held.current = normalized;
        timer.current = setInterval(() => {
          if (held.current) {
            latest.current(held.current);
          }
        }, HOLD_REPEAT_MS);
      }
      latest.current(normalized);
      return;
    }
    if (!['focus', 'blur'].includes(event.eventType)) {
      stop();
    }
    latest.current(event);
  });
}
