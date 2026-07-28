import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getUserEmail } from '@/lib/gmail';
import { saveEmailConnection } from '@/lib/db';
import { requireDb } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/email?error=access_denied`);
  }

  try {
    // La cuenta de Gmail queda atada al usuario que inició el flujo.
    const db = await requireDb();
    const tokens = await exchangeCodeForTokens(code);
    const email = await getUserEmail(tokens.access_token!);

    await saveEmailConnection(db, {
      email,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token ?? null,
      token_expiry: tokens.expiry_date ?? null,
    });

    return NextResponse.redirect(`${appUrl}/email?connected=1`);
  } catch (err) {
    console.error('Gmail callback error:', err);
    return NextResponse.redirect(`${appUrl}/email?error=auth_failed`);
  }
}
