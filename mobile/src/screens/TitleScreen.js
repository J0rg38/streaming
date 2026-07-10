// ----------------------------------------------------------------------------
//  TitleScreen — detalle de un título. Película: botón reproducir. Serie:
//  selector de temporada y lista de capítulos.
// ----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { fetchMedia, imageSource } from '../api';

export default function TitleScreen({ route, navigation }) {
  const { id } = route.params;
  const [media, setMedia] = useState(null);
  const [season, setSeason] = useState(null);

  useEffect(() => {
    fetchMedia(id).then((m) => {
      setMedia(m);
      if (m.seasons?.length) setSeason(m.seasons[0].season);
    }).catch(console.warn);
  }, [id]);

  const episodes = useMemo(() => {
    if (!media?.seasons) return [];
    return media.seasons.find((s) => s.season === season)?.episodes || [];
  }, [media, season]);

  if (!media) return <View style={styles.center}><ActivityIndicator color="#E35336" size="large" /></View>;

  const playMovie = () =>
    navigation.navigate('Player', { mediaId: media.id, title: media.title });
  const playEpisode = (ep) =>
    navigation.navigate('Player', { mediaId: media.id, episodeId: ep.id, title: `${media.title} · T${ep.season_number}:E${ep.episode_number}` });

  return (
    <ScrollView style={{ backgroundColor: '#141414' }}>
      <Image source={imageSource(media.banner_url || media.poster_url)} style={styles.banner} />
      <View style={{ padding: 16 }}>
        <Text style={styles.title}>{media.title}</Text>
        <Text style={styles.meta}>{[media.release_year, media.genres?.join(' · ')].filter(Boolean).join('  ·  ')}</Text>
        {!!media.description && <Text style={styles.desc}>{media.description}</Text>}

        {media.type === 'movie' ? (
          <TouchableOpacity style={styles.playBtn} onPress={playMovie}>
            <Text style={styles.playText}>▶  Reproducir</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Selector de temporada */}
            <View style={styles.seasonRow}>
              {media.seasons?.map((s) => (
                <TouchableOpacity key={s.season} onPress={() => setSeason(s.season)}
                  style={[styles.seasonChip, season === s.season && styles.seasonChipActive]}>
                  <Text style={season === s.season ? styles.seasonTextActive : styles.seasonText}>Temporada {s.season}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Capítulos */}
            {episodes.map((ep) => (
              <TouchableOpacity key={ep.id} style={styles.epRow} onPress={() => playEpisode(ep)}>
                <Text style={styles.epNum}>{ep.episode_number}</Text>
                <Text style={styles.epTitle} numberOfLines={1}>{ep.title || `Capítulo ${ep.episode_number}`}</Text>
                <Text style={styles.epPlay}>▶</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center' },
  banner: { width: '100%', height: 210, backgroundColor: '#222' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  meta: { color: '#aaa', marginTop: 4 },
  desc: { color: '#ddd', marginTop: 12, lineHeight: 20 },
  playBtn: { backgroundColor: '#fff', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 18 },
  playText: { color: '#000', fontWeight: '800', fontSize: 16 },
  seasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, marginBottom: 8 },
  seasonChip: { backgroundColor: '#1f1f1f', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  seasonChipActive: { backgroundColor: '#E35336' },
  seasonText: { color: '#ccc' }, seasonTextActive: { color: '#fff', fontWeight: '700' },
  epRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f1f1f', borderRadius: 8, padding: 12, marginTop: 8 },
  epNum: { color: '#888', width: 28, fontSize: 16, fontWeight: '700' },
  epTitle: { color: '#fff', flex: 1 },
  epPlay: { color: '#E35336', fontSize: 16 },
});
