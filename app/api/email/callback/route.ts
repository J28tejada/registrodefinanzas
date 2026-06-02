import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getUserEmail } from '@/lib/gmail';
import { saveEmailConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/email?error=access_denied`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getUserEmail(tokens.access_token!);

    await saveEmailConnection({
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
