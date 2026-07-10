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

## 2. Instalar dependencias (SDK más reciente)
> Expo Go de la Play Store SÓLO abre proyectos del **SDK más reciente**. Por eso
> instalamos el Expo actual y alineamos el resto de paquetes automáticamente.
```bash
cd mobile
rm -rf node_modules package-lock.json
npm install
# Alinea react-native, expo-* y demás con el SDK instalado:
npx expo install --fix
```

## 3. Arrancar
```bash
npx expo start -c        # -c limpia la caché
```
- Escanea el QR con **Expo Go** (Android), o pulsa **a** para abrir en un emulador.

## ⚠️ Si Expo Go da error al escanear el QR
1. **"Project is incompatible with this version of Expo Go"** → tu proyecto usa un
   SDK más antiguo que tu Expo Go. Solución: `npx expo install expo@latest` y luego
   `npx expo install --fix`. Vuelve a arrancar con `npx expo start -c`.
2. **Se queda cargando / "Something went wrong" / timeout** → el teléfono no llega
   al bundler por la red. Prueba el modo túnel (no depende de la LAN):
   ```bash
   npx expo start --tunnel
   ```
   (La primera vez instala `@expo/ngrok`; acepta.)
3. **El móvil y el PC deben estar en la misma WiFi** (salvo con `--tunnel`).
4. Comprueba que el backend es accesible desde el móvil: abre en el navegador del
   teléfono `http://TU_IP:4000/api/health` — debe responder `{"status":"ok"}`.
5. Si nada funciona, ejecuta `npx expo-doctor` y revisa lo que reporte.

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
