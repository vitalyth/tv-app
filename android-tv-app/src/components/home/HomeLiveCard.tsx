import React, { useMemo } from 'react';
import { TvProgramCard, TvCardProgramData } from '../common/TvProgramCard';
import { TvChannel, TvProgram } from '../../types/guide';

interface HomeLiveCardProps {
  channel: TvChannel;
  program?: TvProgram | null;
  hasTVPreferredFocus?: boolean;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  isFirstCard?: boolean;
  isLastCard?: boolean;
  onPress: () => void;
  onFocus: () => void;
}

const HomeLiveCardComponent: React.FC<HomeLiveCardProps> = ({
  channel,
  program,
  hasTVPreferredFocus = false,
  hasPreferredFocus = false,
  focusNonce = 0,
  isFirstCard = false,
  isLastCard = false,
  onPress,
  onFocus,
}) => {
  const currentProgram = program || channel.currentProgram;

  const cardData: TvCardProgramData = useMemo(() => ({
    title: currentProgram?.title || 'שידור חי',
    subtitle: channel.name,
    description: currentProgram?.description || currentProgram?.timeRange || null,
    imageUrl: currentProgram?.imageUrl || channel.logoUrl,
    channelLogoUrl: channel.logoUrl,
    badgeType: 'live',
  }), [channel.name, channel.logoUrl, currentProgram?.title, currentProgram?.description, currentProgram?.timeRange, currentProgram?.imageUrl]);

  return (
    <TvProgramCard
      program={cardData}
      width={238}
      height={154}
      hasTVPreferredFocus={hasTVPreferredFocus || hasPreferredFocus}
      focusNonce={focusNonce}
      lockUp={true}
      lockDown={true}
      lockLeft={isFirstCard}
      lockRight={isLastCard}
      onPress={onPress}
      onFocus={onFocus}
    />
  );
};

export const HomeLiveCard = React.memo(HomeLiveCardComponent, (prev, next) => {
  return (
    prev.channel.id === next.channel.id &&
    prev.channel.name === next.channel.name &&
    prev.channel.logoUrl === next.channel.logoUrl &&
    prev.channel.currentProgram?.id === next.channel.currentProgram?.id &&
    prev.channel.currentProgram?.title === next.channel.currentProgram?.title &&
    prev.hasPreferredFocus === next.hasPreferredFocus &&
    prev.hasTVPreferredFocus === next.hasTVPreferredFocus &&
    prev.focusNonce === next.focusNonce &&
    prev.isFirstCard === next.isFirstCard &&
    prev.isLastCard === next.isLastCard
  );
});

export default HomeLiveCard;
