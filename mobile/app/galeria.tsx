import { ScrollView, View } from 'react-native';
import Texto from '../componentes/Texto';
import ResumenDelMes from '../componentes/ResumenDelMes';
import BarraDePresupuesto from '../componentes/BarraDePresupuesto';
import IconoDeCategoria from '../componentes/IconoDeCategoria';
import ListaDeMovimientos from '../componentes/ListaDeMovimientos';
import EstadoDeCuenta from '../componentes/EstadoDeCuenta';
import ResumenDeExtracto from '../componentes/ResumenDeExtracto';
import RevisionDeExtracto from '../componentes/RevisionDeExtracto';
import HojaDeLineaDeExtracto from '../componentes/HojaDeLineaDeExtracto';
import { ProveedorDeAjustes } from '../componentes/ContextoDeAjustes';
import { ProveedorDeCategorias } from '../componentes/ContextoDeCategorias';
import {
  CATEGORIAS_DEL_EXTRACTO, ESTADOS_DE_CUENTA, EXTRACTO_HOJA, EXTRACTO_RESUMEN, EXTRACTO_SECCIONES,
  ICONOS, MOVIMIENTOS, MOVIMIENTOS_ANCHO, PIEZAS, PRESUPUESTOS, RESUMENES,
} from '@compartido/galeria';
import { makeFormatters } from '@compartido/format';
import { DEFAULT_SETTINGS } from '@compartido/types';

/**
 * El catálogo de componentes del teléfono: el gemelo de app/galeria/page.tsx.
 *
 * Mismas piezas, mismos datos, mismos anchos. Lo que cambia es de qué paquete
 * salen los componentes — y justamente eso es lo que la comparación mide.
 */

/**
 * Los montos del estado de cuenta con la configuración fija, igual que la web.
 * Esas piezas reciben el formateador por prop, así que el `ProveedorDeAjustes`
 * de abajo no les llega: hay que armárselo.
 */
const fmt = makeFormatters(DEFAULT_SETTINGS);
const dinero = (centavos: number) => fmt.money(centavos / 100);
const nada = () => {};

export default function Galeria() {
  // Con la configuración fija, no la del usuario: la galería tiene que dibujar
  // los mismos montos siempre, haya sesión o no.
  return (
    <ProveedorDeAjustes settings={DEFAULT_SETTINGS}>
      <ProveedorDeCategorias>
      <ScrollView className="flex-1 bg-fondo" contentContainerClassName="p-6">
        <View className="max-w-3xl mx-auto w-full gap-8">
          <View>
            <Texto className="text-xl font-semibold text-tinta">Galería · teléfono</Texto>
            <Texto className="text-tinta-2 text-sm">{PIEZAS.length} piezas para comparar con la web</Texto>
          </View>

          {RESUMENES.map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              <ResumenDelMes income={p.income} expenses={p.expenses} balance={p.balance} />
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

          {ESTADOS_DE_CUENTA.map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              {/* `usuario` vacío a propósito: la galería no tiene sesión, y esta
                  pieza solo toca la base cuando alguien abre el formulario de
                  pago, que acá nunca se abre. */}
              <EstadoDeCuenta
                card={p.card} balance={p.balance} payments={p.payments}
                mediosDePago={p.mediosDePago} usuario="" onCambio={() => {}}
              />
            </Pieza>
          ))}

          <Pieza id={EXTRACTO_RESUMEN.id} titulo={EXTRACTO_RESUMEN.titulo} ancho={EXTRACTO_RESUMEN.ancho}>
            <ResumenDeExtracto
              resumen={EXTRACTO_RESUMEN.resumen} boton={EXTRACTO_RESUMEN.boton} dinero={dinero}
              libros={EXTRACTO_RESUMEN.libros} libroId={EXTRACTO_RESUMEN.libroId} onLibro={nada}
              onCambio={nada} onConteo={nada} onImportar={nada}
            />
          </Pieza>

          {EXTRACTO_SECCIONES.map(p => (
            <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
              <RevisionDeExtracto
                seccion={p.seccion} abierta onAlternar={nada} dinero={dinero}
                categorias={CATEGORIAS_DEL_EXTRACTO} onCambio={nada} onAbrirFila={nada}
              />
            </Pieza>
          ))}

          <Pieza id={EXTRACTO_HOJA.id} titulo={EXTRACTO_HOJA.titulo} ancho={EXTRACTO_HOJA.ancho}>
            <HojaDeLineaDeExtracto
              hoja={EXTRACTO_HOJA.hoja} dinero={dinero} categorias={CATEGORIAS_DEL_EXTRACTO}
              onCambio={nada} onCerrar={nada} enLinea
            />
          </Pieza>

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
      <Texto className="text-xs text-tinta-2 mb-2">{titulo}</Texto>
      <View nativeID={id} style={{ width: ancho }}>{children}</View>
    </View>
  );
}
