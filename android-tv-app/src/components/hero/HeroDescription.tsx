import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HeroDescriptionProps {
  description?: string | null;
}

export const HeroDescription: React.FC<HeroDescriptionProps> = ({ description }) => {
  if (!description || !description.trim()) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text} numberOfLines={3} ellipsizeMode="tail">
        {description.trim()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '74%',
    height: 64,
    marginTop: 4,
    overflow: 'hidden',
  },
  text: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
});

