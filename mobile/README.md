# 📱 Mi VOD — App Android (Expo / React Native)

App para **consumir** el contenido (ver películas y series). La administración se
sigue haciendo desde la web. Usa la misma API y las mismas cuentas.

## Requisitos
- Node.js 18+ en tu PC.
- Un teléfono Android con la app **Expo Go** (Play Store) **o** un emulador de Android.
- El backend corriendo y accesible desde el teléfono.

## 1. Configurar la URL del servidor
Edita `src/config.js` y pon la URL de tu backend:
- **Pruebas en tu red local**: la IP de tu PC (no `localhost`), p.ej. `http://192.168.1.50:4000`.
  Averigua tu IP con `ipconfig` (Windows) o `ifconfig`/`ipconfig getifaddr en0` (Mac).
  El teléfono y el PC deben estar en la **misma red WiFi**.
- **Producción**: `https://test.cisne.com.pe`.

## 2. Instalar dependencias (SDK 54, el de tu Expo Go)
> Si `npm install` da errores de `ERESOLVE` (conflicto de versiones entre
> react-native / react-native-screens, etc.), usa este método a prueba de fallos:
> instala ignorando peers y deja que **Expo fije las versiones exactas del SDK**.
```bash
cd mobile
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps    # instala aunque haya conflicto de "peers"
npx expo install --fix            # corrige TODAS las versiones a las del SDK 54
```

> Incluye `react-native-svg` (para el logo). `expo install --fix` deja su versión correcta.

## Icono de la app (APK)
El logo dentro de la app ya se muestra. Para el **icono del APK** (el que sale en el
teléfono), Expo necesita un PNG cuadrado de 1024×1024:
1. Guarda el logo como `mobile/assets/icon.png` (1024×1024, fondo a tu gusto).
2. En `app.json`, dentro de `"android"`, añade: `"adaptiveIcon": { "foregroundImage": "./assets/icon.png", "backgroundColor": "#141414" }` y arriba `"icon": "./assets/icon.png"`.
3. Al compilar con EAS Build se usará ese icono.
> `expo install --fix` es la clave: ajusta react, react-native, react-native-screens,
> safe-area-context, expo-video y demás a las versiones **exactas** compatibles con
> el SDK 54, resolviendo cualquier conflicto.

## 3. Arrancar
```bash
npx expo start -c        # -c limpia la caché
```
- Escanea el QR con **Expo Go** (Android), o pulsa **a** para abrir en un emulador.

## ⚠️ Si Expo Go da error al escanear el QR

### "Failed to download remote update" (java.io.IOException)
Es el caso más común. Expo Go **no pudo descargar el bundle** desde tu PC. Aunque
estén en la misma WiFi, en **macOS** casi siempre lo bloquea el **firewall del Mac**
o el **aislamiento de clientes (AP isolation)** del router. Solución definitiva —
usar el **modo túnel**, que no depende de la red local:
```bash
cd mobile
npx expo start --tunnel -c
```
La primera vez instala `@expo/ngrok` (acepta). Espera a que diga "Tunnel ready" y
escanea el QR nuevo. Necesita internet en el PC y el móvil (ya lo tienes).

Alternativas si no quieres túnel:
- **Permite el firewall del Mac**: Ajustes del sistema → Red → Firewall → permitir
  conexiones entrantes para **node** (o desactívalo temporalmente para probar).
- **Comprueba acceso**: abre en el navegador del móvil `http://TU_IP_PC:8081` —
  si no carga, es firewall/red (usa `--tunnel`).

### "Project is incompatible with this version of Expo Go"
Tu proyecto usa un SDK distinto al de tu Expo Go (el tuyo es **SDK 54**). Alinea:
```bash
cd mobile
rm -rf node_modules package-lock.json
npm install
npx expo install --fix
npx expo start --tunnel -c
```

### Otros
- Mira la terminal donde corre `expo start`: si hay un error rojo de *bundling*,
  ese es el problema real (pásamelo).
- `npx expo-doctor` reporta incompatibilidades de versiones.

## Pantallas incluidas
- **Login** — con tu cuenta de la web.
- **Catálogo** — carruseles por género, "Continuar viendo", "Recién añadidos", "Estelares".
- **Detalle** — película (botón reproducir) o serie (temporadas + capítulos).
- **Buscador** — por título, género o actor (con similares).
- **Reproductor** — con controles nativos; reanuda y guarda el progreso.

## Notas técnicas
- **Autenticación**: la app usa **Bearer token** (no cookies). El token se guarda
  de forma segura con `expo-secure-store` y se envía en cada petición.
- **Reproducción**: usa **streaming progresivo** (`/api/stream`) con el token en la
  cabecera — fiable en móvil y con búsqueda por rangos. El streaming **adaptativo
  (HLS)** en móvil requiere propagar el token a cada segmento; queda como mejora
  siguiente (se puede resolver con URLs firmadas o un token temporal por-segmento).
- **Contenido +18**: si el usuario tiene el acceso habilitado, más adelante se puede
  añadir una sección/atajo; por ahora la app muestra el catálogo normal.

## Próximos pasos sugeridos
1. Sección de adultos (para usuarios con acceso).
2. Reproductor con HLS adaptativo (mejor calidad según la red).
3. Descargas para ver sin conexión.
4. Compilar el APK/AAB con **EAS Build** (`npx eas build -p android`) para instalarlo
   sin Expo Go.
