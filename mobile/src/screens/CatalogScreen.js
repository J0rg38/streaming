// ----------------------------------------------------------------------------
//  CatalogScreen — catálogo con carruseles (estilo Netflix) por género.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCatalog } from '../api';
import { useAuth } from '../auth';
import Logo from '../components/Logo';
import Rail from '../components/Rail';
import Focusable from '../components/Focusable';
import { DownloadIcon, LogOutIcon } from '../components/Icons';

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Focusable onPress={() => navigation.navigate('Search')} style={styles.headerBtn} ring={false} focusStyle={styles.headerBtnFocus} focusScale={1.05}><Text style={styles.link}>Buscar</Text></Focusable>
          <Focusable onPress={() => navigation.navigate('Downloads')} style={styles.headerBtn} ring={false} focusStyle={styles.headerBtnFocus} focusScale={1.05}><DownloadIcon size={22} color="#ddd" /></Focusable>
          {user?.adult && (
            <Focusable onPress={() => navigation.navigate('Adult')} style={styles.adultBtn} ring={false} focusStyle={styles.adultBtnFocus} focusScale={1.05}>
              <Text style={styles.adultTxt}>+18</Text>
            </Focusable>
          )}
          {/* "Salir" ya NO va aquí: en un móvil de 360 dp la cabecera no daba de
              sí y el botón quedaba fuera de la pantalla, así que era imposible
              cerrar sesión. Ahora está en el pie, que es además donde se espera. */}
        </View>
      </View>

      <FlatList
        contentContainerStyle={{ paddingTop: 8 }}
        data={[
          { key: 'cw', title: 'Continuar viendo', items: data?.continueWatching },
          { key: 'ra', title: 'Recién añadidos', items: data?.recentlyAdded },
          { key: 'fe', title: '✨ Estelares', items: data?.featured },
          ...rails.map((r) => ({ key: `g-${r.genre}`, title: r.genre, items: r.items })),
          { key: 'cs', title: 'Próximamente', items: data?.comingSoon },
        ]}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => <Rail title={item.title} items={item.items} onPress={openTitle} />}
        ListFooterComponent={
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.footerLabel}>Sesión iniciada como</Text>
            <Text style={styles.footerUser} numberOfLines={1}>
              {user?.name || user?.email}
            </Text>
            <Focusable onPress={signOut} style={styles.logoutBtn} ring={false} focusStyle={styles.logoutBtnFocus}>
              <LogOutIcon size={18} color="#f87171" />
              <Text style={styles.logoutTxt}>Cerrar sesión</Text>
            </Focusable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: '#141414', zIndex: 10, elevation: 4 },
  logo: { color: '#E35336', fontSize: 22, fontWeight: '800' },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: 'transparent' },
  headerBtnFocus: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: '#fff' },
  link: { color: '#eee', fontSize: 15 },
  adultBtn: { backgroundColor: 'rgba(227,83,54,0.2)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: 'transparent' },
  adultBtnFocus: { backgroundColor: 'rgba(227,83,54,0.45)', borderColor: '#E35336' },
  adultTxt: { color: '#ff7a5c', fontSize: 13, fontWeight: '800' },

  // Pie de la lista: identidad de la sesión + cerrar sesión. Va al final del
  // scroll, que es donde el usuario espera encontrar los ajustes de cuenta.
  footer: {
    marginTop: 12, paddingTop: 22, paddingHorizontal: 16, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  footerLabel: { color: '#777', fontSize: 12 },
  footerUser: { color: '#ddd', fontSize: 15, fontWeight: '600', marginTop: 2, marginBottom: 16 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.45)', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 26,
  },
  logoutBtnFocus: { backgroundColor: 'rgba(248,113,113,0.15)' },
  logoutTxt: { color: '#f87171', fontSize: 15, fontWeight: '700' },
});
