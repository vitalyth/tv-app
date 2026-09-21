import {useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

interface FocusableButtonProps {
  label: string;
  onPress: () => void;
  preferredFocus?: boolean;
}

export function FocusableButton({label, onPress, preferredFocus}: FocusableButtonProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      hasTVPreferredFocus={preferredFocus}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[styles.button, focused && styles.focused]}>
      <Text style={[styles.label, focused && styles.focusedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 220,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4d5f73',
    borderRadius: 6,
    backgroundColor: '#162333',
    paddingHorizontal: 20,
  },
  focused: {
    borderColor: '#ffffff',
    backgroundColor: '#1487e8',
    transform: [{scale: 1.04}],
  },
  label: {color: '#dce7f3', fontSize: 18, fontWeight: '600'},
  focusedLabel: {color: '#ffffff'},
});
