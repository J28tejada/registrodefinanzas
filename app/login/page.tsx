'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet, Loader2, AlertCircle, Mail, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';

type Modo = 'entrar' | 'registrarse';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destino = searchParams.get('next') || '/';

  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  // El callback del correo redirige acá con el motivo si algo falló.
  const [error, setError] = useState(searchParams.get('error') ?? '');
  const [confirmar, setConfirmar] = useState(false);

  const configurado = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    setConfirmar(false);

    try {
      const supabase = createClient();
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(destino);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destino)}` },
        });
        if (error) throw error;
        // Con confirmación por correo activada, la sesión viene vacía.
        if (data.session) {
          router.push(destino);
          router.refresh();
        } else {
          setConfirmar(true);
        }
      }
    } catch (err) {
      setError(traducir(err));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Registro de Finanzas</h1>
            <p className="text-sm text-slate-400">
              {modo === 'entrar' ? 'Entrá a tu cuenta' : 'Creá tu cuenta'}
            </p>
          </div>
        </div>

        {!configurado && (
          <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Faltan <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
              Sin eso no hay forma de iniciar sesión.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {confirmar ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm text-white font-medium">Revisá tu correo</p>
            <p className="text-xs text-slate-400">
              Te mandamos un enlace a <span className="text-slate-200">{email}</span> para confirmar
              la cuenta. Después de abrirlo podés entrar.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Correo</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="vos@ejemplo.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Contraseña</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <button
              type="submit"
              disabled={cargando || !configurado}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
            </button>

            <button
              type="button"
              onClick={() => { setModo(modo === 'entrar' ? 'registrarse' : 'entrar'); setError(''); }}
              className="w-full text-xs text-slate-400 hover:text-white transition-colors"
            >
              {modo === 'entrar' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Entrá'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Los mensajes de Supabase vienen en inglés; los importantes se traducen. */
function traducir(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/user already registered/i.test(msg)) return 'Ese correo ya tiene una cuenta. Probá entrando.';
  if (/email not confirmed/i.test(msg)) return 'Todavía no confirmaste el correo. Revisá tu bandeja.';
  if (/password should be at least/i.test(msg)) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos seguidos. Esperá un momento.';
  return msg;
}
