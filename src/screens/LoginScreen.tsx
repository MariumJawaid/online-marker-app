import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, SafeAreaView, ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { NavigationParamList } from '../types';
import ClassMarkerLogo from '../components/ClassMarkerLogo';

type Props = NativeStackScreenProps<NavigationParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const signIn    = useAuthStore((s) => s.signIn);
  const loading   = useAuthStore((s) => s.loading);
  const error     = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    await signIn(email, password);
    // Navigation happens in the root navigator watching auth state
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <ClassMarkerLogo size={120} transparent={true} />
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Student Login</Text>
            <Text style={styles.subtitle}>Sign in with your institutional email</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#64748B"
              value={email}
              onChangeText={(t) => { clearError(); setEmail(t); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748B"
              value={password}
              onChangeText={(t) => { clearError(); setPassword(t); }}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.btn}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Sign In</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1A2340',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#A0AEC0',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorBox: {
    backgroundColor: '#7F1D1D',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});