'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Plus, Trash2, Loader2 } from 'lucide-react';
import { Card, CardType } from '@/lib/types';

const typeLabel: Record<CardType, string> = { credit: 'Crédito', debit: 'Débito' };
const typeBadge: Record<CardType, string> = {
  credit: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  debit: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<CardType>('credit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cards');
      const data = await res.json();
      setCards(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCards(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      if (!res.ok) { setError('Error al guardar la tarjeta'); return; }
      setName('');
      setType('credit');
      setShowForm(false);
      await loadCards();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/cards/${id}`, { method: 'DELETE' });
      setCards(c => c.filter(x => x.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Mis Tarjetas</h1>
          <p className="text-sm text-slate-400 mt-0.5">Registra tus tarjetas para usarlas al registrar transacciones</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Agregar
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-white">Nueva tarjeta</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('credit')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                type === 'credit' ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              Crédito
            </button>
            <button
              type="button"
              onClick={() => setType('debit')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                type === 'debit' ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              Débito
            </button>
          </div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del banco o tarjeta (ej: BHD Visa)"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            autoFocus
          />
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setName(''); setError(''); }}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No tienes tarjetas registradas.</p>
          <p className="text-sm mt-1">Agrega una para registrar pagos con tarjeta.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <div key={card.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-3.5 flex items-center gap-3 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{card.name}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${typeBadge[card.type]}`}>
                  {typeLabel[card.type]}
                </span>
              </div>
              <button
                onClick={() => handleDelete(card.id)}
                disabled={deleting === card.id}
                className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10"
              >
                {deleting === card.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
