// ----------------------------------------------------------------------------
//  SearchScreen — búsqueda por título, género o actor (con similares).
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, TextInput, FlatList, Image, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { searchMedia, imageSource } from '../api';

export default function SearchScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const t = setTimeout(() => {
      searchMedia(term).then((d) => setResults(d.results || [])).catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={{ flex: 1, backgroundColor: '#141414', padding: 12 }}>
      <TextInput
        style={styles.input} placeholder="Buscar por título, género o actor…" placeholderTextColor="#888"
        value={q} onChangeText={setQ} autoFocus
      />
      <FlatList
        data={results} keyExtractor={(m) => String(m.id)} numColumns={3}
        columnWrapperStyle={{ gap: 8 }} contentContainerStyle={{ gap: 8, paddingTop: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Title', { id: item.id })}>
            <Image source={imageSource(item.poster_url)} style={styles.poster} />
            <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: '#1f1f1f', color: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#333' },
  card: { flex: 1 / 3 },
  poster: { width: '100%', height: 160, borderRadius: 8, backgroundColor: '#222' },
  title: { color: '#ccc', fontSize: 12, marginTop: 4 },
});
