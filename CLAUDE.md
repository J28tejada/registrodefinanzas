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

## Antes de dar algo por terminado

```bash
npm run verificar        # tipos, 3 guardas y pruebas
npm run comparar:build   # compara las dos apps píxel por píxel
cd mobile && npx expo-doctor
```

Si algo falla, se arregla; no se silencia. Las diferencias visuales ya
aceptadas están en `scripts/diferencias-conocidas.json`, cada una con su motivo.

## Pendiente

- **Entrada por voz en el teléfono.** Es lo único sin portar: la web usa la Web
  Speech API, que en React Native no existe. Falta decidir entre grabar y
  transcribir en el servidor, o usar `expo-speech-recognition`.
- **Probar la app en un teléfono de verdad con Expo Go.** Todavía no se probó
  entrar a la base real desde un teléfono.
- **`movimientos-lista`** mide 184px menos en el teléfono a 361px de ancho:
  cada motor corta las líneas en lugares distintos. Falta decidir si se acepta
  o se rearma esa fila.
