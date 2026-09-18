import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};

export default config;
