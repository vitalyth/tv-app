import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type Ref,
} from 'react';
import {
  findNodeHandle,
  StyleSheet,
  TouchableOpacity,
  View,
  type View as ViewType,
} from 'react-native';
import {
  Carousel,
  type CarouselDataChange,
  CarouselDataChangeType,
  type CarouselRef,
  type CarouselRenderInfo,
} from '@amazon-devices/vega-carousel';
import type {
  MediaCarouselHandle,
  MediaCarouselProps,
} from '../../../../src/components/MediaCarousel.types';
import {MEDIA_CAROUSEL_ITEM_SPACING} from '../../../../src/theme/layout';

const ITEM_STYLE = {
  itemPadding: MEDIA_CAROUSEL_ITEM_SPACING,
  itemPaddingOnSelection: MEDIA_CAROUSEL_ITEM_SPACING,
  pressedItemScaleFactor: 0.98,
  selectedItemScaleFactor: 1,
};
const ANIMATION_DURATION = {
  itemPressedDuration: 0.08,
  itemScrollDuration: 0.06,
  containerSelectionChangeDuration: 0.06,
};
const FOCUS_VERTICAL_SPACE = 8;
type FocusableView = ViewType & {requestTVFocus?: () => void};

function VegaMediaCarouselInner<ItemT>(
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
    keyExtractor,
    renderItem,
    onItemFocus,
    onItemSelect,
  }: MediaCarouselProps<ItemT>,
  ref: Ref<MediaCarouselHandle>,
) {
  const carouselRef = useRef<CarouselRef<string>>(null);
  const itemRefs = useRef<Record<number, FocusableView | null>>({});
  const selectedIndexRef = useRef(0);

  const notifyItemFocus = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || selectedIndexRef.current === index) {
        return;
      }
      selectedIndexRef.current = index;
      onItemFocus?.(item, index);
    },
    [items, onItemFocus],
  );

  const focusIndex = useCallback(
    (requestedIndex: number) => {
      const index = Math.max(0, Math.min(requestedIndex, items.length - 1));
      selectedIndexRef.current = index;
      carouselRef.current?.scrollTo(index, false);
      requestAnimationFrame(() => itemRefs.current[index]?.requestTVFocus?.());
    },
    [items.length],
  );

  useImperativeHandle(ref, () => ({
    focusIndex,
    getSelectedIndex() {
      return selectedIndexRef.current;
    },
    restoreFocus() {
      focusIndex(selectedIndexRef.current);
    },
  }));

  const dataChangeCallbackRef = useRef<
    ((changes: CarouselDataChange[]) => void) | null
  >(null);

  const registerDataChangeCallback = useCallback(
    (cb: (changes: CarouselDataChange[]) => void) => {
      dataChangeCallbackRef.current = cb;
    },
    [],
  );

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
      registerDataChangeCallback,
    }),
    [getItem, getItemCount, getItemKey, registerDataChangeCallback],
  );

  const prevItemsRef = useRef(items);
  useEffect(() => {
    const prev = prevItemsRef.current;
    if (prev !== items) {
      prevItemsRef.current = items;
      const changes: CarouselDataChange[] = [];
      const maxLen = Math.max(prev.length, items.length);
      for (let i = 0; i < maxLen; i++) {
        const prevItem = prev[i];
        const nextItem = items[i];
        if (!prevItem && nextItem) {
          changes.push({
            type: CarouselDataChangeType.ADD,
            position: i,
            count: 1,
          });
        } else if (prevItem && !nextItem) {
          changes.push({
            type: CarouselDataChangeType.REMOVE,
            position: i,
            count: 1,
          });
        } else if (prevItem && nextItem) {
          const p = prevItem as Record<string, unknown>;
          const n = nextItem as Record<string, unknown>;
          const contentChanged =
            p.title !== n.title ||
            p.timeRange !== n.timeRange ||
            p.progressPercentage !== n.progressPercentage ||
            p.imageUrl !== n.imageUrl ||
            p.backdropUrl !== n.backdropUrl ||
            p.description !== n.description;

          if (contentChanged) {
            changes.push({
              type: CarouselDataChangeType.UPDATE,
              position: i,
              count: 1,
            });
          }
        }
      }
      if (changes.length > 0) {
        dataChangeCallbackRef.current?.(changes);
        carouselRef.current?.notifyDataChange(changes, false);
      }
    }
  }, [items, keyExtractor]);
  const wrapperStyle = useMemo(
    () => ({
      height: height - FOCUS_VERTICAL_SPACE,
      marginLeft: -leadingInset,
      marginRight: -trailingInset,
    }),
    [height, leadingInset, trailingInset],
  );
  const leftFocusHandle = leftFocusDestination
    ? findNodeHandle(leftFocusDestination)
    : undefined;

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={wrapperStyle}>
      <Carousel<ItemT>
        ref={carouselRef}
        dataAdapter={dataAdapter}
        renderItem={({item, index}) => (
          <TouchableOpacity
            ref={node => {
              itemRefs.current[index] = node;
            }}
            activeOpacity={1}
            accessibilityRole="button"
            nextFocusLeft={
              index === 0 ? leftFocusHandle ?? undefined : undefined
            }
            style={{
              width: itemWidth,
              height: height - FOCUS_VERTICAL_SPACE,
            }}
            onFocus={() => {
              selectedIndexRef.current = index;
              onItemFocus?.(item, index);
            }}
            onPress={() => onItemSelect?.(item, index)}>
            {renderItem(item, index, false)}
          </TouchableOpacity>
        )}
        testID={id}
        uniqueId={id}
        orientation="horizontal"
        renderedItemsCount={Math.min(8, items.length)}
        numOffsetItems={Math.min(2, Math.max(0, items.length - 1))}
        navigableScrollAreaMargin={leadingInset}
        hasPreferredFocus={preferredFocus}
        initialStartIndex={0}
        trapSelectionOnOrientation={false}
        containerStyle={styles.carousel}
        itemStyle={ITEM_STYLE}
        animationDuration={ANIMATION_DURATION}
        selectionStrategy="anchored"
        onSelectionChanged={({selectedIndex: nextIndex}) =>
          notifyItemFocus(nextIndex)
        }
      />
      {active ? (
        <View
          pointerEvents="none"
          style={[
            styles.focusBorder,
            {
              left: leadingInset - 3,
              width: itemWidth + 6,
              height: height - FOCUS_VERTICAL_SPACE + 6,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export const VegaMediaCarousel = forwardRef(VegaMediaCarouselInner) as <ItemT>(
  props: MediaCarouselProps<ItemT> & {ref?: Ref<MediaCarouselHandle>},
) => ReactElement;

const styles = StyleSheet.create({
  carousel: {height: '100%'},
  focusBorder: {
    position: 'absolute',
    top: -3,
    borderColor: '#ffffff',
    borderRadius: 9,
    borderWidth: 3,
  },
});
