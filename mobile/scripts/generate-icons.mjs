// ----------------------------------------------------------------------------
//  generate-icons.mjs — Genera los PNG de la app a partir del logo vectorial.
//
//  La fuente de verdad de la marca es frontend/public/logo.svg; aquí está su
//  geometría replicada para poder rasterizarla sin dependencias externas (no
//  hace falta instalar sharp, canvas ni un navegador).
//
//  Uso:  node scripts/generate-icons.mjs
//
//  Genera en assets/:
//    icon.png          1024x1024  cuadrado negro redondeado + logo (icono de la app)
//    adaptive-icon.png 1024x1024  solo el logo, fondo transparente (Android lo
//                                 recorta con su máscara y pone el color de fondo
//                                 definido en app.json)
//    splash-icon.png    512x512   logo sobre transparente (pantalla de arranque)
//    tv-banner.png      320x180   banner del launcher de Android TV (obligatorio
//                                 en ese tamaño exacto)
//
//  Técnica: en vez de dibujar polígonos, se calcula para cada píxel la DISTANCIA
//  a cada figura y se deriva el alfa de ahí (alpha = 0.5 - distancia). Eso da
//  antialiasing analítico, más limpio que el supermuestreo y de una sola pasada.
//  Además el trazo con uniones/extremos redondeados es exactamente "todos los
//  puntos a distancia <= grosor/2 de la figura", así que el cálculo es exacto.
// ----------------------------------------------------------------------------
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const BRAND = [0xE3, 0x53, 0x36];

// --- Geometría del logo, en el viewBox original 0 0 400 240 -----------------
const TRI = [[185, 48], [346, 120], [185, 192]];
const TRI_R = 17;            // stroke-width 34 / 2, linejoin round
const CURVES = [
  { p: [[30, 146], [96, 112], [136, 112], [170, 129]], r: 11 },  // stroke-width 22 / 2
  { p: [[50, 192], [106, 166], [141, 164], [170, 176]], r: 11 },
];
// Caja del logo ya "engordada" por los trazos.
const BOX = { x0: 30 - 11, y0: 48 - TRI_R, x1: 346 + TRI_R, y1: 192 + TRI_R };
const BOX_W = BOX.x1 - BOX.x0;
const BOX_H = BOX.y1 - BOX.y0;

// --- Utilidades geométricas -------------------------------------------------
function distSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

// Distancia CON SIGNO a un triángulo (negativa dentro).
function sdTriangle(px, py, tri) {
  let d = Infinity;
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = tri[i], [bx, by] = tri[(i + 1) % 3];
    d = Math.min(d, distSeg(px, py, ax, ay, bx, by));
  }
  // Dentro si el punto queda al mismo lado de las tres aristas.
  let neg = 0, pos = 0;
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = tri[i], [bx, by] = tri[(i + 1) % 3];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross < 0) neg++; else pos++;
  }
  return (neg === 3 || pos === 3) ? -d : d;
}

// La curva de Bézier se aproxima por segmentos; 96 es de sobra a este tamaño.
function flatten(p, n = 96) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    pts.push([x, y]);
  }
  return pts;
}
const FLAT = CURVES.map((c) => ({ pts: flatten(c.p), r: c.r }));

function distPolyline(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, distSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
}

// Distancia con signo a un rectángulo redondeado centrado en (0,0).
function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Alfa a partir de la distancia: el borde ocupa 1 píxel -> antialiasing suave.
const cov = (d, scale) => clamp01(0.5 - d * scale);

// --- Render -----------------------------------------------------------------
//  size      : lado (o [ancho, alto])
//  logoRatio : fracción del ancho que ocupa el logo
//  bg        : null (transparente) o [r,g,b] con esquinas redondeadas
function render({ size, logoRatio, bg, radiusRatio = 0 }) {
  const [W, H] = Array.isArray(size) ? size : [size, size];
  const buf = Buffer.alloc(W * H * 4);

  // Escala y desplazamiento para centrar el logo en el lienzo.
  const s = (W * logoRatio) / BOX_W;
  const offX = (W - BOX_W * s) / 2 - BOX.x0 * s;
  const offY = (H - BOX_H * s) / 2 - BOX.y0 * s;

  const hw = W / 2, hh = H / 2;
  const radius = Math.min(W, H) * radiusRatio;
  // 1 píxel del lienzo mide 1/s en coordenadas del logo.
  const logoScale = 1 / (1 / s);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let r = 0, g = 0, b = 0, a = 0;

      // Fondo redondeado.
      if (bg) {
        const aBg = cov(sdRoundRect(cx - hw, cy - hh, hw, hh, radius), 1);
        if (aBg > 0) { r = bg[0]; g = bg[1]; b = bg[2]; a = aBg; }
      }

      // Logo: coordenadas del lienzo -> coordenadas del viewBox.
      const lx = (cx - offX) / s, ly = (cy - offY) / s;
      let aLogo = 0;
      if (lx > BOX.x0 - 2 && lx < BOX.x1 + 2 && ly > BOX.y0 - 2 && ly < BOX.y1 + 2) {
        // Trazo redondeado = puntos a distancia <= r de la figura.
        aLogo = cov(sdTriangle(lx, ly, TRI) - TRI_R, logoScale);
        for (const c of FLAT) {
          if (aLogo >= 1) break;
          aLogo = Math.max(aLogo, cov(distPolyline(lx, ly, c.pts) - c.r, logoScale));
        }
      }

      if (aLogo > 0) {
        // Composición "source-over" del logo sobre el fondo.
        const outA = aLogo + a * (1 - aLogo);
        r = (BRAND[0] * aLogo + r * a * (1 - aLogo)) / outA;
        g = (BRAND[1] * aLogo + g * a * (1 - aLogo)) / outA;
        b = (BRAND[2] * aLogo + b * a * (1 - aLogo)) / outA;
        a = outA;
      }

      const i = (y * W + x) * 4;
      buf[i] = Math.round(r); buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b); buf[i + 3] = Math.round(a * 255);
    }
  }
  return { buf, W, H };
}

// --- Escritura de PNG (RGBA de 8 bits, sin dependencias) --------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(path, { buf, W, H }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;    // bits por canal
  ihdr[9] = 6;    // color type 6 = RGBA
  // Cada scanline lleva delante su byte de filtro (0 = sin filtro).
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// --- Generación -------------------------------------------------------------
mkdirSync(ASSETS, { recursive: true });

const targets = [
  // Icono principal: cuadrado negro con esquinas muy redondeadas. El logo ocupa
  // el 80% del ancho, como en la referencia de marca.
  { file: 'icon.png', opts: { size: 1024, logoRatio: 0.80, bg: [0, 0, 0], radiusRatio: 0.18 } },
  // Adaptive: SOLO el logo y más pequeño; Android recorta con su máscara y el
  // contenido debe caber en la zona segura central (~66% del lienzo).
  { file: 'adaptive-icon.png', opts: { size: 1024, logoRatio: 0.52, bg: null } },
  { file: 'splash-icon.png', opts: { size: 512, logoRatio: 0.62, bg: null } },
  // Banner del launcher de Android TV: 320x180 es obligatorio.
  { file: 'tv-banner.png', opts: { size: [320, 180], logoRatio: 0.46, bg: [0, 0, 0] } },
];

for (const { file, opts } of targets) {
  const img = render(opts);
  writePng(join(ASSETS, file), img);
  console.log(`  ${file.padEnd(20)} ${img.W}x${img.H}`);
}
console.log('Assets generados desde la geometría de frontend/public/logo.svg');
