// ----------------------------------------------------------------------------
//  downloadsContext — expone el conjunto de títulos descargados y un refresh(),
//  para mostrar el indicador de "descargado" junto a cada título del catálogo.
// ----------------------------------------------------------------------------
import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { listDownloadedMediaIds } from './downloads';

const Ctx = createContext({ ids: new Set(), refresh: () => {} });

export function DownloadsProvider({ children }) {
  const [ids, setIds] = useState(new Set());
  const refresh = useCallback(async () => {
    try { setIds(await listDownloadedMediaIds()); } catch { /* noop */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ ids, refresh }}>{children}</Ctx.Provider>;
}

export const useDownloads = () => useContext(Ctx);
