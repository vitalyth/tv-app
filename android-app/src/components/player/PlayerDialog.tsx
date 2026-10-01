import { memo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface PlayerDialogProps extends PropsWithChildren {
  title: string;
  onClose?: () => void;
}

export const PlayerDialog = memo(function PlayerDialogView({
  title,
  onClose,
  children,
}: PlayerDialogProps) {
  return (
    <View style={styles.scrim} testID="player-dialog-scrim">
      {onClose ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
        />
      ) : null}
      <View style={styles.card} testID="player-dialog-card">
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    width: 320,
    backgroundColor: 'rgba(15, 23, 34, 0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    marginBottom: 14,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'left',
  },
  body: {
    width: '100%',
  },
});
