import { ScrollView, View } from 'react-native';
import Texto from '../componentes/Texto';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react-native';
import TarjetaDeResumen from '../componentes/TarjetaDeResumen';
import BarraDePresupuesto from '../componentes/BarraDePresupuesto';
import IconoDeCategoria from '../componentes/IconoDeCategoria';
import ListaDeMovimientos from '../componentes/ListaDeMovimientos';
import { ProveedorDeAjustes } from '../componentes/ContextoDeAjustes';
import { ProveedorDeCategorias } from '../componentes/ContextoDeCategorias';
import { ICONOS, MOVIMIENTOS, MOVIMIENTOS_ANCHO, PIEZAS, PRESUPUESTOS, RESUMENES } from '@compartido/galeria';

/**
 * El catálogo de componentes del teléfono: el gemelo de app/galeria/page.tsx.
 *
 * Mismas piezas, mismos datos, mismos anchos. Lo que cambia es de qué paquete
 * salen los componentes — y justamente eso es lo que la comparación mide.
 */
const ICONO_RESUMEN = { income: TrendingUp, expense: TrendingDown, balance: Wallet } as const;

export default function Galeria() {
  return (
    <ProveedorDeAjustes>
      <ProveedorDeCategorias>
      <ScrollView className="flex-1 bg-slate-950" contentContainerClassName="p-6">
        <View className="max-w-3xl mx-auto w-full gap-8">
          <View>
            <Texto className="text-xl font-bold text-white">Galería · teléfono</Texto>
            <Texto className="text-slate-400 text-sm">{PIEZAS.length} piezas para comparar con la web</Texto>
          </View>

          {RESUMENES.map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              <TarjetaDeResumen
                title={p.title} subtitle={p.subtitle} amount={p.amount}
                variant={p.variant} icon={ICONO_RESUMEN[p.variant]}
              />
            </Pieza>
          ))}

          {PRESUPUESTOS.map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              <BarraDePresupuesto budget={p.budget} />
            </Pieza>
          ))}

          {[...MOVIMIENTOS, ...MOVIMIENTOS_ANCHO].map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              <ListaDeMovimientos transactions={p.transactions} onEdit={() => {}} onDelete={() => {}} />
            </Pieza>
          ))}

          {ICONOS.map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              <IconoDeCategoria icon={p.icon} color={p.color} type={p.type} size={p.size} />
            </Pieza>
          ))}
        </View>
      </ScrollView>
      </ProveedorDeCategorias>
    </ProveedorDeAjustes>
  );
}

/**
 * El envoltorio de cada pieza.
 *
 * `nativeID` y no `data-pieza`: en React Native no hay atributos sueltos, y al
 * exportar a web se convierte en el `id` del elemento, que es lo que busca el
 * comparador.
 */
function Pieza({ id, titulo, ancho, children }: {
  id: string; titulo: string; ancho: number; children: React.ReactNode;
}) {
  return (
    <View>
      <Texto className="text-xs text-slate-500 mb-2">{titulo}</Texto>
      <View nativeID={id} style={{ width: ancho }}>{children}</View>
    </View>
  );
}
