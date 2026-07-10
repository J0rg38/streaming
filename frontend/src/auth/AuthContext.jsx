// ----------------------------------------------------------------------------
//  AuthContext.jsx — Estado global de autenticación.
//  Al montar consulta /api/auth/me para saber si hay sesión activa (cookie).
// ----------------------------------------------------------------------------
import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true hasta comprobar la sesión

  // Comprobación inicial de sesión (cookie httpOnly).
  useEffect(() => {
    authApi.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
    return user;
  };

  const register = async (email, password, name) => {
    const { user } = await authApi.register(email, password, name);
    setUser(user);
    return user;
  };

  const logout = async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  };

  const value = {
    user, loading, login, register, logout,
    isAdmin: user?.role === 'admin',
    // Acceso a la sección de adultos (flag del usuario o administrador).
    canAdult: user?.adult === true || user?.role === 'admin',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
