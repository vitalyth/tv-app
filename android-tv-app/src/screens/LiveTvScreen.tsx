import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import { TvChannel, TvProgram, GuideData, AppDestination } from '../types/guide';
import { api } from '../services/api';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import HeroActions from '../components/hero/HeroActions';
import EpgGrid from '../components/livetv/EpgGrid';
import { TvFocusable } from '../components/common/TvFocusable';

interface LiveTvScreenProps {
  onPlayFullscreen: (channel: TvChannel, program?: TvProgram | null) => void;
  focusNonce?: number;
  onRequestSideNavFocus?: (dest: AppDestination) => void;
  isSideNavActive?: boolean;
  activeChannelId?: string | null;
}

export const LiveTvScreen: React.FC<LiveTvScreenProps> = ({
  onPlayFullscreen,
  focusNonce = 0,
  onRequestSideNavFocus,
  isSideNavActive = false,
  activeChannelId,
}) => {
  const cachedGuide = api.getCachedGuideData();
  const [guideData, setGuideData] = useState<GuideData | null>(cachedGuide);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialTargetCh =
    cachedGuide && cachedGuide.channels.length > 0
      ? (activeChannelId && cachedGuide.channels.find((c) => c.id === activeChannelId)) || cachedGuide.channels[0]
      : null;

  const [selectedChannel, setSelectedChannel] = useState<TvChannel | null>(initialTargetCh);
  const [selectedProgram, setSelectedProgram] = useState<TvProgram | null>(initialTargetCh?.currentProgram || null);
  const [playingChannel, setPlayingChannel] = useState<TvChannel | null>(initialTargetCh);
  const [isMuted, setIsMuted] = useState(false);

  // Focus management
  const [cardFocusNonce, setCardFocusNonce] = useState(cachedGuide ? 1 : 0);
  const [heroFocusNonce, setHeroFocusNonce] = useState(0);
  const [heroFocusButton, setHeroFocusButton] = useState<'fullscreen' | 'mute' | null>(null);

  const focusedChannelIndexRef = useRef(0);
  const focusedColumnRef = useRef<'channel' | 'program'>('channel');
  const isHeroFocusedRef = useRef(false);
  const pendingFocusRef = useRef(false);
  const prevFocusNonceRef = useRef(focusNonce);
  const lastNavTimeRef = useRef(0);
  const isSideNavActiveRef = useRef(isSideNavActive);
  isSideNavActiveRef.current = isSideNavActive;

  const loadGuide = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getGuideData();
      setGuideData(data);
      if (data.channels.length > 0) {
        const targetCh =
          (activeChannelId && data.channels.find((c) => c.id === activeChannelId)) ||
          data.channels[0];
        const initialIdx = data.channels.findIndex((c) => c.id === targetCh.id);
        if (initialIdx !== -1) {
          focusedChannelIndexRef.current = initialIdx;
        }
        setSelectedChannel(targetCh);
        setPlayingChannel(targetCh);
        setSelectedProgram(targetCh.currentProgram || null);
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת לוח שידורים');
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setCardFocusNonce(Date.now());
      }, 150);
    }
  }, [activeChannelId]);

  useEffect(() => {
    loadGuide();
  }, [loadGuide]);

  // Handle focusNonce from parent (e.g., returning from fullscreen player, SideNavRail or destination select)
  useEffect(() => {
    if (focusNonce > 0 && focusNonce !== prevFocusNonceRef.current) {
      prevFocusNonceRef.current = focusNonce;
      if (guideData && guideData.channels.length > 0) {
        isHeroFocusedRef.current = false;
        setHeroFocusButton(null);
        setHeroFocusNonce(0);

        if (activeChannelId) {
          const idx = guideData.channels.findIndex((c) => c.id === activeChannelId);
          if (idx !== -1) {
            focusedChannelIndexRef.current = idx;
            const ch = guideData.channels[idx];
            setSelectedChannel(ch);
            setPlayingChannel(ch);
            const progs = guideData.programsByChannel[ch.id] || [];
            setSelectedProgram(ch.currentProgram || progs[0] || null);
            setCardFocusNonce(focusNonce);
            return;
          }
        }

        setCardFocusNonce(focusNonce);
      } else {
        pendingFocusRef.current = true;
      }
    }
  }, [focusNonce, guideData, activeChannelId]);

  // Remote key listeners for LiveTv navigation
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onTvRemoteKey',
      ({ keyCode, repeatCount = 0 }: { keyCode: number; repeatCount?: number }) => {
        if (isSideNavActiveRef.current) return;
        const now = Date.now();
        const timeSince = now - lastNavTimeRef.current;

        // DPAD_UP = 19
        if (keyCode === 19) {
          if (repeatCount > 0 && timeSince < 220) return;
          if (timeSince < 140) return;
          lastNavTimeRef.current = now;

          if (isHeroFocusedRef.current) return;

          if (focusedChannelIndexRef.current === 0) {
            // From top channel row, move UP to Hero Actions
            isHeroFocusedRef.current = true;
            setHeroFocusButton('fullscreen');
            setHeroFocusNonce(Date.now());
            setCardFocusNonce(0);
          }
        }
        // DPAD_DOWN = 20
        else if (keyCode === 20) {
          if (repeatCount > 0 && timeSince < 220) return;
          if (timeSince < 140) return;
          lastNavTimeRef.current = now;

          if (isHeroFocusedRef.current) {
            // From Hero, move DOWN back to channels
            isHeroFocusedRef.current = false;
            setHeroFocusButton(null);
            setHeroFocusNonce(0);
            setCardFocusNonce(Date.now());
          }
        }
        // DPAD_LEFT = 21
        else if (keyCode === 21) {
          if (isHeroFocusedRef.current) {
            if (heroFocusButton === 'fullscreen') {
              onRequestSideNavFocus?.(AppDestination.LIVE_TV);
            }
          } else if (focusedColumnRef.current === 'channel') {
            // On channel header card (leftmost column), LEFT opens side nav rail
            onRequestSideNavFocus?.(AppDestination.LIVE_TV);
          }
        }
      }
    );

    return () => sub.remove();
  }, [heroFocusButton, onRequestSideNavFocus]);

  const handleChannelPress = (channel: TvChannel) => {
    setSelectedChannel(channel);
    setPlayingChannel(channel);
    const programs = guideData?.programsByChannel[channel.id] || [];
    setSelectedProgram(channel.currentProgram || programs[0] || null);
  };

  const handleChannelFocus = (channel: TvChannel) => {
    setSelectedChannel(channel);
    const programs = guideData?.programsByChannel[channel.id] || [];
    setSelectedProgram(channel.currentProgram || programs[0] || null);
  };

  const handleProgramPress = (channel: TvChannel, program: TvProgram) => {
    setSelectedChannel(channel);
    setSelectedProgram(program);
    onPlayFullscreen(channel, program);
  };

  const handleProgramFocus = (channel: TvChannel, program: TvProgram) => {
    setSelectedChannel(channel);
    setSelectedProgram(program);
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleOpenFullscreen = () => {
    const ch = playingChannel || selectedChannel;
    if (ch) {
      onPlayFullscreen(ch, selectedProgram);
    }
  };

  // Active info for Hero
  const displayChannel = selectedChannel || playingChannel;
  const heroTitle = selectedProgram?.title || displayChannel?.name || 'שידור חי';
  const heroSubtitle = displayChannel?.name;
  const heroDescription = selectedProgram?.description || '';
  const heroTimeRange = selectedProgram?.timeRange;
  const heroChannelLogoUrl = displayChannel?.logoUrl;
  const backgroundImageUrl = selectedProgram?.imageUrl || displayChannel?.logoUrl;
  const activeStreamUrl = playingChannel?.streamUrl || displayChannel?.streamUrl;

  if (isLoading || !guideData || guideData.channels.length === 0) {
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

  return (
    <TvScreenLayout
      backgroundImageUrl={backgroundImageUrl}
      heroTitle={heroTitle}
      heroSubtitle={heroSubtitle}
      heroDescription={heroDescription}
      heroTimeRange={heroTimeRange}
      heroChannelLogoUrl={heroChannelLogoUrl}
      isLive={true}
      videoStreamUrl={activeStreamUrl || undefined}
      isVideoPaused={false}
      isMuted={isMuted}
      actions={
        <HeroActions
          onOpenFullScreen={handleOpenFullscreen}
          onToggleMute={handleToggleMute}
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
      <View style={styles.content}>
        <EpgGrid
          data={guideData}
          isLoading={isLoading}
          error={error}
          selectedChannel={selectedChannel}
          playingChannel={playingChannel}
          onChannelPress={handleChannelPress}
          onChannelFocus={(ch, idx) => {
            focusedChannelIndexRef.current = idx;
            focusedColumnRef.current = 'channel';
            handleChannelFocus(ch);
          }}
          onProgramPress={handleProgramPress}
          onProgramFocus={(ch, prog) => {
            focusedColumnRef.current = 'program';
            handleProgramFocus(ch, prog);
          }}
          targetFocusIndex={focusedChannelIndexRef.current}
          cardFocusNonce={cardFocusNonce}
        />
      </View>
    </TvScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
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

export default LiveTvScreen;

