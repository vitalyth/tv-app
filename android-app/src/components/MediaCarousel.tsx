import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TVFocusGuideView,
  type FocusDestination,
  type ListRenderItemInfo,
  type View as ViewType,
} from 'react-native';
import type {
  MediaCarouselHandle,
  MediaCarouselProps,
} from './MediaCarousel.types';
import { MEDIA_CAROUSEL_ITEM_SPACING } from '../theme/layout';

const FOCUS_GUTTER = 4;

interface CarouselCellProps<ItemT> {
  active: boolean;
  height: number;
  index: number;
  item: ItemT;
  itemWidth: number;
  preferredFocus: boolean;
  leftFocusDestination?: FocusDestination;
  renderItem: MediaCarouselProps<ItemT>['renderItem'];
  setItemRef: (index: number, node: ViewType | null) => void;
  onFocus: (item: ItemT, index: number) => void;
  onSelect?: (item: ItemT, index: number) => void;
}

const CarouselCell = memo(function CarouselCellView<ItemT>({
  active,
  height,
  index,
  item,
  itemWidth,
  preferredFocus,
  leftFocusDestination,
  renderItem,
  setItemRef,
  onFocus,
  onSelect,
}: CarouselCellProps<ItemT>) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      ref={node => setItemRef(index, node)}
      accessibilityRole="button"
      focusable
      hasTVPreferredFocus={preferredFocus}
      nextFocusLeft={index === 0 ? leftFocusDestination : undefined}
      scrollSnapAlign="start"
      onBlur={() => setFocused(false)}
      onFocus={() => {
        setFocused(true);
        onFocus(item, index);
      }}
      onPress={() => onSelect?.(item, index)}
      style={{
        width: itemWidth,
        height: height - FOCUS_GUTTER * 2,
        marginRight: MEDIA_CAROUSEL_ITEM_SPACING,
      }}
    >
      {renderItem(item, index, active && focused)}
    </Pressable>
  );
}) as <ItemT>(props: CarouselCellProps<ItemT>) => React.ReactElement;

function MediaCarouselInner<ItemT>(
  {
    id,
    items,
    itemWidth,
    height,
    leadingInset = 0,
    trailingInset = 0,
    active = true,
    preferredFocus = false,
    leftFocusDestination,
    trapFocusUp = false,
    trapFocusDown = false,
    keyExtractor,
    renderItem,
    onItemFocus,
    onItemSelect,
  }: MediaCarouselProps<ItemT>,
  ref: Ref<MediaCarouselHandle>,
) {
  const [hasPreferredFocus, setHasPreferredFocus] = useState(preferredFocus);
  const listRef = useRef<FlatList<ItemT>>(null);
  const itemRefs = useRef<Record<number, ViewType | null>>({});
  const selectedIndexRef = useRef(0);
  const itemExtent = itemWidth + MEDIA_CAROUSEL_ITEM_SPACING;

  const setItemRef = useCallback((index: number, node: ViewType | null) => {
    if (node) {
      itemRefs.current[index] = node;
    } else {
      delete itemRefs.current[index];
    }
  }, []);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      listRef.current?.scrollToOffset({
        animated,
        offset: index * itemExtent,
      });
    },
    [itemExtent],
  );

  const handleItemFocus = useCallback(
    (item: ItemT, index: number) => {
      if (hasPreferredFocus) {
        setHasPreferredFocus(false);
      }
      selectedIndexRef.current = index;
      onItemFocus?.(item, index);
    },
    [hasPreferredFocus, onItemFocus],
  );

  const focusIndex = useCallback(
    (requestedIndex: number) => {
      const index = Math.max(0, Math.min(requestedIndex, items.length - 1));
      selectedIndexRef.current = index;
      scrollToIndex(index, false);
      requestAnimationFrame(() => itemRefs.current[index]?.requestTVFocus?.());
    },
    [items.length, scrollToIndex],
  );

  useImperativeHandle(ref, () => ({
    focusIndex,
    restoreFocus() {
      focusIndex(selectedIndexRef.current);
    },
  }));

  const renderListItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ItemT>) => (
      <CarouselCell
        active={active}
        height={height}
        index={index}
        item={item}
        itemWidth={itemWidth}
        preferredFocus={hasPreferredFocus && index === 0}
        leftFocusDestination={leftFocusDestination}
        renderItem={renderItem}
        setItemRef={setItemRef}
        onFocus={handleItemFocus}
        onSelect={onItemSelect}
      />
    ),
    [
      active,
      handleItemFocus,
      hasPreferredFocus,
      height,
      itemWidth,
      leftFocusDestination,
      onItemSelect,
      renderItem,
      setItemRef,
    ],
  );

  return (
    <TVFocusGuideView
      trapFocusRight
      trapFocusUp={trapFocusUp}
      trapFocusDown={trapFocusDown}
      style={{ height }}
    >
      <FlatList<ItemT>
        ref={listRef}
        horizontal
        data={items as ItemT[]}
        testID={id}
        keyExtractor={keyExtractor}
        renderItem={renderListItem}
        contentContainerStyle={{
          paddingLeft: leadingInset + FOCUS_GUTTER,
          paddingRight: trailingInset + FOCUS_GUTTER,
          paddingVertical: FOCUS_GUTTER,
        }}
        style={[
          styles.list,
          {
            height,
            marginLeft: -leadingInset,
            marginRight: -trailingInset,
          },
        ]}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="item"
        snapToItemPadding={leadingInset + FOCUS_GUTTER}
        scrollAnimationEnabled
        initialNumToRender={8}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={16}
        windowSize={3}
        removeClippedSubviews={false}
        getItemLayout={(_, index) => ({
          index,
          length: itemExtent,
          offset: itemExtent * index,
        })}
      />
    </TVFocusGuideView>
  );
}

export const MediaCarousel = forwardRef(MediaCarouselInner) as <ItemT>(
  props: MediaCarouselProps<ItemT> & { ref?: Ref<MediaCarouselHandle> },
) => React.ReactElement;

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
});
