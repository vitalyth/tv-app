import {
  WatchProgressService,
  isItemCompleted,
  resetWatchProgressMemoryStore,
} from '../src/services/watchProgress';

describe('WatchProgressService', () => {
  beforeEach(() => {
    resetWatchProgressMemoryStore();
  });

  describe('isItemCompleted', () => {
    it('returns false for negative or zero duration', () => {
      expect(isItemCompleted(0, 0)).toBe(false);
      expect(isItemCompleted(100, 0)).toBe(false);
    });

    it('returns false when below 92% and more than 25 seconds remaining', () => {
      // 50% of 100 seconds
      expect(isItemCompleted(50_000, 100_000)).toBe(false);
      // 91% of 1,000 seconds (remaining: 90 seconds > 25 seconds)
      expect(isItemCompleted(910_000, 1_000_000)).toBe(false);
    });

    it('returns true when at or above 92%', () => {
      expect(isItemCompleted(920_000, 1_000_000)).toBe(true);
      expect(isItemCompleted(950_000, 1_000_000)).toBe(true);
    });

    it('returns true when remaining time is 25 seconds or less', () => {
      // 60 second video, 36 seconds watched (remaining 24 seconds <= 25 seconds)
      expect(isItemCompleted(36_000, 60_000)).toBe(true);
      // remaining exactly 25 seconds
      expect(isItemCompleted(35_000, 60_000)).toBe(true);
    });
  });

  describe('CRUD operations', () => {
    it('returns empty array when no items exist', async () => {
      const items = await WatchProgressService.getContinueWatching();
      expect(items).toEqual([]);
    });

    it('saves in-progress item and retrieves it', async () => {
      const saved = await WatchProgressService.saveProgress({
        episodeId: 'ep-1',
        title: 'Episode 1',
        seriesTitle: 'Series A',
        channelName: 'Kan 11',
        imageUrl: 'https://example.com/ep1.jpg',
        positionMs: 60_000,
        durationMs: 300_000,
      });

      expect(saved).toBe(true);

      const list = await WatchProgressService.getContinueWatching();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: 'cw-ep-1',
        episodeId: 'ep-1',
        title: 'Episode 1',
        seriesTitle: 'Series A',
        progressPercentage: 20,
      });
    });

    it('does not include completed items in getContinueWatching', async () => {
      // Save item that is already 95% watched
      await WatchProgressService.saveProgress({
        episodeId: 'ep-completed',
        title: 'Finished Episode',
        positionMs: 950_000,
        durationMs: 1_000_000,
      });

      const list = await WatchProgressService.getContinueWatching();
      expect(list).toHaveLength(0);
    });

    it('sorts multiple items by lastWatchedAt descending', async () => {
      await WatchProgressService.saveProgress({
        episodeId: 'ep-1',
        title: 'First Watched',
        positionMs: 10_000,
        durationMs: 100_000,
      });

      // Small delay to ensure timestamp difference
      await new Promise(r => setTimeout(() => r(undefined), 10));

      await WatchProgressService.saveProgress({
        episodeId: 'ep-2',
        title: 'Second Watched',
        positionMs: 20_000,
        durationMs: 100_000,
      });

      const list = await WatchProgressService.getContinueWatching();
      expect(list).toHaveLength(2);
      expect(list[0].episodeId).toBe('ep-2');
      expect(list[1].episodeId).toBe('ep-1');
    });

    it('can remove progress for an episode', async () => {
      await WatchProgressService.saveProgress({
        episodeId: 'ep-1',
        title: 'Episode 1',
        positionMs: 30_000,
        durationMs: 100_000,
      });

      expect(await WatchProgressService.getContinueWatching()).toHaveLength(1);

      await WatchProgressService.removeProgress('ep-1');
      expect(await WatchProgressService.getContinueWatching()).toHaveLength(0);
    });
  });
});
