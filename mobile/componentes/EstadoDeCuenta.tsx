import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Bell, CalendarClock, Loader2, Scissors, Trash2, X } from 'lucide-react-native';
import Texto from './Texto';
import Selector from './Selector';
import CampoDeFecha from './CampoDeFecha';
import { budgetTone } from './BarraDePresupuesto';
import { useFormatters } from './ContextoDeAjustes';
import { db } from '../lib/datos';
import { borrarPagoTarjeta, registrarPagoTarjeta } from '@compartido/db';
import { fechaValida } from '@compartido/format';
import { Card, CardBalance, CardPayment } from '@compartido/types';
import { useColores } from '../lib/colores';

/**
 * El gemelo de components/CardStatement.tsx.
 *
 * El estado de cuenta de una tarjeta de crédito: cuánto se debe, cuánto queda
 * del cupo y cuándo cierra y vence.
 *
 * Acá vive la respuesta a "¿por qué mi gasto no baja cuando le pago a la
 * tarjeta?": el pago se registra en este bloque y baja el saldo, sin tocar los
 * movimientos del mes. La compra ya se anotó el día que se hizo.
 */
export default function EstadoDeCuenta({
  card, balance, payments, mediosDePago, usuario, onCambio,
}: {
  card: Card;
  balance: CardBalance;
  payments: CardPayment[];
  /** Los otros medios de pago, para decir de dónde salió la plata. */
  mediosDePago: { id: string; name: string }[];
  usuario: string;
  onCambio: () => void | Promise<void>;
}) {
  const paleta = useColores();
  const fmt = useFormatters();
  const [pagando, setPagando] = useState(false);

  const { ciclo } = balance;
  const sinConfigurar = card.credit_limit == null && ciclo == null;

  // La barra usa la misma escala que los presupuestos: ámbar al 80% del cupo,
  // rojo al llegar. Es la misma pregunta —cuánto falta para el techo— y tener
  // dos escalas distintas obligaría a aprenderse cuál es cuál.
  const uso = balance.usoDelLimite ?? 0;
  const tono = budgetTone(uso);

  return (
    <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <Texto className="text-sm font-medium text-tinta">Estado de cuenta</Texto>
        {card.alerts && ciclo ? (
          <View className="flex-row items-center gap-1">
            <Bell size={12} color={paleta.tinta2} />
            <Texto className="text-2xs text-tinta-2">avisos activos</Texto>
          </View>
        ) : null}
      </View>

      {/* El saldo, que es a lo que se viene. */}
      <View>
        <Texto className="text-2xs text-tinta-2">
          {balance.saldo < 0 ? 'A favor' : 'Debés'}
        </Texto>
        <Texto className={`text-2xl font-semibold mt-1 ${balance.saldo > 0 ? 'text-tinta' : 'text-acento'}`}>
          {fmt.money(Math.abs(balance.saldo))}
        </Texto>
      </View>

      {/* Cuánto del cupo va consumido. Sin límite cargado no hay contra qué
          medir, y una barra sin escala no dice nada. */}
      {card.credit_limit != null ? (
        <View className="gap-1.5">
          <View className="h-2 bg-hundido rounded-full overflow-hidden">
            <View className={`h-full rounded-full ${tono.bar}`} style={{ width: `${Math.min(uso, 100)}%` }} />
          </View>
          {/* Los dos textos se encogen, ninguno se recorta.
              En la web son dos `<span>` de un flex con `justify-between`, y
              cuando no entran los dos, el navegador les reparte el faltante y
              CADA UNO envuelve —"125% del / límite" a la izquierda, el monto del
              límite abajo a la derecha—. En React Native un texto no se encoge
              solo: sin `shrink` el de la izquierda se queda en un renglón y el
              de la derecha empuja. Con `flex-1` y `text-right` tampoco servía:
              la segunda línea quedaba alineada al otro lado. */}
          <View className="flex-row items-center justify-between gap-2">
            <Texto className={`text-xs shrink ${tono.text}`}>{Math.round(uso)}% del límite</Texto>
            <Texto className="text-xs text-tinta-2 shrink">
              {balance.disponible != null && balance.disponible >= 0
                ? `${fmt.money(balance.disponible)} disponibles`
                : `${fmt.money(Math.abs(balance.disponible ?? 0))} por encima del límite`}
              <Texto className="text-xs text-tinta-3"> de {fmt.money(card.credit_limit)}</Texto>
            </Texto>
          </View>
        </View>
      ) : (
        <Texto className="text-xs text-tinta-2">
          Cargale el límite en «Editar» para ver cuánto llevás consumido.
        </Texto>
      )}

      {/* Las dos fechas del ciclo. */}
      {ciclo ? (
        <View className="flex-row gap-2">
          <Fecha
            icono={<Scissors size={14} color={paleta.tinta2} />}
            titulo="Corte"
            fecha={fmt.date(ciclo.nextStatement)}
            dias={ciclo.daysToStatement}
          />
          <Fecha
            icono={<CalendarClock size={14} color={paleta.tinta2} />}
            titulo="Pago"
            fecha={fmt.date(ciclo.nextDue)}
            dias={ciclo.daysToDue}
            urgente={ciclo.daysToDue <= 3}
          />
        </View>
      ) : (
        <Texto className="text-xs text-tinta-2">
          Poné el día de corte y el de pago en «Editar» y te aviso tres días antes
          de cada uno.
        </Texto>
      )}

      {/* Lo facturado contra lo que todavía no cerró: son dos plata distintas y
          confundirlas es pagar de menos. */}
      {ciclo ? (
        <View className="flex-row gap-2 pt-1 border-t border-linea">
          <View className="flex-1 pt-3">
            <Texto className="text-2xs text-tinta-2">A pagar</Texto>
            <Texto className="text-base font-semibold text-tinta mt-0.5" numberOfLines={1}>
              {fmt.money(balance.aPagar)}
            </Texto>
            <Texto className="text-2xs text-tinta-2">ya facturado</Texto>
          </View>
          <View className="flex-1 pt-3">
            <Texto className="text-2xs text-tinta-2">Este ciclo</Texto>
            <Texto className="text-base font-semibold text-tinta mt-0.5" numberOfLines={1}>
              {fmt.money(balance.cycleCharged)}
            </Texto>
            <Texto className="text-2xs text-tinta-2">entra en el próximo corte</Texto>
          </View>
        </View>
      ) : null}

      {sinConfigurar ? (
        <Texto className="text-xs text-tinta-2 bg-hundido rounded-lg px-3 py-2">
          El saldo ya se lleva solo: cada compra que anotes con esta tarjeta lo
          sube, y cada pago que registres acá lo baja.
        </Texto>
      ) : null}

      {/* Registrar un pago: la pieza que evita el doble conteo. */}
      {pagando ? (
        <FormularioDePago
          cardId={card.id}
          usuario={usuario}
          sugerido={balance.aPagar > 0 ? balance.aPagar : Math.max(balance.saldo, 0)}
          hoy={fmt.today()}
          mediosDePago={mediosDePago}
          onListo={async () => { setPagando(false); await onCambio(); }}
          onCancelar={() => setPagando(false)}
        />
      ) : (
        <Pressable
          onPress={() => setPagando(true)}
          className="w-full py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center"
        >
          <Texto className="text-sobre-primario text-sm font-medium">Registrar un pago</Texto>
        </Pressable>
      )}

      <Texto className="text-2xs text-tinta-2 leading-relaxed">
        Pagarle a la tarjeta no es un gasto nuevo: la compra ya se anotó el día que
        la hiciste. Por eso el pago baja este saldo y no aparece en los movimientos
        del mes — si no, la misma plata contaría dos veces.
      </Texto>

      {payments.length > 0 ? (
        <ListaDePagos
          payments={payments}
          usuario={usuario}
          mediosDePago={mediosDePago}
          onCambio={onCambio}
        />
      ) : null}
    </View>
  );
}

/** Una de las dos fechas del ciclo, con cuánto falta. */
function Fecha({
  icono, titulo, fecha, dias, urgente,
}: {
  icono: React.ReactNode;
  titulo: string;
  fecha: string;
  dias: number;
  urgente?: boolean;
}) {
  return (
    <View className={`flex-1 rounded-xl px-3 py-2.5 border ${
      urgente ? 'bg-aviso/10 border-aviso/30' : 'bg-hundido border-linea'
    }`}>
      <View className="flex-row items-center gap-1.5">
        {icono}
        <Texto className="text-2xs text-tinta-2">{titulo}</Texto>
      </View>
      <Texto className="text-sm font-semibold text-tinta mt-1" numberOfLines={1}>{fecha}</Texto>
      <Texto className={`text-2xs ${urgente ? 'text-aviso' : 'text-tinta-2'}`}>
        {dias === 0 ? 'es hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}
      </Texto>
    </View>
  );
}

function FormularioDePago({
  cardId, usuario, sugerido, hoy, mediosDePago, onListo, onCancelar,
}: {
  cardId: string;
  usuario: string;
  sugerido: number;
  hoy: string;
  mediosDePago: { id: string; name: string }[];
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
}) {
  // Se sugiere lo que hay que pagar, pero se puede pisar: pagar el mínimo o de
  // más son las dos cosas más comunes.
  const paleta = useColores();
  const [monto, setMonto] = useState(sugerido > 0 ? sugerido.toFixed(2) : '');
  const [fecha, setFecha] = useState(hoy);
  const [origen, setOrigen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const res = await registrarPagoTarjeta(db(usuario), cardId, {
        amount: Number(monto),
        // La misma red que pone la ruta de la web: un campo de fecha vacío o
        // pisado a mano no puede llegar a la base como una fila con `date` nula.
        date: fechaValida(fecha, hoy),
        source_card_id: origen || null,
      });
      if (!res.ok) { setError(res.error); return; }
      await onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const puede = Number(monto) > 0;

  return (
    <View className="border border-linea rounded-xl p-3 gap-2.5 bg-fondo">
      <Texto className="text-xs font-medium text-tinta-2">Pago a la tarjeta</Texto>

      <View className="flex-row gap-2">
        <View className="flex-1 gap-1">
          <Texto className="text-xs text-tinta-2 leading-6">Monto</Texto>
          <TextInput
            keyboardType="decimal-pad"
            value={monto} onChangeText={setMonto} autoFocus
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
          />
        </View>
        <View className="flex-1 gap-1">
          <Texto className="text-xs text-tinta-2 leading-6">Fecha</Texto>
          <CampoDeFecha
            value={fecha} onChange={setFecha}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5"
          />
        </View>
      </View>

      {mediosDePago.length > 0 ? (
        <View className="gap-1">
          <Texto className="text-xs text-tinta-2 leading-6">De dónde salió (opcional)</Texto>
          <Selector
            value={origen}
            opciones={[
              { valor: '', etiqueta: 'Sin especificar' },
              ...mediosDePago.map(m => ({ valor: m.id, etiqueta: m.name })),
            ]}
            onChange={setOrigen}
            titulo="De dónde salió"
          />
        </View>
      ) : null}

      {error ? <Texto className="text-xs text-peligro">{error}</Texto> : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={onCancelar}
          className="flex-1 py-2.5 bg-hundido active:bg-presionado rounded-lg flex-row items-center justify-center gap-1.5"
        >
          <X size={16} color={paleta.tinta} />
          <Texto className="text-tinta text-sm">Cancelar</Texto>
        </Pressable>
        <Pressable
          onPress={guardar}
          disabled={guardando || !puede}
          style={guardando || !puede ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-1.5"
        >
          {guardando ? <Loader2 size={16} color={paleta.sobrePrimario} /> : null}
          <Texto className="text-sobre-primario text-sm font-medium">Guardar pago</Texto>
        </Pressable>
      </View>
    </View>
  );
}

function ListaDePagos({
  payments, usuario, mediosDePago, onCambio,
}: {
  payments: CardPayment[];
  usuario: string;
  mediosDePago: { id: string; name: string }[];
  onCambio: () => void | Promise<void>;
}) {
  const paleta = useColores();
  const fmt = useFormatters();
  const [borrando, setBorrando] = useState<string | null>(null);
  const nombres = new Map(mediosDePago.map(m => [m.id, m.name]));

  const borrar = (pagoId: string) => {
    Alert.alert('¿Eliminar este pago?', 'El saldo vuelve a subir.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setBorrando(pagoId);
          try {
            await borrarPagoTarjeta(db(usuario), pagoId);
            await onCambio();
          } finally {
            setBorrando(null);
          }
        },
      },
    ]);
  };

  return (
    <View className="gap-2 pt-1 border-t border-linea">
      <Texto className="text-xs font-medium text-tinta-2 pt-3">
        Pagos · {payments.length}
      </Texto>
      {payments.map(p => (
        <View key={p.id} className="flex-row items-center gap-3 bg-hundido rounded-lg px-3 py-2">
          <View className="flex-1">
            <Texto className="text-sm text-tinta">{fmt.money(p.amount)}</Texto>
            <Texto className="text-2xs text-tinta-2" numberOfLines={1}>
              {fmt.date(p.date)}
              {p.source_card_id && nombres.has(p.source_card_id)
                ? ` · desde ${nombres.get(p.source_card_id)}`
                : ''}
            </Texto>
          </View>
          <Pressable
            onPress={() => borrar(p.id)}
            disabled={borrando === p.id}
            accessibilityLabel="Eliminar pago"
            className="p-1.5"
            style={borrando === p.id ? { opacity: 0.5 } : undefined}
          >
            {borrando === p.id
              ? <Loader2 size={16} color={paleta.tinta3} />
              : <Trash2 size={16} color={paleta.tinta3} />}
          </Pressable>
        </View>
      ))}
    </View>
  );
}
