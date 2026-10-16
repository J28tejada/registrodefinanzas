/**
 * Los estados de cuenta que se saben leer. Uno por archivo.
 *
 * Leer otro banco (o la tarjeta de crédito del Popular) es sumar un archivo
 * acá con su `reconoce`, su `leer` y un estado sintético para las pruebas. El
 * resto —cuadrar, clasificar, limpiar, importar— no cambia.
 */
import type { ClaseDeLinea, CodigoDeLectura, LecturaCruda, RenglonPdf } from '../tipos';
import { popularCuenta } from './popular-cuenta';

export interface FormatoDeExtracto {
  id: 'popular-cuenta';
  banco: 'popular';
  /** ¿Estos renglones son de este formato? Tiene que ser estricto: el primero que dice que sí, lee. */
  reconoce(r: RenglonPdf[]): boolean;
  leer(r: RenglonPdf[]): LecturaCruda | { error: CodigoDeLectura };
  /** Sobre el detalle UNIDO CON ESPACIOS; la primera que coincide gana. */
  reglas: [ClaseDeLinea, RegExp][];
}

export const FORMATOS: FormatoDeExtracto[] = [popularCuenta];

export function detectarFormato(r: RenglonPdf[]): FormatoDeExtracto | null {
  return FORMATOS.find(f => f.reconoce(r)) ?? null;
}

export function formatoPorId(id: FormatoDeExtracto['id']): FormatoDeExtracto | null {
  return FORMATOS.find(f => f.id === id) ?? null;
}
