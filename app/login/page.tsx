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
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
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

  const entrarConGoogle = async () => {
    setCargandoGoogle(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destino)}`,
        },
      });
      if (error) throw error;
      // Si no hubo error el navegador ya se está yendo a Google: no se apaga
      // el spinner, para que el botón no parpadee durante la redirección.
    } catch (err) {
      setError(traducir(err));
      setCargandoGoogle(false);
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
            <h1 className="text-xl font-bold text-white">Jobidai Wallet</h1>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="text-sm text-white font-medium">Revisá tu correo</p>
            <p className="text-xs text-slate-400">
              Te mandamos un enlace a <span className="text-slate-200">{email}</span> para confirmar
              la cuenta. Después de abrirlo podés entrar.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
            <button
              type="button"
              onClick={entrarConGoogle}
              disabled={cargandoGoogle || cargando || !configurado}
              className="w-full py-3 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2.5"
            >
              {cargandoGoogle ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continuar con Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-500">o con tu correo</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

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
              disabled={cargando || cargandoGoogle || !configurado}
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
