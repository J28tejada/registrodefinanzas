# Jobidai Wallet — notas para Claude

## Cómo se trabaja acá

- **Se pushea directo a `main`, siempre.** Sin ramas ni PR. Usar
  `git push origin HEAD:refs/heads/main`.
- El dueño habla en español rioplatense/dominicano. Los comentarios del código,
  los mensajes de commit y los textos de la app van en el mismo tono.
- Los comentarios explican el **porqué**, no el qué. Mirá los que ya hay.
- Las migraciones de `supabase/migrations/` que ya se aplicaron **no se editan**:
  se agrega una nueva.

## Las dos apps

La web (Next.js, raíz) y la del teléfono (Expo, `mobile/`) tienen que verse
igual. Las mismas 20 pantallas.

- Todo `lib/` es compartido. En el teléfono se importa como `@compartido/…`.
  Nada de `lib/` puede importar de Next.
- El teléfono habla con Supabase **directo**, con las mismas funciones de
  `lib/db.ts`. RLS es lo que protege los datos. Solo pasa por la web lo que
  necesita un secreto del servidor (asistente y Gmail), vía `mobile/lib/api.ts`
  con el token en `Authorization`.
- Las validaciones de lo que entra a la base viven en `lib/*-campos.ts` y las
  usan los dos lados. No duplicarlas.
- Cada pantalla o componente del teléfono dice arriba de qué archivo de la web
  es gemelo.

## El tema

Claro (estilo Notion) y oscuro (estilo ChatGPT), según lo que diga el sistema.
Los colores salen de un solo lugar, `lib/tema.json`, y los dos
`tailwind.config` los cargan por `lib/tema-tailwind.js` como variables CSS.

- En las clases, **solo los tokens**: `bg-fondo`, `bg-panel`, `bg-hundido`,
  `bg-elevado`, `border-linea`, `text-tinta`, `text-tinta-2`, `bg-primario`,
  `text-acento`, `text-peligro`… Nunca `slate-800` ni `emerald-500`: no
  cambian con el tema.
- Donde no hay `className` (íconos de lucide, `ActivityIndicator`,
  `placeholderTextColor`), el teléfono usa `useColores()` de
  `mobile/lib/colores.ts`, que lee el mismo `tema.json`.
- El verde (`acento`) es para lo que entra y lo que salió bien; el rojo
  (`peligro`), para lo que se pasó o falló. Un gasto normal va en tinta. Lo
  seleccionado va en gris (`bg-hundido` o `bg-elevado`), no en verde.

## Antes de dar algo por terminado

```bash
npm run verificar        # tipos, 3 guardas y pruebas
npm run comparar:build   # compara las dos apps píxel por píxel
cd mobile && npx expo-doctor
```

En una Mac el comparador necesita el Chrome instalado:
`CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run comparar`.

Si algo falla, se arregla; no se silencia. Las diferencias visuales ya
aceptadas están en `scripts/diferencias-conocidas.json`, cada una con su motivo.

## Probar en el teléfono con Expo Go

Ya se probó contra la base real. Dos cosas que no son obvias:

- **Entrar con Google** vuelve a la app por una dirección `exp://…/--/auth`, y
  Supabase solo redirige a las que están en Authentication → URL Configuration
  → Redirect URLs. Si falta, no da error: manda a la web y la sesión queda
  abierta en el navegador. Cada túnel de Expo tiene su dirección, así que hay
  que agregar la del túnel en uso (`exp://<host>/--/**`). La de la app
  compilada ya está (`jobidai://**`).
- **Si el teléfono no llega a la Mac** por la red, `npx expo start --tunnel`.
  Cuando ngrok falla, el túnel propio de Expo anda con
  `EXPO_UNSTABLE_TUNNEL_V2=1 npx expo start --tunnel` (hace falta
  `npx expo login`).

## Pendiente

- **Entrada por voz en el teléfono.** Es lo único sin portar: la web usa la Web
  Speech API, que en React Native no existe. Falta decidir entre grabar y
  transcribir en el servidor, o usar `expo-speech-recognition`.
- **`movimientos-lista`** mide 24px menos en el teléfono a 361px de ancho:
  cada motor corta las líneas en lugares distintos. Falta decidir si se acepta
  o se rearma esa fila.
