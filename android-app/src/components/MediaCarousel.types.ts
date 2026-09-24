import type { ReactElement } from 'react';
import type { FocusDestination } from 'react-native';

export interface MediaCarouselHandle {
  focusIndex: (index: number) => void;
  restoreFocus: () => void;
}

export interface MediaCarouselProps<ItemT> {
  id: string;
  items: readonly ItemT[];
  itemWidth: number;
  height: number;
  leadingInset?: number;
  trailingInset?: number;
  active?: boolean;
  preferredFocus?: boolean;
  leftFocusDestination?: FocusDestination;
  trapFocusUp?: boolean;
  trapFocusDown?: boolean;
  keyExtractor: (item: ItemT, index: number) => string;
  renderItem: (item: ItemT, index: number, isFocused: boolean) => ReactElement;
  onItemFocus?: (item: ItemT, index: number) => void;
  onItemSelect?: (item: ItemT, index: number) => void;
}
