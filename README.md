# 🎬 VOD Self-Hosted (tipo Netflix / HBO Max)

Aplicación personal de Video Bajo Demanda con diferenciación **Películas vs Series**.

- **Películas** → clic → reproductor directo.
- **Series** → clic → vista de temporadas/capítulos → clic en capítulo → reproductor.

## Arquitectura

```
streaming/
├── database/
│   └── schema.sql              # Tablas: media, episodes, watch_progress
├── backend/                    # Node.js + Express + pg
│   ├── src/
│   │   ├── index.js            # Servidor
│   │   ├── db.js               # Pool PostgreSQL
│   │   └── routes/
│   │       ├── media.js        # GET /api/media, GET /api/media/:id
│   │       ├── stream.js       # GET /api/stream (rangos HTTP 206)
│   │       └── progress.js     # POST/GET /api/progress (UPSERT)
│   └── .env.example
└── frontend/                   # React + Vite + Tailwind + lucide-react
    └── src/
        ├── pages/Home.jsx           # Carruseles estilo Netflix
        ├── pages/PlayerPage.jsx     # Resuelve video_path película/capítulo
        └── components/
            ├── Carousel.jsx
            ├── MediaCard.jsx        # Ruteo condicional movie/series
            ├── SeriesDetail.jsx     # Selector de temporada + capítulos
            └── VideoPlayer.jsx      # Player custom, guarda progreso c/10s
```

## Puesta en marcha

### 1. Base de datos

```bash
createdb vod                    # si no existe
psql -U postgres -d vod -f database/schema.sql
```

Edita en `schema.sql` (o directamente en la BD) los `video_path` para que apunten
a archivos de video reales de tu disco.

### 2. Backend

```bash
cd backend
cp .env.example .env            # ajusta credenciales y MEDIA_ROOT
npm install
npm run dev                     # http://localhost:4000
```

> **Importante:** `MEDIA_ROOT` en `.env` es la carpeta raíz de tus videos.
> El endpoint de streaming SOLO sirve archivos dentro de esa carpeta
> (protección contra path traversal).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Vite hace proxy de `/api` → `http://localhost:4000`, así que no hay problemas de CORS.

## Notas de diseño

- **Streaming (HTTP 206):** `stream.js` lee la cabecera `Range`, valida límites y
  envía sólo el trozo pedido con `fs.createReadStream({ start, end })`. La misma
  lógica sirve películas y capítulos: sólo cambia el `video_path`.
- **Progreso (UPSERT):** dos índices únicos parciales distinguen película
  (`episode_id IS NULL`) de capítulo (`episode_id IS NOT NULL`), permitiendo
  `ON CONFLICT ... DO UPDATE` sin colisiones.
- **Reanudar:** el player pide el `stopped_at` guardado al montar y hace seek.
