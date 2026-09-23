import type { ReactElement } from 'react';

export interface MediaCarouselProps<ItemT> {
  id: string;
  items: readonly ItemT[];
  itemWidth: number;
  height: number;
  preferredFocus?: boolean;
  keyExtractor: (item: ItemT, index: number) => string;
  renderItem: (item: ItemT, index: number) => ReactElement;
}
