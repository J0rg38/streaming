// ----------------------------------------------------------------------------
//  AdultCatalogScreen — catálogo exclusivo de la sección de adultos (+18).
//  Sólo accesible por usuarios con acceso concedido.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAdultCatalog } from '../api';
import Rail from '../components/Rail';
import { SearchIcon } from '../components/Icons';

export default function AdultCatalogScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdultCatalog().then(setData).catch(console.warn).finally(() => setLoading(false));
  }, []);

  const openTitle = (m) => navigation.navigate('Title', { id: m.id, title: m.title });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#E35336" size="large" /></View>;
  }

  const rails = data?.rails || [];
  const sections = [
    { key: 'cw', title: 'Continuar viendo', items: data?.continueWatching },
    { key: 'ra', title: '🔥 Recién añadidos', items: data?.recentlyAdded },
    ...rails.map((r) => ({ key: `g-${r.genre}`, title: r.genre, items: r.items })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Barra superior FIJA */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Volver</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          {/* adult: true — sin esto el buscador devolvería el catálogo normal. */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Search', { adult: true })}
            style={styles.searchBtn}
            hitSlop={10}
          >
            <SearchIcon size={20} color="#eee" />
            <Text style={styles.searchTxt}>Buscar</Text>
          </TouchableOpacity>
          <View style={styles.badge}><Text style={styles.badgeTxt}>+18</Text></View>
        </View>
      </View>

      <FlatList
        contentContainerStyle={{ paddingTop: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>Aún no hay contenido en esta sección.</Text>}
        data={sections}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => <Rail title={item.title} items={item.items} onPress={openTitle} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(227,83,54,0.25)', backgroundColor: '#000', zIndex: 10, elevation: 4 },
  back: { color: '#ddd', fontSize: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  searchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchTxt: { color: '#eee', fontSize: 15 },
  badge: { backgroundColor: '#E35336', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
