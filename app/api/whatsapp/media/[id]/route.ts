import { NextRequest, NextResponse } from 'next/server';
import { obtenerMedia } from '@/lib/whatsapp/db';

type RouteContext = { params: Promise<{ id: string }> };

/** Sirve el comprobante adjunto a un movimiento (§5.8). */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const media = await obtenerMedia(id);
  if (!media) return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 });

  const bytes = Buffer.from(media.base64, 'base64');
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': media.mimeType,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
