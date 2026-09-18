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

const HomeContinueCardComponent: React.FC<HomeContinueCardProps> = ({
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
  }, [item.title, item.seriesTitle, item.imageUrl, item.channelLogo, (item as any).positionMs, (item as any).durationMs, (item as any).progressPercentage]);

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
};

export const HomeContinueCard = React.memo(HomeContinueCardComponent, (prev, next) => {
  return (
    prev.item.episodeId === next.item.episodeId &&
    prev.item.title === next.item.title &&
    prev.item.imageUrl === next.item.imageUrl &&
    (prev.item as any).positionMs === (next.item as any).positionMs &&
    prev.hasPreferredFocus === next.hasPreferredFocus &&
    prev.hasTVPreferredFocus === next.hasTVPreferredFocus &&
    prev.focusNonce === next.focusNonce &&
    prev.isFirstCard === next.isFirstCard &&
    prev.isLastCard === next.isLastCard
  );
});

export default HomeContinueCard;
