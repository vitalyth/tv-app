import AsyncStorage from '@react-native-async-storage/async-storage';
import { LiveSourcePreferencesService } from '../src/services/liveSourcePreferences';

describe('LiveSourcePreferencesService', () => {
  it('persists a selected source independently for each channel', async () => {
    await LiveSourcePreferencesService.setSourceId('ch-11', 'ch-11b');
    await LiveSourcePreferencesService.setSourceId('ch-12', 'ch-12b2');

    await expect(
      LiveSourcePreferencesService.getSourceId('ch-11'),
    ).resolves.toBe('ch-11b');
    await expect(
      LiveSourcePreferencesService.getSourceId('ch-12'),
    ).resolves.toBe('ch-12b2');
  });

  it('reads a previously stored preference after service reuse', async () => {
    await AsyncStorage.setItem(
      '@tvapp_live_source_preferences_v1',
      JSON.stringify({ 'ch-13': 'ch-13b' }),
    );

    await expect(
      LiveSourcePreferencesService.getSourceId('ch-13'),
    ).resolves.toBe('ch-13b');
  });
});
