import { NextResponse } from 'next/server';
import { getLinksForUser } from '@/lib/chat/db';
import { MODEL, geminiApiKey } from '@/lib/chat/config';
import { getMe, getWebhookInfo, telegramToken, webhookUrl } from '@/lib/chat/transports/telegram';
import { conSesion } from '@/lib/supabase/session';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Todo lo que el sistema sabe, de una: el diagnóstico no debería requerir logs. */
export async function GET() {
  return conSesion(async db => {
    const faltantes = [
      !telegramToken() && 'TELEGRAM_BOT_TOKEN',
      !process.env.TELEGRAM_WEBHOOK_SECRET && 'TELEGRAM_WEBHOOK_SECRET',
      !process.env.NEXT_PUBLIC_APP_URL && 'NEXT_PUBLIC_APP_URL',
      !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
      !geminiApiKey() && 'GOOGLE_AI_API_KEY',
    ].filter(Boolean) as string[];

    const [chats, settings] = await Promise.all([
      getLinksForUser(db.supabase, db.userId, 'telegram'),
      getSettings(db),
    ]);

    let bot: { username: string; first_name: string } | null = null;
    let botError: string | null = null;
    let webhook: {
      configurado: boolean;
      url: string;
      pendientes: number;
      ultimoError: string | null;
    } | null = null;

    if (telegramToken()) {
      try {
        const info = await getMe();
        bot = { username: info.username, first_name: info.first_name };
      } catch (err) {
        botError = err instanceof Error ? err.message : String(err);
      }
      try {
        const wh = await getWebhookInfo();
        webhook = {
          configurado: wh.url === webhookUrl() && wh.url !== '',
          url: wh.url,
          pendientes: wh.pending_update_count ?? 0,
          // Si Telegram no pudo entregar, el motivo exacto está acá.
          ultimoError: wh.last_error_message ?? null,
        };
      } catch {
        webhook = null;
      }
    }

    return NextResponse.json({
      configurado: telegramToken() !== null,
      faltantes,
      bot,
      botError,
      webhook,
      webhookUrlEsperada: process.env.NEXT_PUBLIC_APP_URL ? webhookUrl() : null,
      modelo: MODEL,
      moneda: settings.currency,
      zonaHoraria: settings.timezone,
      chats,
    });
  });
}
