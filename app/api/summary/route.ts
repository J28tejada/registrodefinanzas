import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSummary } from '@/lib/db';

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const summary = await getSummary(userId, startDate, endDate);
    return NextResponse.json(summary);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al obtener resumen' }, { status: 500 });
  }
}
