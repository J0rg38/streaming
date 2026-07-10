// ----------------------------------------------------------------------------
//  CatalogScreen — catálogo con carruseles (estilo Netflix) por género.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { fetchCatalog, imageSource } from '../api';
import { useAuth } from '../auth';

function Poster({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
      <Image source={imageSource(item.poster_url)} style={styles.poster} />
      <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
    </TouchableOpacity>
  );
}

function Rail({ title, items, onPress }) {
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

export default function CatalogScreen({ navigation }) {
  const { signOut } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchCatalog().then(setData).catch(console.warn).finally(() => setLoading(false));
  };
  useEffect(() => { const u = navigation.addListener('focus', load); return u; }, [navigation]);

  const openTitle = (m) => navigation.navigate('Title', { id: m.id, title: m.title });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#E35336" size="large" /></View>;
  }

  const rails = data?.rails || [];
  return (
    <FlatList
      style={{ backgroundColor: '#141414' }}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.logo}>MI VOD</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={() => navigation.navigate('Search')}><Text style={styles.link}>Buscar</Text></TouchableOpacity>
            <TouchableOpacity onPress={signOut}><Text style={styles.link}>Salir</Text></TouchableOpacity>
          </View>
        </View>
      }
      data={[
        { key: 'cw', title: 'Continuar viendo', items: data?.continueWatching },
        { key: 'ra', title: 'Recién añadidos', items: data?.recentlyAdded },
        { key: 'fe', title: '✨ Estelares', items: data?.featured },
        ...rails.map((r) => ({ key: `g-${r.genre}`, title: r.genre, items: r.items })),
      ]}
      keyExtractor={(s) => s.key}
      renderItem={({ item }) => <Rail title={item.title} items={item.items} onPress={openTitle} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 24 },
  logo: { color: '#E35336', fontSize: 24, fontWeight: '800' },
  link: { color: '#ddd', fontSize: 15 },
  railTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 12, marginBottom: 8 },
  card: { width: 120, marginRight: 10 },
  poster: { width: 120, height: 180, borderRadius: 8, backgroundColor: '#222' },
  cardTitle: { color: '#ccc', fontSize: 12, marginTop: 4 },
});
