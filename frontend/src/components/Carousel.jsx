// ----------------------------------------------------------------------------
//  Carousel.jsx — Fila horizontal desplazable estilo Netflix.
//  Recibe un título de género y la lista de items a mostrar.
// ----------------------------------------------------------------------------
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from './MediaCard.jsx';

export default function Carousel({ title, items }) {
  const trackRef = useRef(null);

  // Desplaza la fila una "pantalla" a izquierda o derecha.
  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (!items?.length) return null;

  return (
    <section className="mb-6 sm:mb-8">
      <h2 className="mb-3 px-4 text-lg font-bold sm:px-8 sm:text-xl">{title}</h2>

      <div className="group relative">
        {/* Flecha izquierda */}
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 md:flex"
        >
          <ChevronLeft size={32} />
        </button>

        {/* Pista de tarjetas */}
        <div
          ref={trackRef}
          className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-4 py-2 sm:gap-3 sm:px-8"
        >
          {items.map((item) => (
            <MediaCard key={`${title}-${item.id}`} item={item} />
          ))}
        </div>

        {/* Flecha derecha */}
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 md:flex"
        >
          <ChevronRight size={32} />
        </button>
      </div>
    </section>
  );
}
