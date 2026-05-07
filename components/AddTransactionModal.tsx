'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Transaction, TransactionType, TransactionScope, getCategories, todayISO, AIInterpretation } from '@/lib/types';
import VoiceInput from './VoiceInput';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editingTransaction?: Transaction | null;
}

interface FormData {
  type: TransactionType;
  scope: TransactionScope;
  amount: string;
  category: string;
  description: string;
  date: string;
}

const defaultForm: FormData = {
  type: 'expense',
  scope: 'personal',
  amount: '',
  category: '',
  description: '',
  date: todayISO(),
};

export default function AddTransactionModal({
  isOpen, onClose, onSave, editingTransaction,
}: AddTransactionModalProps) {
  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<AIInterpretation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingTransaction) {
      setForm({
        type: editingTransaction.type,
        scope: editingTransaction.scope,
        amount: String(editingTransaction.amount),
        category: editingTransaction.category,
        description: editingTransaction.description,
        date: editingTransaction.date,
      });
    } else {
      setForm({ ...defaultForm, date: todayISO() });
    }
    setInterpretation(null);
    setError('');
  }, [editingTransaction, isOpen]);

  const categories = getCategories(form.type, form.scope);

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
        type: data.type ?? prev.type,
        scope: data.scope ?? prev.scope,
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
    setSaving(true);
    setError('');
    try {
      const url = editingTransaction
        ? `/api/transactions/${editingTransaction.id}`
        : '/api/transactions';
      const method = editingTransaction ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
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
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">
            {editingTransaction ? 'Editar registro' : 'Nuevo registro'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
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

          {/* Type toggle */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">TIPO</label>
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, type: t, category: '' }))}
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

          {/* Scope toggle */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400 font-medium">ÁMBITO</label>
            <div className="grid grid-cols-2 gap-2">
              {(['personal', 'business'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, scope: s, category: '' }))}
                  className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                    form.scope === s
                      ? s === 'personal'
                        ? 'bg-violet-500/20 border-2 border-violet-500 text-violet-300'
                        : 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                      : 'bg-slate-800 border-2 border-transparent text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {s === 'personal' ? '👤 Personal' : '💼 Negocio'}
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
              disabled={saving}
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
