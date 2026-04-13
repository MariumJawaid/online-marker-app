import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from './src/stores/authStore';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import TestEngine from './src/screens/TestEngine';
import ResultsScreen from './src/screens/ResultsScreen';

import { NavigationParamList } from './src/types';

const Stack = createNativeStackNavigator<NavigationParamList>();

export default function App() {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const loadSession = useAuthStore((s) => s.loadSession);

  // Restore session on app start
  useEffect(() => {
    loadSession();
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0F0F1A',
        }}
      >
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!session ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="TestEngine" component={TestEngine} />
              <Stack.Screen name="Results" component={ResultsScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

  );
}