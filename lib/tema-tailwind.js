/**
 * La paleta de `tema.json` hecha Tailwind, para las dos apps.
 *
 * Los dos `tailwind.config` cargan ESTE archivo, no una copia: si cada lado
 * escribiera sus colores, el día que uno cambie un gris las apps dejan de verse
 * iguales y nada avisa.
 *
 * Cada color es una variable CSS con los tres canales sueltos (`55 53 47`) y no
 * un hex. Así funciona el modificador de opacidad (`bg-acento/10`) y el tema
 * cambia solo, sin un `dark:` al lado de cada clase: el sistema dice claro u
 * oscuro y la media query cambia las variables. NativeWind entiende esa misma
 * media query en el teléfono.
 *
 * Un color puede traer su propia transparencia (`#1E1E2199`, hex de 8 dígitos):
 * es lo que hace que `bg-panel` sea vidrio sin escribir `/55` en cada tarjeta.
 * La transparencia va en otra variable (`--a-panel`), así puede ser distinta en
 * cada tema. Si la clase trae su propia opacidad (`bg-panel/80`), manda la de
 * la clase.
 *
 * No se importa `tailwindcss/plugin`: desde `lib/` resolvería el Tailwind de la
 * raíz aunque lo pida el teléfono. Un plugin puede ser una función pelada.
 */
const tema = require('./tema.json');

const canales = hex =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');

/** La transparencia de un hex de 8 dígitos, redondeada a dos decimales; 1 si no trae. */
const alfa = hex =>
  hex.length === 9 ? Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 100) / 100 : 1;

const variables = paleta =>
  Object.fromEntries(
    Object.entries(paleta).flatMap(([nombre, hex]) => [
      [`--c-${nombre}`, canales(hex)],
      [`--a-${nombre}`, String(alfa(hex))],
    ]),
  );

/*
 * Un color como función y no como `<alpha-value>`: Tailwind la llama con la
 * opacidad de la clase, y cuando la clase no trae ninguna le pasa su variable
 * por defecto (`var(--tw-bg-opacity)`, que vale 1). En ese caso va la del tema.
 */
const colores = Object.fromEntries(
  Object.keys(tema.claro).map(nombre => [
    nombre,
    ({ opacityValue }) =>
      opacityValue === undefined || String(opacityValue).startsWith('var(')
        ? `rgb(var(--c-${nombre}) / var(--a-${nombre}))`
        : `rgb(var(--c-${nombre}) / ${opacityValue})`,
  ]),
);

function plugin({ addBase }) {
  addBase({
    ':root': variables(tema.claro),
    '@media (prefers-color-scheme: dark)': { ':root': variables(tema.oscuro) },
  });
}

module.exports = { colores, plugin, canales, alfa };
