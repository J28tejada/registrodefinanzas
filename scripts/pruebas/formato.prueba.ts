import { crear } from './aserciones';
import { makeFormatters } from '@/lib/format';
import { CASOS, CONFIG_DE_PRUEBA, comprobarFormato } from '@/lib/formato-esperado';

const t = crear('formato');
const fmt = makeFormatters(CONFIG_DE_PRUEBA);

// Si esto falla en la web, lo que cambió es el ICU del entorno, no el código.
for (const { caso, obtuvo } of comprobarFormato(fmt)) {
  t.falla(`${caso.que}(${JSON.stringify(caso.entrada)}) — ${caso.porque}\n` +
    `      esperaba ${JSON.stringify(caso.esperado)}\n` +
    `      obtuvo   ${JSON.stringify(obtuvo)}`);
}
t.suma(CASOS.length);

// El espacio entre símbolo y número es la diferencia más probable entre la web
// y el teléfono, y a ojo no se ve. Se comprueba por código de carácter.
const duro = [...fmt.money(1000)].some(c => c.charCodeAt(0) === 0x00a0 || c.charCodeAt(0) === 0x202f);
t.cierto('money no mete espacios duros entre el símbolo y el número', !duro);

t.resumen(`${CASOS.length} casos de oro`);
