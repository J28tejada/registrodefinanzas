import {
  Baby, Banknote, Bike, BookOpen, Briefcase, Building2, Bus, Cake, Camera, Car,
  Church, Clapperboard, Cloud, Coffee, Coins, CreditCard, Dog, Droplet, Dumbbell,
  FolderOpen, Footprints, Fuel, Gamepad2, Gift, Globe, GraduationCap, Hammer,
  Heart, HeartPulse, Home, Key, Landmark, Lightbulb, LucideIcon, Megaphone,
  Monitor, Music, Package, Palmtree, PawPrint, Percent, Pill, Pizza, Plane, Printer,
  PiggyBank, RefreshCw, Receipt, Scale, Scissors, Shield, Shirt, ShoppingBag,
  ShoppingCart, Smartphone, Sofa, Sparkles, Sprout, Star, Stethoscope, Tag,
  Ticket, TrendingUp, Truck, UtensilsCrossed, Users, Watch, Wifi, Wine, Wrench,
  Zap,
} from 'lucide-react';
import { LedgerColor, LEDGER_COLOR_MAP } from './types';

/**
 * Los íconos que puede llevar una categoría.
 *
 * La base guarda la CLAVE ('utensilios'), no el dibujo. Así el ícono se puede
 * cambiar, corregir o reemplazar por otro paquete sin tocar una sola fila, y
 * una clave que ya no exista se dibuja con el genérico en vez de romper la
 * pantalla.
 *
 * Las claves van en español como todo lo demás del proyecto, y describen el
 * dibujo y no su uso: 'auto' y no 'transporte', porque el mismo auto le sirve a
 * "Transporte", a "Vehículo" y a "Taller".
 *
 * Es un catálogo cerrado a propósito. Importar los mil y pico de lucide para
 * que se elija uno cargaría el paquete entero en el teléfono, y elegir entre
 * mil es peor que elegir entre setenta.
 */
export const ICONOS_CATEGORIA: Record<string, LucideIcon> = {
  // Día a día
  utensilios: UtensilsCrossed,
  cafe: Coffee,
  carrito: ShoppingCart,
  bolsa: ShoppingBag,
  pizza: Pizza,
  copa: Wine,
  torta: Cake,
  // Transporte
  auto: Car,
  combustible: Fuel,
  bus: Bus,
  camion: Truck,
  moto: Bike,
  avion: Plane,
  // Hogar y servicios
  casa: Home,
  edificio: Building2,
  llave: Key,
  sofa: Sofa,
  rayo: Zap,
  agua: Droplet,
  luz: Lightbulb,
  wifi: Wifi,
  herramienta: Wrench,
  martillo: Hammer,
  // Salud y cuidado
  salud: HeartPulse,
  pastilla: Pill,
  estetoscopio: Stethoscope,
  gimnasio: Dumbbell,
  tijera: Scissors,
  brillo: Sparkles,
  // Compras y ocio
  remera: Shirt,
  regalo: Gift,
  zapatos: Footprints,
  reloj: Watch,
  musica: Music,
  cine: Clapperboard,
  juegos: Gamepad2,
  libro: BookOpen,
  entrada: Ticket,
  playa: Palmtree,
  camara: Camera,
  // Trabajo
  maletin: Briefcase,
  monitor: Monitor,
  telefono: Smartphone,
  altavoz: Megaphone,
  carpeta: FolderOpen,
  personas: Users,
  caja: Package,
  impresora: Printer,
  escuela: GraduationCap,
  // Dinero
  billetes: Banknote,
  tarjeta: CreditCard,
  tendencia: TrendingUp,
  porcentaje: Percent,
  recibo: Receipt,
  alcancia: PiggyBank,
  banco: Landmark,
  monedas: Coins,
  balanza: Scale,
  // Otros
  etiqueta: Tag,
  corazon: Heart,
  estrella: Star,
  mascota: PawPrint,
  perro: Dog,
  planta: Sprout,
  iglesia: Church,
  repetir: RefreshCw,
  nube: Cloud,
  mundo: Globe,
  bebe: Baby,
  escudo: Shield,
};

/** Cómo se agrupan en el selector. Setenta sueltos no se pueden recorrer. */
export const GRUPOS_DE_ICONOS: { titulo: string; claves: string[] }[] = [
  { titulo: 'Día a día',   claves: ['utensilios', 'cafe', 'carrito', 'bolsa', 'pizza', 'copa'] },
  { titulo: 'Transporte',  claves: ['auto', 'combustible', 'bus', 'camion', 'moto', 'avion'] },
  { titulo: 'Hogar',       claves: ['casa', 'edificio', 'llave', 'sofa', 'rayo', 'agua', 'luz', 'wifi', 'herramienta', 'martillo'] },
  { titulo: 'Salud',       claves: ['salud', 'pastilla', 'estetoscopio', 'gimnasio', 'tijera', 'brillo'] },
  { titulo: 'Ocio',        claves: ['remera', 'regalo', 'torta', 'zapatos', 'reloj', 'musica', 'cine', 'juegos', 'libro', 'entrada', 'playa', 'camara'] },
  { titulo: 'Trabajo',     claves: ['maletin', 'monitor', 'telefono', 'altavoz', 'carpeta', 'personas', 'caja', 'impresora', 'escuela'] },
  { titulo: 'Dinero',      claves: ['billetes', 'tarjeta', 'tendencia', 'porcentaje', 'recibo', 'alcancia', 'banco', 'monedas', 'balanza'] },
  { titulo: 'Otros',       claves: ['etiqueta', 'corazon', 'estrella', 'mascota', 'perro', 'planta', 'iglesia', 'repetir', 'nube', 'mundo', 'bebe', 'escudo'] },
];

/** El ícono genérico: el que le toca a una categoría que no eligió ninguno. */
export const ICONO_POR_DEFECTO = Tag;

/**
 * El componente de una clave.
 *
 * Nunca devuelve null: una clave vieja o mal escrita cae en el genérico. Si
 * devolviera null, cada lugar que dibuja una categoría tendría que acordarse de
 * contemplarlo, y el que se olvide rompe la pantalla entera.
 */
export function iconoDeCategoria(clave: string | null | undefined): LucideIcon {
  return (clave && ICONOS_CATEGORIA[clave]) || ICONO_POR_DEFECTO;
}

/** Los colores que puede llevar una categoría: los mismos de las cuentas. */
export const COLORES_CATEGORIA = Object.keys(LEDGER_COLOR_MAP) as LedgerColor[];

/**
 * El color con el que se dibuja una categoría.
 *
 * Sin color elegido va el del tipo: verde para lo que entra, gris para lo que
 * sale. Pintar de un color al azar lo que no se eligió haría creer que el color
 * significa algo.
 */
export function colorDeCategoria(
  color: string | null | undefined,
  type: 'income' | 'expense',
): string {
  if (color && color in LEDGER_COLOR_MAP) return LEDGER_COLOR_MAP[color as LedgerColor].main;
  return type === 'income' ? '#10b981' : '#64748b';
}

/**
 * Reglas para adivinar el ícono a partir del nombre.
 *
 * En orden: gana la primera que coincide, así que lo específico va antes que lo
 * general. "Pago filmmaker" tiene que dar cámara y no billetes, y para eso
 * 'filmmaker' va antes que 'pago'.
 *
 * Es una ayuda, no una decisión: lo que elija el usuario siempre manda. Existe
 * porque estrenar la función con veinte categorías propias todas iguales
 * obligaría a veinte viajes al selector antes de ver ninguna mejora.
 */
const PISTAS: [string[], string][] = [
  [['filmmaker', 'editor', 'video', 'foto', 'camara', 'media'], 'camara'],
  [['combustible', 'gasolina', 'nafta'], 'combustible'],
  [['taller', 'mecanic', 'repuesto', 'reparacion'], 'herramienta'],
  [['vehiculo', 'carro', 'auto', 'moto', 'transporte', 'taxi', 'uber', 'pasaje'], 'auto'],
  [['viaje', 'vacacion', 'hotel', 'vuelo', 'avion'], 'avion'],
  [['aliment', 'comida', 'super', 'mercado', 'restaurant', 'cena', 'almuerzo', 'desayuno'], 'utensilios'],
  [['cafe'], 'cafe'],
  [['farmac', 'medic', 'salud', 'doctor', 'hospital', 'seguro medico'], 'salud'],
  [['gimnasio', 'gym', 'ejercicio', 'deporte'], 'gimnasio'],
  [['barber', 'pelu', 'salon', 'corte'], 'tijera'],
  [['ropa', 'vestiment', 'zapato', 'calzado'], 'remera'],
  [['internet', 'celular', 'telefono', 'datos', 'wifi'], 'wifi'],
  [['luz', 'electric', 'energia'], 'rayo'],
  [['agua'], 'agua'],
  [['renta', 'alquiler', 'apartamento', 'vivienda', 'hogar', 'casa'], 'casa'],
  [['suscripcion', 'netflix', 'spotify', 'streaming', 'membresia'], 'repetir'],
  [['cine', 'pelicula', 'entreteni', 'diversion'], 'cine'],
  [['musica'], 'musica'],
  [['juego', 'gaming'], 'juegos'],
  [['educa', 'escuela', 'colegio', 'universidad', 'curso', 'libro', 'estudio'], 'libro'],
  [['diezmo', 'iglesia', 'ofrenda'], 'iglesia'],
  [['regalo', 'cumple'], 'regalo'],
  [['mascota', 'perro', 'gato', 'veterinar'], 'mascota'],
  [['bebe', 'niño', 'nino', 'hijo', 'guarderia'], 'bebe'],
  [['planta', 'jardin', 'solar'], 'planta'],
  [['marketing', 'publicidad', 'anuncio', 'meta'], 'altavoz'],
  [['equipo', 'tecnolog', 'computador', 'laptop', 'software'], 'monitor'],
  [['oficina'], 'edificio'],
  [['empleado', 'nomina', 'personal'], 'personas'],
  [['proyecto'], 'carpeta'],
  [['material', 'insumo', 'mercancia'], 'caja'],
  [['impuesto', 'itbis', 'tasa'], 'recibo'],
  [['comision', 'porcentaje'], 'porcentaje'],
  [['venta', 'compra', 'articulo'], 'carrito'],
  [['inversion', 'dividendo', 'interes', 'rendimiento'], 'tendencia'],
  [['ahorro'], 'alcancia'],
  [['banco', 'prestamo', 'deuda', 'cuota'], 'banco'],
  [['seguro'], 'escudo'],
  [['freelance', 'honorario', 'servicio', 'consultor'], 'maletin'],
  [['salario', 'sueldo', 'pago', 'aporte'], 'billetes'],
];

/**
 * Pistas que valen solo como palabra entera.
 *
 * 'plan' por subcadena rompía "Planta": pegaba con wifi antes de llegar a la
 * regla de las plantas, porque va primero. Y 'gas' por subcadena pegaría con
 * "Gastos varios". Como palabra suelta las dos son inequívocas.
 */
const EXACTAS: Record<string, string> = {
  plan: 'wifi',
  planes: 'wifi',
  ads: 'altavoz',
  gas: 'combustible',
};

/** Sin tildes y en minúscula, para que "Alimentación" case con 'aliment'. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * El ícono que le pega a un nombre, o null si ninguno.
 *
 * Null y no el genérico a propósito: quien la llama tiene que poder distinguir
 * "no se me ocurre ninguno" de "elegí la etiqueta", que son cosas distintas.
 */
export function sugerirIcono(nombre: string): string | null {
  const texto = normalizar(nombre);
  if (!texto) return null;

  // Las de palabra entera van primero: son las que se romperían si otra pista
  // por subcadena las alcanzara antes.
  const palabras = texto.split(/[^a-z0-9]+/).filter(Boolean);
  for (const palabra of palabras) {
    if (palabra in EXACTAS) return EXACTAS[palabra];
  }

  for (const [pistas, clave] of PISTAS) {
    if (pistas.some(p => texto.includes(p))) return clave;
  }
  return null;
}
