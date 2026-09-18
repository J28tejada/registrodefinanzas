#!/bin/bash
# Construye las dos apps apuntando al MISMO backend inventado.
#
# Las variables públicas se incrustan al compilar, no al arrancar: pasárselas a
# `next start` no hace nada, el bundle ya se armó sin ellas. Y si una app se
# construye configurada y la otra no, la comparación mide esa diferencia en
# lugar del diseño — el login de una muestra el aviso de "faltan variables" y el
# de la otra no.
#
# El backend no existe a propósito. La galería no consulta nada; si alguna pieza
# llegara a pedir datos de verdad, tiene que fallar ruidosamente y no mostrar
# algo distinto en silencio.
set -e
cd "$(dirname "$0")/.."

export NEXT_PUBLIC_SUPABASE_URL=https://galeria.invalid
export NEXT_PUBLIC_SUPABASE_ANON_KEY=galeria-sin-datos
export EXPO_PUBLIC_SUPABASE_URL=https://galeria.invalid
export EXPO_PUBLIC_SUPABASE_ANON_KEY=galeria-sin-datos

echo "── web ──"
npm run build >/dev/null
echo "── teléfono ──"
(cd mobile && npm run export:web >/dev/null)
echo "listas"
