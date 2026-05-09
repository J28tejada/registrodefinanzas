import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isGmailConnected, countPendingEmailTransactions, getGmailToken, deleteGmailToken } from '@/lib/db';

export async function GET() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const connected = await isGmailConnected(userId);
    const pendingCount = connected ? await countPendingEmailTransactions(userId) : 0;
    const token = connected ? await getGmailToken(userId) : null;
    return NextResponse.json({
      connected,
      pendingCount,
      lastChecked: token?.lastChecked && token.lastChecked > 0 ? token.lastChecked : null,
    });
  } catch (err) {
    console.error('Gmail status error:', err);
    return NextResponse.json({ error: 'Error al obtener estado' }, { status: 500 });
  }
}

export async function DELETE() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    await deleteGmailToken(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Gmail disconnect error:', err);
    return NextResponse.json({ error: 'Error al desconectar' }, { status: 500 });
  }
}
