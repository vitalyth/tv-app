import React, { ReactNode, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface HomeRowProps {
  title: string;
  children: ReactNode;
  focusedIndex?: number;
  cardWidth?: number;
}

export const HomeRow: React.FC<HomeRowProps> = React.memo(({
  title,
  children,
  focusedIndex,
  cardWidth = 252,
}) => {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (focusedIndex !== undefined && focusedIndex >= 0) {
      // Scroll horizontally to keep focused card well within the viewport
      const targetX = Math.max(0, focusedIndex * cardWidth - 40);
      scrollRef.current?.scrollTo({ x: targetX, animated: true });
    }
  }, [focusedIndex, cardWidth]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        ref={scrollRef}
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
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'left',
  },
  scrollContent: {
    paddingRight: 80,
    paddingVertical: 16,
    paddingLeft: 6,
  },
});

export default HomeRow;
