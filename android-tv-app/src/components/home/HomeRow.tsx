import React, { ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, LayoutChangeEvent } from 'react-native';

interface HomeRowProps {
  title: string;
  children: ReactNode;
  focusedIndex?: number;
  cardWidth?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
}

export const HomeRow: React.FC<HomeRowProps> = React.memo(({
  title,
  children,
  onLayout,
}) => {
  return (
    <View style={styles.container} onLayout={onLayout}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        removeClippedSubviews={false}
        contentContainerStyle={styles.scrollContent}
      >
        {children}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'left',
  },
  scrollContent: {
    paddingRight: 80,
    paddingVertical: 4,
    paddingLeft: 6,
  },
});

export default HomeRow;
