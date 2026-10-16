/**
 * Lo que sale del servidor y lo que se guarda: descripciones armadas de nuevo,
 * nunca el detalle crudo del banco.
 *
 * El detalle trae el número de cuenta de la otra persona, su nombre completo,
 * referencias, el número de terminal y a veces el nombre del titular. Nada de
 * eso le sirve a quien mira sus gastos, y en una cuenta compartida lo verían
 * todos los miembros. Por eso la descripción no se "limpia" del crudo: se arma
 * de las partes que se entendieron ('Retiro de efectivo', 'Transferencia a
 * Ana P. (··3456)'), y lo poco que se copia (el comercio) pasa por
 * `enmascarar`.
 */
import { normalizar, tokensDeNombre, type Clasificacion } from './clasificar';

const MAX_DESCRIPCION = 120;
const MAX_COMERCIO = 60;
const MAX_CLAVE = 60;

/**
 * Toda tira de 5 dígitos o más pasa a '··' + sus últimos 4: así se ven las
 * cuentas en la app, y alcanza para reconocer una sin poder usarla.
 */
export function enmascarar(texto: string): string {
  return texto.replace(/\d{5,}/g, tira => '··' + tira.slice(-4));
}

/**
 * Dos o más palabras seguidas del nombre del titular pasan a 'tu cuenta'.
 * Una sola no: 'Ana' puede ser otra Ana.
 */
export function sinTitular(texto: string, titular: string): string {
  const delTitular = new Set(tokensDeNombre(titular));
  if (delTitular.size === 0) return texto;
  const palabras = texto.split(/\s+/).filter(Boolean);
  const salida: string[] = [];
  for (let i = 0; i < palabras.length;) {
    let j = i;
    while (j < palabras.length && esDelNombre(palabras[j], delTitular)) j++;
    if (j - i >= 2) { salida.push('tu cuenta'); i = j; }
    else { salida.push(palabras[i]); i++; }
  }
  return salida.join(' ');
}

function esDelNombre(palabra: string, delTitular: Set<string>): boolean {
  const t = tokensDeNombre(palabra);
  return t.length > 0 && t.every(x => delTitular.has(x));
}

/** 'SUPER EJEMPLO' → 'Super Ejemplo'. */
function capitalizar(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(/-])([a-zà-ÿ])/g, (_, antes: string, letra: string) => antes + letra.toUpperCase());
}

function recortar(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/**
 * El comercio del primer pedazo del detalle: 'SHELL - PIANTINI' → 'Shell',
 * 'PEDIDOSYA*PROPINA' → 'Pedidosya'.
 *
 * Se corta en la coma (después vienen la ciudad y la referencia), en el '*'
 * (antes está la marca; después, la sucursal o el número de orden) y en ' - '
 * (la sucursal). Las palabras con 3 dígitos o más son referencias, y una letra
 * suelta al final es el resto de un código.
 */
function partesDelComercio(fragmento: string): string[] {
  const base = fragmento.split(',')[0].split('*')[0].split(/\s+-/)[0];
  const palabras = base.split(/\s+/).filter(p => p && !/\d{3,}/.test(p));
  while (palabras.length > 1 && palabras[palabras.length - 1].length === 1) palabras.pop();
  return palabras;
}

export function limpiarComercio(fragmento: string): string {
  return recortar(enmascarar(capitalizar(partesDelComercio(fragmento).join(' '))), MAX_COMERCIO);
}

/**
 * Con qué se aprende la categoría de un comercio: solo letras, las primeras
 * dos palabras. 'SHELL - PIANTINI' y 'SHELL - NACO' son el mismo 'shell'.
 */
export function claveDeComercio(fragmento: string): string {
  const palabras = normalizar(partesDelComercio(fragmento).join(' '))
    .split(/[^a-zñ]+/)
    .filter(Boolean);
  return palabras.slice(0, 2).join(' ').slice(0, MAX_CLAVE);
}

/** 'PEDRO PEREZ GARCIA' → 'Pedro P.'. El apellido entero no le hace falta a nadie. */
export function nombreCorto(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter(p => /[A-Za-zÀ-ÿ]/.test(p));
  if (palabras.length === 0) return '';
  const primero = capitalizar(palabras[0]);
  if (palabras.length === 1) return primero;
  const inicial = palabras[1].replace(/[^A-Za-zÀ-ÿ]/g, '').charAt(0).toUpperCase();
  return inicial ? `${primero} ${inicial}.` : primero;
}

/**
 * La descripción fija de cada cargo del banco. El porcentaje del impuesto se
 * copia del detalle y no se escribe acá: lo fija la DGII y puede cambiar.
 */
function etiquetaDeCargo(texto: string): { descripcion: string; clave: string } {
  if (/CARGO\s+MENSUAL\s+T\.?\s?D\b/i.test(texto)) {
    return { descripcion: 'Cargo mensual de la tarjeta de débito', clave: 'cargo:mensual' };
  }
  if (/CARGO\s+MENSUAL/i.test(texto)) return { descripcion: 'Cargo mensual del banco', clave: 'cargo:mensual' };
  if (/\bDGII\b|IMPUESTO/i.test(texto)) {
    const pct = /(\d{1,2}(?:\.\d{1,2})?)\s*%/.exec(texto);
    return { descripcion: pct ? `Impuesto DGII ${pct[1]}%` : 'Impuesto DGII', clave: 'cargo:dgii' };
  }
  if (/BANCASEGURO/i.test(texto)) return { descripcion: 'Seguro del banco', clave: 'cargo:seguro' };
  if (/COMISI[OÓ]N/i.test(texto)) return { descripcion: 'Comisión del banco', clave: 'cargo:comision' };
  if (/INTER[EÉ]S/i.test(texto)) return { descripcion: 'Intereses cobrados por el banco', clave: 'cargo:intereses' };
  return { descripcion: 'Cargo del banco', clave: 'cargo:banco' };
}

export interface Saneado {
  comercio: string;
  descripcion: string;
  matchKey: string;
  ultimos4Contraparte: string | null;
}

/**
 * Arma comercio, descripción y clave de aprendizaje de una línea ya
 * clasificada. Recibe el detalle crudo y el nombre del titular; no devuelve
 * ninguno de los dos.
 */
export function sanear(
  detalle: string[],
  { clase, contraparte }: Clasificacion,
  centavos: number,
  titular: string,
): Saneado {
  const texto = detalle.join(' ');
  const primero = detalle[0] ?? '';
  const cuenta = contraparte?.cuenta ?? null;
  const ultimos4 = cuenta && cuenta.length >= 4 ? cuenta.slice(-4) : null;
  const sufijo = ultimos4 ? `··${ultimos4}` : '';
  const quien = nombreCorto(contraparte?.nombre ?? '');

  let comercio = '';
  let descripcion: string;
  let matchKey: string;

  switch (clase) {
    case 'purchase':
    case 'refund': {
      comercio = limpiarComercio(sinTitular(primero, titular));
      matchKey = claveDeComercio(sinTitular(primero, titular));
      descripcion = clase === 'purchase'
        ? comercio || 'Compra con tarjeta'
        : comercio ? `Devolución de ${comercio}` : 'Devolución';
      break;
    }
    case 'withdrawal':
      descripcion = 'Retiro de efectivo';
      matchKey = 'retiro';
      break;
    case 'deposit': {
      // El canal ('ACTE' cajero, 'CTAC' sucursal) es lo único estable de un
      // depósito: de ahí se aprende si los de ese canal son ingreso o plata propia.
      const canal = /\bDEP\s+([A-Z]{2,})/.exec(texto);
      descripcion = 'Depósito';
      matchKey = canal ? `dep:${canal[1].toLowerCase()}` : 'dep';
      break;
    }
    case 'fee': {
      const cargo = etiquetaDeCargo(texto);
      descripcion = cargo.descripcion;
      matchKey = cargo.clave;
      break;
    }
    case 'interest':
      descripcion = 'Intereses de la cuenta';
      matchKey = 'intereses';
      break;
    case 'own_transfer':
      descripcion = ultimos4 ? `Entre tus cuentas (${sufijo})` : 'Entre tus cuentas';
      matchKey = `${centavos < 0 ? 'a' : 'de'}:${ultimos4 ?? 'propia'}`;
      break;
    case 'transfer_out':
    case 'transfer_in': {
      const prep = clase === 'transfer_out' ? 'a' : 'de';
      comercio = quien;
      if (quien && sufijo) descripcion = `Transferencia ${prep} ${quien} (${sufijo})`;
      else if (quien || sufijo) descripcion = `Transferencia ${prep} ${quien || sufijo}`;
      else descripcion = clase === 'transfer_out' ? 'Transferencia enviada' : 'Transferencia recibida';
      // Sin cuenta (las de TOKE*), se aprende por el nombre ya recortado: es lo
      // mismo que queda en la descripción, no un dato más.
      matchKey = ultimos4 ? `${prep}:${ultimos4}`
        : quien ? `${prep}:${normalizar(quien).replace(/[^a-zñ ]/g, '').trim()}` : '';
      break;
    }
    default: {
      // Lo que no se entendió: el primer pedazo, cortado y enmascarado. Mejor
      // que un 'Movimiento' a secas para decidir qué fue.
      const limpio = enmascarar(sinTitular(primero.split(',')[0], titular)).replace(/\s+/g, ' ').trim();
      descripcion = limpio ? capitalizar(limpio) : 'Movimiento del banco';
      matchKey = claveDeComercio(sinTitular(primero, titular));
    }
  }

  return {
    comercio: recortar(enmascarar(sinTitular(comercio, titular)), MAX_COMERCIO),
    descripcion: recortar(enmascarar(sinTitular(descripcion, titular)), MAX_DESCRIPCION),
    matchKey: enmascarar(matchKey).slice(0, MAX_CLAVE),
    ultimos4Contraparte: ultimos4,
  };
}
