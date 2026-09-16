import { View, Text, StyleSheet } from 'react-native';

interface HeroDescriptionProps {
  description?: string | null;
}

export const HeroDescription: React.FC<HeroDescriptionProps> = ({ description }) => {
  const trimmed = description?.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text} numberOfLines={3} ellipsizeMode="tail">
        {trimmed}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '74%',
    maxHeight: 64,
    marginTop: 4,
    overflow: 'hidden',
  },
  text: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    textAlign: 'left',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

