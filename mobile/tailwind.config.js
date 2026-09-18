/**
 * La misma configuración que la web: sin `theme.extend`.
 *
 * Que los dos lados usen la paleta por defecto de Tailwind, sin tocar, es lo que
 * hace que `bg-slate-900` sea exactamente el mismo gris en el teléfono y en el
 * navegador. En el momento en que uno de los dos extienda el tema, dejan de
 * verse iguales sin que nada avise.
 */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './componentes/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      /*
       * La misma tipografía que la web, que carga Inter con next/font.
       *
       * Es la única extensión del tema, y no es cosmética: comparando las dos
       * galerías píxel por píxel, las tarjetas de resumen daban 2,6% de
       * diferencia con TODO igual —mismos colores, mismas medidas, mismo
       * texto—. Era la fuente: React Native cae en la del sistema, que no es
       * Inter. Con esto la diferencia se va.
       */
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
    },
  },
  plugins: [],
};
