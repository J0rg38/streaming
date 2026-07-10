// ----------------------------------------------------------------------------
//  auth.js — Contexto de sesión. Guarda el token de forma segura (SecureStore)
//  para mantener la sesión entre reinicios de la app.
// ----------------------------------------------------------------------------
import { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as api from './api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'vod_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Al abrir la app, recuperamos el token guardado y validamos la sesión.
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          api.setToken(token);
          const { user } = await api.me();
          setUser(user);
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        api.setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async (email, password) => {
    const { user, token } = await api.login(email, password);
    api.setToken(token);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setUser(user);
    return user;
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
