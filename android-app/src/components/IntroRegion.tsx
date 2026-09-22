import { StyleSheet, Text, View } from 'react-native';
import type { RouteDefinition } from '../navigation/routes';

export function IntroRegion({ route }: { route: RouteDefinition }) {
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>{route.eyebrow}</Text>
      <Text numberOfLines={1} style={styles.title}>
        {route.title}
      </Text>
      <Text numberOfLines={2} style={styles.description}>
        {route.description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 188, justifyContent: 'flex-end', maxWidth: 760 },
  eyebrow: {
    color: '#63bfff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  title: { color: '#ffffff', fontSize: 42, fontWeight: '800' },
  description: {
    color: '#c4d1dc',
    fontSize: 19,
    lineHeight: 27,
    marginTop: 10,
  },
});
