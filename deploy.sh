#!/usr/bin/env bash
# ============================================================================
#  deploy.sh — Actualiza la app en el servidor (git pull + build + restart).
#
#  Uso (en el servidor, dentro de la carpeta del proyecto):
#     chmod +x deploy.sh        # sólo la primera vez
#     ./deploy.sh
#
#  Requiere: git, node/npm, pm2, nginx. Ejecuta pasos con sudo donde hace falta.
# ============================================================================
set -euo pipefail

# Carpeta del proyecto = donde está este script.
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "==> [1/5] Actualizando código (git pull)…"
git pull --ff-only

echo "==> [2/5] Backend: dependencias + reinicio…"
cd "$PROJECT_DIR/backend"
npm install --omit=dev
# Reinicia si ya existe el proceso; si no, lo crea.
if pm2 describe vod-backend >/dev/null 2>&1; then
  pm2 restart vod-backend --update-env
else
  pm2 start src/index.js --name vod-backend
  pm2 save
fi

echo "==> [3/5] Frontend: build…"
cd "$PROJECT_DIR/frontend"
npm install
npm run build

echo "==> [4/5] Permisos + SELinux del frontend…"
sudo chown -R nginx:nginx dist
if command -v restorecon >/dev/null 2>&1; then
  sudo restorecon -Rv dist >/dev/null || true
fi

echo "==> [5/5] Recargando Nginx…"
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "✅ Despliegue completado."
echo ""
echo "ℹ️  Si esta actualización incluye cambios de base de datos, ejecuta la"
echo "    migración correspondiente manualmente, por ejemplo:"
echo "    PGPASSWORD='TU_PASS' psql -U postgres -h 127.0.0.1 -d vod -f database/migration_XXXX.sql"
