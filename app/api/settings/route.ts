import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return conSesion(async db => {
    const settings = await getSettings(db);
    return NextResponse.json(settings);
  });
}

export async function PATCH(req: NextRequest) {
  return conSesion(async db => {
    const body = await req.json().catch(() => ({}));
    const cambios: Record<string, string> = {};

    if (typeof body.currency === 'string') {
      const codigo = body.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(codigo)) {
        return NextResponse.json({ error: `"${body.currency}" no es un código de moneda ISO de 3 letras.` }, { status: 400 });
      }
      if (!monedaSoportada(codigo)) {
        return NextResponse.json({ error: `Tu navegador y el servidor no reconocen la moneda "${codigo}".` }, { status: 400 });
      }
      cambios.currency = codigo;
    }

    if (typeof body.locale === 'string' && body.locale.trim()) {
      const locale = body.locale.trim();
      if (!localeSoportado(locale)) {
        return NextResponse.json({ error: `"${locale}" no es un locale válido.` }, { status: 400 });
      }
      cambios.locale = locale;
    }

    if (typeof body.timezone === 'string' && body.timezone.trim()) {
      const tz = body.timezone.trim();
      if (!zonaSoportada(tz)) {
        return NextResponse.json({ error: `"${tz}" no es una zona horaria IANA válida.` }, { status: 400 });
      }
      cambios.timezone = tz;
    }

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'No mandaste ningún cambio válido.' }, { status: 400 });
    }

    const settings = await saveSettings(db, cambios);
    return NextResponse.json(settings);
  });
}

function monedaSoportada(codigo: string): boolean {
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: codigo }).format(1);
    return true;
  } catch {
    return false;
  }
}

function localeSoportado(locale: string): boolean {
  try {
    new Intl.NumberFormat(locale).format(1);
    return true;
  } catch {
    return false;
  }
}

function zonaSoportada(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
