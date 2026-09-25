'use client';

import { Transaction, LEDGER_COLOR_MAP } from '@/lib/types';
import { useLedger } from './LedgerContext';
import { useCategories } from './CategoriesContext';
import CategoryIcon from './CategoryIcon';
import { useFormatters } from './SettingsContext';
import { useEffect, useState } from 'react';
import { Pencil, Trash2, Mic, Bot, Pencil as PencilIcon, MessageCircle, Send, Receipt, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';

// Una trazabilidad que solo sirve consultando la base no le sirve al usuario.
const sourceBadge = {
  voice: { icon: Mic, cls: 'text-tinta-2', label: 'por voz', texto: '' },
  ai: { icon: Bot, cls: 'text-tinta-2', label: 'con IA', texto: '' },
  manual: { icon: PencilIcon, cls: 'text-tinta-3', label: 'a mano', texto: '' },
  whatsapp: { icon: MessageCircle, cls: 'text-acento', label: 'vía WhatsApp', texto: 'vía WhatsApp' },
  telegram: { icon: Send, cls: 'text-info', label: 'vía Telegram', texto: 'vía Telegram' },
};

interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
}

export default function TransactionList({ transactions, onEdit, onDelete, loading }: TransactionListProps) {
  const { currentLedger, ledgers } = useLedger();
  const { dibujoDe } = useCategories();
  const fmt = useFormatters();
  // Para no repetir tu propio nombre en cada fila: solo se muestra el del otro.
  const [miId, setMiId] = useState('');

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) setMiId(data.user.id);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-hundido rounded-lg h-14 animate-pulse" />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-12">
        <div className="w-12 h-12 rounded-full bg-hundido flex items-center justify-center mb-3">
          <Receipt className="w-5 h-5 text-tinta-2" />
        </div>
        <p className="text-sm font-medium text-tinta">Todavía no hay movimientos</p>
        <p className="text-sm text-tinta-2 mt-1">Registrá el primero con el botón +</p>
      </div>
    );
  }

  return (
    // Una sola tarjeta de vidrio con líneas entre filas, no una tarjeta por
    // movimiento: con tantas cajas seguidas la pantalla era puro borde.
    <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl px-3">
      {transactions.map(tx => {
        const Source = sourceBadge[tx.source] ?? sourceBadge.manual;
        const SourceIcon = Source.icon;
        const txLedger = tx.ledger_id ? ledgers.find(l => l.id === tx.ledger_id) : null;
        const showLedgerBadge = !currentLedger && txLedger;

        return (
          <div
            key={tx.id}
            // Tocar la fila la edita: en un teléfono, un lápiz y una papelera
            // en cada fila le comían el ancho al texto.
            onClick={() => onEdit(tx)}
            className="border-b border-linea last:border-b-0 hover:bg-hundido px-1 py-3 flex items-center gap-3 group transition-colors cursor-pointer"
          >
            {/* El ícono de la categoría en lugar de la barrita de color: la
                barra decía si entraba o salía, que el signo del monto ya dice.
                El ícono deja recorrer la lista reconociendo en qué se gastó sin
                leer una sola palabra. */}
            <CategoryIcon
              {...dibujoDe(tx.category, tx.type)}
              type={tx.type}
              size="sm"
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sin descripción la fila quedaría con el título en blanco:
                    la categoría es lo que mejor la identifica. */}
                <span className="text-sm text-tinta font-medium truncate">
                  {tx.description?.trim() || tx.category}
                </span>
                {showLedgerBadge && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: LEDGER_COLOR_MAP[txLedger.color].main + '22',
                      color: LEDGER_COLOR_MAP[txLedger.color].text,
                    }}
                  >
                    {txLedger.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-tinta-2 flex-wrap">
                <span>
                  {tx.category}
                  {/* El detalle pegado a su categoría y no como otro dato
                      suelto: "Alimentación · Supermercado" se lee como una
                      cosa, que es lo que es. */}
                  {tx.subcategory && <span className="text-tinta-3"> › {tx.subcategory}</span>}
                </span>
                <span>·</span>
                <span>{fmt.date(tx.date)}</span>
                {/* Solo cuando lo cargó otro: en lo propio sería ruido en cada fila. */}
                {tx.author_name && tx.author_id !== miId && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-tinta-2">
                      <User className="w-3 h-3" />
                      {tx.author_name}
                    </span>
                  </>
                )}
                {tx.payment_method && (
                  <>
                    <span>·</span>
                    <span>{tx.payment_method}</span>
                  </>
                )}
                {/* Solo cuando no se cargó a mano, que es lo normal. El lápiz de
                    "a mano" en cada fila se confundía con el de editar. */}
                {tx.source && tx.source !== 'manual' && (
                  <>
                    <span>·</span>
                    <span className={`flex items-center gap-1 ${Source.cls}`} title={Source.label}>
                      <SourceIcon className="w-3 h-3" />
                      {Source.texto && <span>{Source.texto}</span>}
                    </span>
                  </>
                )}
                {tx.receipt_url && (
                  <>
                    <span>·</span>
                    <a
                      href={`/api/receipts?path=${encodeURIComponent(tx.receipt_url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-tinta-2 hover:text-tinta transition-colors"
                    >
                      <Receipt className="w-3 h-3" /> recibo
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="text-right flex-shrink-0">
              {/* El gasto en tinta y no en rojo: es lo normal de una lista de
                  movimientos, y en rojo la pantalla entera parecía un error. */}
              <p className={`font-medium tabular-nums ${tx.type === 'income' ? 'text-acento' : 'text-tinta'}`}>
                {tx.type === 'income' ? '+' : '−'}{fmt.money(tx.amount)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {/* Con teclado la fila no se alcanza: el lápiz queda para eso en
                  pantallas anchas, donde además aparece al pasar el mouse. */}
              <button
                onClick={e => { e.stopPropagation(); onEdit(tx); }}
                aria-label="Editar"
                className="hidden sm:inline-flex p-1.5 text-tinta-2 hover:text-tinta hover:bg-presionado rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDelete(tx.id); }}
                aria-label="Eliminar"
                className="p-1.5 text-tinta-2 hover:text-peligro hover:bg-peligro/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
