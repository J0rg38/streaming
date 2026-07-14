// ----------------------------------------------------------------------------
//  Rail.js — Carrusel horizontal de portadas (reutilizable).
// ----------------------------------------------------------------------------
import { View, Text, FlatList, Image, Pressable, StyleSheet } from 'react-native';
import { imageSource } from '../api';
import { useDownloads } from '../downloadsContext';
import { DownloadCloudIcon } from './Icons';

export function Poster({ item, onPress }) {
  const { ids } = useDownloads();
  const downloaded = ids.has(item.id);
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ focused }) => [styles.card, focused && styles.cardFocused]}
    >
      {({ focused }) => (
        <>
          <View style={styles.posterWrap}>
            {/* Resplandor terracota detrás de la carátula al enfocar */}
            {focused && (
              <>
                <View style={[styles.glow, styles.glowOuter]} pointerEvents="none" />
                <View style={[styles.glow, styles.glowInner]} pointerEvents="none" />
              </>
            )}
            <Image source={imageSource(item.poster_url)} style={styles.poster} />
          </View>
          <View style={styles.titleRow}>
            {downloaded && <DownloadCloudIcon size={14} color="#4ade80" />}
            <Text numberOfLines={1} style={[styles.cardTitle, focused && styles.cardTitleFocused]}>
              {item.title}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export default function Rail({ title, items, onPress }) {
  if (!items?.length) return null;
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={styles.railTitle}>{title}</Text>
      <FlatList
        horizontal data={items} keyExtractor={(m) => String(m.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        renderItem={({ item }) => <Poster item={item} onPress={onPress} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  railTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 16, marginBottom: 4 },
  card: { width: 120, marginRight: 14 },
  cardFocused: { transform: [{ scale: 1.14 }], zIndex: 10 },
  posterWrap: { width: 120, height: 180, alignItems: 'center', justifyContent: 'center' },
  // Capas de resplandor (color de la app) — dan sensación de retroiluminación.
  glow: { position: 'absolute', borderRadius: 18, backgroundColor: '#E35336' },
  glowOuter: { top: -16, left: -16, right: -16, bottom: -16, opacity: 0.28 },
  glowInner: { top: -7, left: -7, right: -7, bottom: -7, opacity: 0.55, borderRadius: 12 },
  poster: { width: 120, height: 180, borderRadius: 8, backgroundColor: '#222' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  cardTitle: { color: '#ccc', fontSize: 12, flexShrink: 1 },
  cardTitleFocused: { color: '#fff', fontWeight: '700' },
});
