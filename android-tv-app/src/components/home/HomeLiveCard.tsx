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

export const HomeLiveCard: React.FC<HomeLiveCardProps> = React.memo(({
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
  }), [channel, currentProgram]);

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
});

export default HomeLiveCard;
