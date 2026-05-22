import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../utils/theme';

interface Props {
  title: string;
  subtitle?: string;
}

export default function SectionHeader({ title, subtitle }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 36,
    marginBottom: 14,
    gap: 12,
  },
  bar: {
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: Colors.sectionBar,
  },
  textBlock: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSub,
    textAlign: 'right',
    marginTop: 2,
  },
});
