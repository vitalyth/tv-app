import React, { useMemo } from 'react';
import { TvProgramCard, TvCardProgramData } from '../common/TvProgramCard';
import { VodEpisode } from '../../types/vod';

interface EpisodeCardProps {
  episode: VodEpisode;
  onPress: (episode: VodEpisode) => void;
  onFocus?: (episode: VodEpisode) => void;
  hasPreferredFocus?: boolean;
  isFirstCard?: boolean;
  isLastCard?: boolean;
}

export const EpisodeCard: React.FC<EpisodeCardProps> = React.memo(({
  episode,
  onPress,
  onFocus,
  hasPreferredFocus = false,
  isFirstCard = false,
  isLastCard = false,
}) => {
  const cardData: TvCardProgramData = useMemo(() => ({
    title: episode.title,
    description: episode.description || null,
    imageUrl: episode.imageUrl,
    badgeType: 'vod',
    progress: episode.progress,
  }), [episode]);

  return (
    <TvProgramCard
      program={cardData}
      width={238}
      height={154}
      hasTVPreferredFocus={hasPreferredFocus}
      lockUp={false}
      lockDown={true}
      lockLeft={isFirstCard}
      lockRight={isLastCard}
      onPress={() => onPress(episode)}
      onFocus={() => onFocus?.(episode)}
    />
  );
});

export default EpisodeCard;
