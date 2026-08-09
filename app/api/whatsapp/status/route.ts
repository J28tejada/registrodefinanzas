import { NextResponse } from 'next/server';
import { getLinksForUser } from '@/lib/chat/db';
import {
  connectionState, evolutionConfig, getWebhook, instanceOwnerNumber, webhookUrl,
} from '@/lib/chat/transports/evolution';
import { MODEL, geminiApiKey } from '@/lib/chat/config';
import { conSesion } from '@/lib/supabase/session';
import { esAdmin } from '@/lib/supabase/admins';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Dos respuestas distintas según quién pregunte.
 *
 * Al usuario común solo le importa una cosa: si puede vincular su WhatsApp y si
 * el asistente va a contestarle. El nombre de la instancia, el modelo o la URL
 * del webhook no son información que pueda usar, y mostrárselos convierte una
 * pantalla de dos pasos en un tablero de diagnóstico.
 *
 * Al admin le hace falta todo, porque es quien arregla la conexión cuando se
 * cae. Se separa acá y no en el navegador: esconder con CSS igual manda los
 * datos, y la URL del webhook —aunque lleve el token tapado— no tiene por qué
 * viajar a la máquina de cualquiera.
 */
export async function GET() {
  return conSesion(async db => {
    const cfg = evolutionConfig();
    const [chats, permiso] = await Promise.all([
      getLinksForUser(db.supabase, db.userId, 'whatsapp'),
      esAdmin(),
    ]);

    let state = 'sin-configurar';
    let stateError: string | null = null;
    let numeroBot: string | null = null;

    if (cfg) {
      try {
        state = await connectionState();
      } catch (err) {
        state = 'error';
        stateError = err instanceof Error ? err.message : String(err);
      }
      // Solo con la sesión abierta: antes de emparejar no hay número que ofrecer.
      if (state === 'open') {
        try {
          numeroBot = await instanceOwnerNumber();
        } catch {
          // El número solo sirve para ofrecer un atajo; sin él la pantalla
          // sigue mostrando el código para mandarlo a mano.
          numeroBot = null;
        }
      }
    }

    // Lo único que cambia la experiencia del usuario común: si el bot responde.
    const comun = {
      esAdmin: permiso.ok,
      listo: cfg !== null && state === 'open',
      numeroBot,
      chats,
    };

    if (!permiso.ok) return NextResponse.json(comun);

    const faltantes = [
      !process.env.EVOLUTION_API_URL && 'EVOLUTION_API_URL',
      !process.env.EVOLUTION_API_KEY && 'EVOLUTION_API_KEY',
      !process.env.EVOLUTION_INSTANCE && 'EVOLUTION_INSTANCE',
      !process.env.EVOLUTION_WEBHOOK_TOKEN && 'EVOLUTION_WEBHOOK_TOKEN',
      !process.env.NEXT_PUBLIC_APP_URL && 'NEXT_PUBLIC_APP_URL',
      !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
      !geminiApiKey() && 'GOOGLE_AI_API_KEY',
    ].filter(Boolean) as string[];

    let webhookConfigurado: boolean | null = null;
    if (cfg) {
      try {
        const wh = await getWebhook();
        const url = (wh?.url as string) ?? ((wh?.webhook as Record<string, unknown>)?.url as string) ?? null;
        const porEventos =
          (wh?.webhookByEvents as boolean) ??
          ((wh?.webhook as Record<string, unknown>)?.webhookByEvents as boolean) ??
          false;
        // Con webhookByEvents en true el webhook nunca recibe nada.
        webhookConfigurado = Boolean(url) && porEventos !== true;
      } catch {
        webhookConfigurado = null;
      }
    }

    const settings = await getSettings(db);

    return NextResponse.json({
      ...comun,
      avanzado: {
        configurado: cfg !== null,
        faltantes,
        instancia: cfg?.instance ?? null,
        state,
        stateError,
        // Con el token enmascarado: sirve para verificar la URL, no para copiarla.
        webhookUrl: process.env.NEXT_PUBLIC_APP_URL ? webhookUrl().replace(/token=.*$/, 'token=***') : null,
        webhookConfigurado,
        modelo: MODEL,
        moneda: settings.currency,
        zonaHoraria: settings.timezone,
      },
    });
  });
}
