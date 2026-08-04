import { ImageResponse } from 'next/og';
import { IconoMarca } from '@/lib/icono';

/**
 * Los íconos grandes que referencia el manifest.
 *
 * Van como route handler y no con `generateImageMetadata` porque ahí el id no
 * llegaba a la función —`params` e `id` venían vacíos— y **todos** los tamaños
 * salían de 512, el favicon incluido, sin que nada fallara. Acá el tamaño está
 * en la URL y es imposible que se confunda.
 */
const TAMANOS: Record<string, { lado: number; proporcion: number; radio: number }> = {
  // `any`: se ve tal cual, con sus esquinas redondeadas.
  '192': { lado: 192, proporcion: 0.56, radio: 42 },
  '512': { lado: 512, proporcion: 0.56, radio: 112 },
  // `maskable`: Android lo recorta con la forma de su lanzador, así que va a
  // sangre y con más aire para que el recorte no se coma la billetera.
  maskable: { lado: 512, proporcion: 0.42, radio: 0 },
};

export function generateStaticParams() {
  return Object.keys(TAMANOS).map(tamano => ({ tamano }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tamano: string }> },
) {
  const { tamano } = await params;
  const conf = TAMANOS[tamano];
  if (!conf) return new Response('Tamaño no disponible', { status: 404 });

  return new ImageResponse(
    <IconoMarca size={conf.lado} proporcion={conf.proporcion} radio={conf.radio} />,
    { width: conf.lado, height: conf.lado },
  );
}
