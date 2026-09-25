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
 * No se importa `tailwindcss/plugin`: desde `lib/` resolvería el Tailwind de la
 * raíz aunque lo pida el teléfono. Un plugin puede ser una función pelada.
 */
const tema = require('./tema.json');

const canales = hex =>
  [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');

const variables = paleta =>
  Object.fromEntries(Object.entries(paleta).map(([nombre, hex]) => [`--c-${nombre}`, canales(hex)]));

const colores = Object.fromEntries(
  Object.keys(tema.claro).map(nombre => [nombre, `rgb(var(--c-${nombre}) / <alpha-value>)`]),
);

function plugin({ addBase }) {
  addBase({
    ':root': variables(tema.claro),
    '@media (prefers-color-scheme: dark)': { ':root': variables(tema.oscuro) },
  });
}

module.exports = { colores, plugin };
