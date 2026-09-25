import { InputAccessoryView, Keyboard, Platform, Pressable, View } from 'react-native';
import Texto from './Texto';

/**
 * El id que un campo pasa en `inputAccessoryViewID` para llevar la barra.
 *
 * Va en todos los campos con teclado numérico (`decimal-pad`, `number-pad`,
 * `phone-pad`): en iOS esos teclados no tienen tecla de aceptar ni de cerrar, y
 * una vez abiertos no había forma de sacarlos. Tapaban además el botón de
 * guardar.
 */
export const TECLADO_CON_LISTO = 'teclado-con-listo';

/**
 * La barra con "Listo" que aparece pegada arriba del teclado, como en las apps
 * de iOS. Solo iOS: en Android el teclado numérico trae su propia tecla.
 *
 * Sin gemelo en la web: el navegador del teléfono pone su propia barra con
 * "OK" encima del teclado.
 *
 * Tiene que estar montada en el mismo árbol que el campo: una por pantalla la
 * pone Estructura, y el formulario de movimiento, que es un `Modal` y vive en
 * otra ventana, monta la suya.
 */
export default function BarraDelTeclado() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={TECLADO_CON_LISTO}>
      <View className="bg-panel-fuerte border-t border-linea px-4 py-2 flex-row justify-end">
        <Pressable
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Cerrar el teclado"
          hitSlop={8}
          className="px-3 py-1.5 rounded-lg active:bg-hundido"
        >
          <Texto className="text-base font-semibold text-tinta">Listo</Texto>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}
