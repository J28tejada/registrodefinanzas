import { Pressable, ScrollView, View } from 'react-native';
import Texto from './Texto';
import IconoDeCategoria from './IconoDeCategoria';
import { ICONOS_CATEGORIA } from '../lib/iconos-categoria';
import { COLORES_CATEGORIA, GRUPOS_DE_ICONOS } from '@compartido/categorias-catalogo';
import { LEDGER_COLOR_MAP, TransactionType } from '@compartido/types';

/**
 * El gemelo de components/IconPicker.tsx.
 *
 * Elegir el dibujo de una categoría: primero el color, después el ícono. El
 * color arriba y no abajo porque tiñe a todos los íconos de la grilla: se elige
 * una vez y después se recorre la grilla viendo ya cómo va a quedar, en lugar
 * de elegir un ícono a ciegas y descubrir el color después.
 */
export default function SelectorDeIcono({
  icon, color, type, onIcon, onColor,
}: {
  icon: string | null;
  color: string | null;
  type: TransactionType;
  onIcon: (clave: string) => void;
  onColor: (color: string | null) => void;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-1.5">
        {/* "Sin color" primero: es el estado de arranque y tiene que poder
            recuperarse, no solo abandonarse. */}
        <Pressable
          onPress={() => onColor(null)}
          accessibilityLabel="Sin color"
          className={`w-7 h-7 rounded-md bg-slate-700 border ${
            color === null ? 'border-2 border-white' : 'border-slate-600'
          }`}
          style={color === null ? { transform: [{ scale: 1.1 }] } : undefined}
        />
        {COLORES_CATEGORIA.map(c => (
          <Pressable
            key={c}
            onPress={() => onColor(c)}
            accessibilityLabel={`Color ${c}`}
            className={`w-7 h-7 rounded-md ${color === c ? 'border-2 border-white' : ''}`}
            style={[
              { backgroundColor: LEDGER_COLOR_MAP[c].main },
              color === c ? { transform: [{ scale: 1.1 }] } : null,
            ]}
          />
        ))}
      </View>

      {/* Alto tope y scroll: setenta íconos sueltos empujarían el nombre y los
          botones de guardar fuera de la pantalla del teléfono.
          `nestedScrollEnabled` porque esto vive dentro del ScrollView de la
          pantalla: sin eso, en Android el de afuera se queda con el gesto y
          esta lista no se mueve. */}
      <ScrollView
        className="max-h-56"
        nestedScrollEnabled
        contentContainerClassName="gap-3 pr-1"
      >
        {GRUPOS_DE_ICONOS.map(({ titulo, claves }) => (
          <View key={titulo} className="gap-1.5">
            <Texto className="text-2xs text-slate-500 uppercase tracking-wider">{titulo}</Texto>
            <View className="flex-row flex-wrap">
              {claves.map(clave => {
                const Icono = ICONOS_CATEGORIA[clave];
                const elegido = icon === clave;
                return (
                  <Pressable
                    key={clave}
                    onPress={() => onIcon(clave)}
                    accessibilityLabel={clave}
                    accessibilityState={{ selected: elegido }}
                    // Seis por fila, como el `grid-cols-6` de la web. En React
                    // Native no hay grilla: el ancho va en porcentaje y la
                    // separación adentro de cada celda, porque un `gap` sobre
                    // seis celdas de 1/6 no entra en el renglón.
                    className="items-center justify-center p-0.5"
                    style={{ width: `${100 / 6}%`, aspectRatio: 1 }}
                  >
                    <View className={`flex-1 w-full rounded-lg items-center justify-center ${
                      elegido ? 'border-2 border-emerald-400' : ''
                    }`}>
                      {elegido
                        ? <IconoDeCategoria icon={clave} color={color} type={type} size="sm" />
                        : <Icono size={16} color="#94a3b8" strokeWidth={1.75} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
