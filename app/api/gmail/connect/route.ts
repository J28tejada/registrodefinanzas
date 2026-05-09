import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { buildOAuthUrl } from '@/lib/gmail';

export async function GET() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = buildOAuthUrl(userId);
  return NextResponse.redirect(url, 302);
}
