// ----------------------------------------------------------------------------
//  Rail.js — Carrusel horizontal de portadas (reutilizable).
// ----------------------------------------------------------------------------
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { imageSource } from '../api';

export function Poster({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
      <Image source={imageSource(item.poster_url)} style={styles.poster} />
      <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
    </TouchableOpacity>
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
  cardTitle: { color: '#ccc', fontSize: 12, marginTop: 4 },
});
