// ----------------------------------------------------------------------------
//  Focusable — envoltorio que muestra el FOCO del control remoto (Android TV).
//
//  En TV, al navegar con el D-pad, el elemento enfocado se resalta con un anillo
//  terracota y un leve zoom. En móvil no hay foco, así que se comporta como un
//  botón normal (sin cambios visuales).
// ----------------------------------------------------------------------------
import { Pressable, StyleSheet, Platform } from 'react-native';

// El resalte de foco solo tiene sentido con mando: indica dónde está el cursor
// del D-pad. En móvil la vista conserva el foco de Android tras volver de otra
// pantalla, y el botón se quedaba con un borde terracota permanente.
const IS_TV = Platform.isTV === true;

export default function Focusable({
  children, onPress, style, focusStyle, focusScale = 1.06, ring = true, ...rest
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ focused: rawFocused, pressed }) => {
        const focused = rawFocused && IS_TV;
        return [
          style,
          focused && ring && styles.ring,
          focused && focusStyle,
          focused && { transform: [{ scale: focusScale }] },
          pressed && styles.pressed,
        ];
      }}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: '#E35336', borderRadius: 8 },
  pressed: { opacity: 0.7 },
});
