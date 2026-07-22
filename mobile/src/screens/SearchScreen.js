// ----------------------------------------------------------------------------
//  SearchScreen — búsqueda por título, género o actor (con similares).
//
//  Sirve a las DOS secciones: se le pasa `adult` por parámetro de navegación.
//  Es importante que el buscador respete la sección de origen — buscando desde
//  +18 no deben aparecer títulos del catálogo normal ni al revés (el backend
//  filtra por `is_adult` y exige acceso concedido para el catálogo de adultos).
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, TextInput, FlatList, Image, Text, StyleSheet } from 'react-native';
import { searchMedia, imageSource } from '../api';
import { useDownloads } from '../downloadsContext';
import Focusable from '../components/Focusable';
import { DownloadCloudIcon } from '../components/Icons';

export default function SearchScreen({ navigation, route }) {
  const adult = route?.params?.adult === true;
  const { ids } = useDownloads();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  // Título de la cabecera según la sección, para que se vea dónde estás buscando.
  useEffect(() => {
    navigation.setOptions({ title: adult ? 'Buscar +18' : 'Buscar' });
  }, [navigation, adult]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const t = setTimeout(() => {
      searchMedia(term, adult).then((d) => setResults(d.results || [])).catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(t);
  }, [q, adult]);

  return (
    <View style={{ flex: 1, backgroundColor: adult ? '#000' : '#141414', padding: 12 }}>
      <TextInput
        style={styles.input}
        placeholder={adult ? 'Buscar en +18…' : 'Buscar por título, género o actor…'}
        placeholderTextColor="#888"
        value={q} onChangeText={setQ} autoFocus
      />
      <FlatList
        data={results} keyExtractor={(m) => String(m.id)} numColumns={3}
        columnWrapperStyle={{ gap: 8 }} contentContainerStyle={{ gap: 8, paddingTop: 12 }}
        renderItem={({ item }) => (
          <Focusable style={styles.card} onPress={() => navigation.navigate('Title', { id: item.id })}>
            <Image source={imageSource(item.poster_url)} style={styles.poster} />
            <View style={styles.titleRow}>
              {ids.has(item.id) && <DownloadCloudIcon size={13} color="#4ade80" />}
              <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
            </View>
          </Focusable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: '#1f1f1f', color: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#333' },
  card: { flex: 1 / 3 },
  poster: { width: '100%', height: 160, borderRadius: 8, backgroundColor: '#222' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  title: { color: '#ccc', fontSize: 12, flexShrink: 1 },
});
