// ----------------------------------------------------------------------------
//  utils/format.js — Formateo de duraciones y etiquetas de progreso.
// ----------------------------------------------------------------------------

// Segundos -> "1h 23min" / "45min" / "50s".
export function formatMinutes(secs) {
  if (!secs || secs <= 0) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${Math.round(secs)}s`;
}

// Segundos -> "mm:ss" / "h:mm:ss" (para el reproductor).
export function formatClock(t) {
  if (!Number.isFinite(t)) return '0:00';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// Dado un objeto progress del backend, devuelve una etiqueta legible.
//   - Sin progreso pero con duración -> "1h 30min" (cuánto dura).
//   - Con progreso                   -> "Te quedan 45min" (cuánto falta).
//   - Casi terminado                 -> "Visto".
export function progressLabel(progress, fallbackDuration = null) {
  // Caso: nunca visto. Mostramos la duración total si la conocemos.
  if (!progress) {
    return fallbackDuration ? formatMinutes(fallbackDuration) : '';
  }
  const { percent, remaining, stopped_at, duration } = progress;

  if (percent !== null && percent >= 95) return 'Visto';

  if (remaining != null && remaining > 0) {
    return `Te quedan ${formatMinutes(remaining)}`;
  }
  // Hay algo visto pero no sabemos la duración total.
  if (stopped_at > 0 && !duration) {
    return `Visto ${formatMinutes(stopped_at)}`;
  }
  return duration ? formatMinutes(duration) : '';
}
