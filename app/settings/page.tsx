'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, Globe, Clock, Loader2, CheckCircle2, AlertCircle, LogOut, ChevronDown } from 'lucide-react';
import { useSettings } from '@/components/SettingsContext';
import { CURRENCIES } from '@/lib/types';
import { makeFormatters, zonasHorarias } from '@/lib/format';
import { createClient } from '@/lib/supabase/browser';
import CategoriesPanel from '@/components/CategoriesPanel';
import CardsPanel from '@/components/CardsPanel';

export default function SettingsPage() {
  const router = useRouter();
  const { settings, loaded, save } = useSettings();

  const [currency, setCurrency] = useState(settings.currency);
  const [locale, setLocale] = useState(settings.locale);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    setCurrency(settings.currency);
    setLocale(settings.locale);
    setTimezone(settings.timezone);
  }, [settings]);

  useEffect(() => {
    try {
      createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
    } catch {
      // Supabase sin configurar: la pantalla sigue sirviendo para ver la config.
    }
  }, []);

  const zonas = useMemo(() => zonasHorarias(), []);
  const vistaPrevia = useMemo(
    () => makeFormatters({ currency, locale, timezone }),
    [currency, locale, timezone],
  );

  const hayCambios =
    currency !== settings.currency || locale !== settings.locale || timezone !== settings.timezone;

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      await save({ currency, locale, timezone });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const salir = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  /** Al elegir moneda de la lista, el locale que le pega viene de regalo. */
  const elegirMoneda = (codigo: string) => {
    setCurrency(codigo);
    const opcion = CURRENCIES.find(c => c.code === codigo);
    if (opcion) setLocale(opcion.locale);
  };

  if (!loaded) {
    return (
      <div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-14 md:pt-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Configuración</h1>
        <p className="text-slate-400 text-sm">Moneda, formato y zona horaria de tu cuenta</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {guardado && !hayCambios && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Configuración guardada. Los montos ya se muestran en {settings.currency}.
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5">
        {/* Moneda */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Coins className="w-4 h-4 text-emerald-400" /> Moneda
          </label>
          <div className="relative">
            <select
              value={CURRENCIES.some(c => c.code === currency) ? currency : 'otra'}
              onChange={e => e.target.value !== 'otra' && elegirMoneda(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
              <option value="otra">Otra (escribir el código)</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <input
            value={currency}
            onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="Código ISO, ej. DOP"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase placeholder:text-slate-500 placeholder:font-sans focus:outline-none focus:border-emerald-500"
          />
          <p className="text-xs text-slate-500">
            Cambia cómo se muestran los montos. No convierte lo ya registrado: los
            números guardados quedan igual, solo cambia el símbolo.
          </p>
        </div>

        {/* Locale */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Globe className="w-4 h-4 text-blue-400" /> Formato regional
          </label>
          <input
            value={locale}
            onChange={e => setLocale(e.target.value)}
            placeholder="es-DO"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono placeholder:text-slate-500 placeholder:font-sans focus:outline-none focus:border-emerald-500"
          />
          <p className="text-xs text-slate-500">
            Define separadores de miles y cómo se escriben las fechas. Se completa
            solo al elegir una moneda de la lista.
          </p>
        </div>

        {/* Zona horaria */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Clock className="w-4 h-4 text-violet-400" /> Zona horaria
          </label>
          <div className="relative">
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 pr-8 text-sm text-white focus:outline-none focus:border-emerald-500 appearance-none"
            >
              {zonas.includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
              {zonas.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <p className="text-xs text-slate-500">
            Con esto se resuelve qué día es &quot;hoy&quot;. El servidor corre en UTC: sin la zona
            correcta, un gasto de las nueve de la noche quedaría anotado mañana.
          </p>
        </div>

        {/* Vista previa */}
        <div className="bg-slate-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs text-slate-400">Así se va a ver</p>
          <p className="text-lg font-semibold text-white">{vistaPrevia.money(1234567.89)}</p>
          <p className="text-xs text-slate-400">
            {vistaPrevia.date(vistaPrevia.today())} · hoy es {vistaPrevia.today()}
          </p>
        </div>

        <button
          onClick={guardar}
          disabled={guardando || !hayCambios}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {hayCambios ? 'Guardar cambios' : 'Sin cambios'}
        </button>
      </div>

      <CategoriesPanel />

      <CardsPanel />

      {/* Cuenta */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium truncate">{email || 'Sesión iniciada'}</p>
          <p className="text-xs text-slate-500">Tus datos son solo tuyos: nadie más los ve.</p>
        </div>
        <button
          onClick={salir}
          className="px-3 py-2 bg-slate-800 hover:bg-rose-600 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </div>
    </div>
  );
}
