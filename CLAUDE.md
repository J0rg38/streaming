# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Este archivo es el "handoff" del proyecto: el historial de chat NO viaja por git, este documento sí.
> Idioma del código, comentarios y UI: **español**. Mantenlo así.

## Qué es

Plataforma de streaming VOD **auto-alojada** (estilo Netflix/HBO Max), con tres clientes sobre una
misma API:

- **backend/** — Node 20 + Express 4 (**ES Modules**, sin TypeScript) + PostgreSQL (`pg` crudo, sin ORM).
- **frontend/** — React 18 + Vite + Tailwind + react-router-dom + hls.js.
- **mobile/** — Expo SDK 54 con `react-native-tvos` (fork, para Google TV) + expo-video.
- **database/** — SQL a mano (`schema.sql` + `migration_*.sql`), en la **raíz** del repo (no dentro de backend/).

Marca: terracota **`#E35336`** (brand) y **`#C13D24`** (brand-dark, hovers).

## Comandos

```bash
# Dev local (requiere PostgreSQL + backend/.env copiado de .env.example)
cd backend  && npm install && npm run dev      # node --watch, API en :4000
cd frontend && npm install && npm run dev      # Vite :5173, proxy /api -> :4000
cd mobile   && npm install && npx expo start -c

# Base de datos desde cero
psql -U postgres -d vod -f database/schema.sql   # ¡DESTRUCTIVO: hace DROP TABLE!
#  Y NADA MÁS: schema.sql trae ya todas las columnas e índices de las migraciones.
#  Los migration_*.sql son sólo para actualizar una BD que YA existe.

# Actualizar una BD existente (pendiente de aplicar en producción)
psql -U postgres -d vod -f database/migration_marks.sql   # marcas de créditos/cabecera

# Verificación antes de dar por bueno un cambio (NO hay tests ni linter en el repo)
cd backend  && node --check src/routes/admin.js   # sintaxis del/los archivos tocados
cd frontend && npm run build                      # el build es la única red de seguridad del front
#  node --check SÓLO vale para backend (ES Modules puro). El frontend es JSX y mobile es JSX
#  dentro de .js: ahí node --check falla siempre. Mobile NO tiene comprobación estática alguna
#  — el error sale en Metro o en el prebuild.

# Despliegue en el servidor
./deploy.sh                # git pull + npm install + build + pm2 restart + reload nginx
# Las migraciones de BD NO las aplica deploy.sh: hay que ejecutarlas a mano.

# --- APK de distribución, compilados EN LOCAL (sin EAS) --------------------
cd mobile
node scripts/build-apk.mjs both     # o: tv | mobile   -> build-output/*.apk
#  El script hace todo: prebuild del objetivo, arquitecturas, firma y recogida.
#  Requiere credentials/mivod-release.keystore (ver credentials/LEEME.md).

# Alternativa en la nube (ya no se usa por defecto)
eas build -p android --profile preview        # APK celular
eas build -p android --profile preview-tv     # APK Google TV (react-native-tvos)
cd mobile && eas update --branch preview --message "..."   # OTA de solo-JS

# --- Desarrollo en un Google TV físico (ciclo rápido, sin EAS) --------------
adb connect <IP-de-la-TV>:5555         # aceptar el diálogo RSA en el televisor
adb -s <IP>:5555 reverse tcp:8081 tcp:8081   # para que Metro llegue a la TV
cd mobile && $env:EXPO_TV=1; npx expo prebuild --platform android --clean
#  OJO: prebuild resetea gradle.properties a 4 arquitecturas. El aparato de
#  pruebas es ARM de 32 bits (abilist64 vacío), así que restringir acelera mucho:
#      reactNativeArchitectures=armeabi-v7a          (build: ~4 min en vez de ~20)
cd android && .\gradlew.bat assembleDebug
adb -s <IP>:5555 install -r app\build\outputs\apk\debug\app-debug.apk
cd .. && npx expo start --dev-client   # a partir de aquí, JS por Fast Refresh

#  Depurar la navegación por D-pad sin tocar el mando:
adb -s <IP>:5555 shell input keyevent 19/20/21/22/23   # arriba/abajo/izq/der/OK
adb -s <IP>:5555 shell uiautomator dump /sdcard/ui.xml # ver QUÉ nodo tiene el foco
#  Los iconos NO se actualizan por Metro: son recursos nativos, exigen recompilar.
```

> **Un solo proyecto Expo produce las DOS apps.** `EXPO_TV=1` en el `prebuild` decide si
> `android/` sale para televisor (leanback, banner, sin exigir táctil) o para móvil. Solo
> puede existir una carpeta nativa a la vez EN LOCAL; para cambiar de objetivo se repite el
> prebuild (~1 min). **En EAS no hay conflicto**: los perfiles `preview` y `preview-tv`
> hacen cada uno su propio prebuild en la nube, así que ambos APK se generan sin tocar nada.
> No hace falta duplicar el proyecto: `api.js`, `auth.js`, `downloads.js` y `progress.js`
> son comunes, y `App.js` elige la interfaz con `Platform.isTV`.
>
> Al cambiar de objetivo, acuérdate de reajustar `reactNativeArchitectures` en
> `android/gradle.properties` (el prebuild lo resetea): `armeabi-v7a` para el onn box de TV,
> `arm64-v8a` para un móvil moderno.
>
> **Si al cambiar de objetivo o de ABI el build falla con `Unable to delete file …
> node_modules/expo-modules-core/…/classes.jar`**: los módulos de Expo compilan DENTRO de
> `node_modules`, y un demonio de Gradle retiene los artefactos de la arquitectura anterior.
> No es un fallo del código. Se arregla con:
> ```powershell
> cd android; .\gradlew.bat --stop
> Remove-Item ..\node_modules\expo-modules-core\android\build -Recurse -Force
> Remove-Item ..\node_modules\react-native-screens\android\build -Recurse -Force
> ```
> (se regeneran solos en la siguiente compilación).

> **Los APK de distribución se compilan en local** con `scripts/build-apk.mjs`, que
> firma con `credentials/mivod-release.keystore`. Ese keystore **no se puede perder**:
> Android identifica una app por paquete + firma, así que con otro keystore las
> actualizaciones dejarían de instalarse encima de las ya instaladas. Está fuera de git.
>
> El script **desactiva expo-updates** en la compilación local. Sin eso, la APK
> arrancaría, se bajaría el último bundle publicado con `eas update` y reemplazaría
> el JavaScript recién compilado sin avisar — un fallo desconcertante de diagnosticar.
>
> Debug NO sirve para distribuir: no lleva el JS dentro, lo pide a Metro y en un
> aparato suelto se queda en negro.

> **Al cambiar los iconos, SUBIR `android.versionCode` en `app.json`.** El launcher de
> Google TV cachea el icono indexado por *(paquete, versionCode)*, y esa caché sobrevive
> tanto a `adb install -r` como a desinstalar+instalar **y a reiniciar el aparato**. Si el
> versionCode no cambia, seguirás viendo el icono viejo aunque el APK lleve el nuevo
> (comprobable extrayendo `res/mipmap-xxxhdpi-v4/ic_launcher*.webp` del APK: pese a la
> extensión son PNG, así que se pueden abrir). Perseguir esto como si fuera un fallo de
> build es una pérdida de tiempo garantizada.

> **El emulador de Google TV no funciona en el PC de desarrollo actual**: VT-x está
> desactivado en la BIOS (`VirtualizationFirmwareEnabled = False`), así que el AVD
> `GoogleTV_1080p` ya creado no arranca acelerado. Se trabaja contra el aparato físico
> por adb. Para usarlo habría que activar Intel VT-x en la BIOS y la característica
> "Plataforma del hipervisor de Windows".

## Arquitectura — flujos que cruzan varios archivos

### Autenticación (una sola función decide todo)
`backend/src/middleware/auth.js` → `readToken(req)` acepta el JWT por **tres** vías, en este orden:
cookie httpOnly `vod_token` (web) → `Authorization: Bearer` (móvil) → `?token=` en la URL (para
`<Image>` y reproductores nativos que no mandan cabeceras). Todo lo montado bajo `requireAuth`
funciona con las tres. `canAccessAdult(user) = user?.adult === true` — **ser admin NO da acceso +18**.

### Almacenamiento multi-disco
`backend/src/storage.js` lee `MEDIA_DISKS` (JSON en `.env`) y garantiza siempre el disco por defecto
(`MEDIA_ROOT`). Cada disco tiene `movies/ series/ images/ hls/`. Consecuencias en el resto del código:
- `index.js` monta **un `express.static` por disco** para `/api/images` y `/api/hls`; Express prueba
  disco a disco por fallthrough hasta encontrar el archivo.
- `stream.js` valida con `isInsideAnyDisk()` (anti path-traversal) en vez de un único root.
- El destino de una subida se elige con el query param **`?disk=<id>`** (`admin.js` → `diskDir`).
- El HLS se genera **en el mismo disco** que el video de origen (`hlsDirFor`).

### Ingesta: subida → BD → transcodificación
1. `admin.js` recibe multipart con multer (`MAX_UPLOAD_GB`), guarda el archivo en el disco elegido e
   inserta la fila en `media`/`episodes`. `is_adult` se **deriva de los géneros** (`isAdultGenres`:
   contiene "adulto"/"adultos"), no es un campo del formulario.
2. `enqueueTranscode({kind,id,videoPath})` → `transcoder.js`: **cola secuencial, concurrencia 1**
   (transcodificar satura la CPU). Estados en BD: `pending → processing → ready | error`.
3. Por item se generan renditions 360/480/720/1080p **sin upscaling**, `master.m3u8`, y un sprite
   `thumbnails.jpg` + `thumbnails.vtt` para el preview de la barra de progreso.
4. La clave del item es `movie-<id>` / `episode-<id>`; la URL pública queda en `hls_master`
   (`/api/hls/movie-8/master.m3u8`) y el VTT se deriva sustituyendo `master.m3u8` → `thumbnails.vtt`.
5. Al arrancar, `resumePendingTranscodes()` reencola todo lo que no esté `ready` y
   `backfillThumbnails()` genera sprites faltantes. Por eso **basta reiniciar el backend** para
   reparar transcodificaciones a medias.

### Reproducción (doble camino)
`PlayerPage.jsx` decide: si `transcode_status === 'ready'` usa `hls_master` con hls.js
(`xhrSetup` con `withCredentials`); si no, cae al **MP4 original progresivo** vía
`GET /api/stream?path=...` (rangos HTTP 206 en `stream.js`). El original nunca se borra: es el
respaldo mientras el HLS no existe.

### Catálogo: dedup TOTAL (`media.js` → `buildCatalog`)
Cada título aparece **una sola vez en toda la página**. Un `Set seen` acumulativo se aplica en este
orden: Continuar viendo → **Destacados** (prioridad sobre recientes) → Recién añadidos (**máx. 12**)
→ (sólo +18) rails de descubrimiento por actriz/etiqueta (`buildLensRails`) → Géneros.
En géneros el reparto es **codicioso, no equilibrado**: en cada vuelta gana el género con MÁS títulos
disponibles y se lleva todo lo que encaje (`MIN_RAIL = 4`, `MAX_RAIL = 24`), y lo que no llena fila
acaba en "Más títulos". Repartir "equilibrado" fue justo el error anterior: mandar cada título al
género con menos ítems garantizaba docenas de carruseles de UNA sola película.
"Próximamente" (`coming_soon`) es una sección aparte y se excluye de todo lo demás.

### Contenido para adultos
`media.is_adult` (derivado de géneros) + `users.adult_access`. Vive **sólo** en `/adultos` y su propio
buscador `/adultos/buscar`; `GET /api/media` filtra `is_adult = false` y `/api/media/adult` filtra
`true` previa comprobación de `canAccessAdult`.

### Próximamente
Películas sin video (`coming_soon = true`, `video_path NULL`, `release_date`). La restricción
`chk_video_path` está relajada por `migration_coming_soon.sql` para permitirlo. Se crean en
Admin → pestaña "Próximamente" y se "regularizan" subiendo el video
(`POST /api/admin/upcoming/:id/video`), que pone `coming_soon = false` y encola la transcodificación.

### Búsqueda
`GET /api/media/search` usa **pg_trgm**: `ILIKE` sobre título/géneros/actores/tags más `similarity()`
como fallback difuso, ordenado por `title_match DESC, score DESC`. Devuelve `hasTitleMatch` para que
el front avise "no hay exacto, mostramos similares".

### Recomendaciones: afinidad ponderada (`media.js` → `GET /api/media/:id/similar`)
"Comparte algún género" no sirve: casi todo comparte *Drama* y la parrilla sale plana. Se puntúa la
**intersección de arrays** en SQL (`cardinality(ARRAY(SELECT unnest(a) INTERSECT SELECT unnest(b)))`)
con pesos **actores ×4, géneros ×3, etiquetas ×2**; orden `score DESC, created_at DESC`, límite 12.
Se filtra al mismo bucket `is_adult` y se excluye `coming_soon` (lo que no se puede ver no se
recomienda). Si nada puntúa >0, cae a los más recientes.
Un solo endpoint alimenta a los tres clientes: "Más como esto" en la ficha, el "A continuación" + la
parrilla de `EndScreen` en web, y `TvDetailScreen` en televisor.
**Trampa de rutas:** `/:id/similar` DEBE declararse ANTES que `/:id` en `media.js`, o Express casa
`/:id` y se pierde el sufijo.

### Fin de reproducción: créditos, "visto" y post-play
Nadie se queda a ver los créditos, así que exigir el último segundo para dar por terminada una
película la dejaba atascada en "Continuar viendo". El punto que manda es **`credits_start`**:

- **De dónde sale** (`backend/src/marks.js`): cuatro capas, gana la mejor disponible y queda anotada
  en `marks_source` — estimación por duración (se calcula al vuelo, **no** se guarda, así afinar la
  fórmula mejora todo el catálogo de golpe) → capítulo "End Credits" del contenedor
  (`ffprobe -show_chapters`, `'chapters'`) → luminancia de los **fotogramas clave** del último tercio
  con ffmpeg (`'auto'`: los créditos son un tramo largo y oscuro que llega al final) → **clic del
  administrador en el reproductor** (`'manual'`, que ninguna detección automática pisa).
- **Cuándo se analiza**: barrido en segundo plano al arrancar y tras cada subida
  (`scheduleMarksScan`), de uno en uno y **sólo mientras `isTranscodeBusy()` sea false** —
  transcodificar tiene prioridad absoluta. Un análisis sin resultado deja `marks_source='auto'` con
  `credits_start` NULL: consta como analizado y no se repite en cada arranque.
- **Qué hace el reproductor web** (`VideoPlayer.jsx`): al llegar a `credits_at` guarda el progreso
  **al final** (título visto), encoge el vídeo a la esquina superior derecha y muestra `EndScreen`
  con las recomendaciones. El vídeo **no se para**. La cuenta atrás del siguiente título arranca
  20 s después (`autoplayDelay`, recortado si los créditos son más cortos que eso). "Seguir viendo"
  devuelve el vídeo a pantalla completa y ya no vuelve a interrumpir.
- El encogido se aplica a un **contenedor**, NUNCA al `<video>`: tocar el elemento le quita el
  overlay de hardware (misma razón por la que no debe llevar `border-radius`).
- **Series**: `intro_start`/`intro_end` alimentan el botón "Saltar intro". Se marcan a mano; el botón
  "· y toda la temporada" copia la marca al resto de capítulos, porque la sintonía empieza siempre en
  el mismo punto. De la cabecera sólo se marca el FINAL; el principio se asume en el segundo 0.
- **La duración es el cimiento de todo esto.** Antes sólo se guardaba si el NAVEGADOR podía leerla al
  subir el archivo (con MKV casi nunca), y sin duración `percent` queda en null y el título **no sale
  nunca** de "Continuar viendo". Ahora la escribe `transcoder.js` desde ffprobe y el barrido de marcas
  rellena la que falte.
- **Sólo está en la web.** Las apps de móvil y TV siguen con el comportamiento antiguo (pantalla final
  al terminar el archivo); llevarlo allí es la siguiente entrega.

### Panel de administración: paginado y progreso volátil
- `GET /api/admin/library` está **paginado** (`page`, `pageSize` ≤ 50, `type`, `q`, `adult`). No volver
  a cargar el catálogo entero de golpe en `Admin.jsx` (1563 líneas, el archivo más grande del repo).
- `GET /api/admin/transcode-progress` devuelve un mapa **en memoria** `{ 'movie-8': 42 }` que el panel
  sondea. Se pierde al reiniciar: el trabajo se reencola y continúa, pero la barra vuelve a 0.
- `library?adult=true` exige `canAccessAdult` **aunque seas admin** — misma regla que el catálogo.

## Base de datos

Tres tablas: `users`, `media` (películas **y** series; `type='series'` deja `video_path NULL` y sus
videos viven en `episodes`), `episodes`, más `watch_progress`. El progreso usa **dos índices únicos
parciales** (`episode_id IS NULL` vs `NOT NULL`) para que el mismo `ON CONFLICT` sirva a películas y
capítulos.

Al añadir una columna hay que tocar **dos** archivos: el `database/migration_*.sql` idempotente
(`ADD COLUMN IF NOT EXISTS`) y además `schema.sql` (instalación desde cero). El segundo paso es el que
se olvida, y el fallo no aparece hasta que alguien instala de cero: ya pasó con
`coming_soon`/`release_date`, que vivieron meses sólo en su migración — una instalación nueva
rechazaba cualquier "Próximamente" por el `chk_video_path` estricto. Corregido: **hoy `schema.sql`
está al día** (columnas E índices, incluidos los GIN/trigram del buscador). Mantenerlo así.
Nunca ejecutar `schema.sql` sobre una BD con datos.

## Convenciones de frontend

- `frontend/src/api.js` — único cliente, base `/api`, siempre `credentials: 'include'`.
- Rutas protegidas mediante `ProtectedRoute` (`requireAdmin` / `requireAdult`), ver `main.jsx`.
- `Search.jsx` es reutilizable con la prop `adult`; igual el detalle de película/serie.
- **`VideoPlayer.jsx`** — controles propios estilo MAX, refuerzo de volumen con Web Audio
  (`VOLUME_BOOST = 1.7`), miniaturas por sprite+VTT. Las capas de controles usan la clase CSS
  `.vp-layer` (`transform: translateZ(0)`) para pintarse sobre el overlay de hardware del video sin
  desactivarlo (si se desactiva, se pierden FPS). **NO reintroducir `border-radius`/`isolation` en el
  `<video>`.**
- `EndScreen` y los detalles usan `homePath` (`/` o `/adultos` según `is_adult`) para el botón "Inicio".

## Convenciones de mobile

`mobile/src/config.js` fija `API_BASE` (hoy `https://vod.cisne.com.pe`) — cámbialo por la IP de la LAN
para probar contra un backend local. El token va por Bearer y, donde no se puede, por `?token=`.
Descargas offline en `downloads.js` + `downloadsContext.js`.

**Una app, dos interfaces.** `App.js` bifurca por `Platform.isTV` (true cuando se compila con
`EXPO_TV=1`): en televisor carga `src/tv/`, en móvil `src/screens/`. La lógica de negocio (`api.js`,
`auth.js`, `downloads.js`, `progress.js`) es COMPARTIDA — solo cambia la capa visual. `PlayerScreen`
sí es común a ambos y se ramifica internamente con `IS_TV`.

Los iconos (`assets/icon.png`, `adaptive-icon`, `splash-icon`, `tv-banner`) se GENERAN desde el logo
vectorial con `node scripts/generate-icons.mjs`; la fuente de verdad de la marca es
`frontend/public/logo.svg`. No editarlos a mano: se regeneran y se pierde el cambio.

## Interfaz de TV (`mobile/src/tv/`) — reglas y trampas

Aparato de referencia: **onn. 4K Streaming Box** (Google TV, Android 14). Dos datos que condicionan
todo el diseño: reporta un lienzo de **960x540 dp** (1280x720 a densidad 213) y solo tiene **2 GB de
RAM**, así que las listas evitan recargas innecesarias y el fondo del hero se cambia con *debounce*.

- **`TvFrame`** aporta barra lateral + puente de foco a toda pantalla de TV. Una pantalla nueva se
  envuelve ahí y recibe `contentRef`, que DEBE ir en un `<TVFocusGuideView autoFocus>` que envuelva
  todo lo enfocable. Antes de existir, el +18 y la ficha reutilizaban vistas de móvil y se quedaban
  sin barra y sin arreglos de foco.
- **El catálogo normal y el +18 son la MISMA pantalla** (`TvCatalogScreen` con prop `adult`). No
  duplicar: cualquier arreglo debe valer para los dos por construcción.
- **`theme.js` manda en las medidas.** `layout.contentLeft` (80 dp) esquiva la barra lateral
  superpuesta; `layout.heroRatio` está calculado para que el primer carrusel entre entero.

### Trampas del motor de foco de Android (todas costaron un ciclo de depuración)

1. **El zoom debe aplicarse al MISMO elemento que dibuja el resalte.** Si el borde vive en un
   contenedor que no escala y el contenido crece dentro, se ve un recuadro fijo con la imagen
   desbordándolo. Además, un `borderWidth` sobre un contenedor de ancho fijo reduce su caja de
   contenido y descuadra a los hijos: por eso el borde va SIEMPRE presente (transparente sin foco) y
   solo cambia de color.
2. **`trapFocusLeft/Right/Up/Down` bloquean el cruce de la frontera TAMBIÉN AL ENTRAR**, no solo al
   salir. `trapFocusLeft` en los carruseles dejó la barra lateral inalcanzable.
3. **Android resuelve el foco por HAZ direccional**: al pulsar DERECHA solo considera candidatos que
   solapen verticalmente. Los iconos del menú (arriba) no solapan con las tarjetas (abajo), así que el
   foco quedaba encerrado en el menú — y era asimétrico, porque IZQUIERDA sí funcionaba. Solución: el
   "puente de foco" de `TvFrame`, una franja de altura completa que siempre solapa y redirige con
   `destinations`. Se activa SOLO mientras la barra tiene el foco; activo siempre interceptaría el
   camino de ida. **`nextFocusRight` apuntando a un `TVFocusGuideView` no funciona** — se probó.
4. **`autoFocus` no reclama el foco al montar**, solo redirige el que ENTRA en el guía. Para que una
   pantalla arranque con algo enfocado hace falta `hasTVPreferredFocus` en un elemento concreto.
5. **Un `TextInput` no es alcanzable con el D-pad por sí solo.** Se envuelve en `TvFocusable` y el
   `onPress` (tecla OK) le cede el foco, que es lo que abre el teclado del televisor.
6. **Nunca definir un componente dentro del render** (p. ej. un `Field` con un `TextInput` dentro):
   React crea un tipo nuevo en cada render, remonta el input y el campo pierde el foco con cada tecla.
7. **LogBox está silenciado en TV** (`App.js`): su aviso amarillo no se puede cerrar con un mando. Los
   warnings siguen íntegros en la consola de Metro.

## Producción (AlmaLinux 10, SELinux enforcing) — gotchas ya resueltos, no re-romper

Dominio actual **`vod.cisne.com.pe`**. Nginx (proxy a Node :4000) + PM2 (`vod-backend`); el frontend
se sirve estático desde `frontend/dist`. Detalle completo en [DEPLOY.md](DEPLOY.md).

1. **`app.set('trust proxy', 1)`** en `index.js` — sin esto express-rate-limit lanza errores async que
   tumban el proceso (502 al subir) y las cookies `secure` no se envían (401). Hacen falta **las dos
   piezas**: `trust proxy` sin `COOKIE_SECURE=true` en `backend/.env` deja la cookie sin `Secure`, y
   `COOKIE_SECURE=true` sin `trust proxy` impide que Express detecte el HTTPS (`X-Forwarded-Proto`).
2. **SELinux en los discos de media** — el backend ESCRIBE en `<disco>/movies|series|images|hls`; hay
   que etiquetarlas con `httpd_sys_rw_content_t` + `restorecon` o la subida se corta a mitad
   (502 "upstream prematurely closed"). **Repetir al añadir un disco nuevo.** Ver DEPLOY.md →
   "SELinux para los discos de media".
3. **Subidas grandes** — `client_max_body_size`, `proxy_request_buffering off` y timeouts largos en el
   bloque **HTTPS (443)** de Nginx; en Node, `requestTimeout/timeout/headersTimeout = 0` (index.js) y
   `timeout: 0` en el proxy de Vite para dev.
4. **Backup** — Admin → pestaña Backup genera un `.tar.gz` con `pg_dump --clean --if-exists` + las
   imágenes de **todos** los discos. **Los videos NO se incluyen** (demasiado grandes; se respaldan
   aparte). `POST /api/admin/restore` es **DESTRUCTIVO** (el dump lleva `--clean`) y devuelve las
   imágenes **sólo al disco por defecto** — da igual, porque los `express.static` las encuentran en
   cualquiera. Requiere `pg_dump`/`psql`/`tar` en el PATH del proceso del backend.

Las credenciales reales (BD, JWT, admin seed) viven en `backend/.env`, nunca en git.

## Flujo de trabajo

- Verificar con `node --check` (backend) y `npm run build` (frontend) antes de dar algo por bueno.
  Mobile no tiene red de seguridad estática: ahí el cambio se prueba en Metro o en el aparato.
- **En esta máquina (`C:\DESARROLLOS\streaming`) no hay `node`, `npm`, `psql` ni `adb` en el PATH**
  (los `node_modules` sí están, copiados). Mientras siga así, un cambio **no se puede verificar en
  local**: hay que decirlo claramente en vez de dar por bueno algo sin comprobar.
- **`mobile/README.md` está obsoleto**: da por pendientes cosas que ya existen (+18, descargas
  offline, APK sin Expo Go) y no menciona la app de TV. `README.md` (raíz), este archivo y
  [DEPLOY.md](DEPLOY.md) sí están al día; aquel, no.
- El usuario suele hacer el commit/push él mismo y desplegar con `./deploy.sh` (+ migración a mano
  si la hubiera).
