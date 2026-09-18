import { View } from 'react-native';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import TarjetaDeResumen from '../componentes/TarjetaDeResumen';
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
        <Texto className="text-xl font-bold text-white">Vista previa</Texto>
        <Texto className="text-slate-400 text-sm">La navegación, sin datos de verdad</Texto>
      </View>

      <View className="flex-row gap-3">
        {RESUMENES.slice(0, 2).map(p => (
          <View key={p.id} className="flex-1">
            <TarjetaDeResumen
              title={p.title} subtitle={p.subtitle} amount={p.amount}
              variant={p.variant}
              icon={p.variant === 'income' ? TrendingUp : TrendingDown}
            />
          </View>
        ))}
      </View>
      <TarjetaDeResumen
        title="Balance" subtitle="del mes" amount={7779} variant="balance" icon={Wallet}
      />

      <View className="bg-slate-900 border border-slate-800 rounded-xl p-5 gap-3">
        <Texto className="text-sm font-medium text-slate-300">Presupuestos del mes</Texto>
        {PRESUPUESTOS.map(p => <BarraDePresupuesto key={p.id} budget={p.budget} compact />)}
      </View>

      {/* Relleno: si la barra de abajo tapa esto, el pb-32 no alcanza. */}
      {[1, 2, 3].map(n => (
        <View key={n} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <Texto className="text-sm text-slate-400">Bloque de relleno {n}</Texto>
        </View>
      ))}
      <View className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
        <Texto className="text-sm text-emerald-400">
          Si ves este bloque entero, el espacio de abajo alcanza.
        </Texto>
      </View>
    </Pantalla>
  );
}
