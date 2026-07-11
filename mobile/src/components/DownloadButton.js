// ----------------------------------------------------------------------------
//  DownloadButton — control de descarga (película o capítulo).
//  La descarga la gestiona el contexto global; aquí solo se refleja el estado.
//
//  props:
//    item     = { mediaId, episodeId?, title, subtitle?, posterUrl, videoPath }
//    variant  = 'full' (películas) | 'compact' (filas de capítulos)
//    onStarted = callback al iniciar la descarga (p.ej. ir a "Descargas")
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { getDownload, deleteDownload } from '../downloads';
import { useDownloads } from '../downloadsContext';
import { DownloadIcon, CheckIcon, TrashIcon, XIcon } from './Icons';

const keyFor = (mediaId, episodeId) => (episodeId ? `${mediaId}_e${episodeId}` : `m${mediaId}`);

export default function DownloadButton({ item, variant = 'full', onStarted }) {
  const { active, startDownload, cancelDownload, refresh } = useDownloads();
  const key = keyFor(item.mediaId, item.episodeId);
  const dl = active[key];                 // en curso (o undefined)
  const isActive = !!dl;
  const [done, setDone] = useState(false);

  // Estado "descargado" inicial y tras completar/cancelar (cuando sale de active).
  // Depende de isActive (booleano), no del objeto dl, para no re-leer en cada tick.
  useEffect(() => {
    let alive = true;
    getDownload(item.mediaId, item.episodeId).then((d) => { if (alive) setDone(!!d); });
    return () => { alive = false; };
  }, [item.mediaId, item.episodeId, isActive]);

  const start = () => { startDownload(item); onStarted?.(); };
  const remove = () => {
    Alert.alert('Eliminar descarga', '¿Quitar esta descarga del dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteDownload(key); setDone(false); refresh(); } },
    ]);
  };

  const pct = Math.round((dl?.progress || 0) * 100);

  // -------- Variante compacta (capítulos) --------
  if (variant === 'compact') {
    if (dl) {
      return (
        <TouchableOpacity onPress={() => cancelDownload(key)} style={styles.compact} hitSlop={8}>
          <Text style={styles.compactPct}>{pct}%</Text>
        </TouchableOpacity>
      );
    }
    if (done) {
      return (
        <TouchableOpacity onPress={remove} style={styles.compact} hitSlop={8}>
          <CheckIcon size={18} color="#4ade80" />
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity onPress={start} style={styles.compact} hitSlop={8}>
        <DownloadIcon size={19} color="#bbb" />
      </TouchableOpacity>
    );
  }

  // -------- Variante completa (película) --------
  if (dl) {
    return (
      <View style={styles.progressRow}>
        <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
        <Text style={styles.pct}>{pct}%</Text>
        <TouchableOpacity onPress={() => cancelDownload(key)} hitSlop={10}><XIcon size={20} color="#bbb" /></TouchableOpacity>
      </View>
    );
  }
  if (done) {
    return (
      <View style={styles.doneRow}>
        <View style={styles.doneLeft}>
          <CheckIcon size={18} color="#4ade80" />
          <Text style={styles.doneText}>Descargada · disponible offline</Text>
        </View>
        <TouchableOpacity onPress={remove} hitSlop={10}><TrashIcon size={19} color="#bbb" /></TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.dlBtn} onPress={start}>
      <DownloadIcon size={20} color="#fff" />
      <Text style={styles.dlText}>Descargar</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compact: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  compactPct: { color: '#E35336', fontSize: 12, fontWeight: '800' },

  dlBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, padding: 13, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)' },
  dlText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingHorizontal: 2 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: '#E35336' },
  pct: { color: '#ddd', fontSize: 13, fontWeight: '700', width: 40, textAlign: 'right' },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', backgroundColor: 'rgba(74,222,128,0.08)' },
  doneLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { color: '#dff5e4', fontSize: 14, fontWeight: '600' },
});
