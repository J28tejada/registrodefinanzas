/**
 * La misma configuración que la web, extensión por extensión.
 *
 * Los colores salen de `lib/tema-tailwind.js`, el mismo archivo que carga la
 * web: `bg-fondo` es el mismo gris en el teléfono y en el navegador porque los
 * dos lo leen del mismo lugar. Lo demás que se extiende acá tiene que estar
 * extendido IGUAL en `tailwind.config.ts`: en el momento en que uno de los dos
 * agregue algo por su cuenta, dejan de verse iguales sin que nada avise.
 */
const { colores, plugin: tema } = require('../lib/tema-tailwind.js');

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './componentes/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Los de `lib/tema.json`, que cambian solos entre claro y oscuro.
      colors: colores,
      /*
       * La misma tipografía que la web, que carga Inter con next/font.
       *
       * No es cosmética: comparando las dos
       * galerías píxel por píxel, las tarjetas de resumen daban 2,6% de
       * diferencia con TODO igual —mismos colores, mismas medidas, mismo
       * texto—. Era la fuente: React Native cae en la del sistema, que no es
       * Inter. Con esto la diferencia se va.
       */
      /*
       * Los tres tamaños chicos que la app usa debajo de `text-xs`.
       *
       * Existen porque la alternativa —`text-[11px]`— es una trampa silenciosa:
       * un tamaño arbitrario lleva interlineado 1.5 en el navegador (11px dan
       * 16,5) y `normal` en NativeWind (11px dan 14). Cada renglón de esos
       * quedaba 2,5px más bajo en el teléfono, y como son los renglones de las
       * etiquetas —que hay dos o tres por tarjeta— una pieza entera terminaba
       * 30 o 40px más corta sin que ninguna clase se viera distinta.
       *
       * Con el tamaño nombrado el interlineado va escrito y es el mismo de los
       * dos lados. Los números son los que el navegador ya calculaba —1.5— pero
       * redondeados a entero: 11px daban 16,5, y media línea fraccionaria corre
       * medio píxel todo lo que venga abajo. Eso no se ve, pero hace que una
       * captura de la misma pieza mida 88 o 90 según dónde haya caído, y
       * entonces la comparación empieza a marcar diferencias que no existen.
       *
       * `scripts/verificar-clases.mjs` rechaza los `text-[Npx]` en el código del
       * teléfono para que nadie los traiga de vuelta sin darse cuenta.
       */
      fontSize: {
        '2xs': ['11px', '16px'],
        '3xs': ['10px', '15px'],
        '4xs': ['9px', '14px'],
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
    },
  },
  plugins: [tema],
};
