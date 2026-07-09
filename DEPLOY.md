# 🚀 Despliegue en servidor — AlmaLinux 10

Guía paso a paso para desplegar la app VOD en tu servidor.

| Dato | Valor |
|------|-------|
| SO | AlmaLinux 10 |
| Dominio | `test.cisne.com.pe` |
| Base de datos | `vod` |
| Contraseña BD (usuario `postgres`) | `$imb@29304044` |
| Repositorio | `https://github.com/J0rg38/streaming.git` |
| Backend (Node) | puerto interno `4000` |
| Frontend | build estático servido por Nginx |

> **Antes de empezar**: apunta el dominio `test.cisne.com.pe` (registro **A** en tu DNS)
> a la **IP pública** de tu servidor. Sin esto, el certificado SSL fallará.

Ejecuta los comandos como usuario con `sudo` (o `root`).

---

## 1. Preparar el sistema

```bash
sudo dnf update -y
sudo dnf install -y git nginx firewalld policycoreutils-python-utils
sudo systemctl enable --now firewalld
```

### Abrir puertos web en el firewall
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## 2. Instalar Node.js 20 LTS

```bash
# Repositorio oficial de NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v   # debe mostrar v20.x
npm -v
```

Instala **PM2** (gestor de procesos que mantiene el backend vivo y lo reinicia solo):
```bash
sudo npm install -g pm2
```

---

## 3. Instalar PostgreSQL 16

```bash
# Repositorio oficial de PostgreSQL
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-10-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo dnf -qy module disable postgresql   # desactiva el módulo por defecto del SO
sudo dnf install -y postgresql16-server postgresql16-contrib

# Inicializar el cluster y arrancar
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
sudo systemctl enable --now postgresql-16
```

> `postgresql16-contrib` es **necesario**: incluye la extensión `pg_trgm` que usa el buscador.

### Crear la base de datos y la contraseña
```bash
# Poner contraseña al usuario 'postgres' y crear la BD 'vod'
sudo -u postgres psql <<'SQL'
ALTER USER postgres WITH PASSWORD '$imb@29304044';
CREATE DATABASE vod OWNER postgres;
SQL
```

### Permitir conexión local con contraseña
Edita el archivo de autenticación:
```bash
sudo nano /var/lib/pgsql/16/data/pg_hba.conf
```
Busca las líneas `host ... 127.0.0.1/32 ... ident` (y `::1/128`) y cambia el método
`ident`/`peer` por **`scram-sha-256`**. Deberían quedar así:
```
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```
Recarga PostgreSQL:
```bash
sudo systemctl restart postgresql-16
```

---

## 4. Instalar ffmpeg

La app usa `ffmpeg-static` (se instala vía npm automáticamente), así que **normalmente
no necesitas ffmpeg del sistema**. Si prefieres el del sistema o hay problemas con el
binario estático, instálalo con RPM Fusion:

```bash
sudo dnf install -y https://download1.rpmfusion.org/free/el/rpmfusion-free-release-10.noarch.rpm
sudo dnf install -y ffmpeg ffmpeg-devel
ffmpeg -version
```
(Si instalas el del sistema, puedes forzar su uso con `FFMPEG_PATH`/`FFPROBE_PATH` en el `.env`.)

---

## 5. Clonar el proyecto

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/J0rg38/streaming.git
sudo chown -R $USER:$USER /var/www/streaming
cd /var/www/streaming
```

---

## 6. Cargar el esquema de la base de datos

El archivo `database/schema.sql` ya incluye **todo** (usuarios, media, episodios,
progreso, HLS, actores, etiquetas y la extensión `pg_trgm`):

```bash
cd /var/www/streaming
PGPASSWORD='$imb@29304044' psql -U postgres -h 127.0.0.1 -d vod -f database/schema.sql
```

> Esto **crea las tablas desde cero**. En un despliegue nuevo es lo correcto.
> (No ejecutes los `migration_*.sql`: son para actualizar una BD que ya existía.)

---

## 7. Configurar el backend

```bash
cd /var/www/streaming/backend
npm install --omit=dev
```

Crea la carpeta de medios y el archivo `.env`:
```bash
mkdir -p /var/www/streaming/backend/media
# Genera un secreto JWT aleatorio
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

cat > /var/www/streaming/backend/.env <<EOF
PORT=4000

PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=\$imb@29304044
PGDATABASE=vod

MEDIA_ROOT=/var/www/streaming/backend/media
MAX_UPLOAD_GB=50

JWT_SECRET=$JWT
JWT_EXPIRES=7d

ADMIN_EMAIL=admin@cisne.com.pe
ADMIN_PASSWORD=CambiaEstaClaveYa123!
ADMIN_NAME=Administrador

CLIENT_ORIGIN=https://test.cisne.com.pe
COOKIE_SECURE=true
EOF
```

> **Importante:**
> - En el `.env`, la contraseña lleva `\$` (barra invertida) sólo por el `cat` con here-doc:
>   el archivo final debe contener `PGPASSWORD=$imb@29304044`. Verifícalo con `cat .env`.
>   Si lo editas a mano con `nano`, escribe directamente `PGPASSWORD=$imb@29304044`.
> - `COOKIE_SECURE=true` porque serviremos por HTTPS.
> - Cambia `ADMIN_PASSWORD` por una contraseña fuerte: es tu acceso al panel.

### Arrancar el backend con PM2
```bash
cd /var/www/streaming/backend
pm2 start src/index.js --name vod-backend
pm2 save
pm2 startup systemd    # ejecuta el comando que te imprima para que arranque al reiniciar
```
Comprueba que responde:
```bash
curl http://localhost:4000/api/health   # -> {"status":"ok"}
```

---

## 8. Compilar el frontend

El frontend en producción habla con `/api` (mismo dominio, vía Nginx), así que no
necesita configuración extra.

```bash
cd /var/www/streaming/frontend
npm install
npm run build      # genera la carpeta dist/
```

El resultado queda en `/var/www/streaming/frontend/dist`.

---

## 9. Configurar Nginx

Crea el sitio:
```bash
sudo nano /etc/nginx/conf.d/streaming.conf
```
Pega esto:
```nginx
server {
    listen 80;
    server_name test.cisne.com.pe;

    # --- Frontend (SPA React) ---
    root /var/www/streaming/frontend/dist;
    index index.html;

    # Subidas grandes de video (ajusta si necesitas más)
    client_max_body_size 51200M;   # 50 GB

    # --- API + streaming: proxy al backend Node ---
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts largos para subidas y streaming
        proxy_connect_timeout 3600s;
        proxy_send_timeout    3600s;
        proxy_read_timeout    3600s;
        proxy_request_buffering off;   # streaming de la subida sin bufferizar todo
    }

    # Enrutado del lado del cliente (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Permite que Nginx haga proxy al backend (SELinux lo bloquea por defecto en AlmaLinux):
```bash
sudo setsebool -P httpd_can_network_connect 1
```

Da permisos de lectura a Nginx sobre el frontend:
```bash
sudo chown -R nginx:nginx /var/www/streaming/frontend/dist
# Si Nginx no puede entrar a /var/www/streaming, ajusta el recorrido:
sudo chmod o+x /var/www /var/www/streaming /var/www/streaming/frontend
```

Prueba y arranca Nginx:
```bash
sudo nginx -t
sudo systemctl enable --now nginx
```

Ahora `http://test.cisne.com.pe` debería cargar la app (sin HTTPS todavía).

---

## 10. HTTPS con Let's Encrypt (Certbot)

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d test.cisne.com.pe
```
Certbot edita tu Nginx para servir por HTTPS y configura la renovación automática.
Elige la opción de **redirigir HTTP → HTTPS** cuando lo pregunte.

Comprueba la renovación automática:
```bash
sudo systemctl status certbot-renew.timer
```

Listo: entra a **https://test.cisne.com.pe** e inicia sesión con el
`ADMIN_EMAIL` / `ADMIN_PASSWORD` que pusiste en el `.env`.

---

## 11. Comprobaciones finales

```bash
pm2 status                       # backend "online"
pm2 logs vod-backend --lines 50  # ver logs del backend / transcodificación
sudo systemctl status nginx      # nginx activo
```

- Sube una película desde **Administrar → Película**. Verás el badge "Procesando calidades…".
- El progreso de transcodificación aparece en tiempo real en la biblioteca.
- Cuando termine, se reproduce en calidad adaptativa (HLS).

---

## 🔄 Actualizar el servidor cuando cambie el código

```bash
cd /var/www/streaming
git pull

# Backend (si cambió)
cd backend && npm install --omit=dev && pm2 restart vod-backend

# Si hubo cambios de base de datos, aplica la migración correspondiente, p.ej.:
# PGPASSWORD='$imb@29304044' psql -U postgres -h 127.0.0.1 -d vod -f database/migration_XXXX.sql

# Frontend (si cambió)
cd ../frontend && npm install && npm run build
sudo chown -R nginx:nginx /var/www/streaming/frontend/dist
```

> Los archivos de video subidos viven en `/var/www/streaming/backend/media` y **no** se
> tocan con `git pull` (están en `.gitignore`). Haz copias de seguridad de esa carpeta
> y de la base de datos (`pg_dump`) periódicamente.

---

## 🧯 Problemas frecuentes

| Síntoma | Causa / Solución |
|---------|------------------|
| `502 Bad Gateway` | El backend no está arriba (`pm2 status`) **o** falta `setsebool -P httpd_can_network_connect 1`. |
| Login falla / "No autenticado" | `COOKIE_SECURE=true` requiere HTTPS. Asegúrate de entrar por `https://`. |
| La subida se corta | Sube `client_max_body_size` y los `proxy_*_timeout` en Nginx (ya incluidos arriba). |
| `pg_trgm does not exist` | Falta `postgresql16-contrib`. Instálalo y re-ejecuta el `schema.sql`. |
| Error de conexión a la BD | Revisa `pg_hba.conf` (método `scram-sha-256`) y que la contraseña del `.env` coincida. |
| El video no reproduce en calidad HD | La transcodificación aún no termina (badge "Procesando"). Espera; mientras tanto usa modo progresivo. |
| Nginx "Permission denied" al leer dist | `chmod o+x` a las carpetas del recorrido o `chown -R nginx:nginx dist`. |

---

## 🔐 Recomendaciones de seguridad (producción)

- Cambia `ADMIN_PASSWORD` por una contraseña larga y única.
- Considera crear un **usuario de BD dedicado** (no `postgres` superusuario) sólo con permisos sobre `vod`.
- Mantén el sistema actualizado (`sudo dnf update`).
- Haz backups: `pg_dump` de la BD + copia de la carpeta `media`.
