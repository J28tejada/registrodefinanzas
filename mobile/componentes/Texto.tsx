import { Text as TextoDeRN, TextProps } from 'react-native';

/**
 * Texto con la tipografía de la app puesta.
 *
 * Existe porque en React Native la fuente NO se hereda: ponerla en el
 * contenedor no hace nada, cada texto tiene que traer la suya. En la web
 * alcanza con una clase en el <body> y todo lo de adentro la toma.
 *
 * Y tiene que traerla para que se vea igual: comparando las dos galerías, las
 * tarjetas daban 2,6% de diferencia solo por eso.
 *
 * El peso va en la familia y no en `fontWeight` a propósito: Inter se carga como
 * cuatro archivos distintos, y pedirle "negrita" a la versión normal da una
 * negrita sintética —más fina y peor espaciada— que no coincide con la web.
 */
const POR_PESO: Record<string, string> = {
  'font-bold': 'Inter_700Bold',
  'font-semibold': 'Inter_600SemiBold',
  'font-medium': 'Inter_500Medium',
};

export default function Texto({ className = '', style, ...resto }: TextProps & { className?: string }) {
  const peso = Object.keys(POR_PESO).find(c => className.split(/\s+/).includes(c));
  return (
    <TextoDeRN
      {...resto}
      className={className}
      style={[{ fontFamily: peso ? POR_PESO[peso] : 'Inter_400Regular' }, style]}
    />
  );
}
