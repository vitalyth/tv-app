/* eslint-disable @amazon-devices/kepler/sdl-package-version-check-imports -- Vega provides this system module. */
import {
  AudioManager,
  AudioSystemSound,
} from '@amazon-devices/keplerscript-audio-lib';
/* eslint-enable @amazon-devices/kepler/sdl-package-version-check-imports */

const MINIMUM_SOUND_INTERVAL_MS = 45;
let lastPlayedAt = 0;

export function playFocusSound() {
  const now = Date.now();
  if (now - lastPlayedAt < MINIMUM_SOUND_INTERVAL_MS) {
    return;
  }
  lastPlayedAt = now;
  AudioManager.playSystemSoundAsync(AudioSystemSound.SELECT).catch(
    () => undefined,
  );
}
