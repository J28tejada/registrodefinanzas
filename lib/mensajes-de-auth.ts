/**
 * Los mensajes de error del login, en español.
 *
 * Supabase los manda en inglés y con su propia redacción. Traducirlos en cada
 * app terminaría en dos textos distintos para el mismo problema — "Correo o
 * contraseña incorrectos" en un lado y "Credenciales inválidas" en el otro—, y
 * el usuario no tiene por qué notar en qué aparato está leyendo.
 */
export function traducirErrorDeAuth(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/user already registered/i.test(msg)) return 'Ese correo ya tiene una cuenta. Probá entrando.';
  if (/email not confirmed/i.test(msg)) return 'Todavía no confirmaste el correo. Revisá tu bandeja.';
  if (/password should be at least/i.test(msg)) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos seguidos. Esperá un momento.';
  return msg;
}
