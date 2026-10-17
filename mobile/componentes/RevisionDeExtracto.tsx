import { Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  AlertTriangle, Check, ChevronDown, CircleMinus, CirclePlus, CreditCard, Link2, Lock,
} from 'lucide-react-native';
import Texto from './Texto';
import IconoDeCategoria from './IconoDeCategoria';
import { useColores } from '../lib/colores';
import type { Category, TransactionType } from '@compartido/types';
import type {
  AccionDeFila, CambioDePlan, FilaDeVista, GrupoDeVista, IdDeSeccion, InterruptorDeVista,
  MontoDeFila, SeccionDeVista,
} from '@compartido/extractos/planear';

/**
 * Una sección de la revisión de un estado de cuenta: "Para revisar", "Se
 * anotan", "No se anotan"… El gemelo de components/BankStatementReview.tsx.
 *
 * Dibuja solo lo que le llega de `vistaDelPlan`, que es el mismo en la web y
 * acá: si esto decidiera algo, las dos apps podrían mostrar cosas distintas
 * para el mismo PDF. Sin contextos ni pedidos, para que la galería la dibuje.
 */

/** De centavos a texto, con la moneda de la persona. Cada app pasa su formateador. */
export type Dinero = (centavos: number) => string;

/** Lo que tocó la persona. `destino`: la clave de una línea, un grupo de "Para revisar" o null. */
export type AlCambiar = (destino: string | null, cambio: CambioDePlan) => void;

/** `tabular-nums` no existe como clase en NativeWind: va por estilo, en cada monto. */
export const NUMEROS_PAREJOS = { fontVariant: ['tabular-nums' as const] };

/**
 * El `shadow-sm` de la web, escrito a mano. La misma clase en NativeWind es
 * otra sombra —1px al 35% de negro, la de su preset— y lo elegido se veía con
 * un filo oscuro abajo que en la web no tiene.
 */
export const SOMBRA_CHICA = { boxShadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)' };

// Un ícono por sección para reconocerlas al pasar sin leer el título. Solo
// "Para revisar" va en color: es la única que pide algo.
const ICONO_DE_SECCION: Record<IdDeSeccion, LucideIcon> = {
  revisar: AlertTriangle,
  'se-anotan': CirclePlus,
  pagos: CreditCard,
  'ya-estaban': Link2,
  'no-se-anotan': CircleMinus,
  'ya-importados': Lock,
};

export default function RevisionDeExtracto({
  seccion, abierta, onAlternar, dinero, categorias, onCambio, onAbrirFila,
}: {
  seccion: SeccionDeVista;
  /** Controlada desde afuera: tocar un conteo del resumen la abre antes de llevar hasta ella. */
  abierta: boolean;
  onAlternar: () => void;
  dinero: Dinero;
  /** Las del libro donde se anota: de ahí sale el ícono de cada fila. */
  categorias: Category[];
  onCambio: AlCambiar;
  onAbrirFila: (clave: string) => void;
}) {
  const paleta = useColores();
  const Icono = ICONO_DE_SECCION[seccion.id];
  const { totales } = seccion;

  return (
    <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl">
      <Pressable
        onPress={onAlternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        className="w-full px-4 py-3 flex-row items-start gap-2.5"
      >
        <View className="mt-0.5">
          <Icono size={16} color={seccion.id === 'revisar' ? paleta.aviso : paleta.tinta2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Texto className="text-sm font-semibold text-tinta">{seccion.titulo}</Texto>
          {seccion.nota ? <Texto className="text-xs text-tinta-2">{seccion.nota}</Texto> : null}
          {/* Los dos totales por separado y no un neto: "se suman 12 de ingreso
              y 10.000 de gasto" se lee de una; un neto obliga a hacer la cuenta
              al revés para saber cuánto se gastó. */}
          {totales && (totales.ingresosCentavos > 0 || totales.gastosCentavos > 0) ? (
            <View className="flex-row flex-wrap gap-x-3">
              {totales.ingresosCentavos > 0 ? (
                <Texto className="text-xs font-medium text-acento" style={NUMEROS_PAREJOS}>
                  +{dinero(totales.ingresosCentavos)}
                </Texto>
              ) : null}
              {totales.gastosCentavos > 0 ? (
                <Texto className="text-xs font-medium text-tinta" style={NUMEROS_PAREJOS}>
                  −{dinero(totales.gastosCentavos)}
                </Texto>
              ) : null}
            </View>
          ) : null}
        </View>
        <View className="mt-0.5" style={abierta ? { transform: [{ rotate: '180deg' }] } : undefined}>
          <ChevronDown size={16} color={paleta.tinta3} />
        </View>
      </Pressable>

      {abierta ? seccion.grupos.map(g => (
        // La línea entre grupos va de borde a borde y la de entre filas, con
        // margen: así se ve dónde termina una pregunta y empieza la otra.
        <View key={g.id} className="border-t border-linea px-4">
          <EncabezadoDeGrupo grupo={g} onCambio={onCambio} />
          {g.filas.map((f, i) => (
            <View key={f.clave} className={i > 0 || tieneEncabezado(g) ? 'border-t border-linea' : ''}>
              <Fila fila={f} dinero={dinero} categorias={categorias} onCambio={onCambio} onAbrir={() => onAbrirFila(f.clave)} />
            </View>
          ))}
        </View>
      )) : null}
    </View>
  );
}

function tieneEncabezado(g: GrupoDeVista): boolean {
  return !!(g.titulo || g.pregunta || g.nota || g.botones.length > 0 || g.interruptor);
}

/** El subtítulo de un grupo, con su pregunta, sus botones y su interruptor. */
function EncabezadoDeGrupo({ grupo, onCambio }: { grupo: GrupoDeVista; onCambio: AlCambiar }) {
  if (!tieneEncabezado(grupo)) return null;
  return (
    <View className="pt-3 pb-3 gap-2">
      {grupo.titulo || grupo.nota ? (
        <View className="flex-row items-start justify-between gap-3">
          {grupo.titulo ? <Texto className="flex-1 text-xs font-medium text-tinta-2">{grupo.titulo}</Texto> : null}
          {grupo.nota ? <Texto className="text-2xs text-tinta-3">{grupo.nota}</Texto> : null}
        </View>
      ) : null}
      {grupo.pregunta ? <Texto className="text-sm text-tinta">{grupo.pregunta}</Texto> : null}
      {grupo.botones.length > 0 ? (
        // Solo tocan lo que sigue sin decidir: lo ya elegido fila por fila no se pisa.
        // Con borde y sin relleno, para no confundirlos con las píldoras de
        // cada fila, que dicen casi lo mismo pero deciden una sola.
        <View className="flex-row flex-wrap gap-2">
          {grupo.botones.map(b => (
            <Pressable
              key={b.texto}
              onPress={() => onCambio(b.destino, b.cambio)}
              accessibilityRole="button"
              className="px-3 py-1.5 border border-linea-fuerte active:bg-hundido rounded-lg"
            >
              <Texto className="text-xs font-medium text-tinta">{b.texto}</Texto>
            </Pressable>
          ))}
        </View>
      ) : null}
      {grupo.interruptor ? (
        <Interruptor interruptor={grupo.interruptor} onCambiar={c => onCambio(null, c)} />
      ) : null}
    </View>
  );
}

/**
 * Una línea del banco. Tocarla abre su hoja; las píldoras de "Para revisar"
 * deciden sin abrirla, que es lo que se hace casi siempre.
 */
function Fila({
  fila, dinero, categorias, onCambio, onAbrir,
}: {
  fila: FilaDeVista;
  dinero: Dinero;
  categorias: Category[];
  onCambio: AlCambiar;
  onAbrir: () => void;
}) {
  const paleta = useColores();
  const tipo: TransactionType = fila.monto.signo === '+' ? 'income' : 'expense';
  const dibujo = fila.categoria ? dibujoDe(categorias, fila.categoria.categoria, tipo) : { icon: null, color: null };
  // Lo que no se anota se apaga entero, no solo el monto: un ícono verde y un
  // título en negro en "No se anotan" se leían como plata que sí entraba.
  const apagada = fila.monto.rol === 'apagado';

  const tocarPildora = (a: AccionDeFila) => {
    // Sin cambio, la píldora pide algo más (la categoría): eso se elige en la hoja.
    if (a.cambio) onCambio(fila.clave, a.cambio);
    else onAbrir();
  };

  return (
    <Pressable
      onPress={onAbrir}
      accessibilityRole="button"
      // Con el lector de pantalla la fila es un solo elemento y las píldoras de
      // adentro no se alcanzan: van como acciones de la fila, que es lo que en
      // la web hace llegar a cada una con Tab.
      accessibilityActions={fila.acciones.map(a => ({ name: a.id, label: a.texto }))}
      onAccessibilityAction={e => {
        const a = fila.acciones.find(x => x.id === e.nativeEvent.actionName);
        if (a) tocarPildora(a);
      }}
      className="py-3 flex-row items-start gap-3"
    >
      <IconoDeCategoria icon={dibujo.icon} color={dibujo.color} type={apagada ? 'expense' : tipo} size="sm" />

      <View className="flex-1 gap-1">
        <View className="flex-row items-start gap-3">
          <Texto
            className={`flex-1 text-sm font-medium ${apagada ? 'text-tinta-2' : 'text-tinta'}`}
            numberOfLines={1}
          >
            {fila.descripcion}
          </Texto>
          <Monto monto={fila.monto} dinero={dinero} className="text-sm font-medium" />
        </View>

        <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
          {/* Lo ya importado no se toca desde acá: el candado lo dice antes de abrirla. */}
          {fila.bloqueada ? <Lock size={12} color={paleta.tinta3} /> : null}
          <Texto className="text-xs text-tinta-2">{fila.fecha}</Texto>
          {fila.categoria ? (
            <>
              <View className="px-1.5 py-0.5 bg-hundido rounded-md">
                <Texto className="text-2xs text-tinta-2">{fila.categoria.texto}</Texto>
              </View>
              {fila.categoria.notas.map(n => (
                <Texto key={n} className="text-2xs text-tinta-3">{n}</Texto>
              ))}
            </>
          ) : null}
        </View>

        {fila.motivo ? <Texto className="text-xs text-tinta-2">{fila.motivo}</Texto> : null}

        {/* Lo que ya estaba anotado y podría ser esta línea, con su monto: si
            no coincide al centavo, es lo primero que se quiere comparar. */}
        {fila.candidato ? (
          <View className="mt-0.5 px-2.5 py-1.5 bg-hundido rounded-lg flex-row items-center justify-between gap-3">
            <Texto className="flex-1 text-xs text-tinta-2" numberOfLines={1}>{fila.candidato.texto}</Texto>
            <Texto className="text-xs text-tinta" style={NUMEROS_PAREJOS}>{dinero(fila.candidato.centavos)}</Texto>
          </View>
        ) : null}

        {fila.acciones.length > 0 ? (
          <View className="mt-1 flex-row flex-wrap gap-1.5">
            {fila.acciones.map(a => (
              <Pildora
                key={a.id}
                texto={a.texto}
                elegida={a.elegida}
                onElegir={() => tocarPildora(a)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * El ícono de la categoría de una fila, buscado por nombre entre las del libro
 * destino. Una que todavía no existe ('Cargos bancarios', que se crea al
 * importar) cae en el genérico, igual que en la lista de movimientos.
 */
function dibujoDe(categorias: Category[], nombre: string, tipo: TransactionType) {
  const buscado = nombre.trim().toLowerCase();
  const c = categorias.find(x => x.type === tipo && !x.parent_id && x.name.toLowerCase() === buscado);
  return { icon: c?.icon ?? null, color: c?.color ?? null };
}

// ─── Las piezas chicas, compartidas con el resumen y la hoja ─────────────────

/** Un monto con su signo: verde lo que entra, tinta lo que sale, apagado lo que no cuenta. */
export function Monto({ monto, dinero, className = '' }: { monto: MontoDeFila; dinero: Dinero; className?: string }) {
  const color = monto.rol === 'ingreso' ? 'text-acento' : monto.rol === 'gasto' ? 'text-tinta' : 'text-tinta-3';
  return (
    <Texto className={`${color} ${className}`} style={NUMEROS_PAREJOS}>
      {monto.signo}{dinero(monto.centavos)}
    </Texto>
  );
}

/**
 * Una opción que se elige tocándola. La elegida va en gris claro, levantada y
 * con el tilde, nunca en verde: el verde es para la plata que entra, y una
 * píldora verde en "No anotar" diría lo contrario de lo que hace.
 *
 * Es un `Pressable` adentro de otro —la fila también se toca—: el de adentro se
 * queda con el toque y el de afuera no se entera, que es el `stopPropagation`
 * de la web.
 */
export function Pildora({
  texto, elegida, onElegir, grande = false,
}: {
  texto: string;
  elegida: boolean;
  onElegir: () => void;
  /** En la hoja, donde son la decisión principal y hay lugar. */
  grande?: boolean;
}) {
  const paleta = useColores();
  return (
    <Pressable
      onPress={onElegir}
      accessibilityRole="button"
      accessibilityState={{ selected: elegida }}
      className={`rounded-full border flex-row items-center gap-1 ${grande ? 'px-3 py-1.5' : 'px-2.5 py-1'} ${
        elegida ? 'bg-elevado border-linea-fuerte' : 'bg-hundido border-transparent'
      }`}
      style={elegida ? SOMBRA_CHICA : undefined}
    >
      {elegida ? <Check size={grande ? 14 : 12} color={paleta.tinta} strokeWidth={2.5} /> : null}
      <Texto
        className={`${grande ? 'text-sm' : 'text-xs'} ${elegida ? 'text-tinta font-medium' : 'text-tinta-2'}`}
      >
        {texto}
      </Texto>
    </Pressable>
  );
}

/**
 * Un interruptor dibujado a mano, igual que en la web: el `Switch` de React
 * Native es el del sistema y se ve distinto en iOS y en Android. Prendido va en
 * el color de los botones principales; apagado, hueco y con la perilla más
 * chica, para que se distinga sin depender solo del color.
 */
export function Interruptor({
  interruptor, onCambiar,
}: {
  interruptor: InterruptorDeVista;
  onCambiar: (cambio: CambioDePlan) => void;
}) {
  const { valor } = interruptor;
  return (
    <Pressable
      onPress={() => onCambiar(interruptor.cambio)}
      accessibilityRole="switch"
      accessibilityState={{ checked: valor }}
      className="w-full flex-row items-center gap-3"
    >
      <Texto className="flex-1 text-sm text-tinta">{interruptor.texto}</Texto>
      <View
        className={`w-10 h-6 rounded-full border px-0.5 flex-row items-center ${
          valor ? 'bg-primario border-primario justify-end' : 'bg-hundido border-linea-fuerte justify-start'
        }`}
      >
        <View className={`rounded-full ${valor ? 'w-5 h-5 bg-sobre-primario' : 'w-4 h-4 ml-0.5 bg-tinta-3'}`} />
      </View>
    </Pressable>
  );
}
