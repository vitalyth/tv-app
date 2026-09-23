import {useCallback, useMemo} from 'react';
import {Carousel, type CarouselRenderInfo} from '@amazon-devices/vega-carousel';
import type {MediaCarouselProps} from '../../../../src/components/MediaCarousel.types';

const ITEM_SPACING = 18;
const ITEM_STYLE = {
  itemPadding: ITEM_SPACING,
  itemPaddingOnSelection: ITEM_SPACING,
  pressedItemScaleFactor: 0.98,
  selectedItemScaleFactor: 1,
};
const ANIMATION_DURATION = {
  itemPressedDuration: 0.08,
  itemScrollDuration: 0.12,
  containerSelectionChangeDuration: 0.12,
};

export function VegaMediaCarousel<ItemT>({
  id,
  items,
  height,
  preferredFocus = false,
  keyExtractor,
  renderItem,
}: MediaCarouselProps<ItemT>) {
  const getItem = useCallback((index: number) => items[index], [items]);
  const getItemCount = useCallback(() => items.length, [items]);
  const getItemKey = useCallback(
    ({item, index}: CarouselRenderInfo<ItemT>) => keyExtractor(item, index),
    [keyExtractor],
  );
  const dataAdapter = useMemo(
    () => ({
      getItem,
      getItemCount,
      getItemKey,
      notifyDataError: () => false,
    }),
    [getItem, getItemCount, getItemKey],
  );
  const containerStyle = useMemo(() => ({height}), [height]);

  if (items.length === 0) {
    return null;
  }

  return (
    <Carousel<ItemT>
      dataAdapter={dataAdapter}
      renderItem={({item, index}) => renderItem(item, index)}
      testID={id}
      uniqueId={id}
      orientation="horizontal"
      renderedItemsCount={Math.min(8, items.length)}
      numOffsetItems={Math.min(2, Math.max(0, items.length - 1))}
      hasPreferredFocus={preferredFocus}
      initialStartIndex={0}
      trapSelectionOnOrientation={false}
      containerStyle={containerStyle}
      itemStyle={ITEM_STYLE}
      animationDuration={ANIMATION_DURATION}
      selectionStrategy="natural"
    />
  );
}
