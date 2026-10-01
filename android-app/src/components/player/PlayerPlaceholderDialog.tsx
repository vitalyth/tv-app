import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlayerDialog } from './PlayerDialog';

interface PlayerPlaceholderDialogProps {
  title: string;
  message: string;
  onClose: () => void;
}

export const PlayerPlaceholderDialog = memo(
  function PlayerPlaceholderDialogView({
    title,
    message,
    onClose,
  }: PlayerPlaceholderDialogProps) {
    return (
      <PlayerDialog title={title}>
        <View style={styles.container}>
          <Text style={styles.message}>{message}</Text>
          <Pressable
            focusable={true}
            hasTVPreferredFocus={true}
            onPress={onClose}
            style={({ focused }) => [
              styles.button,
              focused && styles.buttonFocused,
            ]}
          >
            {({ focused }) => (
              <Text
                style={[
                  styles.buttonText,
                  focused && styles.buttonTextFocused,
                ]}
              >
                סגור
              </Text>
            )}
          </Pressable>
        </View>
      </PlayerDialog>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 20,
  },
  message: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonFocused: {
    backgroundColor: '#ffffff',
    transform: [{ scale: 1.05 }],
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextFocused: {
    color: '#07111c',
    fontWeight: '700',
  },
});
