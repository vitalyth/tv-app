import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface AppLogoProps {
  size?: number;
}

export const AppLogo: React.FC<AppLogoProps> = React.memo(({ size = 96 }) => {
  return (
    <Image
      source={{ uri: 'ic_app_logo' }}
      style={[
        styles.logo,
        {
          width: size,
          height: size,
        },
      ]}
      resizeMode="contain"
    />
  );
});

const styles = StyleSheet.create({
  logo: {
    // Android drawable: res/drawable/ic_app_logo.xml
  },
});

export default AppLogo;