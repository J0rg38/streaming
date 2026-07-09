// ----------------------------------------------------------------------------
//  PlayerPage.jsx — Página contenedora del reproductor.
//
//  Resuelve el video_path correcto según sea película o capítulo:
//    - /watch/:mediaId          -> película  -> usa media.video_path
//    - /watch/:mediaId/:epId    -> capítulo  -> busca el episode y usa su video_path
//
//  Luego pasa a <VideoPlayer> el path y los ids necesarios para guardar progreso.
// ----------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchMedia, fetchSimilar, streamUrl } from '../api.js';
import VideoPlayer from '../components/VideoPlayer.jsx';

export default function PlayerPage() {
  const { mediaId, epId } = useParams();
  const [searchParams] = useSearchParams();
  const restart = searchParams.get('restart') === '1'; // "Ver desde el inicio"
  const navigate = useNavigate();

  // source = { hlsUrl, progressiveUrl } — el player elige HLS si está listo.
  const [source, setSource] = useState(null);
  const [title, setTitle] = useState('');
  const [nextItem, setNextItem] = useState(null);       // "a continuación"
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMedia(mediaId), fetchSimilar(mediaId).catch(() => [])])
      .then(([media, similar]) => {
        let videoPath, hlsMaster, status;
        let next = null;

        if (epId) {
          // --- Capítulo de serie -------------------------------------------
          const allEpisodes = (media.seasons || []).flatMap((s) => s.episodes);
          const idx = allEpisodes.findIndex((e) => String(e.id) === String(epId));
          const ep = allEpisodes[idx];
          if (!ep) throw new Error('Capítulo no encontrado');
          videoPath = ep.video_path;
          hlsMaster = ep.hls_master;
          status = ep.transcode_status;
          setTitle(
            `${media.title} · T${ep.season_number}:E${ep.episode_number}` +
            (ep.title ? ` — ${ep.title}` : '')
          );

          // "Siguiente episodio" si existe uno después en la serie.
          const nextEp = allEpisodes[idx + 1];
          if (nextEp) {
            next = {
              subtitle: `Siguiente episodio · T${nextEp.season_number}:E${nextEp.episode_number}`,
              title: nextEp.title || `Capítulo ${nextEp.episode_number}`,
              poster_url: media.poster_url,
              banner_url: media.banner_url,
              meta: media.title,
              path: `/watch/${media.id}/${nextEp.id}`,
            };
          }
        } else {
          // --- Película -----------------------------------------------------
          if (!media.video_path) throw new Error('La película no tiene archivo de video');
          videoPath = media.video_path;
          hlsMaster = media.hls_master;
          status = media.transcode_status;
          setTitle(media.title);
        }

        // Si no hay "siguiente episodio", usamos la primera recomendación.
        if (!next && similar.length) {
          const rec = similar[0];
          next = {
            subtitle: 'A continuación',
            title: rec.title,
            poster_url: rec.poster_url,
            banner_url: rec.banner_url,
            meta: [rec.release_year, rec.genres?.join(' · ')].filter(Boolean).join('  ·  '),
            path: rec.type === 'series' ? `/series/${rec.id}` : `/watch/${rec.id}`,
          };
        }

        setNextItem(next);
        // Recomendaciones para la parrilla (excluimos la usada como "siguiente").
        const usedId = next && !epId ? similar[0]?.id : null;
        setRecommendations(similar.filter((s) => s.id !== usedId));

        setSource({
          hlsUrl: status === 'ready' && hlsMaster ? hlsMaster : null,
          progressiveUrl: streamUrl(videoPath),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mediaId, epId]);

  if (loading) {
    return <div className="grid h-screen place-items-center bg-black text-gray-400">Cargando reproductor…</div>;
  }
  if (error) {
    return (
      <div className="grid h-screen place-items-center bg-black text-gray-400">
        <div className="text-center">
          <p className="mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="rounded bg-brand px-4 py-2">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-black">
      <VideoPlayer
        hlsUrl={source?.hlsUrl}
        progressiveUrl={source?.progressiveUrl}
        mediaId={Number(mediaId)}
        episodeId={epId ? Number(epId) : null}
        title={title}
        restart={restart}
        nextItem={nextItem}
        recommendations={recommendations}
        onNavigate={(path) => navigate(path)}
        onBack={() => navigate(-1)}
      />
    </div>
  );
}
