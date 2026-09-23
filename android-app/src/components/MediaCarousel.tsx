import { FlatList, StyleSheet, View } from 'react-native';
import type { MediaCarouselProps } from './MediaCarousel.types';

const ITEM_SPACING = 18;

export function MediaCarousel<ItemT>({
  id,
  items,
  itemWidth,
  height,
  keyExtractor,
  renderItem,
}: MediaCarouselProps<ItemT>) {
  const itemExtent = itemWidth + ITEM_SPACING;

  return (
    <FlatList
      horizontal
      data={items as ItemT[]}
      testID={id}
      keyExtractor={keyExtractor}
      renderItem={({ item, index }) => renderItem(item, index)}
      ItemSeparatorComponent={ItemSeparator}
      contentContainerStyle={styles.content}
      style={[styles.list, { height }]}
      showsHorizontalScrollIndicator={false}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={5}
      getItemLayout={(_, index) => ({
        index,
        length: itemExtent,
        offset: itemExtent * index,
      })}
    />
  );
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { flexGrow: 0, marginHorizontal: -6, overflow: 'visible' },
  content: { paddingHorizontal: 6, paddingVertical: 6 },
  separator: { width: ITEM_SPACING },
});
