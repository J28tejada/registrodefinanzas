import { crear } from './aserciones';
import { declaraciones } from '@/lib/chat/agent';
import { elegirCuenta } from '@/lib/chat/pending';

const t = crear('agente-sin-cuenta');

// ─── El esquema que se le declara a Gemini ───
//
// Un `enum` vacío hace que Gemini rechace la petición entera. Un chat vinculado
// sin cuenta llegaba acá con la lista vacía y fallaba con cualquier mensaje.
const categoriaDe = (cats: string[]) => {
  const registrar = declaraciones(cats).find(d => d.name === 'registrar_movimiento');
  const props = (registrar?.parameters as unknown as { properties: Record<string, Record<string, unknown>> }).properties;
  return props.categoria;
};

t.cierto('sin categorías no se declara un enum', !('enum' in categoriaDe([])));
t.igual('sin categorías sigue siendo texto', categoriaDe([]).type, 'string');
t.igual('con categorías se declaran todas', categoriaDe(['Súper', 'Farmacia']).enum, ['Súper', 'Farmacia']);

// ─── Elegir cuenta sin haber preguntado ───
const cuentas = [
  { id: 'p', name: 'Personal' },
  { id: 'h', name: 'Gastos Hogar' },
  { id: 'u', name: 'Uber' },
];
const estricta = (txt: string) => elegirCuenta(txt, cuentas, { parcial: false });

t.igual('un gasto que nombra una cuenta no la elige', estricta('gasté 300 en uber'), null);
t.igual('tampoco por pedazo de nombre', estricta('hogar'), null);
t.igual('un saludo no elige', estricta('hola'), null);
t.igual('el nombre exacto sí', estricta('Uber'), 'u');
t.igual('sin importar mayúsculas ni tildes', estricta('gastos hogar'), 'h');
t.igual('el número de la lista sí', estricta('1'), 'p');
t.igual('un número fuera de la lista no', estricta('9'), null);
t.igual('un sí no elige', estricta('sí'), null);

// ─── El modo de siempre no cambia ───
t.igual('respondiendo a la pregunta, el pedazo alcanza', elegirCuenta('hogar', cuentas), 'h');

t.resumen('un chat sin cuenta no rompe el agente');
