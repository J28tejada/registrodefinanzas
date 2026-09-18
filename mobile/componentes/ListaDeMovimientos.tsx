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

/**
 * De dónde salió cada movimiento.
 *
 * En la web el color va como clase y el SVG lo hereda; acá hace falta el
 * hexadecimal, porque un ícono nativo no hereda el color del texto.
 */
const ORIGEN = {
  voice: { icono: Mic, color: '#64748b', texto: '' },
  ai: { icono: Bot, color: '#64748b', texto: '' },
  manual: { icono: Pencil, color: '#475569', texto: '' },
  whatsapp: { icono: MessageCircle, color: '#10b981', texto: 'vía WhatsApp' },
  telegram: { icono: Send, color: '#38bdf8', texto: 'vía Telegram' },
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
          <View key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-16" />
        ))}
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View className="items-center py-12">
        <Texto className="text-4xl mb-3">💸</Texto>
        <Texto className="text-slate-500">No hay transacciones aquí.</Texto>
        <Texto className="text-sm text-slate-500 mt-1">
          Agrega tu primera transacción con el botón +
        </Texto>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {transactions.map(tx => {
        const origen = ORIGEN[tx.source] ?? ORIGEN.manual;
        const IconoOrigen = origen.icono;
        const cuentaDelMov = tx.ledger_id ? ledgers.find(l => l.id === tx.ledger_id) : null;
        const mostrarCuenta = !currentLedger && cuentaDelMov;

        return (
          <View
            key={tx.id}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex-row items-center gap-3"
          >
            {/* El ícono de la categoría en lugar de la barrita de color: la
                barra decía si entraba o salía, que el signo del monto ya dice. */}
            <IconoDeCategoria {...dibujoDe(tx.category, tx.type)} type={tx.type} size="sm" />

            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2 flex-wrap">
                {/* Sin descripción la fila quedaría con el título en blanco:
                    la categoría es lo que mejor la identifica. */}
                <Texto className="text-sm text-white font-medium flex-1" numberOfLines={1}>
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
                <Texto className="text-xs text-slate-500">
                  {tx.category}
                  {/* El detalle pegado a su categoría y no como otro dato
                      suelto: "Alimentación · Supermercado" se lee como una
                      cosa, que es lo que es. */}
                  {tx.subcategory ? <Texto className="text-xs text-slate-600"> › {tx.subcategory}</Texto> : null}
                </Texto>
                <Texto className="text-xs text-slate-500">·</Texto>
                <Texto className="text-xs text-slate-500">{fmt.date(tx.date)}</Texto>

                {/* Solo cuando lo cargó otro: en lo propio sería ruido. */}
                {tx.author_name && tx.author_id !== miId ? (
                  <>
                    <Texto className="text-xs text-slate-500">·</Texto>
                    <View className="flex-row items-center gap-1">
                      <User size={12} color="#94a3b8" />
                      <Texto className="text-xs text-slate-400">{tx.author_name}</Texto>
                    </View>
                  </>
                ) : null}

                {tx.payment_method ? (
                  <>
                    <Texto className="text-xs text-slate-500">·</Texto>
                    <Texto className="text-xs text-slate-500">{tx.payment_method}</Texto>
                  </>
                ) : null}

                <Texto className="text-xs text-slate-500">·</Texto>
                <View className="flex-row items-center gap-1">
                  <IconoOrigen size={12} color={origen.color} />
                  {origen.texto ? (
                    <Texto className="text-xs" style={{ color: origen.color }}>{origen.texto}</Texto>
                  ) : null}
                </View>

                {tx.receipt_url ? (
                  <>
                    <Texto className="text-xs text-slate-500">·</Texto>
                    <View className="flex-row items-center gap-1">
                      <Receipt size={12} color="#94a3b8" />
                      <Texto className="text-xs text-slate-400">recibo</Texto>
                    </View>
                  </>
                ) : null}
              </View>
            </View>

            <View>
              <Texto className={`font-semibold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {tx.type === 'income' ? '+' : '−'}{fmt.money(tx.amount)}
              </Texto>
            </View>

            {/* Siempre visibles. En la web se revelan al pasar el mouse por
                encima (`sm:group-hover:opacity-100`), y en un teléfono no hay
                mouse: escondidos serían botones que no aparecen nunca. */}
            <View className="flex-row items-center gap-1">
              <Pressable onPress={() => onEdit(tx)} className="p-1.5 active:bg-slate-800 rounded-lg">
                <Pencil size={14} color="#94a3b8" />
              </Pressable>
              <Pressable onPress={() => onDelete(tx.id)} className="p-1.5 active:bg-rose-500/10 rounded-lg">
                <Trash2 size={14} color="#94a3b8" />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
