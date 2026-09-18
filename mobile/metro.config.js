// Metro con la carpeta `lib/` del repo compartida.
//
// Es la pieza que sostiene "que la app móvil sea idéntica": los tipos, el
// formato de plata, la matemática del ciclo de tarjeta, el catálogo de íconos y
// TODO lib/db.ts son los MISMOS archivos que usa la web, no una copia. Una copia
// se desincroniza; esto no puede.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const raizDelRepo = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

// Metro solo mira dentro del proyecto salvo que se le diga. Sin esto, importar
// `@compartido/db` falla con "Unable to resolve module".
config.watchFolders = [path.resolve(raizDelRepo, 'lib')];

config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// Los paquetes que `lib/` importa se fijan a la copia de mobile/.
//
// Sin esto, un archivo de ../lib/ que pida '@supabase/supabase-js' sube por el
// árbol y encuentra el node_modules de la raíz —el de Next, con React 18—, y el
// bundle termina con dos copias. No se puede resolver apagando la búsqueda
// jerárquica: los paquetes de Expo tienen dependencias anidadas que dependen de
// ella (expo-font busca expo-asset así).
const fijarA = n => path.resolve(__dirname, 'node_modules', n);
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@compartido': path.resolve(raizDelRepo, 'lib'),
  react: fijarA('react'),
  'react-native': fijarA('react-native'),
  '@supabase/supabase-js': fijarA('@supabase/supabase-js'),
};

/*
 * `inlineRem: 16` no es un detalle: es lo que hace que una clase signifique lo
 * mismo en los dos lados.
 *
 * En la web, `p-4` es `1rem` y el navegador lo resuelve contra los 16px del
 * documento. En nativo no hay documento, y NativeWind cae en 14 si nadie le
 * dice. Sin esta línea `p-4` mide 14 en el teléfono y 16 en la web, y lo mismo
 * TODA la escala de medidas: la app entera queda 12,5% más chica.
 *
 * Y es invisible para el comparador de la galería, que corre sobre el export
 * web: ahí manda el CSS del navegador y el valor sale bien igual. Este es el
 * agujero de esa verificación, y por eso el número va acá escrito a mano.
 */
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
