/**
 * El PDF viaja como base64 dentro de un JSON, igual desde la web que desde el
 * teléfono: el teléfono ya lo tiene así (expo-file-system lo lee en base64) y
 * un solo formato de cuerpo es una sola ruta que probar.
 *
 * Sin `Buffer`, que es de Node: esto corre en el navegador, en el teléfono y en
 * el servidor. `btoa`/`atob` existen en los tres.
 */

/**
 * De a pedazos porque `String.fromCharCode(...bytes)` con 3 MB revienta la
 * pila: los argumentos de una llamada tienen tope. Múltiplo de 3 para que cada
 * pedazo codifique sin relleno y se puedan pegar uno detrás del otro.
 */
const PEDAZO = 3 * 8192;

export function bytesABase64(bytes: Uint8Array): string {
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += PEDAZO) {
    const pedazo = bytes.subarray(i, i + PEDAZO);
    let binario = '';
    for (let j = 0; j < pedazo.length; j++) binario += String.fromCharCode(pedazo[j]);
    partes.push(btoa(binario));
  }
  return partes.join('');
}

/** Null si no es base64 válido: un cuerpo mal armado no tiene por qué tirar una excepción. */
export function base64ABytes(texto: string): Uint8Array | null {
  const limpio = texto.replace(/\s+/g, '');
  if (limpio.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(limpio)) return null;
  let binario: string;
  try {
    binario = atob(limpio);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
