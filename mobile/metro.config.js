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

module.exports = withNativeWind(config, { input: './global.css' });
