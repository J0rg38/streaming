// ----------------------------------------------------------------------------
//  App.js — Punto de entrada. Navegación + sesión.
//
//  Una sola app, dos interfaces: si el aparato es un televisor (Platform.isTV,
//  que el fork react-native-tvos pone a true cuando se compila con EXPO_TV=1)
//  se cargan las pantallas de src/tv/ ("10-foot UI", navegación con D-pad); en
//  móvil se usan las de src/screens/ de siempre. La lógica de negocio (api,
//  auth, descargas, progreso) es COMPARTIDA: solo cambia la capa visual.
// ----------------------------------------------------------------------------
import { View, ActivityIndicator, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth';
import { DownloadsProvider } from './src/downloadsContext';
import LoginScreen from './src/screens/LoginScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import AdultCatalogScreen from './src/screens/AdultCatalogScreen';
import TitleScreen from './src/screens/TitleScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SearchScreen from './src/screens/SearchScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';

// --- Pantallas específicas de TV -------------------------------------------
import TvCatalogScreen from './src/tv/screens/TvCatalogScreen';
import TvDetailScreen from './src/tv/screens/TvDetailScreen';
import TvSearchScreen from './src/tv/screens/TvSearchScreen';

const IS_TV = Platform.isTV === true;

// En TV el aviso amarillo de LogBox ("Open debugger to view warnings") tapa la
// interfaz y NO se puede cerrar: no hay dónde pulsar con un mando de D-pad.
// Lo silenciamos solo en televisor; los warnings se siguen viendo íntegros en la
// consola de Metro, y los errores fatales (pantalla roja) siguen apareciendo.
if (IS_TV) LogBox.ignoreAllLogs();

const Stack = createNativeStackNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#141414', primary: '#E35336', card: '#141414', text: '#fff' },
};

// --- Rutas de TELEVISOR -----------------------------------------------------
//  Sin cabeceras: en TV la barra de título de react-navigation no aporta (no hay
//  botón "atrás" táctil) y roba altura útil. Se vuelve con la tecla BACK del mando.
//  El catálogo normal y el de adultos son LA MISMA pantalla con distinta prop.
//  Antes el +18 reutilizaba la vista de móvil y por eso no heredaba ninguna
//  mejora de TV; así cualquier arreglo vale automáticamente para los dos.
const TvHome = (props) => <TvCatalogScreen {...props} adult={false} />;
const TvAdult = (props) => <TvCatalogScreen {...props} adult />;

function TvRoutes() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="TvHome" component={TvHome} />
      <Stack.Screen name="TvAdult" component={TvAdult} />
      <Stack.Screen name="TvDetail" component={TvDetailScreen} />
      <Stack.Screen name="TvSearch" component={TvSearchScreen} />
      {/* Sin versión de TV propia todavía. */}
      <Stack.Screen name="Downloads" component={DownloadsScreen} />
      <Stack.Screen name="Player" component={PlayerScreen} />
    </Stack.Navigator>
  );
}

// --- Rutas de MÓVIL (sin cambios) ------------------------------------------
function MobileRoutes() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#141414' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="Catalog" component={CatalogScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Adult" component={AdultCatalogScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Title" component={TitleScreen} options={{ title: '' }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Buscar' }} />
      <Stack.Screen name="Downloads" component={DownloadsScreen} options={{ title: 'Descargas' }} />
      <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false, orientation: 'landscape' }} />
    </Stack.Navigator>
  );
}

function Routes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#141414', justifyContent: 'center' }}>
      <ActivityIndicator color="#E35336" size="large" />
    </View>;
  }

  if (!user) {
    return (
      <Stack.Navigator>
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    );
  }

  return IS_TV ? <TvRoutes /> : <MobileRoutes />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DownloadsProvider>
          <NavigationContainer theme={theme}>
            <StatusBar style="light" />
            <Routes />
          </NavigationContainer>
        </DownloadsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
