import {memo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TVFocusGuideView} from 'react-native';
import {PlayerDialog} from './PlayerDialog';
import type {SubtitleOption} from '../../media/player';
import {t} from '../../i18n';

interface Props {
  tracks: SubtitleOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export const SubtitleDialog = memo(function SubtitleDialog({tracks, selectedId, onSelect, onClose}: Props) {
  const options = [{id: 'off', label: t('playerSubtitlesOff')}, ...tracks];
  return (
    <PlayerDialog title={t('playerSubtitles')}>
      <TVFocusGuideView trapFocusUp trapFocusDown>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          {options.map(option => (
            <Pressable
              key={option.id}
              testID={`subtitle-option-${option.id}`}
              hasTVPreferredFocus={selectedId === option.id}
              onPress={() => {onSelect(option.id); onClose();}}
              style={({focused}) => [styles.option, focused && styles.focused]}
            >
              {({focused}) => (
                <Text style={[styles.label, focused && styles.focusedLabel]}>
                  {option.label}{selectedId === option.id ? '  ✓' : ''}
                </Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </PlayerDialog>
  );
});

const styles = StyleSheet.create({
  scroll: {maxHeight: 360},
  list: {gap: 8, padding: 4},
  option: {paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)'},
  focused: {backgroundColor: '#ffffff'},
  label: {color: '#d4e2ee', fontSize: 16, textAlign: 'left'},
  focusedLabel: {color: '#07111c'},
});
