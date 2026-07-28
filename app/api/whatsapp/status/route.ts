import { NextResponse } from 'next/server';
import { getNumbersForUser } from '@/lib/whatsapp/db';
import { connectionState, evolutionConfig, getWebhook, webhookUrl } from '@/lib/whatsapp/evolution';
import { MODEL, geminiApiKey } from '@/lib/whatsapp/config';
import { conSesion } from '@/lib/supabase/session';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Todo lo que el sistema sabe, de una: el diagnóstico no debería requerir logs. */
export async function GET() {
  return conSesion(async db => {
    const cfg = evolutionConfig();
    const faltantes = [
      !process.env.EVOLUTION_API_URL && 'EVOLUTION_API_URL',
      !process.env.EVOLUTION_API_KEY && 'EVOLUTION_API_KEY',
      !process.env.EVOLUTION_INSTANCE && 'EVOLUTION_INSTANCE',
      !process.env.EVOLUTION_WEBHOOK_TOKEN && 'EVOLUTION_WEBHOOK_TOKEN',
      !process.env.NEXT_PUBLIC_APP_URL && 'NEXT_PUBLIC_APP_URL',
      !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
      !geminiApiKey() && 'GOOGLE_AI_API_KEY',
    ].filter(Boolean) as string[];

    const [numeros, settings] = await Promise.all([
      getNumbersForUser(db.supabase, db.userId),
      getSettings(db),
    ]);

    let state = 'sin-configurar';
    let stateError: string | null = null;
    let webhookConfigurado: boolean | null = null;

    if (cfg) {
      try {
        state = await connectionState();
      } catch (err) {
        state = 'error';
        stateError = err instanceof Error ? err.message : String(err);
      }
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

    return NextResponse.json({
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
      numeros,
    });
  });
}
