import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { VodSeries } from '../../types/vod';
import VodSeriesCard from './VodSeriesCard';

interface VodSeriesGridProps {
  series: VodSeries[];
  isLoading: boolean;
  error?: string | null;
  onSeriesPress: (series: VodSeries) => void;
  onSeriesFocus: (series: VodSeries) => void;
}

const NUM_COLUMNS = 5;

export const VodSeriesGrid: React.FC<VodSeriesGridProps> = React.memo(({
  series,
  isLoading,
  error,
  onSeriesPress,
  onSeriesFocus,
}) => {
  const renderItem = useCallback(({ item, index }: { item: VodSeries; index: number }) => (
    <View style={styles.cardContainer}>
      <VodSeriesCard
        series={item}
        onPress={onSeriesPress}
        onFocus={onSeriesFocus}
        hasPreferredFocus={index === 0}
      />
    </View>
  ), [onSeriesPress, onSeriesFocus]);

  const keyExtractor = useCallback((item: VodSeries) => item.id, []);

  if (isLoading && series.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#E2E8F0" />
      </View>
    );
  }

  if (error && series.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (series.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>לא נמצאו תוכניות</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={series}
      keyExtractor={keyExtractor}
      numColumns={NUM_COLUMNS}
      contentContainerStyle={styles.listContent}
      columnWrapperStyle={styles.columnWrapper}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={true}
      renderItem={renderItem}
      ListFooterComponent={
        isLoading ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator size="small" color="#E2E8F0" />
          </View>
        ) : null
      }
    />
  );
});

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 40,
    paddingTop: 8,
  },
  columnWrapper: {
    gap: 16,
    marginBottom: 16,
  },
  cardContainer: {
    flex: 1 / NUM_COLUMNS,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  errorText: {
    fontSize: 16,
    color: '#F04438',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8E95A2',
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});

export default VodSeriesGrid;
