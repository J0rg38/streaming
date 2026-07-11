// ----------------------------------------------------------------------------
//  downloadsContext — gestor GLOBAL de descargas.
//
//  Mantiene las descargas en curso (con su progreso) y el conjunto de títulos
//  ya descargados. Al ser global, una descarga sigue avanzando y su progreso se
//  ve desde cualquier pantalla (incluida "Descargas") aunque salgas de la ficha.
// ----------------------------------------------------------------------------
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { listDownloadedMediaIds, startDownload as startDownloadFile } from './downloads';

const keyFor = (mediaId, episodeId) => (episodeId ? `${mediaId}_e${episodeId}` : `m${mediaId}`);

const Ctx = createContext(null);

export function DownloadsProvider({ children }) {
  const [ids, setIds] = useState(new Set());   // mediaIds con descarga completa
  const [active, setActive] = useState({});    // key -> { key, mediaId, episodeId, title, subtitle, poster, progress }
  const cancels = useRef({});                   // key -> función cancel

  const refresh = useCallback(async () => {
    try { setIds(await listDownloadedMediaIds()); } catch { /* noop */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Inicia una descarga (idempotente por key). item = { mediaId, episodeId?, title, subtitle?, posterUrl, videoPath }
  const startDownload = useCallback((item) => {
    const key = keyFor(item.mediaId, item.episodeId);
    if (cancels.current[key]) return; // ya se está descargando

    setActive((a) => ({
      ...a,
      [key]: { key, mediaId: item.mediaId, episodeId: item.episodeId || null, title: item.title, subtitle: item.subtitle || null, poster: item.posterUrl, progress: 0 },
    }));

    const { promise, cancel } = startDownloadFile(item, (r) => {
      setActive((a) => (a[key] ? { ...a, [key]: { ...a[key], progress: r } } : a));
    });
    cancels.current[key] = cancel;

    promise
      .then((entry) => { if (entry) refresh(); })
      .catch(() => { /* el ítem vuelve a "Descargar" al quitarse de active */ })
      .finally(() => {
        delete cancels.current[key];
        setActive((a) => { const n = { ...a }; delete n[key]; return n; });
      });
  }, [refresh]);

  const cancelDownload = useCallback((key) => {
    cancels.current[key]?.();
    delete cancels.current[key];
    setActive((a) => { const n = { ...a }; delete n[key]; return n; });
  }, []);

  const value = { ids, active, refresh, startDownload, cancelDownload };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDownloads = () => useContext(Ctx);
