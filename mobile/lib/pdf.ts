import { Platform } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { bytesABase64 } from '@compartido/extractos/base64';
import { LIMITE_PDF_BYTES } from '@compartido/extractos/textos';
import type { CodigoDeLectura } from '@compartido/extractos/tipos';

/**
 * Lo que sale de elegir un PDF: el archivo en base64, que se canceló o por qué
 * no se pudo. El error es un código de `MENSAJES_DE_LECTURA`, así la pantalla
 * dice lo mismo que la web cuando el problema es el mismo.
 */
export type PdfElegido =
  | { tipo: 'pdf'; nombre: string; base64: string }
  | { tipo: 'cancelado' }
  | { tipo: 'error'; codigo: Extract<CodigoDeLectura, 'MUY_GRANDE' | 'ILEGIBLE'> };

/** Lo que pesa de verdad un base64: 3 bytes por cada 4 letras, menos el relleno. */
function bytesDe(base64: string): number {
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - relleno;
}

/**
 * Abre el selector de archivos del teléfono y trae el PDF elegido, listo para
 * mandar a leer. El gemelo del `<input type="file">` de
 * app/cards/importar/page.tsx.
 *
 * El tamaño se mira ANTES de leerlo, con lo que dice el selector: 3 MB de
 * base64 viajando para que el servidor conteste que no es un estado de cuenta
 * son datos del teléfono perdidos. Si el selector no lo sabe, se mira después.
 *
 * La copia que el selector deja en el caché se borra apenas se leyó: la
 * pantalla promete que no se guarda nada hasta importar, y un estado de cuenta
 * tirado en el caché de la app es justamente guardar.
 */
export async function elegirPdf(): Promise<PdfElegido> {
  let elegido;
  try {
    elegido = await getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  } catch {
    return { tipo: 'error', codigo: 'ILEGIBLE' };
  }
  if (elegido.canceled || !elegido.assets?.[0]) return { tipo: 'cancelado' };

  const asset = elegido.assets[0];
  if (asset.size != null && asset.size > LIMITE_PDF_BYTES) {
    borrarCopia(asset.uri);
    return { tipo: 'error', codigo: 'MUY_GRANDE' };
  }

  let base64: string;
  try {
    // En el navegador (la galería, `expo start --web`) no hay sistema de
    // archivos: el selector entrega el `File` del navegador, como en la web.
    base64 = Platform.OS === 'web' && asset.file
      ? bytesABase64(new Uint8Array(await asset.file.arrayBuffer()))
      : await new File(asset.uri).base64();
  } catch {
    return { tipo: 'error', codigo: 'ILEGIBLE' };
  } finally {
    borrarCopia(asset.uri);
  }

  if (bytesDe(base64) > LIMITE_PDF_BYTES) return { tipo: 'error', codigo: 'MUY_GRANDE' };
  return { tipo: 'pdf', nombre: asset.name, base64 };
}

function borrarCopia(uri: string) {
  if (Platform.OS === 'web') return;
  try {
    // Solo la copia, que el selector deja en `<caché>/DocumentPicker/` en iOS
    // y en Android: si alguna vez devolviera el archivo original, borrarlo
    // sería borrarle el PDF a la persona.
    if (!uri.includes('/DocumentPicker/')) return;
    const copia = new File(uri);
    if (copia.exists) copia.delete();
  } catch {
    // Si no se pudo borrar, el sistema limpia el caché solo: no vale un error en pantalla.
  }
}
