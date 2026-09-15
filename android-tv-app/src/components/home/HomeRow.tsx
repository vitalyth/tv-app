import React, { ReactNode } from 'react';
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
}) => {
  return (
    <View style={styles.container}>
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
