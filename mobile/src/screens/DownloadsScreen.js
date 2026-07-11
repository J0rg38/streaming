// ----------------------------------------------------------------------------
//  DownloadsScreen — títulos descargados para ver sin conexión.
// ----------------------------------------------------------------------------
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, Image, FlatList, TouchableOpacity, Alert, StyleSheet,
} from 'react-native';
import { listDownloads, deleteDownload, formatBytes } from '../downloads';
import { useDownloads } from '../downloadsContext';
import { PlayFilledIcon, TrashIcon, DownloadCloudIcon } from '../components/Icons';

export default function DownloadsScreen({ navigation }) {
  const { refresh } = useDownloads();
  const [items, setItems] = useState([]);

  const load = useCallback(() => { listDownloads().then(setItems); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  if (!items.length) {
    return (
      <View style={styles.empty}>
        <DownloadCloudIcon size={54} color="#555" />
        <Text style={styles.emptyTitle}>Sin descargas</Text>
        <Text style={styles.emptyText}>Descarga películas desde su ficha para verlas sin conexión.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: '#141414' }}
      contentContainerStyle={{ padding: 14 }}
      data={items}
      keyExtractor={(d) => d.key}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <TouchableOpacity style={styles.rowMain} onPress={() => play(item)} activeOpacity={0.7}>
            <Image source={item.posterUri ? { uri: item.posterUri } : undefined} style={styles.poster} />
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              {!!item.subtitle && <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>}
              <Text style={styles.size}>{formatBytes(item.size)}</Text>
            </View>
            <View style={styles.playChip}><PlayFilledIcon size={16} color="#000" /></View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.trashBtn} onPress={() => remove(item)} hitSlop={8}>
            <TrashIcon size={20} color="#bbb" />
          </TouchableOpacity>
        </View>
      )}
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
  size: { color: '#777', fontSize: 12, marginTop: 6 },
  playChip: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  trashBtn: { paddingHorizontal: 14, paddingVertical: 20 },
});
