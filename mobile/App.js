// ----------------------------------------------------------------------------
//  App.js — Punto de entrada. Navegación + sesión.
// ----------------------------------------------------------------------------
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth';
import LoginScreen from './src/screens/LoginScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import TitleScreen from './src/screens/TitleScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SearchScreen from './src/screens/SearchScreen';

const Stack = createNativeStackNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#141414', primary: '#E35336', card: '#141414', text: '#fff' },
};

function Routes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#141414', justifyContent: 'center' }}>
      <ActivityIndicator color="#E35336" size="large" />
    </View>;
  }

  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#141414' }, headerTintColor: '#fff' }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Catalog" component={CatalogScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Title" component={TitleScreen} options={{ title: '' }} />
          <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Buscar' }} />
          <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false, orientation: 'landscape' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="light" />
        <Routes />
      </NavigationContainer>
    </AuthProvider>
  );
}
