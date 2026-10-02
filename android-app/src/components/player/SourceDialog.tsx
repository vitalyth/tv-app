import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useTVEventHandler,
  View,
  type View as ViewType,
} from 'react-native';
import type { LiveChannelSourceOption } from '../../api/channels';
import { PlayerDialog } from './PlayerDialog';

interface SourceDialogProps {
  sources: LiveChannelSourceOption[];
  channelLabel?: string;
  switchingSourceId?: string;
  error?: string;
  onSelectSource: (sourceId: string) => void;
}

type FocusableView = ViewType & { requestTVFocus?: () => void };

export const SourceDialog = memo(function SourceDialogView({
  sources,
  channelLabel,
  switchingSourceId,
  error,
  onSelectSource,
}: SourceDialogProps) {
  const selectedIndex = sources.findIndex(source => source.selected);
  const preferredFocusIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const sourceRefs = useRef<Record<string, FocusableView | null>>({});
  const [focusedIndex, setFocusedIndex] = useState(preferredFocusIndex);

  const focusIndex = useCallback(
    (nextIndex: number) => {
      if (sources.length === 0) {
        return;
      }
      const normalizedIndex =
        (nextIndex + sources.length) % sources.length;
      setFocusedIndex(normalizedIndex);
      const source = sources[normalizedIndex];
      requestAnimationFrame(() => {
        sourceRefs.current[source.id]?.requestTVFocus?.();
      });
    },
    [sources],
  );

  useEffect(() => {
    const preferredSource = sources[preferredFocusIndex];
    if (!preferredSource) {
      return undefined;
    }
    setFocusedIndex(preferredFocusIndex);
    const timer = setTimeout(
      () => sourceRefs.current[preferredSource.id]?.requestTVFocus?.(),
      80,
    );
    return () => clearTimeout(timer);
  }, [preferredFocusIndex, sources]);

  useTVEventHandler(event => {
    if (event.eventKeyAction === 1 || switchingSourceId) {
      return;
    }
    if (event.eventType === 'down') {
      focusIndex(focusedIndex + 1);
    } else if (event.eventType === 'up') {
      focusIndex(focusedIndex - 1);
    }
  });

  return (
    <PlayerDialog title="מקורות שידור">
      <View style={styles.list}>
        {channelLabel ? (
          <Text numberOfLines={1} style={styles.channelLabel}>
            {channelLabel}
          </Text>
        ) : null}
        {sources.length === 0 ? (
          <Text style={styles.message}>לא נמצאו מקורות נוספים לערוץ זה.</Text>
        ) : (
          sources.map((source, index) => {
            const isSwitching = switchingSourceId === source.id;
            return (
              <Pressable
                key={source.id}
                ref={node => {
                  sourceRefs.current[source.id] = node;
                }}
                testID={`source-option-${source.id}`}
                focusable={!switchingSourceId}
                disabled={Boolean(switchingSourceId)}
                hasTVPreferredFocus={index === preferredFocusIndex}
                onFocus={() => setFocusedIndex(index)}
                onPress={() => onSelectSource(source.id)}
                style={({ focused }) => [
                  styles.item,
                  source.selected && styles.itemSelected,
                  (focused || focusedIndex === index) && styles.itemFocused,
                ]}
              >
                {({ focused }) => (
                  <>
                    <View style={styles.itemTextContainer}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.itemLabel,
                          source.selected && styles.itemLabelSelected,
                          (focused || focusedIndex === index) &&
                            styles.itemLabelFocused,
                        ]}
                      >
                        {isSwitching ? 'מתחבר...' : source.label}
                      </Text>
                      <Text
                        style={[
                          styles.itemStatus,
                          source.selected && styles.itemStatusSelected,
                          (focused || focusedIndex === index) &&
                            styles.itemStatusFocused,
                        ]}
                      >
                        {source.selected ? 'מוצג' : 'זמין'}
                      </Text>
                    </View>
                    {source.selected ? (
                      <Text
                        style={[
                          styles.checkmark,
                          (focused || focusedIndex === index) &&
                            styles.checkmarkFocused,
                        ]}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </>
                )}
              </Pressable>
            );
          })
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </PlayerDialog>
  );
});

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  channelLabel: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'left',
    marginBottom: 4,
  },
  item: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  itemFocused: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
    transform: [{ scale: 1.02 }],
  },
  itemSelected: {
    borderColor: '#22d3ee',
  },
  itemLabel: {
    color: '#d4e2ee',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'left',
  },
  itemLabelSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  itemLabelFocused: {
    color: '#07111c',
    fontWeight: '700',
  },
  itemTextContainer: {
    flex: 1,
    gap: 2,
  },
  itemStatus: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'left',
  },
  itemStatusSelected: {
    color: '#22d3ee',
  },
  itemStatusFocused: {
    color: '#334155',
  },
  checkmark: {
    color: '#22d3ee',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  checkmarkFocused: {
    color: '#07111c',
  },
  message: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: 12,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
});
