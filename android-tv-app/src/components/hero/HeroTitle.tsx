import React from 'react';
import { Text, StyleSheet } from 'react-native';

interface HeroTitleProps {
  title: string;
}

export const HeroTitle: React.FC<HeroTitleProps> = ({ title }) => {
  return (
    <Text style={styles.title} numberOfLines={2}>
      {title || 'שידור חי'}
    </Text>
  );
};

const styles = StyleSheet.create({
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
});

