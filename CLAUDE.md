# CLAUDE.md — Contexto del proyecto (VOD self-hosted)

Este archivo es el "handoff" para continuar el desarrollo con Claude Code en cualquier
máquina. Léelo al empezar. El historial de chat NO viaja por git; este documento sí.

## Qué es
Plataforma de streaming VOD **auto-alojada** (estilo Netflix/HBO Max), con:
- **Web** (React) — catálogo, reproductor HLS, panel de administración.
- **App Android** (Expo/React Native) — catálogo, reproductor, descargas offline, soporte Google TV.
- **Backend** (Node/Express + PostgreSQL) — API, auth, transcodificación a HLS, multi-disco.

Marca: color terracota **`#E35336`** (brand) y **`#C13D24`** (brand-dark, hovers).

## Stack y estructura
- **backend/** — Node + Express (ES Modules) + PostgreSQL (`pg`). Sin TypeScript.
  - `src/index.js` — entrada. **`app.set('trust proxy', 1)`** (obligatorio tras Nginx), guards de `unhandledRejection`/`uncaughtException`, timeouts de subida en 0.
  - `src/routes/` — `media.js` (catálogo/detalle/búsqueda), `admin.js` (subidas, biblioteca, usuarios, discos, backup, descargas), `auth.js`, `progress.js`, `stream.js`.
  - `src/storage.js` — multi-disco (`MEDIA_DISKS`), subcarpetas `movies/series/images/hls`.
  - `src/transcoder.js` — cola de transcodificación a HLS con `ffmpeg-static`/`ffprobe-static` (sprite + WebVTT de miniaturas).
  - `src/middleware/auth.js` — JWT; `canAccessAdult(user) = user?.adult === true` (SIN fallback de admin).
  - `database/` — `schema.sql` + `migration_*.sql` (ejecutar en orden al desplegar cambios de BD).
- **frontend/** — React + Vite + Tailwind + lucide-react + react-router-dom.
  - `src/pages/` — `Home.jsx`, `AdultHome.jsx`, `MovieDetail.jsx`, `Search.jsx` (reusable con prop `adult`), `PlayerPage.jsx`, `Admin.jsx`, `Login.jsx`, `Register.jsx`.
  - `src/components/` — `VideoPlayer.jsx`, `EndScreen.jsx`, `MediaCard.jsx`, `Carousel.jsx`, `SeriesDetail.jsx`.
  - `src/api.js` — cliente (cookies `credentials:'include'`, base `/api`).
- **mobile/** — Expo SDK 54, `react-native-tvos` (fork, para Google TV), expo-video, react-native-svg, expo-file-system (descargas), expo-navigation-bar.
  - `src/screens/`, `src/components/` (incl. `Focusable.js` para foco de TV), `src/config.js` (`API_BASE = https://vod.cisne.com.pe`).

## Convenciones clave
- **Auth web**: JWT en cookie httpOnly. **Móvil**: Bearer en header + `?token=` en URL (para `<Image>`/reproductores). `readToken()` mira cookie → Bearer → query.
- **Adultos**: `media.is_adult` (derivado de géneros "adulto/adultos") + `users.adult_access`. El contenido adulto solo vive en su sección (`/adultos`) y su propio buscador (`/adultos/buscar`).
- **Catálogo (dedup TOTAL)** en `media.js` `buildCatalog`: cada título aparece **UNA sola vez** en toda la página. Prioridad: Continuar viendo → **Destacados** (prioridad sobre recientes) → Recién añadidos (**máx. 12**) → (adultos) recomendaciones por actriz/etiqueta → Géneros. En géneros, cada título se asigna a UN género (reparto **equilibrado**: al género que menos ítems tenga). "Próximamente" (`coming_soon`) es sección aparte y no aparece en el resto.
- **Próximamente**: películas sin video aún (`coming_soon=true`, `video_path NULL`, `release_date`). Se crean en Admin → pestaña "Próximamente"; se "regularizan" subiendo el video (botón "Subir video" en la Biblioteca → `POST /api/admin/upcoming/:id/video`).
- **Reproductor web** (`VideoPlayer.jsx`): controles propios estilo MAX, auto-ocultado, refuerzo de volumen con Web Audio (`VOLUME_BOOST = 1.7`), miniaturas por sprite+VTT. Las capas de controles usan la clase CSS `.vp-layer` (`transform: translateZ(0)`) para pintarse sobre el overlay de hardware del video (sin desactivarlo → sin perder FPS). NO reintroducir `border-radius`/`isolation` en el `<video>`.
- **EndScreen**: el botón "Inicio" usa `homePath` (`/` o `/adultos` según `is_adult`). El detalle (Movie/Series) tiene botón "Inicio" además de "Volver".

## Producción — servidor (AlmaLinux 10, SELinux enforcing)
- Dominio actual: **`vod.cisne.com.pe`** (antes `test.cisne.com.pe`). Ver DEPLOY.md → "Cambiar el dominio".
- Nginx (proxy a Node :4000) + PM2 (`vod-backend`). Frontend servido como estático (`frontend/dist`).
- Discos de media (`MEDIA_DISKS` en `backend/.env`), p.ej. `disk1=/home`, `disk2=/mnt/vod2`.
- **GOTCHAS de producción ya resueltos (no re-romper):**
  1. **`trust proxy`** en `index.js` — sin esto, express-rate-limit tumbaba el proceso (502 al subir) y las cookies `secure` no se enviaban (401).
  2. **SELinux en los discos de media** — el backend ESCRIBE en `<disco>/movies|series|images|hls`. Hay que etiquetar esas subcarpetas con `httpd_sys_rw_content_t` + `restorecon`, o la subida se corta a mitad (502 "upstream prematurely closed"). Al añadir un disco nuevo, repetir. Ver DEPLOY.md → "SELinux para los discos de media". (Ej. reciente: subida de serie fallaba porque faltaba etiquetar `/home/series`.)
  3. Subidas grandes: `client_max_body_size` + `proxy_request_buffering off` + timeouts largos en el bloque **HTTPS (443)** de Nginx; timeouts de Node en 0.
- **Backup**: Admin → pestaña Backup genera un `.tar.gz` (pg_dump + imágenes) y restaura. Requiere `pg_dump`/`psql`/`tar` en el server.
- Credenciales conocidas del proyecto: DB `PGPASSWORD=$imb@29304044`; admin seed `admin@vod.local / Admin123!` (o el del `.env`). Repo: `https://github.com/J0rg38/streaming.git` (rama `main`).

## Comandos
```bash
# Dev local
cd backend  && npm install && npm run dev      # API en :4000 (necesita PostgreSQL + .env)
cd frontend && npm install && npm run dev      # Vite :5173
cd mobile   && npm install && npx expo start -c

# Desplegar cambios en el servidor
cd /var/www/streaming && git pull
# Si hay migración nueva:  psql -U postgres -h 127.0.0.1 -d vod -f database/migration_XXX.sql
cd backend && npm install --omit=dev && pm2 restart vod-backend
cd ../frontend && npm run build && sudo chown -R nginx:nginx dist

# App Android: cambios de JS por OTA (no reconstruye APK)
cd mobile && eas update --branch preview --message "..."
# APK nuevo (celular / TV):
eas build -p android --profile preview        # celular
eas build -p android --profile preview-tv     # Google TV (usa react-native-tvos)
```

## Estado / trabajo reciente (jul 2026)
Todo lo siguiente ya está hecho y desplegado:
- Web: reproductor pro (fix de FPS y controles), login bonito, buscador (pg_trgm) normal y +18, admin (sidebar fija, vista lista/mosaico, descarga de video original + masiva, backup, abrir detalle desde biblioteca), dedup total + equilibrio de géneros, destacados con prioridad, recientes máx 12, sección Próximamente, botón "Inicio" en detalles, marcar "no visto" (clic derecho).
- Android: descargas offline (con progreso, ver sin conexión, indicador verde en títulos descargados), reproductor con miniaturas y ajuste de imagen, soporte **Google TV** (fork react-native-tvos, foco con `Focusable`, D-pad para seek/play), barra fija, oculta barras del sistema al reproducir.

## Cómo continuar
- Trabaja como hasta ahora: cambios de backend/frontend, `node --check` en backend y `npm run build` en frontend antes de dar por bueno.
- El usuario suele hacer commit/push él mismo y desplegar en el server con `git pull` + `pm2 restart` + rebuild del frontend.
- Respeta los gotchas de producción de arriba (trust proxy, SELinux de discos, Nginx 443).
