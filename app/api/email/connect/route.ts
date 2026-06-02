import { NextResponse } from 'next/server';
import { getGmailAuthUrl } from '@/lib/gmail';

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Google OAuth no configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.' },
      { status: 503 },
    );
  }
  const url = getGmailAuthUrl();
  return NextResponse.redirect(url);
}
