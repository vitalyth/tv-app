import { memo, useCallback, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from 'react-native';
import { PlayerDialog } from './PlayerDialog';
import type { VideoQualityOption } from '../../media/player';
import { t } from '../../i18n';
import { getAutoQualityLabel } from './qualityDisplay';

interface QualityDialogProps {
  qualities: VideoQualityOption[];
  selectedQualityId: string;
  onSelectQuality: (qualityId: string) => void;
  onClose: () => void;
}

const DEFAULT_QUALITIES: VideoQualityOption[] = [
  { id: 'auto', label: 'Auto' },
  { id: '1080', label: '1080p' },
  { id: '720', label: '720p' },
  { id: '480', label: '480p' },
];

export const QualityDialog = memo(function QualityDialogView({
  qualities,
  selectedQualityId,
  onSelectQuality,
  onClose,
}: QualityDialogProps) {
  const options =
    qualities && qualities.length > 0 ? qualities : DEFAULT_QUALITIES;
  const optionRefs = useRef<Array<View | null>>([]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectQuality(id);
      onClose();
    },
    [onClose, onSelectQuality],
  );

  return (
    <PlayerDialog title={t('playerVideoQuality')}>
      <TVFocusGuideView trapFocusUp trapFocusDown style={styles.list}>
        {options.map((option, index) => {
          const isSelected =
            selectedQualityId === option.id ||
            (!selectedQualityId && option.id === 'auto');
          const label =
            option.id === 'auto'
              ? getAutoQualityLabel(option, options)
              : option.label;

          return (
            <Pressable
              key={option.id}
              ref={ref => {
                optionRefs.current[index] = ref;
              }}
              testID={`quality-option-${option.id}`}
              focusable={true}
              hasTVPreferredFocus={
                isSelected || (!selectedQualityId && index === 0)
              }
              nextFocusUp={
                index > 0 ? (optionRefs.current[index - 1] as any) : undefined
              }
              nextFocusDown={
                index < options.length - 1
                  ? (optionRefs.current[index + 1] as any)
                  : undefined
              }
              onPress={() => handleSelect(option.id)}
              style={({ focused }) => [
                styles.item,
                focused && styles.itemFocused,
              ]}
            >
              {({ focused }) => (
                <>
                  <Text
                    style={[
                      styles.itemLabel,
                      isSelected && styles.itemLabelSelected,
                      focused && styles.itemLabelFocused,
                    ]}
                  >
                    {label}
                  </Text>
                  {isSelected ? (
                    <Text
                      style={[
                        styles.checkmark,
                        focused && styles.checkmarkFocused,
                      ]}
                    >
                      ✓
                    </Text>
                  ) : null}
                </>
              )}
            </Pressable>
          );
        })}
      </TVFocusGuideView>
    </PlayerDialog>
  );
});

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  itemFocused: {
    backgroundColor: '#ffffff',
    transform: [{ scale: 1.02 }],
  },
  itemLabel: {
    color: '#d4e2ee',
    fontSize: 16,
    fontWeight: '500',
  },
  itemLabelFocused: {
    color: '#07111c',
    fontWeight: '700',
  },
  itemLabelSelected: {
    fontWeight: '700',
    color: '#ffffff',
  },
  checkmark: {
    color: '#22d3ee',
    fontSize: 18,
    fontWeight: '700',
  },
  checkmarkFocused: {
    color: '#07111c',
  },
});
