// ----------------------------------------------------------------------------
//  CatalogScreen — catálogo con carruseles (estilo Netflix) por género.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCatalog } from '../api';
import { useAuth } from '../auth';
import Logo from '../components/Logo';
import Rail from '../components/Rail';
import { DownloadIcon } from '../components/Icons';

export default function CatalogScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
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
    <View style={{ flex: 1, backgroundColor: '#141414' }}>
      {/* Barra superior FIJA (no se mueve con el scroll) */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Logo height={26} />
          <Text style={styles.logo}>MI VOD</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Search')}><Text style={styles.link}>Buscar</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Downloads')} hitSlop={8}><DownloadIcon size={22} color="#ddd" /></TouchableOpacity>
          {user?.adult && (
            <TouchableOpacity onPress={() => navigation.navigate('Adult')} style={styles.adultBtn}>
              <Text style={styles.adultTxt}>+18</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={signOut}><Text style={styles.link}>Salir</Text></TouchableOpacity>
        </View>
      </View>

      <FlatList
        contentContainerStyle={{ paddingTop: 8 }}
        data={[
          { key: 'cw', title: 'Continuar viendo', items: data?.continueWatching },
          { key: 'ra', title: 'Recién añadidos', items: data?.recentlyAdded },
          { key: 'fe', title: '✨ Estelares', items: data?.featured },
          ...rails.map((r) => ({ key: `g-${r.genre}`, title: r.genre, items: r.items })),
        ]}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => <Rail title={item.title} items={item.items} onPress={openTitle} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: '#141414', zIndex: 10, elevation: 4 },
  logo: { color: '#E35336', fontSize: 22, fontWeight: '800' },
  link: { color: '#ddd', fontSize: 15 },
  adultBtn: { backgroundColor: 'rgba(227,83,54,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  adultTxt: { color: '#E35336', fontSize: 13, fontWeight: '700' },
});
