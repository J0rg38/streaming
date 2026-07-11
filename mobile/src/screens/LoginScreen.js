// ----------------------------------------------------------------------------
//  LoginScreen — inicio de sesión (look cinematográfico, igual que la web).
// ----------------------------------------------------------------------------
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import Logo from '../components/Logo';
import AuthBackground from '../components/AuthBackground';
import { MailIcon, LockIcon, LogInIcon } from '../components/Icons';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(''); setLoading(true);
    try { await signIn(email.trim(), password); }
    catch (e) { setError(e.message || 'No se pudo iniciar sesión'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <AuthBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.centerer}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Logo height={54} />
            <Text style={styles.title}>MI <Text style={styles.titleAccent}>VOD</Text></Text>
            <Text style={styles.tagline}>Tu cine, tus series, donde quieras.</Text>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.inputRow}>
            <MailIcon size={18} />
            <TextInput
              style={styles.input} placeholder="Email" placeholderTextColor="#8b8b8b"
              autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
              value={email} onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputRow}>
            <LockIcon size={18} />
            <TextInput
              style={styles.input} placeholder="Contraseña" placeholderTextColor="#8b8b8b"
              secureTextEntry value={password} onChangeText={setPassword}
              onSubmitEditing={onSubmit} returnKeyType="go"
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : (<><LogInIcon size={18} /><Text style={styles.buttonText}>Entrar</Text></>)}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0f' },
  centerer: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },

  card: {
    borderRadius: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 26, paddingTop: 30,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },

  header: { alignItems: 'center', marginBottom: 24 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 14, letterSpacing: 0.5 },
  titleAccent: { color: '#E35336' },
  tagline: { color: '#9ca3af', fontSize: 13, marginTop: 6 },

  errorBox: {
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14, marginBottom: 12,
  },
  input: { flex: 1, color: '#fff', paddingVertical: 13, fontSize: 15 },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#E35336', borderRadius: 12, paddingVertical: 14, marginTop: 6,
    shadowColor: '#E35336', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
