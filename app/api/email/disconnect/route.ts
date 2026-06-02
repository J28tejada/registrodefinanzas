import { NextResponse } from 'next/server';
import { deleteEmailConnection } from '@/lib/db';

export async function POST() {
  await deleteEmailConnection();
  return NextResponse.json({ ok: true });
}
