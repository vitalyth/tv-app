import React, { useMemo } from 'react';
import { TvProgramCard, TvCardProgramData } from '../common/TvProgramCard';
import { VodRecentItem } from '../../types/vod';

interface HomeContinueCardProps {
  item: VodRecentItem;
  hasTVPreferredFocus?: boolean;
  hasPreferredFocus?: boolean;
  focusNonce?: number;
  isFirstCard?: boolean;
  isLastCard?: boolean;
  onPress: () => void;
  onFocus: () => void;
}

export const HomeContinueCard: React.FC<HomeContinueCardProps> = React.memo(({
  item,
  hasTVPreferredFocus = false,
  hasPreferredFocus = false,
  focusNonce = 0,
  isFirstCard = false,
  isLastCard = false,
  onPress,
  onFocus,
}) => {
  const cardData: TvCardProgramData = useMemo(() => {
    const rawItem = item as any;
    const pos = rawItem.positionMs;
    const dur = rawItem.durationMs;
    const pct = rawItem.progressPercentage;
    const hasProgress = (pct !== undefined && pct > 0) || (Boolean(pos) && pos > 1000);
    const progressVal = hasProgress
      ? ((pct !== undefined && pct > 0) ? pct : (dur && dur > 0 ? pos / dur : 0.1))
      : undefined;

    return {
      title: item.title,
      subtitle: item.seriesTitle || null,
      imageUrl: item.imageUrl,
      channelLogoUrl: item.channelLogo,
      badgeType: 'vod',
      progress: progressVal,
    };
  }, [item]);

  return (
    <TvProgramCard
      program={cardData}
      width={238}
      height={164}
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

export default HomeContinueCard;
