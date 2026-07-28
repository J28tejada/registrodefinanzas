import { NextResponse } from 'next/server';
import { deleteEmailConnection } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export async function POST() {
  return conSesion(async db => {
    await deleteEmailConnection(db);
    return NextResponse.json({ ok: true });
  });
}
