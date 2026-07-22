// ----------------------------------------------------------------------------
//  build-apk.mjs — Compila los APK de release EN ESTE ORDENADOR, sin EAS.
//
//  Uso:
//    node scripts/build-apk.mjs tv        solo el APK de Google TV
//    node scripts/build-apk.mjs mobile    solo el APK de móvil/tablet
//    node scripts/build-apk.mjs both      los dos, uno detrás de otro
//
//  Los APK terminados se dejan en build-output/ con un nombre claro.
//
//  Por qué RELEASE y no debug: una compilación debug NO lleva el JavaScript
//  dentro; lo pide a Metro al arrancar. Serviría para desarrollar con el PC
//  delante, pero en un aparato suelto se quedaría en pantalla negra. Release
//  empaqueta el bundle y además va firmada, así que se puede instalar y
//  actualizar de verdad.
// ----------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(ROOT, 'android');
const OUT = join(ROOT, 'build-output');
const CREDS = join(ROOT, 'credentials');
const KEYSTORE = join(CREDS, 'mivod-release.keystore');
const PASSFILE = join(CREDS, '.keystore-password');

// Arquitecturas por objetivo. El aparato de TV de referencia (onn 4K Streaming
// Box) es ARM de 32 bits; los móviles modernos son de 64. Incluimos ambas en los
// dos APK para que sirvan en cualquier aparato, a costa de algo de tamaño.
const ABIS = 'armeabi-v7a,arm64-v8a';

const TARGETS = {
  tv: { expoTv: '1', label: 'Google TV' },
  mobile: { expoTv: '', label: 'móvil y tablet' },
};

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function step(n, total, msg) {
  console.log(`\n[${n}/${total}] ${msg}`);
}

// Espera síncrona (no hay await en el cuerpo de este script).
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Borrado con reintentos: en Windows, el demonio de Gradle tarda un momento en
// soltar los descriptores tras `--stop`, y un borrado inmediato da EPERM. Si
// aun así no se puede, seguimos: la limpieza es una precaución, no un requisito.
function rmWithRetry(path, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return true;
    } catch {
      sleep(1500);
    }
  }
  console.warn(`  (aviso) no se pudo limpiar ${path}; se continúa igualmente`);
  return false;
}

// --- Comprobaciones previas -------------------------------------------------
if (!existsSync(KEYSTORE) || !existsSync(PASSFILE)) {
  console.error(
    'Falta el keystore de firma.\n' +
    'Debería estar en credentials/mivod-release.keystore junto a .keystore-password.\n' +
    'Ver credentials/LEEME.md.'
  );
  process.exit(1);
}
const PASS = readFileSync(PASSFILE, 'utf8').trim();
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
const versionCode = appJson.expo.android.versionCode;
const version = appJson.expo.version;

function build(target) {
  const { expoTv, label } = TARGETS[target];
  const total = 5;
  console.log(`\n${'='.repeat(64)}\n  Compilando APK para ${label}  (v${version}, versionCode ${versionCode})\n${'='.repeat(64)}`);

  const env = { ...process.env, EXPO_TV: expoTv };
  if (!expoTv) delete env.EXPO_TV;   // que no quede a '' , el plugin mira si existe

  step(1, total, 'Generando el proyecto nativo (expo prebuild)…');
  run('npx --yes expo prebuild --platform android --clean', { env });

  step(2, total, `Fijando arquitecturas: ${ABIS}`);
  const gp = join(ANDROID, 'gradle.properties');
  writeFileSync(
    gp,
    readFileSync(gp, 'utf8').replace(/^reactNativeArchitectures=.*$/m, `reactNativeArchitectures=${ABIS}`)
  );

  step(3, total, 'Desactivando las actualizaciones OTA de EAS en esta compilación…');
  // MOTIVO: app.json deja expo-updates apuntando a u.expo.dev. Una APK local
  // arrancaría, se descargaría el último bundle publicado con `eas update` y
  // REEMPLAZARÍA el JavaScript recién compilado — silenciosamente, y sin que
  // nada lo delate salvo que la app "vuelva" a comportarse como una versión
  // vieja. Como estas APK se distribuyen a mano, se desactiva.
  const manifest = join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');
  writeFileSync(
    manifest,
    readFileSync(manifest, 'utf8').replace(
      /(android:name="expo\.modules\.updates\.ENABLED" android:value=")true(")/,
      '$1false$2'
    )
  );

  step(4, total, 'Compilando y firmando (esto tarda unos minutos)…');
  // Los módulos de Expo compilan dentro de node_modules y, al cambiar de
  // arquitectura entre objetivos, Gradle deja artefactos bloqueados. Limpiamos
  // antes para no toparnos con "Unable to delete file … classes.jar".
  try { run('.\\gradlew.bat --stop', { cwd: ANDROID }); } catch { /* puede no haber demonio */ }
  sleep(2000);   // dar tiempo a que Windows libere los ficheros del demonio
  for (const m of ['expo-modules-core', 'react-native-screens', 'react-native-svg']) {
    rmWithRetry(join(ROOT, 'node_modules', m, 'android', 'build'));
  }

  // La firma se inyecta por línea de comandos en vez de tocar build.gradle,
  // porque el prebuild lo regenera y se perdería el cambio en cada compilación.
  const signing = [
    `-Pandroid.injected.signing.store.file=${KEYSTORE.replace(/\\/g, '/')}`,
    `-Pandroid.injected.signing.store.password=${PASS}`,
    `-Pandroid.injected.signing.key.alias=mivod`,
    `-Pandroid.injected.signing.key.password=${PASS}`,
  ].join(' ');
  run(`.\\gradlew.bat assembleRelease ${signing}`, { cwd: ANDROID, env });

  step(5, total, 'Recogiendo el APK…');
  mkdirSync(OUT, { recursive: true });
  const src = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const dest = join(OUT, `mivod-${target}-v${version}-${versionCode}.apk`);
  copyFileSync(src, dest);
  const mb = (readFileSync(dest).length / 1024 / 1024).toFixed(1);
  console.log(`\n  LISTO -> build-output/${dest.split(/[\\/]/).pop()}  (${mb} MB)`);
}

const arg = (process.argv[2] || '').toLowerCase();
const list = arg === 'both' ? ['mobile', 'tv'] : TARGETS[arg] ? [arg] : null;
if (!list) {
  console.error('Uso: node scripts/build-apk.mjs <tv|mobile|both>');
  process.exit(1);
}
for (const t of list) build(t);

console.log(`
${'='.repeat(64)}
Los APK están en build-output/.

Para instalarlos:
  adb install -r build-output/<archivo>.apk
o cópialos al aparato y ábrelos desde un explorador de archivos.

OJO la primera vez: en los aparatos donde ya instalaste una versión de EAS o de
depuración, Android rechazará la instalación por firma distinta. Hay que
desinstalar la anterior primero (se pierden sesión y descargas offline). A
partir de ahí, las siguientes actualizaciones se instalan encima sin problema.
`);
