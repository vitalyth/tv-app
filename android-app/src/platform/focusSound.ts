import { NativeModules } from 'react-native';

const MINIMUM_SOUND_INTERVAL_MS = 45;
let lastPlayedAt = 0;

interface FocusSoundNativeModule {
  play(): void;
}

const focusSound = NativeModules.FocusSound as
  | FocusSoundNativeModule
  | undefined;

export function playFocusSound() {
  const now = Date.now();
  if (now - lastPlayedAt < MINIMUM_SOUND_INTERVAL_MS) {
    return;
  }
  lastPlayedAt = now;
  focusSound?.play();
}
