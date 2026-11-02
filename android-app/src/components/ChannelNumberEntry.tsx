import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  BackHandler,
  StyleSheet,
  Text,
  TextInput,
  View,
  useTVEventHandler,
} from 'react-native';
import {getPlayableLiveChannels} from '../api/channels';
import {t} from '../i18n';
import type {MediaItem} from '../media/player';

const ENTRY_DELAY_MS = 1500;
const MAX_DIGITS = 4;

/** Global remote-number entry; text fields keep their normal keyboard input. */
export function ChannelNumberEntry({onTune}: {onTune: (item: MediaItem) => void}) {
  const [entry, setEntry] = useState<{number: string; message?: string} | null>(null);
  const digits = useRef('');
  const typing = useRef(false);
  const heldDigit = useRef<string | null>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tune = useRef(onTune);
  tune.current = onTune;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    request.current += 1;
    digits.current = '';
    typing.current = false;
    heldDigit.current = null;
    setEntry(null);
  }, [clearTimer]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') cancel();
    });
    return () => {
      clearTimer();
      request.current += 1;
      appState.remove();
    };
  }, [cancel, clearTimer]);

  const active = entry !== null;
  useEffect(() => {
    if (!active) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => back.remove();
  }, [active, cancel]);

  useTVEventHandler(event => {
    const digit = /^\d$/.test(event.eventType) ? event.eventType : null;
    if (event.eventKeyAction === 1) {
      if (heldDigit.current === digit) heldDigit.current = null;
      return;
    }
    if (!digit) {
      if (digits.current && !['focus', 'blur'].includes(event.eventType)) cancel();
      return;
    }
    if (TextInput.State.currentlyFocusedInput()) return;
    if (event.eventKeyAction === 0 && heldDigit.current === digit) return;
    heldDigit.current = event.eventKeyAction === 0 ? digit : null;
    clearTimer();
    const number = typing.current && digits.current.length < MAX_DIGITS
      ? digits.current + digit
      : digit;
    digits.current = number;
    typing.current = true;
    const currentRequest = ++request.current;
    setEntry({number});
    timer.current = setTimeout(async () => {
      timer.current = null;
      typing.current = false;
      setEntry({number, message: t('channelNumberLoading')});
      try {
        const channels = await getPlayableLiveChannels();
        if (currentRequest !== request.current) return;
        if (TextInput.State.currentlyFocusedInput()) {
          cancel();
          return;
        }
        const target = channels.find(channel =>
          /^\d+$/.test(channel.channelNumber ?? '') &&
          Number(channel.channelNumber) === Number(number),
        );
        if (target) {
          cancel();
          tune.current(target);
          return;
        }
        setEntry({number, message: t('channelNumberNotFound')});
      } catch {
        if (currentRequest !== request.current) return;
        setEntry({number, message: t('playerChannelUnavailable')});
      }
      timer.current = setTimeout(cancel, 2500);
    }, ENTRY_DELAY_MS);
  });

  if (!entry) return null;
  return (
    <View pointerEvents="none" style={styles.overlay} accessibilityLiveRegion="polite">
      <Text style={styles.label}>{t('channelNumberLabel')}</Text>
      <Text style={styles.number}>{entry.number}</Text>
      {entry.message ? <Text style={styles.message}>{entry.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 32, right: 32, zIndex: 100,
    minWidth: 110, maxWidth: 300, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, backgroundColor: 'rgba(7, 17, 28, 0.94)',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  label: {color: 'rgba(255, 255, 255, 0.65)', fontSize: 14},
  number: {color: '#ffffff', fontSize: 36, fontWeight: '600', textAlign: 'center'},
  message: {color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, marginTop: 4},
});
