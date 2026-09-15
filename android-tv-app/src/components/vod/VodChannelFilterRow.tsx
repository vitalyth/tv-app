import React from 'react';
import { View, StyleSheet } from 'react-native';
import { VodProvider } from '../../types/vod';
import VodChannelBadge from './VodChannelBadge';

interface VodChannelFilterRowProps {
  selectedProvider: VodProvider | null;
  onSelectProvider: (provider: VodProvider | null) => void;
}

const PROVIDERS: VodProvider[] = [
  'kan-vod',
  'keshet-vod',
  'reshet-vod',
  'c14-vod',
  'i24-vod',
];

export const VodChannelFilterRow: React.FC<VodChannelFilterRowProps> = ({
  selectedProvider,
  onSelectProvider,
}) => {
  return (
    <View style={styles.container}>
      {/* "All" button */}
      <VodChannelBadge
        provider={null}
        isSelected={selectedProvider === null}
        onSelect={() => onSelectProvider(null)}
      />

      {/* Provider channel circles */}
      {PROVIDERS.map((provider) => (
        <VodChannelBadge
          key={provider}
          provider={provider}
          isSelected={selectedProvider === provider}
          onSelect={() => {
            if (selectedProvider === provider) {
              onSelectProvider(null); // Toggle back to all
            } else {
              onSelectProvider(provider);
            }
          }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
});

export default VodChannelFilterRow;
