import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export const appStorage: StorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ?? null;
    } catch (error) {
      console.warn('[storage.kepler] getItem error:', error);
      throw error;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.warn('[storage.kepler] setItem error:', error);
      throw error;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.warn('[storage.kepler] removeItem error:', error);
      throw error;
    }
  },
};

export default appStorage;
