import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  type View as ViewType,
} from 'react-native';
import type { RouteDefinition } from '../navigation/routes';

export interface PageContentHandle {
  focusFirst: () => void;
  restoreFocus: () => void;
}

interface PageContentProps {
  route: RouteDefinition;
  onContentFocus: () => void;
}

const PLACEHOLDERS = [
  'Primary content',
  'Secondary content',
  'More to explore',
];

export const PageContent = forwardRef<PageContentHandle, PageContentProps>(
  function PageContentView({ route, onContentFocus }, ref) {
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const itemRefs = useRef<Array<ViewType | null>>([]);
    const lastFocusedIndex = useRef(0);

    useImperativeHandle(ref, () => ({
      focusFirst() {
        lastFocusedIndex.current = 0;
        itemRefs.current[0]?.requestTVFocus?.();
      },
      restoreFocus() {
        itemRefs.current[lastFocusedIndex.current]?.requestTVFocus?.();
      },
    }));

    return (
      <View style={styles.root}>
        <Text style={styles.heading}>{route.label}</Text>
        <TVFocusGuideView autoFocus trapFocusRight style={styles.row}>
          {PLACEHOLDERS.map((label, index) => (
            <Pressable
              key={label}
              ref={node => {
                itemRefs.current[index] = node;
              }}
              accessibilityLabel={`${route.label}: ${label}`}
              accessibilityRole="button"
              hasTVPreferredFocus={index === 0}
              onBlur={() =>
                setFocusedIndex(current => (current === index ? null : current))
              }
              onFocus={() => {
                lastFocusedIndex.current = index;
                setFocusedIndex(index);
                onContentFocus();
              }}
              onPress={() => undefined}
              style={[
                styles.card,
                focusedIndex === index && styles.focusedCard,
              ]}
            >
              <View
                style={[
                  styles.cardAccent,
                  index === 1 && styles.cyan,
                  index === 2 && styles.red,
                ]}
              />
              <Text style={styles.cardKicker}>SHELL PREVIEW</Text>
              <Text style={styles.cardTitle}>{label}</Text>
              <Text style={styles.cardCaption}>
                Content arrives in a later stage
              </Text>
            </Pressable>
          ))}
        </TVFocusGuideView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { marginTop: 34 },
  heading: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '700',
    marginBottom: 14,
  },
  row: { flexDirection: 'row', gap: 18, padding: 4 },
  card: {
    width: 278,
    height: 150,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(15, 31, 43, 0.92)',
    padding: 18,
    overflow: 'hidden',
  },
  focusedCard: {
    borderColor: '#ffffff',
    backgroundColor: '#173b55',
    transform: [{ scale: 1.035 }],
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#754bd8',
  },
  cyan: { backgroundColor: '#1597ba' },
  red: { backgroundColor: '#d64550' },
  cardKicker: { color: '#7fcaff', fontSize: 12, fontWeight: '800' },
  cardTitle: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '700',
    marginTop: 20,
  },
  cardCaption: { color: '#9fb0bd', fontSize: 14, marginTop: 8 },
});
