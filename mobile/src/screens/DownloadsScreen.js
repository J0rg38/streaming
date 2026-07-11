// ----------------------------------------------------------------------------
//  DownloadsScreen — descargas en curso (con progreso) y ya disponibles offline.
// ----------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, Image, FlatList, TouchableOpacity, Alert, StyleSheet,
} from 'react-native';
import { listDownloads, deleteDownload, formatBytes } from '../downloads';
import { useDownloads } from '../downloadsContext';
import { imageSource } from '../api';
import { PlayFilledIcon, TrashIcon, XIcon, DownloadCloudIcon } from '../components/Icons';

export default function DownloadsScreen({ navigation }) {
  const { active, cancelDownload, refresh } = useDownloads();
  const [items, setItems] = useState([]);

  const load = useCallback(() => { listDownloads().then(setItems); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Recarga las completadas cuando cambia el conjunto de descargas en curso
  // (p.ej. una termina y pasa a la lista de disponibles). La firma por claves
  // evita recargar en cada actualización de progreso.
  const activeKeys = Object.keys(active).sort().join(',');
  useEffect(() => { load(); }, [activeKeys, load]);

  const play = (d) =>
    navigation.navigate('Player', {
      mediaId: d.mediaId, episodeId: d.episodeId, localUri: d.fileUri, title: d.title,
    });

  const remove = (d) => {
    Alert.alert('Eliminar descarga', `¿Quitar "${d.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteDownload(d.key); load(); refresh(); } },
    ]);
  };

  const downloading = Object.values(active);
  const isEmpty = !downloading.length && !items.length;

  if (isEmpty) {
    return (
      <View style={styles.empty}>
        <DownloadCloudIcon size={54} color="#555" />
        <Text style={styles.emptyTitle}>Sin descargas</Text>
        <Text style={styles.emptyText}>Descarga películas o capítulos desde su ficha para verlos sin conexión.</Text>
      </View>
    );
  }

  // Sección "en curso" (arriba) + sección "completadas".
  const data = [
    ...downloading.map((d) => ({ type: 'active', key: d.key, item: d })),
    ...items.map((d) => ({ type: 'done', key: d.key, item: d })),
  ];

  return (
    <FlatList
      style={{ backgroundColor: '#141414' }}
      contentContainerStyle={{ padding: 14 }}
      data={data}
      keyExtractor={(row) => `${row.type}-${row.key}`}
      renderItem={({ item: row }) => {
        const d = row.item;

        if (row.type === 'active') {
          const pct = Math.round((d.progress || 0) * 100);
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Image source={imageSource(d.poster)} style={styles.poster} />
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={2}>{d.title}</Text>
                  {!!d.subtitle && <Text style={styles.subtitle} numberOfLines={1}>{d.subtitle}</Text>}
                  <View style={styles.progressWrap}>
                    <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                    <Text style={styles.pct}>{pct}%</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity style={styles.trashBtn} onPress={() => cancelDownload(d.key)} hitSlop={8}>
                <XIcon size={20} color="#bbb" />
              </TouchableOpacity>
            </View>
          );
        }

        return (
          <View style={styles.row}>
            <TouchableOpacity style={styles.rowMain} onPress={() => play(d)} activeOpacity={0.7}>
              <Image source={d.posterUri ? { uri: d.posterUri } : undefined} style={styles.poster} />
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={2}>{d.title}</Text>
                {!!d.subtitle && <Text style={styles.subtitle} numberOfLines={1}>{d.subtitle}</Text>}
                <View style={styles.doneMeta}>
                  <DownloadCloudIcon size={13} color="#4ade80" />
                  <Text style={styles.size}>{formatBytes(d.size)} · offline</Text>
                </View>
              </View>
              <View style={styles.playChip}><PlayFilledIcon size={16} color="#000" /></View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.trashBtn} onPress={() => remove(d)} hitSlop={8}>
              <TrashIcon size={20} color="#bbb" />
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1c1c', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 12 },
  poster: { width: 54, height: 80, borderRadius: 6, backgroundColor: '#333' },
  info: { flex: 1 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  subtitle: { color: '#aaa', fontSize: 12, marginTop: 2 },
  size: { color: '#9aa', fontSize: 12 },
  doneMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: '#E35336' },
  pct: { color: '#ddd', fontSize: 12, fontWeight: '700', width: 38, textAlign: 'right' },
  playChip: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  trashBtn: { paddingHorizontal: 14, paddingVertical: 20 },
});
