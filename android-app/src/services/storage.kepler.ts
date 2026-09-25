import * as ReactNative from 'react-native';

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

interface KeplerAsyncStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

const keplerStorage = (ReactNative as unknown as { AsyncStorage?: KeplerAsyncStorage }).AsyncStorage;

export const appStorage: StorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (keplerStorage) {
      return keplerStorage.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (keplerStorage) {
      await keplerStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (keplerStorage) {
      await keplerStorage.removeItem(key);
    }
  },
};

export default appStorage;

