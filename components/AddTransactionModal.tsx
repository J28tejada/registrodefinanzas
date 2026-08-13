'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { Transaction, TransactionType, TransactionScope, AIInterpretation, LEDGER_COLOR_MAP, Card, CARD_KIND_LABEL } from '@/lib/types';
import { useCategories } from './CategoriesContext';
import { useLedger } from './LedgerContext';
import { useFormatters } from './SettingsContext';
import VoiceInput from './VoiceInput';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editingTransaction?: Transaction | null;
}

interface FormData {
  ledger_id: string;
  type: TransactionType;
  amount: string;
  category: string;
  description: string;
  date: string;
  /** Vacío = sin especificar. No es obligatorio: muchos gastos no lo tienen. */
  card_id: string;
}

export default function AddTransactionModal({
  isOpen, onClose, onSave, editingTransaction,
}: AddTransactionModalProps) {
  const { currentLedger, ledgers, setSelectorOpen } = useLedger();
  const { para } = useCategories();
  const fmt = useFormatters();

  const defaultLedgerId = currentLedger?.id ?? (ledgers[0]?.id ?? '');

  const defaultForm: FormData = {
    ledger_id: defaultLedgerId,
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    // "Hoy" en la zona del usuario, no en la del navegador.
    date: fmt.today(),
    card_id: '',
  };

  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<AIInterpretation | null>(null);
  const [error, setError] = useState('');
  const [cards, setCards] = useState<Card[]>([]);

  // Se piden al abrir y no una sola vez: si acabás de crear una en
  // Configuración, tiene que estar en el desplegable sin recargar la página.
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/cards')
      .then(r => r.ok ? r.json() : { cards: [] })
      .then(d => setCards(d.cards ?? []))
      .catch(() => setCards([]));
  }, [isOpen]);

  // Derive scope from selected ledger
  const selectedLedger = ledgers.find(l => l.id === form.ledger_id) ?? currentLedger;
  const scope: TransactionScope = selectedLedger?.type ?? 'personal';
  // Salen de la base: el usuario puede agregarlas y renombrarlas.
  const categories = para(form.type, scope).map(c => c.name);

  useEffect(() => {
    if (editingTransaction) {
      setForm({
        ledger_id: editingTransaction.ledger_id ?? defaultLedgerId,
        type: editingTransaction.type,
        amount: String(editingTransaction.amount),
        category: editingTransaction.category,
        description: editingTransaction.description,
        date: editingTransaction.date,
        card_id: editingTransaction.card_id ?? '',
      });
    } else {
      setForm({ ...defaultForm, date: fmt.today(), ledger_id: currentLedger?.id ?? (ledgers[0]?.id ?? '') });
    }
    setInterpretation(null);
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTransaction, isOpen, currentLedger, ledgers.length]);

  const handleVoiceTranscript = async (text: string) => {
    setInterpreting(true);
    setError('');
    setInterpretation(null);
    try {
      const res = await fetch('/api/ai/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data: AIInterpretation = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error al interpretar');

      setInterpretation(data);
      setForm(prev => ({
        ...prev,
        type: data.type ?? prev.type,
        amount: data.amount != null ? String(data.amount) : prev.amount,
        category: data.category ?? prev.category,
        description: data.description ?? prev.description,
        date: data.date ?? prev.date,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al interpretar');
    } finally {
      setInterpreting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.category || !form.description) {
      setError('Completa todos los campos requeridos');
      return;
    }
    // Sin cuenta el movimiento queda huérfano: no aparece en ninguna vista de
    // cuenta ni suma a ningún saldo. Antes solo se validaba cuando ya existía
    // alguna cuenta, así que quien recién empezaba guardaba movimientos sueltos.
    if (!form.ledger_id) {
      setError(ledgers.length === 0
        ? 'Primero creá una cuenta para poder anotar movimientos.'
        : 'Elegí una cuenta');
      return;
    }
    setSaving(true);
    setError('');
    // La última palabra la tiene el tipo, no lo que quedó en el formulario: un
    // ingreso viaja sin tarjeta aunque se hubiera elegido una antes de cambiarlo.
    const cardId = form.type === 'expense' ? (form.card_id || null) : null;
    try {
      const url = editingTransaction
        ? `/api/transactions/${editingTransaction.id}`
        : '/api/transactions';
      const method = editingTransaction ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ledger_id: form.ledger_id,
          type: form.type,
          scope,
          amount: parseFloat(form.amount),
          category: form.category,
          description: form.description,
          date: form.date,
          card_id: cardId,
          // El texto acompaña a la FK: si más adelante se borra la tarjeta, el
          // movimiento conserva con qué se pagó.
          payment_method: cardId ? (cards.find(c => c.id === cardId)?.name ?? null) : null,
          source: interpretation ? 'voice' : 'manual',
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full md:max-w-lg bg-slate-900 border border-slate-700 md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
        {/* z-10: sin él la cabecera queda en el fondo del apilado y cualquier
            elemento posicionado del formulario —el botón "Hablar", que es
            `relative`— se pinta ENCIMA del título al desplazar el modal. Estar
            pegada arriba no alcanza: hay que estar adelante también. */}
        <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">
            {editingTransaction ? 'Editar registro' : 'Nuevo registro'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 sm:space-y-5">
          {/* Voice input */}
          {!editingTransaction && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2">
              <p className="text-xs text-slate-400 font-medium">ENTRADA DE VOZ</p>
              <p className="text-xs text-slate-500">
                Habla tu transacción y la IA rellenará el formulario automáticamente.
              </p>
              {interpreting ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Interpretando con IA...
                </div>
              ) : (
                <VoiceInput onTranscript={handleVoiceTranscript} />
              )}
              {interpretation && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 mt-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  IA completó el formulario (confianza: {Math.round(interpretation.confidence * 100)}%)
                </div>
              )}
            </div>
          )}

          {/* Cada usuario arranca con una cuenta personal, así que esto casi
              nunca aparece: queda por si la borró y se quedó sin ninguna. */}
          {ledgers.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm text-amber-200">
                Te quedaste sin cuentas. Creá una para poder anotar movimientos.
              </p>
              <button
                type="button"
                onClick={() => { onClose(); setSelectorOpen(true); }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Crear mi primera cuenta
              </button>
            </div>
          )}

          {/* Ledger picker */}
          {ledgers.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">CUENTA</label>
              <div className="relative">
                <select
                  value={form.ledger_id}
                  onChange={e => setForm(p => ({ ...p, ledger_id: e.target.value, category: '' }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-8 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm appearance-none"
                >
                  {ledgers.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                {/* Color dot */}
                {selectedLedger && (
                  <div
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm pointer-events-none"
                    style={{
                      background: `linear-gradient(to right, ${LEDGER_COLOR_MAP[selectedLedger.color].dark} 35%, ${LEDGER_COLOR_MAP[selectedLedger.color].main} 35%)`
                    }}
                  />
                )}
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Type toggle */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">TIPO</label>
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  // Al pasar a ingreso se suelta la tarjeta: si no, la elegida
                  // como gasto se guardaría igual, con el campo ya oculto.
                  onClick={() => setForm(p => ({
                    ...p, type: t, category: '', card_id: t === 'income' ? '' : p.card_id,
                  }))}
                  className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                    form.type === t
                      ? t === 'expense'
                        ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-300'
                        : 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 border-2 border-transparent text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {t === 'expense' ? '− Gasto' : '+ Ingreso'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">MONTO *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                required
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">CATEGORÍA *</label>
            <select
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
              required
            >
              <option value="">Seleccionar categoría</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {interpretation?.suggestions && interpretation.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="text-xs text-slate-500">Sugerencias:</span>
                {interpretation.suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, category: s }))}
                    className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">DESCRIPCIÓN *</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Ej: Almuerzo en restaurante"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
              required
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">FECHA *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
              required
            />
          </div>

          {/* Con qué se pagó. Opcional: la mayoría de los gastos se anotan sin
              pensar en esto, y volverlo obligatorio agrega un paso a la acción
              más frecuente de la app. Solo aparece si hay tarjetas cargadas.

              Y solo en gastos: un ingreso no se paga con nada. Además el gasto
              por tarjeta sale de `spent_by_card`, que cuenta únicamente gastos,
              así que en un ingreso el dato no alimentaría ninguna vista. */}
          {form.type === 'expense' && cards.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">PAGADO CON</label>
              <div className="relative">
                <select
                  value={form.card_id}
                  onChange={e => setForm(p => ({ ...p, card_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-white focus:outline-none focus:border-emerald-500 text-sm appearance-none"
                >
                  <option value="">Sin especificar</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.last4 ? ` ···· ${c.last4}` : ''} — {CARD_KIND_LABEL[c.kind]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || ledgers.length === 0}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
