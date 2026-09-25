/* eslint-env jest */
const mockStore = {};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) {
    delete mockStore[k];
  }
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async key => mockStore[key] ?? null),
    setItem: jest.fn(async (key, value) => {
      mockStore[key] = value;
    }),
    removeItem: jest.fn(async key => {
      delete mockStore[key];
    }),
    clear: jest.fn(async () => {
      for (const k of Object.keys(mockStore)) {
        delete mockStore[k];
      }
    }),
  },
}));
