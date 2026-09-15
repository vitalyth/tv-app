import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { TvChannel, TvProgram, GuideData } from '../types/guide';
import { api } from '../services/api';
import TvScreenLayout from '../components/layout/TvScreenLayout';
import HeroActions from '../components/hero/HeroActions';
import EpgGrid from '../components/livetv/EpgGrid';

interface LiveTvScreenProps {
  onPlayFullscreen: (channel: TvChannel, program?: TvProgram | null) => void;
}

export const LiveTvScreen: React.FC<LiveTvScreenProps> = ({
  onPlayFullscreen,
}) => {
  const [guideData, setGuideData] = useState<GuideData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedChannel, setSelectedChannel] = useState<TvChannel | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<TvProgram | null>(null);
  const [playingChannel, setPlayingChannel] = useState<TvChannel | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const loadGuide = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getGuideData();
      setGuideData(data);
      if (data.channels.length > 0) {
        const firstCh = data.channels[0];
        setSelectedChannel(firstCh);
        setPlayingChannel(firstCh);
        setSelectedProgram(firstCh.currentProgram || null);
      }
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת לוח שידורים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGuide();
  }, [loadGuide]);

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
          onChannelFocus={handleChannelFocus}
          onProgramPress={handleProgramPress}
          onProgramFocus={handleProgramFocus}
        />
      </View>
    </TvScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});

export default LiveTvScreen;

