import { View } from 'react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import ResumenDelMes from '../componentes/ResumenDelMes';
import BarraDePresupuesto from '../componentes/BarraDePresupuesto';
import { PRESUPUESTOS, RESUMENES } from '@compartido/galeria';

/**
 * El chrome dibujado sin sesión, para poder mirarlo.
 *
 * No es una pantalla de la app. La navegación solo aparece en las pantallas que
 * piden sesión, así que sin entrar no hay forma de verla — y para revisar que
 * las barras y el menú quedaron bien no hace falta una cuenta de verdad.
 *
 * Lleva contenido de sobra a propósito: es lo que muestra si el `pb-32` alcanza
 * para que la última tarjeta no quede debajo de la barra de abajo.
 */
export default function VistaPrevia() {
  return (
    <Pantalla className="gap-6">
      <View>
        <Texto className="text-xl font-semibold text-tinta">Vista previa</Texto>
        <Texto className="text-tinta-2 text-sm">La navegación, sin datos de verdad</Texto>
      </View>

      <ResumenDelMes income={RESUMENES[0].income} expenses={RESUMENES[0].expenses} balance={RESUMENES[0].balance} />

      <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl px-4 pt-3.5 pb-1">
        <Texto className="text-base font-semibold text-tinta mb-1">Presupuestos</Texto>
        {PRESUPUESTOS.map(p => (
          <View key={p.id} className="py-3.5 border-t border-linea">
            <BarraDePresupuesto budget={p.budget} compact />
          </View>
        ))}
      </View>

      {/* Relleno: si la barra de abajo tapa esto, el pb-32 no alcanza. */}
      {[1, 2, 3].map(n => (
        <View key={n} className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5">
          <Texto className="text-sm text-tinta-2">Bloque de relleno {n}</Texto>
        </View>
      ))}
      <View className="bg-acento/10 border border-acento/30 rounded-xl p-5">
        <Texto className="text-sm text-acento">
          Si ves este bloque entero, el espacio de abajo alcanza.
        </Texto>
      </View>
    </Pantalla>
  );
}
