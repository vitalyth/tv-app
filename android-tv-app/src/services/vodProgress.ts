import { NativeModules } from 'react-native';
import { VodRecentItem } from '../types/vod';

const { VodProgressModule } = NativeModules;

export interface ContinueWatchingItem extends VodRecentItem {
  positionMs: number;
  durationMs: number;
  progressPercentage: number;
  lastWatchedAt: number;
}

export const vodProgressService = {
  saveProgress: async (
    episodeId: string,
    seriesId: string | null | undefined,
    positionMs: number,
    durationMs: number,
    item?: VodRecentItem | null
  ): Promise<boolean> => {
    if (!VodProgressModule?.saveProgress || !episodeId) return false;
    try {
      const itemJson = item ? JSON.stringify(item) : null;
      return await VodProgressModule.saveProgress(
        episodeId,
        seriesId || null,
        positionMs,
        durationMs,
        itemJson
      );
    } catch {
      return false;
    }
  },

  getContinueWatching: async (): Promise<ContinueWatchingItem[]> => {
    if (!VodProgressModule?.getContinueWatching) return [];
    try {
      const res = await VodProgressModule.getContinueWatching();
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  },

  getProgress: async (
    episodeId: string
  ): Promise<{ positionMs: number; durationMs: number; isCompleted: boolean } | null> => {
    if (!VodProgressModule?.getProgress || !episodeId) return null;
    try {
      return await VodProgressModule.getProgress(episodeId);
    } catch {
      return null;
    }
  },

  saveRecentChannel: async (channelId: string): Promise<boolean> => {
    if (!VodProgressModule?.saveRecentChannel || !channelId) return false;
    try {
      return await VodProgressModule.saveRecentChannel(channelId);
    } catch {
      return false;
    }
  },

  getRecentChannels: async (): Promise<string[]> => {
    if (!VodProgressModule?.getRecentChannels) return [];
    try {
      const res = await VodProgressModule.getRecentChannels();
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  },

  saveMutePreference: async (isMuted: boolean): Promise<boolean> => {
    if (!VodProgressModule?.saveMutePreference) return false;
    try {
      return await VodProgressModule.saveMutePreference(isMuted);
    } catch {
      return false;
    }
  },

  getMutePreference: async (): Promise<boolean> => {
    if (!VodProgressModule?.getMutePreference) return false;
    try {
      const res = await VodProgressModule.getMutePreference();
      return typeof res === 'boolean' ? res : false;
    } catch {
      return false;
    }
  },

  requestViewFocus: async (viewTag: number): Promise<boolean> => {
    if (!VodProgressModule?.requestViewFocus || !viewTag) return false;
    try {
      return await VodProgressModule.requestViewFocus(viewTag);
    } catch {
      return false;
    }
  },

  setFocusBoundaries: async (
    viewTag: number,
    boundaries: {
      lockUp?: boolean;
      lockDown?: boolean;
      lockLeft?: boolean;
      lockRight?: boolean;
    }
  ): Promise<boolean> => {
    if (!VodProgressModule?.setFocusBoundaries || !viewTag) return false;
    try {
      return await VodProgressModule.setFocusBoundaries(
        viewTag,
        !!boundaries.lockUp,
        !!boundaries.lockDown,
        !!boundaries.lockLeft,
        !!boundaries.lockRight
      );
    } catch {
      return false;
    }
  },
};

export default vodProgressService;
