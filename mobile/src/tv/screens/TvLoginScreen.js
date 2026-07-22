// ----------------------------------------------------------------------------
//  TvLoginScreen — inicio de sesión para televisor.
//
//  Por qué no vale la pantalla de móvil: una tarjeta centrada es un patrón de
//  móvil/web. En TV el ojo entra por la izquierda y el mando navega en vertical,
//  así que las plataformas grandes (Netflix, Max, Prime) usan una composición
//  asimétrica: contenido en la franja izquierda y una imagen o degradado que
//  respira a la derecha. Eso es lo que se hace aquí.
//
//  Detalles pensados para el mando:
//    - El foco arranca en el campo de email (TVFocusGuideView autoFocus).
//    - Pulsar OK sobre un campo le da el foco al TextInput y abre el teclado del
//      televisor; sin eso el campo se vería enfocado pero no se podría escribir.
//    - Los campos son altos (56 dp) y el foco se marca con borde terracota +
//      fondo más claro, legible a tres metros.
//    - Al enviar desde el teclado (returnKeyType "go") se pasa al siguiente campo
//      o se envía, para no obligar a navegar con el D-pad entre cada paso.
// ----------------------------------------------------------------------------
import { useRef, useState } from 'react';
import {
  View, Text, TextInput, ActivityIndicator, StyleSheet, TVFocusGuideView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../../auth';
import { API_BASE } from '../../config';
import Logo from '../../components/Logo';
import AuthBackground from '../../components/AuthBackground';
import TvFocusable from '../components/TvFocusable';
import { MailIcon, LockIcon } from '../../components/Icons';
import { colors, spacing, type, overscan } from '../theme';

// Campo reutilizable. Está DEFINIDO FUERA del componente a propósito: si se
// declara dentro del render, React crea un tipo de componente nuevo en cada
// pulsación, desmonta el TextInput y lo vuelve a montar. El síntoma es que el
// campo pierde el foco y el teclado se cierra tras cada letra.
//
// El envoltorio es quien recibe el foco del mando; al pulsar OK se lo cede al
// TextInput, que es el que abre el teclado del televisor.
function Field({ icon: Icon, inputRef, preferredFocus = false, ...inputProps }) {
  return (
    <TvFocusable
      onPress={() => inputRef.current?.focus()}
      // hasTVPreferredFocus reclama el foco AL MONTAR. Hace falta además del
      // autoFocus del TVFocusGuideView: ese solo redirige el foco que ENTRA en
      // el guía, así que al abrir la pantalla no había nada enfocado y parecía
      // que la interfaz no respondía.
      hasTVPreferredFocus={preferredFocus}
      style={styles.fieldWrap}
      focusStyle={styles.fieldWrapFocused}
      scale={1}
    >
      {({ focused }) => (
        <View style={[styles.field, focused && styles.fieldFocused]}>
          <Icon size={20} color={focused ? colors.brand : colors.textFaint} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholderTextColor={colors.textFaint}
            underlineColorAndroid="transparent"
            {...inputProps}
          />
        </View>
      )}
    </TvFocusable>
  );
}

export default function TvLoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailRef = useRef(null);
  const passRef = useRef(null);

  const onSubmit = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <AuthBackground />

      {/* Logo gigante de fondo a la derecha: da profundidad y refuerza la marca
          sin competir con el formulario (opacidad muy baja). */}
      <View style={styles.watermark} pointerEvents="none">
        <Logo height={420} />
      </View>

      <View style={styles.content}>
        <View style={styles.brandRow}>
          <Logo height={44} />
          <Text style={styles.brand}>MI <Text style={styles.brandAccent}>VOD</Text></Text>
        </View>

        <Text style={styles.heading}>Inicia sesión</Text>
        <Text style={styles.sub}>Usa la misma cuenta que en la web.</Text>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TVFocusGuideView autoFocus style={styles.form}>
          <Field
            icon={MailIcon}
            inputRef={emailRef}
            preferredFocus
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
          />
          <Field
            icon={LockIcon}
            inputRef={passRef}
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          <TvFocusable
            onPress={onSubmit}
            style={styles.button}
            focusStyle={styles.buttonFocused}
            scale={1.02}
          >
            {({ focused }) => (
              loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[styles.buttonText, focused && styles.buttonTextFocused]}>Entrar</Text>
            )}
          </TvFocusable>
        </TVFocusGuideView>

        {/* Saber a qué servidor apunta la app ahorra muchos malentendidos al
            depurar en casa de otro (o con la VPN puesta). */}
        <Text style={styles.server}>{API_BASE.replace(/^https?:\/\//, '')}</Text>
      </View>
    </View>
  );
}

const COLUMN = 420;   // ancho de la columna del formulario (dp)

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d0d0f' },

  watermark: {
    position: 'absolute',
    right: -110, top: '50%',
    marginTop: -210,
    opacity: 0.07,
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: overscan.horizontal + spacing.lg,
    width: COLUMN + overscan.horizontal + spacing.lg,
  },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  brand: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  brandAccent: { color: colors.brand },

  heading: { ...type.hero, fontSize: 34 },
  sub: { ...type.body, marginTop: 4, marginBottom: spacing.lg },

  errorBox: {
    borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    marginBottom: spacing.md,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },

  form: { width: COLUMN, gap: spacing.sm },

  // El borde exterior existe SIEMPRE (transparente sin foco) para que activarlo
  // no desplace nada: mismo principio que las carátulas del catálogo.
  // Grosor 3 dp: a tres metros un borde de 2 dp apenas se distingue.
  fieldWrap: { borderRadius: 14, borderWidth: 3, borderColor: 'transparent' },
  fieldWrapFocused: { borderColor: colors.brand },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: spacing.md,
  },
  // El foco cambia borde Y fondo: dos señales redundantes, porque en un panel
  // mal calibrado (o con el brillo bajo) una sola puede no apreciarse.
  fieldFocused: { backgroundColor: 'rgba(227,83,54,0.22)' },
  input: { flex: 1, color: colors.text, fontSize: 17, padding: 0 },

  button: {
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm,
    borderWidth: 2, borderColor: 'transparent',
  },
  buttonFocused: { backgroundColor: '#fff', borderColor: '#fff' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  buttonTextFocused: { color: '#000' },

  server: {
    position: 'absolute',
    left: overscan.horizontal + spacing.lg,
    bottom: overscan.vertical,
    color: colors.textFaint,
    fontSize: 12,
  },
});
