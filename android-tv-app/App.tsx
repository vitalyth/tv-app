import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import VodCategoryScreen from './src/screens/VodCategoryScreen';
import PlayerScreen from './src/screens/PlayerScreen';

export type RootStackParamList = {
  Home: undefined;
  VodCategory: {
    channelId: string;
    channelName: string;
    channelLogo?: string;
  };
  Player: {
    url?: string;
    title: string;
    isLive?: boolean;
    vodItem?: import('./src/services/tvApi').VodItem;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar hidden />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: '#0d1117' },
        }}
      >
        <Stack.Screen name="Home"        component={HomeScreen}        />
        <Stack.Screen name="VodCategory" component={VodCategoryScreen} />
        <Stack.Screen name="Player"      component={PlayerScreen}      />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
