import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Text, DeviceEventEmitter } from 'react-native';
import { AppDestination, TvChannel, TvProgram } from '../types/guide';
import { VodRecentItem } from '../types/vod';
import { api, resolveImageUrl } from '../services/api';
import { vodProgressService, ContinueWatchingItem } from '../services/vodProgress';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import HeroActions from '../components/hero/HeroActions';
import HomeRow from '../components/home/HomeRow';
import HomeLiveCard from '../components/home/HomeLiveCard';
import HomeContinueCard from '../components/home/HomeContinueCard';
import ShortcutCard from '../components/home/ShortcutCard';
import { TvFocusable } from '../components/common/TvFocusable';

interface HomeScreenProps {
  initialChannels?: TvChannel[];
  initialContinueWatching?: ContinueWatchingItem[];
  initialNewVod?: VodRecentItem[];
  onPlayChannel: (channel: TvChannel, program?: TvProgram | null) => void;
  onPlayRecentVod: (item: VodRecentItem) => void;
  onNavigateDestination?: (destination: AppDestination) => void;
  onRequestSideNavFocus?: (destination: AppDestination) => void;
  recentChannelIds?: string[];
  activeStreamUrl?: string | null;
  isVideoReady?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onMediaChange?: (streamUrl: string | null, channelId?: string | null) => void;
  focusNonce?: number;
  activeChannelId?: string | null;
  isPlayerActive?: boolean;
  isSideNavActive?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = React.memo(({
  initialChannels = [],
  initialContinueWatching = [],
  initialNewVod = [],
  onPlayChannel,
  onPlayRecentVod,
  onNavigateDestination,
  onRequestSideNavFocus,
  recentChannelIds = [],
  activeStreamUrl,
  isVideoReady = false,
  isMuted = true,
  onToggleMute,
  onMediaChange,
  focusNonce = 0,
  activeChannelId,
  isPlayerActive = false,
  isSideNavActive = false,
}) => {
  const [channels, setChannels] = useState<TvChannel[]>(initialChannels);
  const [continueWatchingItems, setContinueWatchingItems] = useState<ContinueWatchingItem[]>(initialContinueWatching);
  const [newVodItems, setNewVodItems] = useState<VodRecentItem[]>(initialNewVod);
  const [loading, setLoading] = useState(initialChannels.length === 0);
  const [error, setError] = useState<string | null>(null);

  const [focusedChannel, setFocusedChannel] = useState<TvChannel | null>(
    (initialChannels && initialChannels[0]) || null
  );
  const [focusedRecent, setFocusedRecent] = useState<VodRecentItem | null>(null);
  const [showArtwork, setShowArtwork] = useState(!isVideoReady || !activeStreamUrl);
  const [hasHadInitialFocus, setHasHadInitialFocus] = useState(false);

  const [focusedLiveIndex, setFocusedLiveIndex] = useState(0);
  const [focusedChannelId, setFocusedChannelId] = useState<string | null>(
    (initialChannels && initialChannels[0]?.id) || null
  );
  const [focusedContinueIndex, setFocusedContinueIndex] = useState(0);
  const [focusedContinueId, setFocusedContinueId] = useState<string | null>(null);
  const [focusedNewVodIndex, setFocusedNewVodIndex] = useState(0);
  const [focusedNewVodId, setFocusedNewVodId] = useState<string | null>(null);
  const [focusedShortcutIndex, setFocusedShortcutIndex] = useState(0);

  // Hero Actions focus state (Fullscreen vs Mute button)
  const [heroFocusButton, setHeroFocusButton] = useState<'fullscreen' | 'mute' | null>(null);
  const [heroFocusNonce, setHeroFocusNonce] = useState(0);
  const isHeroFocusedRef = useRef(false);
  const initialFocusDoneRef = useRef(false);

  // Card programmatic focus target for D-pad navigation - targeted at Card 0 initially
  const [cardFocusTarget, setCardFocusTarget] = useState<{ row: number; index: number; nonce: number } | null>({
    row: 0,
    index: 0,
    nonce: 1,
  });
  const focusedIndicesRef = useRef({ row0: 0, row1: 0, row2: 0, row3: 0 });
  const prevFocusNonceRef = useRef(focusNonce);
  const lastVerticalNavTimeRef = useRef(0);
  const isSideNavActiveRef = useRef(isSideNavActive);
  isSideNavActiveRef.current = isSideNavActive;

  const initialRecentIdsRef = useRef<string[] | null>(null);
  if (initialRecentIdsRef.current === null && recentChannelIds.length > 0) {
    initialRecentIdsRef.current = recentChannelIds;
  }

  // Prioritize Live Channels: 10 total:
  // 1) Recently watched channels (frozen from session start so order is stable)
  // 2) Remaining channels in their natural guide order
  const displayLiveChannels = useMemo(() => {
    if (channels.length === 0) return [];
    const byId = new Map(channels.map((ch) => [ch.id, ch]));
    const effectiveRecent = initialRecentIdsRef.current || recentChannelIds;
    const recent = effectiveRecent
      .map((id) => byId.get(id))
      .filter((ch): ch is TvChannel => !!ch);

    const recentSet = new Set(recent.map((c) => c.id));
    const nonRecent = channels.filter((ch) => !recentSet.has(ch.id));

    const list = [...recent, ...nonRecent];
    if (activeChannelId && byId.has(activeChannelId)) {
      const activeCh = byId.get(activeChannelId)!;
      const idx = list.findIndex((c) => c.id === activeChannelId);
      if (idx > 9) {
        list.splice(idx, 1);
        list.splice(9, 0, activeCh);
      }
    }

    return list.slice(0, 10);
  }, [channels, recentChannelIds, activeChannelId]);

  // Limit New VOD to 10 latest items
  const displayNewVodItems = useMemo(() => {
    return newVodItems.slice(0, 10);
  }, [newVodItems]);

  const verticalScrollRef = useRef<ScrollView>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRowRef = useRef(0);
  const rowYPositions = useRef<Record<number, number>>({});

  const scrollToRow = useCallback((rowIndex: number) => {
    focusedRowRef.current = rowIndex;
    const fallbackY = rowIndex === 0 ? 0 : rowIndex === 1 ? 205 : rowIndex === 2 ? 415 : 625;
    const targetY = rowYPositions.current[rowIndex] ?? fallbackY;

    // Smoothly snap to section title directly below hero area in ONE single continuous motion
    verticalScrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
  }, []);

  // Restore focus to exact card and refresh continue watching when returning from fullscreen
  useEffect(() => {
    if (focusNonce > 0 && focusNonce !== prevFocusNonceRef.current) {
      prevFocusNonceRef.current = focusNonce;

      // Immediately refresh continue watching items with updated progress
      vodProgressService.getContinueWatching().then((items) => {
        if (items) {
          setContinueWatchingItems(items);
        }
      });

      // If returning with an active channel (e.g., switched channel in fullscreen player),
      // restore focus directly to that channel card in Row 0
      if (activeChannelId) {
        const activeIdx = displayLiveChannels.findIndex((c) => c.id === activeChannelId);
        if (activeIdx !== -1) {
          focusedRowRef.current = 0;
          focusedIndicesRef.current.row0 = activeIdx;
          setFocusedLiveIndex(activeIdx);
          const ch = displayLiveChannels[activeIdx];
          setFocusedChannel(ch);
          setFocusedChannelId(ch.id);
          setFocusedRecent(null);

          setCardFocusTarget({
            row: 0,
            index: activeIdx,
            nonce: Date.now(),
          });
          scrollToRow(0);
          return;
        }
      }

      const targetRow = focusedRowRef.current;
      let targetIdx = 0;

      if (targetRow === 0) {
        targetIdx = Math.min(focusedIndicesRef.current.row0, displayLiveChannels.length - 1);
        if (displayLiveChannels[targetIdx]) {
          setFocusedChannel(displayLiveChannels[targetIdx]);
          setFocusedChannelId(displayLiveChannels[targetIdx].id);
        }
      } else if (targetRow === 1 && continueWatchingItems.length > 0) {
        targetIdx = Math.min(focusedIndicesRef.current.row1, continueWatchingItems.length - 1);
      } else if (targetRow === (continueWatchingItems.length > 0 ? 2 : 1)) {
        targetIdx = Math.min(focusedIndicesRef.current.row2, displayNewVodItems.length - 1);
      } else {
        targetIdx = Math.min(focusedIndicesRef.current.row3, 6);
      }

      setCardFocusTarget({
        row: targetRow,
        index: Math.max(0, targetIdx),
        nonce: Date.now(),
      });
      scrollToRow(targetRow);
    }
  }, [
    focusNonce,
    activeChannelId,
    displayLiveChannels,
    continueWatchingItems.length,
    displayNewVodItems.length,
    scrollToRow,
  ]);

  const loadData = useCallback(async () => {
    setChannels((curr) => {
      if (curr.length === 0) {
        setLoading(true);
      }
      return curr;
    });
    setError(null);
    try {
      const [channelsRes, continueRes, newVodRes] = await Promise.allSettled([
        api.getLiveChannels(),
        vodProgressService.getContinueWatching(),
        api.getNewVodContent(),
      ]);
      const liveChannels = channelsRes.status === 'fulfilled' ? channelsRes.value : [];
      const continueList = continueRes.status === 'fulfilled' ? continueRes.value : [];
      const newVodList = newVodRes.status === 'fulfilled' ? newVodRes.value : [];

      if (liveChannels.length > 0) {
        setChannels(liveChannels);
        setFocusedChannelId((prev) => prev || liveChannels[0].id);
        setFocusedChannel((prev) => prev || liveChannels[0]);
      }
      setContinueWatchingItems(continueList);
      if (newVodList.length > 0) {
        setNewVodItems(newVodList);
      }

      if (liveChannels.length === 0 && channelsRes.status === 'rejected') {
        setError(channelsRes.reason?.message || 'שגיאה בטעינת נתונים');
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת נתונים');
    } finally {
      setTimeout(() => {
        setLoading(false);
        if (!initialFocusDoneRef.current) {
          setCardFocusTarget({ row: 0, index: 0, nonce: Date.now() });
        }
      }, 150);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic auto-update every 60 seconds (channels, continue watching, new vod)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [channelsRes, continueRes, newVodRes] = await Promise.allSettled([
          api.getLiveChannels(),
          vodProgressService.getContinueWatching(),
          api.getNewVodContent(),
        ]);
        if (channelsRes.status === 'fulfilled' && channelsRes.value.length > 0) {
          setChannels(channelsRes.value);
        }
        if (continueRes.status === 'fulfilled') {
          setContinueWatchingItems(continueRes.value);
        }
        if (newVodRes.status === 'fulfilled' && newVodRes.value.length > 0) {
          setNewVodItems(newVodRes.value);
        }
      } catch {}
    }, 60000);

    return () => {
      clearInterval(interval);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);


  // Once video is ready from the root player, hide artwork; otherwise keep artwork visible
  useEffect(() => {
    if (isVideoReady && activeStreamUrl) {
      setShowArtwork(false);
    } else {
      setShowArtwork(true);
    }
  }, [isVideoReady, activeStreamUrl]);

  // Synchronize focusedChannel with fresh guide data when channels update
  useEffect(() => {
    if (channels.length > 0) {
      const currentTargetId = focusedChannelId || activeChannelId;
      if (currentTargetId) {
        const fresh = channels.find((c) => c.id === currentTargetId);
        if (fresh) {
          setFocusedChannel(fresh);
        }
      }
    }
  }, [channels, focusedChannelId, activeChannelId]);

  // Channel focus handler: instant artwork, instant player teardown, preview timer before video plays
  const handleChannelFocus = useCallback((channel: TvChannel, index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedLiveIndex(index);
    focusedIndicesRef.current.row0 = index;
    setFocusedChannelId(channel.id);

    if (focusedRowRef.current !== 0) {
      scrollToRow(0);
    }

    setFocusedRecent(null);
    setFocusedChannel(channel);

    const isCurrentChannel =
      (focusedChannelId === channel.id || activeChannelId === channel.id) &&
      (Boolean(activeStreamUrl) || previewTimerRef.current !== null);

    if (isCurrentChannel) {
      if (isVideoReady) {
        setShowArtwork(false);
      }
      return;
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    // Immediately stop previous audio and video surface so no previous stream leaks
    onMediaChange?.(null, null);
    setShowArtwork(true);
    previewTimerRef.current = setTimeout(async () => {
      let stream = channel.streamUrl;
      if (!stream && channel.rawChannel) {
        const resolved = await api.getLiveChannelStream(channel.rawChannel);
        if (resolved) stream = resolved;
      }
      onMediaChange?.(stream, channel.id);
    }, 1500);
  }, [activeChannelId, activeStreamUrl, isVideoReady, onMediaChange, scrollToRow]);

  // Set initial focus & preview on first channel after data loads (ONCE)
  useEffect(() => {
    if (displayLiveChannels.length > 0 && !initialFocusDoneRef.current) {
      initialFocusDoneRef.current = true;
      const initialChannel =
        (activeChannelId && displayLiveChannels.find((c) => c.id === activeChannelId)) ||
        displayLiveChannels[0];

      const initialIdx = displayLiveChannels.findIndex((c) => c.id === initialChannel.id);
      const effectiveIdx = initialIdx !== -1 ? initialIdx : 0;

      setFocusedChannel(initialChannel);
      setFocusedChannelId(initialChannel.id);
      setFocusedLiveIndex(effectiveIdx);

      // Explicitly schedule card focus target with Date.now() nonce so Card 0 takes native Android focus
      setTimeout(() => {
        setCardFocusTarget({
          row: 0,
          index: effectiveIdx,
          nonce: Date.now(),
        });
      }, 50);

      handleChannelFocus(initialChannel, effectiveIdx);
    }
  }, [displayLiveChannels, activeChannelId, handleChannelFocus]);

  // Continue Watching focus handler: instant artwork, immediate player teardown, preview playback
  const handleContinueFocus = useCallback((item: ContinueWatchingItem, index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedContinueIndex(index);
    focusedIndicesRef.current.row1 = index;
    setFocusedContinueId(item.episodeId);

    if (focusedRowRef.current !== 1) {
      scrollToRow(1);
    }

    setFocusedRecent(item);
    setFocusedChannel(null);
    setFocusedChannelId(null);

    const isCurrentVod =
      !activeChannelId &&
      (focusedContinueId === item.episodeId || focusedRecent?.episodeId === item.episodeId) &&
      (Boolean(activeStreamUrl) || previewTimerRef.current !== null);

    if (isCurrentVod) {
      if (isVideoReady) {
        setShowArtwork(false);
      }
      return;
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    // Immediately stop previous audio and video surface so no previous stream leaks
    onMediaChange?.(null, null);
    setShowArtwork(true);
    previewTimerRef.current = setTimeout(async () => {
      const stream = await api.getVodEpisodeStream(item);
      if (stream) {
        onMediaChange?.(stream, null);
      }
    }, 1500);
  }, [activeStreamUrl, isVideoReady, activeChannelId, focusedContinueId, focusedRecent?.episodeId, onMediaChange, scrollToRow]);

  // New VOD focus handler: instant artwork, immediate player teardown, preview playback
  const handleNewVodFocus = useCallback((item: VodRecentItem, index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedNewVodIndex(index);
    const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;
    focusedIndicesRef.current.row2 = index;
    setFocusedNewVodId(item.episodeId);

    if (focusedRowRef.current !== newVodRow) {
      scrollToRow(newVodRow);
    }

    setFocusedRecent(item);
    setFocusedChannel(null);
    setFocusedChannelId(null);

    const isCurrentVod =
      !activeChannelId &&
      (focusedNewVodId === item.episodeId || focusedRecent?.episodeId === item.episodeId) &&
      (Boolean(activeStreamUrl) || previewTimerRef.current !== null);

    if (isCurrentVod) {
      if (isVideoReady) {
        setShowArtwork(false);
      }
      return;
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    // Immediately stop previous audio and video surface so no previous stream leaks
    onMediaChange?.(null, null);
    setShowArtwork(true);
    previewTimerRef.current = setTimeout(async () => {
      const stream = await api.getVodEpisodeStream(item);
      if (stream) {
        onMediaChange?.(stream, null);
      }
    }, 1500);
  }, [continueWatchingItems.length, activeStreamUrl, isVideoReady, activeChannelId, focusedRecent?.episodeId, onMediaChange, scrollToRow]);

  // Shortcuts focus handler: instant artwork, immediate player teardown
  const handleShortcutFocus = useCallback((index: number) => {
    setHasHadInitialFocus(true);
    isHeroFocusedRef.current = false;
    setHeroFocusButton(null);
    setFocusedShortcutIndex(index);
    const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;
    focusedIndicesRef.current.row3 = index;
    setFocusedChannelId(null);

    if (focusedRowRef.current !== shortcutRow) {
      scrollToRow(shortcutRow);
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    setShowArtwork(true);
    onMediaChange?.(null, null);
  }, [continueWatchingItems.length, onMediaChange, scrollToRow]);

  // TV remote key listener for D-pad navigation
  useEffect(() => {
    if (isPlayerActive) return;

    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode, repeatCount = 0 }: { keyCode: number; repeatCount?: number }) => {
        if (isPlayerActive || isSideNavActiveRef.current) return;

        const getCurrentColumn = (row: number): number => {
          if (row === 0) return focusedLiveIndex;
          if (continueWatchingItems.length > 0) {
            if (row === 1) return focusedContinueIndex;
            if (row === 2) return focusedNewVodIndex;
            return focusedShortcutIndex;
          } else {
            if (row === 1) return focusedNewVodIndex;
            return focusedShortcutIndex;
          }
        };

        const getRowMaxIndex = (row: number): number => {
          if (row === 0) return Math.max(0, displayLiveChannels.length - 1);
          if (continueWatchingItems.length > 0) {
            if (row === 1) return Math.max(0, continueWatchingItems.length - 1);
            if (row === 2) return Math.max(0, displayNewVodItems.length - 1);
            return 6;
          } else {
            if (row === 1) return Math.max(0, displayNewVodItems.length - 1);
            return 6;
          }
        };

        // DPAD_UP = 19
        if (keyCode === 19) {
          if (isHeroFocusedRef.current) {
            // Boundary at top: remain on Hero buttons
            return;
          }

          const now = Date.now();
          const timeSinceLastNav = now - lastVerticalNavTimeRef.current;
          if (repeatCount > 0 && timeSinceLastNav < 220) return;
          if (timeSinceLastNav < 140) return;
          lastVerticalNavTimeRef.current = now;

          const currentRow = focusedRowRef.current;
          if (currentRow === 0) {
            // Requirement 1: Moving UP from Row 0 moves UP to Fullscreen icon
            isHeroFocusedRef.current = true;
            setHeroFocusButton('fullscreen');
            setHeroFocusNonce(Date.now());
          } else {
            // Moving UP between sections: always stay in the same column directly above
            let targetRow = 0;
            if (currentRow === 1) {
              targetRow = 0;
            } else if (currentRow === 2) {
              targetRow = continueWatchingItems.length > 0 ? 1 : 0;
            } else if (currentRow === 3) {
              if (displayNewVodItems.length > 0) {
                targetRow = continueWatchingItems.length > 0 ? 2 : 1;
              } else if (continueWatchingItems.length > 0) {
                targetRow = 1;
              } else {
                targetRow = 0;
              }
            }

            focusedRowRef.current = targetRow;
            const currentCol = getCurrentColumn(currentRow);
            const targetIdx = Math.min(currentCol, getRowMaxIndex(targetRow));

            setCardFocusTarget({
              row: targetRow,
              index: Math.max(0, targetIdx),
              nonce: Date.now(),
            });
            scrollToRow(targetRow);
          }
        }
        // DPAD_DOWN = 20
        else if (keyCode === 20) {
          const now = Date.now();
          const timeSinceLastNav = now - lastVerticalNavTimeRef.current;
          if (repeatCount > 0 && timeSinceLastNav < 220) return;
          if (timeSinceLastNav < 140) return;
          lastVerticalNavTimeRef.current = now;

          if (isHeroFocusedRef.current) {
            // From Hero buttons, move DOWN back to Row 0 directly below
            isHeroFocusedRef.current = false;
            setHeroFocusButton(null);
            setHeroFocusNonce(0);
            focusedRowRef.current = 0;
            const targetIdx = Math.min(
              focusedLiveIndex,
              Math.max(0, displayLiveChannels.length - 1)
            );
            setCardFocusTarget({
              row: 0,
              index: Math.max(0, targetIdx),
              nonce: Date.now(),
            });
            scrollToRow(0);
            return;
          }

          // Moving DOWN between sections: always stay in the same column directly below
          const currentRow = focusedRowRef.current;
          const totalRows = continueWatchingItems.length > 0 ? 4 : 3;
          const maxRowIndex = totalRows - 1;

          if (currentRow >= maxRowIndex) {
            // Bottom boundary: stay on current row/card, do not jump
            const currentShortcutsIdx = Math.min(focusedShortcutIndex, 6);
            setCardFocusTarget({
              row: currentRow,
              index: currentShortcutsIdx,
              nonce: Date.now(),
            });
            return;
          }

          let targetRow = currentRow + 1;
          focusedRowRef.current = targetRow;
          const currentCol = getCurrentColumn(currentRow);
          const targetIdx = Math.min(currentCol, getRowMaxIndex(targetRow));

          setCardFocusTarget({
            row: targetRow,
            index: Math.max(0, targetIdx),
            nonce: Date.now(),
          });
          scrollToRow(targetRow);
        }
        // DPAD_RIGHT = 22
        else if (keyCode === 22) {
          // In hero buttons, native Android moves focus between Fullscreen and Mute naturally.
          // In rows, lockRight stops at the end. Check right boundary to prevent state desync:
          const currentRow = focusedRowRef.current;
          let isAtEnd = false;
          let maxIdx = 0;
          if (currentRow === 0) {
            maxIdx = displayLiveChannels.length - 1;
            isAtEnd = focusedLiveIndex >= maxIdx;
          } else if (currentRow === 1 && continueWatchingItems.length > 0) {
            maxIdx = continueWatchingItems.length - 1;
            isAtEnd = focusedContinueIndex >= maxIdx;
          } else if (currentRow === (continueWatchingItems.length > 0 ? 2 : 1)) {
            maxIdx = displayNewVodItems.length - 1;
            isAtEnd = focusedNewVodIndex >= maxIdx;
          } else {
            maxIdx = 6;
            isAtEnd = focusedShortcutIndex >= maxIdx;
          }

          if (isAtEnd) {
            return;
          }
        }
        // DPAD_LEFT = 21
        else if (keyCode === 21) {
          if (isHeroFocusedRef.current) {
            if (heroFocusButton === 'fullscreen') {
              // Left from fullscreen hero button moves to side navigation rail
              onRequestSideNavFocus?.(AppDestination.HOME);
            }
            return;
          }

          // Requirement 4: שמאלה עד הסוף צריך לעבור לתפריט בראשי לפרק שמסומן
          const currentRow = focusedRowRef.current;
          let isAtStart = false;

          if (currentRow === 0) {
            isAtStart = focusedLiveIndex === 0;
          } else if (currentRow === 1 && continueWatchingItems.length > 0) {
            isAtStart = focusedContinueIndex === 0;
          } else if (currentRow === (continueWatchingItems.length > 0 ? 2 : 1)) {
            isAtStart = focusedNewVodIndex === 0;
          } else {
            isAtStart = focusedShortcutIndex === 0;
          }

          if (isAtStart) {
            onRequestSideNavFocus?.(AppDestination.HOME);
          }
        }
      }
    );

    return () => {
      sub.remove();
    };
  }, [
    isPlayerActive,
    displayLiveChannels.length,
    continueWatchingItems.length,
    displayNewVodItems.length,
    focusedLiveIndex,
    focusedContinueIndex,
    focusedNewVodIndex,
    focusedShortcutIndex,
    heroFocusButton,
    onToggleMute,
    onRequestSideNavFocus,
    scrollToRow,
  ]);

  // Active item for Hero & Artwork
  const isRecentFocused = !!focusedRecent;
  const activeChannel = focusedChannel || (isRecentFocused ? null : displayLiveChannels[0]) || null;
  const activeProgram = activeChannel?.currentProgram;

  const heroTitle = isRecentFocused
    ? focusedRecent.title
    : activeProgram?.title || activeChannel?.name || 'טלוויזיה חיה';

  const heroSubtitle = isRecentFocused
    ? focusedRecent.seriesTitle || focusedRecent.channelName || (focusedRowRef.current === 1 ? 'המשך צפייה' : 'VOD')
    : activeChannel?.name || 'שידור חי';

  const heroDescription = isRecentFocused
    ? (focusedRecent.description || focusedRecent.rawItem?.description || focusedRecent.rawItem?.desc || '')
    : activeProgram?.description || '';

  const heroTimeRange = isRecentFocused ? undefined : activeProgram?.timeRange;

  const heroChannelLogoUrl = isRecentFocused
    ? focusedRecent.channelLogo
    : activeChannel?.logoUrl;

  const backgroundImageUrl = isRecentFocused
    ? (focusedRecent.imageUrl
        ? resolveImageUrl(focusedRecent.imageUrl, true)
        : focusedRecent.rawItem?.backdropUrl
        ? resolveImageUrl(focusedRecent.rawItem.backdropUrl, true)
        : null)
    : activeProgram?.backdropUrl || (activeProgram?.imageUrl ? resolveImageUrl(activeProgram.imageUrl, true) : activeChannel?.logoUrl);

  const handleOpenFullScreen = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (isRecentFocused && focusedRecent) {
      onPlayRecentVod?.(focusedRecent);
    } else if (activeChannel) {
      onPlayChannel(activeChannel, activeProgram);
    }
  }, [isRecentFocused, focusedRecent, activeChannel, activeProgram, onPlayRecentVod, onPlayChannel]);

  const handlePlayLiveCard = useCallback((channel: TvChannel) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onPlayChannel(channel, channel.currentProgram);
  }, [onPlayChannel]);

  const handlePlayVodCard = useCallback((item: VodRecentItem) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    onPlayRecentVod?.(item);
  }, [onPlayRecentVod]);

  if (loading || displayLiveChannels.length === 0) {
    return (
      <View style={styles.fullScreenLoading}>
        <TvFocusable
          hasTVPreferredFocus={true}
          focusable={true}
          scaleOnFocus={false}
          style={styles.loadingFocusContainer}
          focusedStyle={styles.loadingFocusContainer}
        >
          <ActivityIndicator size="large" color="#25D4DE" />
        </TvFocusable>
      </View>
    );
  }

  if (error && displayLiveChannels.length === 0) {
    return (
      <View style={styles.fullScreenLoading}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <TvScreenLayout
      backgroundImageUrl={backgroundImageUrl}
      heroTitle={heroTitle}
      heroSubtitle={heroSubtitle}
      heroDescription={heroDescription}
      heroTimeRange={heroTimeRange}
      heroChannelLogoUrl={heroChannelLogoUrl}
      isLive={!isRecentFocused}
      showVodBadge={isRecentFocused}
      hasExternalPlayer={true}
      showArtwork={showArtwork}
      isMuted={isMuted}
      actions={
        <HeroActions
          onOpenFullScreen={handleOpenFullScreen}
          onToggleMute={onToggleMute}
          isMuted={isMuted}
          focusTargetButton={heroFocusButton}
          focusNonce={heroFocusNonce}
          onFocusAction={(btn) => {
            isHeroFocusedRef.current = true;
            setHeroFocusButton(btn);
          }}
        />
      }
    >
      <ScrollView
        ref={verticalScrollRef}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        scrollsChildToFocus={false}
        contentContainerStyle={styles.rowsContent}
      >
          {/* Row 1: ערוצים חיים (Exactly 10 items, prioritized) */}
          {displayLiveChannels.length > 0 && (
            <HomeRow
              title="ערוצים חיים"
              onLayout={(e) => {
                rowYPositions.current[0] = e.nativeEvent.layout.y;
              }}
            >
              {displayLiveChannels.map((channel, index) => {
                const isTargeted = cardFocusTarget?.row === 0 && cardFocusTarget?.index === index;
                const isCard0 = index === 0;

                return (
                  <HomeLiveCard
                    key={channel.id}
                    channel={channel}
                    program={channel.currentProgram}
                    onPress={() => handlePlayLiveCard(channel)}
                    onFocus={() => handleChannelFocus(channel, index)}
                    focusNonce={isTargeted ? cardFocusTarget!.nonce : (!hasHadInitialFocus && isCard0 ? 1 : 0)}
                    isFirstCard={index === 0}
                    isLastCard={index === displayLiveChannels.length - 1}
                    hasPreferredFocus={
                      isTargeted || (!hasHadInitialFocus && isCard0)
                    }
                  />
                );
              })}
            </HomeRow>
          )}

          {/* Row 2: המשך צפייה (Watched & unfinished only) */}
          {continueWatchingItems.length > 0 && (
            <HomeRow
              title="המשך צפייה"
              onLayout={(e) => {
                rowYPositions.current[1] = e.nativeEvent.layout.y;
              }}
            >
              {continueWatchingItems.map((item, index) => {
                const isTargeted = cardFocusTarget?.row === 1 && cardFocusTarget?.index === index;

                return (
                  <HomeContinueCard
                    key={`continue_${item.episodeId}`}
                    item={item}
                    onPress={() => handlePlayVodCard(item)}
                    onFocus={() => handleContinueFocus(item, index)}
                    focusNonce={isTargeted ? cardFocusTarget!.nonce : 0}
                    isFirstCard={index === 0}
                    isLastCard={index === continueWatchingItems.length - 1}
                    hasPreferredFocus={isTargeted}
                  />
                );
              })}
            </HomeRow>
          )}

          {/* Row 3: תכני VOD חדשים (Top 10 latest) */}
          {displayNewVodItems.length > 0 && (
            <HomeRow
              title="תכני VOD חדשים"
              onLayout={(e) => {
                const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;
                rowYPositions.current[newVodRow] = e.nativeEvent.layout.y;
              }}
            >
              {displayNewVodItems.map((item, index) => {
                const newVodRow = continueWatchingItems.length > 0 ? 2 : 1;
                const isTargeted = cardFocusTarget?.row === newVodRow && cardFocusTarget?.index === index;

                return (
                  <HomeContinueCard
                    key={`new_vod_${item.episodeId}_${index}`}
                    item={item}
                    onPress={() => handlePlayVodCard(item)}
                    onFocus={() => handleNewVodFocus(item, index)}
                    focusNonce={isTargeted ? cardFocusTarget!.nonce : 0}
                    isFirstCard={index === 0}
                    isLastCard={index === displayNewVodItems.length - 1}
                    hasPreferredFocus={isTargeted}
                  />
                );
              })}
            </HomeRow>
          )}

          {/* Row 4: עוד לצפות (Shortcuts & Providers) */}
          <HomeRow
            title="עוד לצפות"
            onLayout={(e) => {
              const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;
              rowYPositions.current[shortcutRow] = e.nativeEvent.layout.y;
            }}
          >
            {(() => {
              const shortcutRow = continueWatchingItems.length > 0 ? 3 : 2;
              const isTargeted = (idx: number) => cardFocusTarget?.row === shortcutRow && cardFocusTarget?.index === idx;
              const getNonce = (idx: number) => isTargeted(idx) ? cardFocusTarget!.nonce : 0;
              const isPref = (idx: number) => isTargeted(idx);

              return (
                <>
                  <ShortcutCard
                    title="Live TV"
                    subtitle="כל הערוצים החיים"
                    iconName="live"
                    onPress={() => onNavigateDestination?.(AppDestination.LIVE_TV)}
                    onFocus={() => handleShortcutFocus(0)}
                    focusNonce={getNonce(0)}
                    isFirstCard={true}
                    isLastCard={false}
                    hasPreferredFocus={isPref(0)}
                  />
                  <ShortcutCard
                    title="VOD"
                    subtitle="ספריות הערוצים"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(1)}
                    focusNonce={getNonce(1)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(1)}
                  />
                  <ShortcutCard
                    title="כאן 11"
                    subtitle="VOD 11"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(2)}
                    focusNonce={getNonce(2)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(2)}
                  />
                  <ShortcutCard
                    title="קשת 12"
                    subtitle="VOD 12"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(3)}
                    focusNonce={getNonce(3)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(3)}
                  />
                  <ShortcutCard
                    title="רשת 13"
                    subtitle="VOD 13"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(4)}
                    focusNonce={getNonce(4)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(4)}
                  />
                  <ShortcutCard
                    title="עכשיו 14"
                    subtitle="VOD 14"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(5)}
                    focusNonce={getNonce(5)}
                    isFirstCard={false}
                    isLastCard={false}
                    hasPreferredFocus={isPref(5)}
                  />
                  <ShortcutCard
                    title="i24NEWS"
                    subtitle="VOD 15"
                    iconName="vod"
                    onPress={() => onNavigateDestination?.(AppDestination.VOD)}
                    onFocus={() => handleShortcutFocus(6)}
                    focusNonce={getNonce(6)}
                    isFirstCard={false}
                    isLastCard={true}
                    hasPreferredFocus={isPref(6)}
                  />
                </>
              );
            })()}
          </HomeRow>
        </ScrollView>
    </TvScreenLayout>
  );
});

const styles = StyleSheet.create({
  rowsContent: {
    paddingBottom: 160,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  errorText: {
    color: '#F04438',
    fontSize: 16,
    textAlign: 'center',
  },
  fullScreenLoading: {
    flex: 1,
    backgroundColor: '#080A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingFocusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});

export default HomeScreen;
