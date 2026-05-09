import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { exchangeCodeForTokens } from '@/lib/gmail';
import { saveGmailToken } from '@/lib/db';

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || state !== userId) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code, req.nextUrl.origin);
    await saveGmailToken(userId, { ...tokens, lastChecked: 0 });
    return NextResponse.redirect(new URL('/settings?gmail=connected', req.nextUrl.origin), 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Gmail callback error:', msg);
    return NextResponse.redirect(new URL('/settings?gmail=error', req.nextUrl.origin), 302);
  }
}
