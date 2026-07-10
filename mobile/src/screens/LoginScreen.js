// ----------------------------------------------------------------------------
//  LoginScreen — inicio de sesión con la misma cuenta de la web.
// ----------------------------------------------------------------------------
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../auth';

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
    <View style={styles.container}>
      <Text style={styles.logo}>MI VOD</Text>
      <Text style={styles.subtitle}>Inicia sesión para ver tu contenido</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input} placeholder="Email" placeholderTextColor="#888"
        autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail}
      />
      <TextInput
        style={styles.input} placeholder="Contraseña" placeholderTextColor="#888"
        secureTextEntry value={password} onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414', justifyContent: 'center', padding: 24 },
  logo: { color: '#E35336', fontSize: 34, fontWeight: '800' },
  subtitle: { color: '#aaa', marginBottom: 24, marginTop: 4 },
  input: { backgroundColor: '#1f1f1f', color: '#fff', borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  button: { backgroundColor: '#E35336', borderRadius: 8, padding: 15, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#ff8a80', marginBottom: 12 },
});
