# 🎬 Mi VOD — plataforma de streaming auto-alojada

Video bajo demanda para servidor propio, estilo Netflix / HBO Max: catálogo con carruseles,
series por temporadas, streaming adaptativo (HLS), cuentas de usuario y panel de administración.

**Tres clientes sobre una misma API**: web, app Android de móvil y app de Google TV.

| Carpeta | Qué es |
|---------|--------|
| `backend/` | Node 20 + Express 4 (ES Modules) + PostgreSQL con `pg` crudo (sin ORM) |
| `frontend/` | React 18 + Vite + Tailwind + react-router-dom + hls.js |
| `mobile/` | Expo SDK 54 sobre `react-native-tvos`: **un solo proyecto** genera la app de móvil y la de TV |
| `database/` | SQL a mano: `schema.sql` + `migration_*.sql` |

> Para trabajar en el código, la referencia completa (arquitectura, trampas ya resueltas,
> convenciones) está en **[CLAUDE.md](CLAUDE.md)**. Para poner esto en un servidor, en
> **[DEPLOY.md](DEPLOY.md)**.

---

## Qué hace

- **Cuentas y roles.** Registro y login con JWT. Rol `user` / `admin`, y un permiso
  independiente de acceso a contenido +18 (**ser admin no lo concede**).
- **Películas y series.** Una película va directa al reproductor; una serie abre la vista de
  temporadas y capítulos.
- **Streaming adaptativo.** Cada video se transcodifica a HLS (360/480/720/1080p, sin
  *upscaling*) y el reproductor web elige calidad según el ancho de banda. Mientras el HLS no
  está listo, se sirve el MP4 original por rangos HTTP 206.
- **Continuar viendo.** El progreso se guarda por usuario y por capítulo, y se reanuda en
  cualquiera de los tres clientes.
- **Final de película sin esperar a los créditos.** El sistema detecta dónde empiezan los créditos
  (por los capítulos del archivo o analizando la imagen con ffmpeg, y siempre corregible con un clic
  desde el reproductor): al llegar ahí el título ya cuenta como visto, el vídeo se encoge a una
  esquina y aparecen las recomendaciones y el siguiente título. En series, botón de "Saltar intro".
- **Catálogo sin repeticiones.** Un título aparece una sola vez en toda la portada: Continuar
  viendo → Estelares → Recién añadidos → Géneros.
- **Recomendaciones por afinidad.** "Más como esto" y el "A continuación" del final del
  reproductor se puntúan por reparto, géneros y etiquetas compartidas.
- **Buscador difuso** (`pg_trgm`): por título, género, actor o etiqueta, con aviso de
  "no hay coincidencia exacta, mostramos similares".
- **Sección +18** separada, con su propio catálogo y buscador, sólo para cuentas habilitadas.
- **Próximamente.** Títulos anunciados sin video todavía; se "regularizan" subiendo el archivo.
- **Almacenamiento multi-disco.** El contenido puede repartirse entre varios discos del
  servidor; al subir se elige en cuál guardar.
- **Panel de administración** en la web: biblioteca paginada, subida de películas/series/
  capítulos, usuarios, uso de disco y copia de seguridad.
- **Apps Android**: catálogo, buscador, reproductor y **descargas para ver sin conexión**;
  en Google TV, interfaz propia navegable con el mando (D-pad).

---

## Puesta en marcha en local

Requisitos: **Node.js 20+** y **PostgreSQL** (con la extensión `pg_trgm` disponible).
No hacen falta ffmpeg ni ffprobe: el backend trae los binarios (`ffmpeg-static`).

### 1. Base de datos

```bash
createdb vod
psql -U postgres -d vod -f database/schema.sql   # crea las tablas (DESTRUCTIVO)
```

> Y nada más: `schema.sql` trae todas las columnas e índices. Los `migration_*.sql` sirven para
> **actualizar una BD que ya existía**, no para una instalación nueva.

### 2. Backend

```bash
cd backend
cp .env.example .env      # ajusta PG*, MEDIA_ROOT y JWT_SECRET
npm install
npm run dev               # http://localhost:4000
```

`.env.example` documenta todas las variables. Las tres imprescindibles:

- `MEDIA_ROOT` — carpeta raíz del contenido. El backend **sólo** sirve archivos dentro de los
  discos configurados (protección contra *path traversal*).
- `JWT_SECRET` — cadena larga y aleatoria.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — el administrador se crea solo al primer arranque.

Al arrancar, el backend también reencola las transcodificaciones a medias y genera las
miniaturas que falten: **reiniciar repara una ingesta interrumpida**.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Vite hace proxy de `/api` → `http://localhost:4000`, así que no hay problemas de CORS.
Entra con el usuario administrador y sube contenido desde `/admin`.

### 4. Apps Android (opcional)

```bash
cd mobile
npm install
npx expo start -c
```

Antes, apunta `src/config.js` al backend: en pruebas por LAN, la **IP del PC**
(no `localhost`, que en el teléfono es el propio teléfono).

Un mismo proyecto produce las dos apps: la variable `EXPO_TV=1` en el `prebuild` decide si la
carpeta nativa sale para televisor o para móvil, y `App.js` elige la interfaz con
`Platform.isTV`. Los APK de distribución se compilan en local:

```bash
node scripts/build-apk.mjs both     # o: tv | mobile   -> build-output/*.apk
```

Requiere el keystore de firma (`credentials/`, fuera de git — ver `mobile/credentials/LEEME.md`).

---

## Rutas de la web

| Ruta | Qué muestra |
|------|-------------|
| `/` · `/search` | Portada y buscador |
| `/movie/:id` · `/series/:id` | Ficha de película / serie con temporadas y capítulos |
| `/watch/:mediaId[/:epId]` | Reproductor |
| `/adultos` · `/adultos/buscar` | Sección +18 (requiere permiso en la cuenta) |
| `/admin` | Panel de administración (requiere rol `admin`) |

---

## Notas de diseño

- **Token por tres vías.** El JWT viaja en cookie `httpOnly` (web), en `Authorization: Bearer`
  (apps) o en `?token=` en la URL, para las etiquetas `<Image>` y reproductores nativos que no
  envían cabeceras de forma fiable. Una sola función del middleware lo resuelve.
- **Streaming progresivo (HTTP 206).** `stream.js` lee la cabecera `Range`, valida que la ruta
  esté dentro de algún disco configurado y envía sólo el trozo pedido. La misma lógica sirve
  películas y capítulos: sólo cambia el `video_path`.
- **Transcodificación en cola de uno.** Transcodificar satura la CPU, así que los trabajos se
  procesan de uno en uno, con el estado (`pending → processing → ready | error`) en la base de
  datos. El MP4 original nunca se borra: es el respaldo mientras el HLS no exista.
- **Progreso con UPSERT.** Dos índices únicos **parciales** distinguen película
  (`episode_id IS NULL`) de capítulo (`episode_id IS NOT NULL`), de modo que el mismo
  `ON CONFLICT ... DO UPDATE` sirve para ambos casos.
- **HLS en la web, progresivo en las apps.** El reproductor web usa hls.js cuando la
  transcodificación está lista; las apps usan siempre `/api/stream` con el token en la cabecera,
  que es lo fiable en Android.

---

## Despliegue

`./deploy.sh` en el servidor: `git pull` + dependencias + build del frontend + reinicio con PM2
+ recarga de Nginx. **Las migraciones de base de datos no las aplica el script**, hay que
ejecutarlas a mano.

La guía completa de instalación en un servidor limpio (AlmaLinux 10, Nginx, PM2, HTTPS con
Let's Encrypt y las reglas de SELinux que hacen falta) está en **[DEPLOY.md](DEPLOY.md)**.
