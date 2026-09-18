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
  theme: { extend: {} },
  plugins: [],
};
