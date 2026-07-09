import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El proxy redirige /api al backend Express (puerto 4000) durante desarrollo,
// evitando problemas de CORS y permitiendo usar rutas relativas en el frontend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Sin timeouts: permite subidas de varios GB sin que el proxy corte
        // la conexión a mitad (p.ej. al 73%).
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
});
