import { crear } from './aserciones';
import { leerIconoYColor } from '@/app/api/categories/validacion';
import {
  ICONOS_CATEGORIA, GRUPOS_DE_ICONOS, COLORES_CATEGORIA,
  iconoDeCategoria, colorDeCategoria, ICONO_POR_DEFECTO, sugerirIcono,
} from '@/lib/iconos-categoria';

const t = crear('categorias');

// ─── El catálogo ───
t.cierto('las claves van en minúscula y sin espacios',
  Object.keys(ICONOS_CATEGORIA).every(k => /^[a-z]+$/.test(k)));

const enGrupos = GRUPOS_DE_ICONOS.flatMap(g => g.claves);
t.igual('los grupos solo usan claves reales', enGrupos.filter(k => !(k in ICONOS_CATEGORIA)), []);
t.igual('ninguna clave en dos grupos', enGrupos.filter((k, i) => enGrupos.indexOf(k) !== i), []);
t.igual('los grupos cubren todo el catálogo',
  Object.keys(ICONOS_CATEGORIA).filter(k => !enGrupos.includes(k)), []);

// ─── Respaldo ───
t.igual('una clave inventada cae en el genérico', iconoDeCategoria('no-existe'), ICONO_POR_DEFECTO);
t.igual('null también', iconoDeCategoria(null), ICONO_POR_DEFECTO);
t.igual('vacío también', iconoDeCategoria(''), ICONO_POR_DEFECTO);
t.igual('una real devuelve la suya', iconoDeCategoria('casa'), ICONOS_CATEGORIA.casa);

// ─── Colores ───
t.igual('sin color, un gasto va gris', colorDeCategoria(null, 'expense'), '#64748b');
t.igual('sin color, un ingreso va verde', colorDeCategoria(null, 'income'), '#10b981');
t.igual('un color inventado cae al del tipo', colorDeCategoria('fucsia', 'expense'), '#64748b');
t.igual('uno válido manda', colorDeCategoria('blue', 'expense'), '#3b82f6');
t.igual('la paleta tiene ocho', COLORES_CATEGORIA.length, 8);

// ─── La validación de la API ───
const val = (b: Record<string, unknown>) => leerIconoYColor(b);
t.igual('sin claves no cambia nada', val({}), { ok: true, campos: {} });
t.igual('un ícono válido pasa', val({ icon: 'casa' }), { ok: true, campos: { icon: 'casa' } });
t.igual('null es "sacalo"', val({ icon: null }), { ok: true, campos: { icon: null } });
t.igual('vacío también', val({ icon: '' }), { ok: true, campos: { icon: null } });
t.igual('uno inventado se rechaza', val({ icon: 'dragon' }).ok, false);
t.igual('uno que no es texto se rechaza', val({ icon: 42 }).ok, false);
t.igual('un color válido pasa', val({ color: 'pink' }), { ok: true, campos: { color: 'pink' } });
t.igual('uno inventado se rechaza', val({ color: 'fucsia' }).ok, false);
t.igual('los dos juntos', val({ icon: 'auto', color: 'blue' }), { ok: true, campos: { icon: 'auto', color: 'blue' } });
t.igual('lo que no le toca lo ignora', val({ name: 'x', type: 'expense', icon: 'casa' }),
  { ok: true, campos: { icon: 'casa' } });
t.igual('nada de SQL en la clave', val({ icon: "casa'; drop table categories--" }).ok, false);

// ─── El sugeridor, contra nombres reales ───
const sug: [string, string | null][] = [
  ['Internet celular', 'wifi'], ['Combustible', 'combustible'], ['Aporte hogar', 'casa'],
  ['Transporte', 'auto'], ['Pago filmmaker', 'camara'], ['Pago editor', 'camara'],
  ['Jobidai media', 'camara'], ['Meta Ads', 'altavoz'], ['Diezmo', 'iglesia'],
  ['Solar', 'planta'], ['Taller', 'herramienta'], ['Vehículo', 'auto'],
  ['Barbershop', 'tijera'], ['Compra articulos', 'carrito'], ['Agua potable', 'agua'],
  ['Alimentación', 'utensilios'], ['Salud', 'salud'], ['Entretenimiento', 'cine'],
  ['Ropa', 'remera'], ['Educación', 'libro'], ['Hogar', 'casa'],
  ['Suscripciones', 'repetir'], ['Salario', 'billetes'], ['Freelance', 'maletin'],
  ['Inversiones', 'tendencia'], ['Regalo', 'regalo'], ['Materiales', 'caja'],
  ['Marketing', 'altavoz'], ['Equipo/Tecnología', 'monitor'], ['Oficina', 'edificio'],
  ['Impuestos', 'recibo'], ['Ventas', 'carrito'], ['Comisiones', 'porcentaje'],
  ['Proyectos', 'carpeta'], ['Personal/Empleados', 'personas'],
  // Las de palabra entera: 'plan' no puede ganarle a "Planta", ni 'gas' a "Gastos".
  ['Plan internet', 'wifi'], ['Plan de datos', 'wifi'], ['Planes', 'wifi'],
  ['Planta', 'planta'], ['Plantas del patio', 'planta'],
  ['Gas', 'combustible'], ['Gas de cocina', 'combustible'], ['Gasolina', 'combustible'],
  ['Gastos varios', null],
  ['Otros', null], ['', null], ['   ', null], ['xyzqw', null],
];
for (const [entrada, esperado] of sug) t.igual(`sugerir("${entrada}")`, sugerirIcono(entrada), esperado);

t.igual('nunca sugiere una clave que no exista',
  sug.map(([n]) => sugerirIcono(n)).filter(s => s && !(s in ICONOS_CATEGORIA)), []);

t.resumen(`catálogo de ${Object.keys(ICONOS_CATEGORIA).length} íconos`);
