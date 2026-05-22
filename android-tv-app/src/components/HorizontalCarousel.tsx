import React, { useRef } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
  paddingStart?: number;
}

/**
 * RTL-safe horizontal carousel.
 * On Android TV the FlatList/ScrollView focus tracking works best
 * with a plain horizontal ScrollView - the DPAD will auto-scroll
 * into focused items.
 */
export default function HorizontalCarousel({ children, paddingStart = 36 }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingRight: paddingStart }]}
      // RTL: content starts from the right on RTL locales
      style={styles.scroll}
    >
      {children}
      {/* right-edge spacer */}
      <View style={styles.endSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 36,
  },
  endSpacer: {
    width: 24,
  },
});
