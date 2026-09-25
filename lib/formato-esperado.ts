/**
 * Lo que `lib/format.ts` TIENE que devolver, escrito a mano.
 *
 * El formato de plata y de fechas sale de `Intl`, y `Intl` no es el mismo en
 * todas partes: el navegador trae sus propios datos de ICU, y Hermes —el motor
 * del teléfono— los pide prestados al sistema operativo. O sea que dos personas
 * con el MISMO archivo instalado pueden ver montos distintos según la versión de
 * su Android o su iOS.
 *
 * Con 58 lugares de la app mostrando plata, eso no se puede dejar a la suerte.
 * Esta tabla es el árbitro: la web la comprueba en `npm test`, y el teléfono la
 * dibuja en la pantalla `/formato` para poder mirarla en un aparato de verdad,
 * que es el único lugar donde la pregunta se contesta.
 *
 * La diferencia más probable no es el símbolo sino el espacio: CLDR usa a veces
 * un espacio duro (U+00A0) entre el símbolo y el número. Por eso lo esperado se
 * escribe con el código del carácter y no con un espacio tecleado, que se vería
 * igual y compararía distinto.
 */
import { FormatConfig } from './format';

export const CONFIG_DE_PRUEBA: FormatConfig = {
  currency: 'DOP',
  locale: 'es-DO',
  timezone: 'America/Santo_Domingo',
};

export interface CasoDeFormato {
  /** Qué se llama, para que el informe diga dónde falló. */
  que: 'money' | 'amount' | 'date' | 'monthLabel';
  entrada: number | string;
  esperado: string;
  /** Por qué este caso está en la lista. */
  porque: string;
}

export const CASOS: CasoDeFormato[] = [
  { que: 'money', entrada: 24700, esperado: 'RD$24,700.00',
    porque: 'el monto típico del tablero' },
  { que: 'money', entrada: 0, esperado: 'RD$0.00',
    porque: 'el cero lleva los dos decimales igual' },
  { que: 'money', entrada: 1234567.5, esperado: 'RD$1,234,567.50',
    porque: 'dos separadores de miles y un decimal que hay que completar' },
  { que: 'money', entrada: -3200, esperado: '-RD$3,200.00',
    porque: 'de qué lado del símbolo cae el menos' },
  { que: 'money', entrada: 0.005, esperado: 'RD$0.01',
    porque: 'redondeo del medio centavo' },
  { que: 'money', entrada: 1715, esperado: 'RD$1,715.00',
    porque: 'un tope de presupuesto real del usuario' },

  { que: 'amount', entrada: 1234567.5, esperado: '1,234,567.5',
    porque: 'sin símbolo y sin rellenar decimales: es lo que va al modelo' },

  { que: 'date', entrada: '2026-09-18', esperado: '18 sept de 2026',
    porque: 'el mes abreviado en español lleva punto o no según los datos' },
  { que: 'date', entrada: '2026-01-01', esperado: '01 ene de 2026',
    porque: 'el día con cero adelante' },
  { que: 'date', entrada: '2024-02-29', esperado: '29 feb de 2024',
    porque: 'un 29 de febrero que existe' },
  { que: 'date', entrada: '2026-12-31', esperado: '31 dic de 2026',
    porque: 'el último día del año' },

  { que: 'monthLabel', entrada: '2026-09-01', esperado: 'Septiembre de 2026',
    porque: 'el mes completo, que va en la cabecera de cada pantalla; mayúscula solo en la inicial' },
  { que: 'monthLabel', entrada: '2026-03-01', esperado: 'Marzo de 2026',
    porque: 'un mes corto' },
];

/** Corre la tabla contra unos formateadores y devuelve lo que no coincidió. */
export function comprobarFormato(
  fmt: { money(n: number): string; amount(n: number): string; date(s: string): string; monthLabel(s: string): string },
): { caso: CasoDeFormato; obtuvo: string }[] {
  const fallas: { caso: CasoDeFormato; obtuvo: string }[] = [];
  for (const caso of CASOS) {
    const obtuvo = caso.que === 'money' ? fmt.money(caso.entrada as number)
      : caso.que === 'amount' ? fmt.amount(caso.entrada as number)
      : caso.que === 'date' ? fmt.date(caso.entrada as string)
      : fmt.monthLabel(caso.entrada as string);
    if (obtuvo !== caso.esperado) fallas.push({ caso, obtuvo });
  }
  return fallas;
}
