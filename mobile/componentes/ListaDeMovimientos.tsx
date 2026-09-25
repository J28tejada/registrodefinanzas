import { Pressable, View } from 'react-native';
import {
  Bot, MessageCircle, Mic, Pencil, Receipt, Send, Trash2, User,
} from 'lucide-react-native';
import Texto from './Texto';
import IconoDeCategoria from './IconoDeCategoria';
import { useCategorias } from './ContextoDeCategorias';
import { useFormatters } from './ContextoDeAjustes';
import { useCuenta } from './ContextoDeCuenta';
import { useSesion } from './ContextoDeSesion';
import { LEDGER_COLOR_MAP, Transaction } from '@compartido/types';
import { useColores } from '../lib/colores';

/**
 * De dónde salió cada movimiento.
 *
 * En la web el color va como clase y el SVG lo hereda; acá el ícono nativo
 * quiere el color por prop. Se guarda el NOMBRE del color del tema y no el hex:
 * el hex lo pone `useColores()` según el teléfono esté en claro u oscuro.
 */
const ORIGEN = {
  voice: { icono: Mic, color: 'tinta2', texto: '' },
  ai: { icono: Bot, color: 'tinta2', texto: '' },
  manual: { icono: Pencil, color: 'tinta3', texto: '' },
  whatsapp: { icono: MessageCircle, color: 'acento', texto: 'vía WhatsApp' },
  telegram: { icono: Send, color: 'info', texto: 'vía Telegram' },
} as const;

/** El gemelo de components/TransactionList.tsx. */
export default function ListaDeMovimientos({
  transactions, onEdit, onDelete, loading,
}: {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
}) {
  const paleta = useColores();
  const { currentLedger, ledgers } = useCuenta();
  const { dibujoDe } = useCategorias();
  const { session } = useSesion();
  const fmt = useFormatters();
  // Para no repetir tu propio nombre en cada fila: solo se muestra el del otro.
  const miId = session?.user?.id ?? '';

  if (loading) {
    return (
      <View className="gap-2">
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} className="bg-hundido rounded-lg h-14" />
        ))}
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View className="items-center py-12">
        <View className="w-12 h-12 rounded-full bg-hundido items-center justify-center mb-3">
          <Receipt size={20} color={paleta.tinta2} />
        </View>
        <Texto className="text-sm font-medium text-tinta">Todavía no hay movimientos</Texto>
        <Texto className="text-sm text-tinta-2 mt-1">Registrá el primero con el botón +</Texto>
      </View>
    );
  }

  return (
    // Una lista con líneas entre filas, como la web.
    <View className="border-t border-linea">
      {transactions.map(tx => {
        const origen = ORIGEN[tx.source] ?? ORIGEN.manual;
        const IconoOrigen = origen.icono;
        const cuentaDelMov = tx.ledger_id ? ledgers.find(l => l.id === tx.ledger_id) : null;
        const mostrarCuenta = !currentLedger && cuentaDelMov;

        return (
          // Tocar la fila la edita; a la derecha queda solo la papelera.
          <Pressable
            key={tx.id}
            onPress={() => onEdit(tx)}
            className="border-b border-linea px-1 py-3 flex-row items-center gap-3 active:bg-hundido"
          >
            {/* El ícono de la categoría en lugar de la barrita de color: la
                barra decía si entraba o salía, que el signo del monto ya dice. */}
            <IconoDeCategoria {...dibujoDe(tx.category, tx.type)} type={tx.type} size="sm" />

            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2 flex-wrap">
                {/* Sin descripción la fila quedaría con el título en blanco:
                    la categoría es lo que mejor la identifica. */}
                <Texto className="text-sm text-tinta font-medium flex-1" numberOfLines={1}>
                  {tx.description?.trim() || tx.category}
                </Texto>
                {mostrarCuenta && cuentaDelMov ? (
                  <Texto
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: LEDGER_COLOR_MAP[cuentaDelMov.color].main + '22',
                      color: LEDGER_COLOR_MAP[cuentaDelMov.color].text,
                    }}
                  >
                    {cuentaDelMov.name}
                  </Texto>
                ) : null}
              </View>

              <View className="flex-row items-center gap-2 mt-0.5 flex-wrap">
                <Texto className="text-xs text-tinta-2">
                  {tx.category}
                  {/* El detalle pegado a su categoría y no como otro dato
                      suelto: "Alimentación · Supermercado" se lee como una
                      cosa, que es lo que es. */}
                  {tx.subcategory ? <Texto className="text-xs text-tinta-3"> › {tx.subcategory}</Texto> : null}
                </Texto>
                <Texto className="text-xs text-tinta-2">·</Texto>
                <Texto className="text-xs text-tinta-2">{fmt.date(tx.date)}</Texto>

                {/* Solo cuando lo cargó otro: en lo propio sería ruido. */}
                {tx.author_name && tx.author_id !== miId ? (
                  <>
                    <Texto className="text-xs text-tinta-2">·</Texto>
                    <View className="flex-row items-center gap-1">
                      <User size={12} color={paleta.tinta2} />
                      <Texto className="text-xs text-tinta-2">{tx.author_name}</Texto>
                    </View>
                  </>
                ) : null}

                {tx.payment_method ? (
                  <>
                    <Texto className="text-xs text-tinta-2">·</Texto>
                    <Texto className="text-xs text-tinta-2">{tx.payment_method}</Texto>
                  </>
                ) : null}

                {/* Solo cuando no se cargó a mano, que es lo normal. */}
                {tx.source && tx.source !== 'manual' ? (
                  <>
                    <Texto className="text-xs text-tinta-2">·</Texto>
                    <View className="flex-row items-center gap-1">
                      <IconoOrigen size={12} color={paleta[origen.color]} />
                      {origen.texto ? (
                        <Texto className="text-xs" style={{ color: paleta[origen.color] }}>{origen.texto}</Texto>
                      ) : null}
                    </View>
                  </>
                ) : null}

                {tx.receipt_url ? (
                  <>
                    <Texto className="text-xs text-tinta-2">·</Texto>
                    <View className="flex-row items-center gap-1">
                      <Receipt size={12} color={paleta.tinta2} />
                      <Texto className="text-xs text-tinta-2">recibo</Texto>
                    </View>
                  </>
                ) : null}
              </View>
            </View>

            <View>
              <Texto className={`font-medium ${tx.type === 'income' ? 'text-acento' : 'text-tinta'}`}
                style={{ fontVariant: ['tabular-nums'] }}>
                {tx.type === 'income' ? '+' : '−'}{fmt.money(tx.amount)}
              </Texto>
            </View>

            {/* Siempre visible: en un teléfono no hay mouse que la revele. */}
            <Pressable onPress={() => onDelete(tx.id)} accessibilityLabel="Eliminar"
              className="p-1.5 active:bg-peligro/10 rounded-lg">
              <Trash2 size={14} color={paleta.tinta2} />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}
