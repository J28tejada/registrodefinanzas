import {
  Baby, Banknote, Bike, BookOpen, Briefcase, Building2, Bus, Cake, Camera,
  Car, Church, Clapperboard, Cloud, Coffee, Coins, CreditCard, Dog, Droplet,
  Dumbbell, FolderOpen, Footprints, Fuel, Gamepad2, Gift, Globe,
  GraduationCap, Hammer, Heart, HeartPulse, Home, Key, Landmark, Lightbulb,
  Megaphone, Monitor, Music, Package, Palmtree, PawPrint, Percent, PiggyBank,
  Pill, Pizza, Plane, Printer, Receipt, RefreshCw, Scale, Scissors, Shield,
  Shirt, ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Sprout, Star,
  Stethoscope, Tag, Ticket, TrendingUp, Truck, Users, UtensilsCrossed, Watch,
  Wifi, Wine, Wrench, Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

/**
 * El mapa de íconos del TELÉFONO: clave -> componente de `lucide-react-native`.
 *
 * El gemelo de `lib/iconos-categoria.ts` de la web. Las claves, los grupos y
 * qué ícono le toca a cada una salen de `categorias-catalogo.ts`, que es
 * compartido; acá solo se resuelven contra el paquete nativo.
 *
 * Las dos listas tienen que decir lo mismo. Que lo digan no lo garantiza la
 * buena voluntad: lo comprueba `scripts/verificar-iconos.mjs`, que falla si una
 * clave falta, sobra o apunta a otro dibujo.
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

/** El ícono genérico: el que le toca a una categoría que no eligió ninguno. */
export const ICONO_POR_DEFECTO = Tag;

/** El componente de una clave. Nunca null: una clave rara cae en el genérico. */
export function iconoDeCategoria(clave: string | null | undefined): LucideIcon {
  return (clave && ICONOS_CATEGORIA[clave]) || ICONO_POR_DEFECTO;
}

export {
  GRUPOS_DE_ICONOS,
  COLORES_CATEGORIA,
  NOMBRES_DE_ICONO,
  NOMBRE_ICONO_POR_DEFECTO,
  colorDeCategoria,
  sugerirIcono,
} from '@compartido/categorias-catalogo';
