// ----------------------------------------------------------------------------
//  Rail.js — Carrusel horizontal de portadas (reutilizable).
// ----------------------------------------------------------------------------
import { View, Text, FlatList, Image, StyleSheet } from 'react-native';
import { imageSource } from '../api';
import { useDownloads } from '../downloadsContext';
import { DownloadCloudIcon } from './Icons';
import Focusable from './Focusable';

export function Poster({ item, onPress }) {
  const { ids } = useDownloads();
  const downloaded = ids.has(item.id);
  return (
    <Focusable style={styles.card} onPress={() => onPress(item)}>
      <Image source={imageSource(item.poster_url)} style={styles.poster} />
      <View style={styles.titleRow}>
        {downloaded && <DownloadCloudIcon size={14} color="#4ade80" />}
        <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
      </View>
    </Focusable>
  );
}

export default function Rail({ title, items, onPress }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.railTitle}>{title}</Text>
      <FlatList
        horizontal data={items} keyExtractor={(m) => String(m.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        renderItem={({ item }) => <Poster item={item} onPress={onPress} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  railTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 12, marginBottom: 8 },
  card: { width: 120, marginRight: 10 },
  poster: { width: 120, height: 180, borderRadius: 8, backgroundColor: '#222' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardTitle: { color: '#ccc', fontSize: 12, flexShrink: 1 },
});
