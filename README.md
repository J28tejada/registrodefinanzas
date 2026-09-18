# Jobidai Wallet

App de finanzas personales: varias cuentas, presupuestos mensuales, chat con IA,
importación desde Gmail y un agente de WhatsApp. Está en la web y en el teléfono
—Android e iOS con Expo—, con las mismas pantallas.

Cada usuario tiene su login, sus datos y su propia moneda, formato regional y
zona horaria.

## Puesta en marcha

1. Creá un proyecto en [Supabase](https://supabase.com) y corré
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) en su
   SQL Editor. Detalles en [`docs/supabase.md`](docs/supabase.md).
2. Copiá `.env.local.example` a `.env.local` y completá las variables.
3. `npm install && npm run dev`, entrá a `/login` y creá tu cuenta.
4. En **Configuración** elegí moneda, formato y zona horaria (arranca en DOP,
   es-DO, America/Santo_Domingo).

## Agente de chat

Escribís, dictás o fotografiás el recibo, y el movimiento queda anotado después
de confirmarlo:

```
vos:  gasté 800 en el súper
bot:  ¿Anoto un gasto de RD$800.00 en Súper del sábado (Alimentación)?
vos:  sí
bot:  Listo ✅ −RD$800.00 · Súper del sábado · Alimentación · 26/07
      ⚠️ Alimentación: te pasaste del presupuesto por RD$1,200.00
```

Funciona por **Telegram** y por **WhatsApp**, con el mismo agente detrás.
Telegram se configura en cinco minutos y no necesita servidor propio;
WhatsApp necesita Evolution API y un túnel.

- [`docs/telegram.md`](docs/telegram.md) — empezá por acá, es lo más simple
- [`docs/whatsapp.md`](docs/whatsapp.md) — Evolution, Baileys y sus trampas

## La app del teléfono

`mobile/` es la misma app en React Native, con las mismas veinte pantallas.
No es un puerto que se dejó a medias y después se siguió por su cuenta: la
regla es que las dos se vean igual, y eso se comprueba, no se promete.

**Lo que comparten.** Todo `lib/` es de las dos: el acceso a datos, el formato
de moneda y fechas, el ciclo de las tarjetas, el catálogo de íconos y las
validaciones. Metro lo toma de `../lib` y en el teléfono se escribe
`@compartido/…`. Nada de `lib/` importa de Next, y así tiene que seguir.

**De dónde salen los datos.** El teléfono habla con Supabase DIRECTO, con las
mismas funciones de `lib/db.ts` que hay detrás de cada ruta de `app/api`. Una
petición menos, un formato menos que mantener de los dos lados, y ninguna
validación duplicada — lo que separa los datos de una persona de los de otra
sigue siendo RLS, que corre en la base. La excepción son las cosas que
necesitan un secreto del servidor: hoy, el asistente y el escaneo de Gmail, que
sí pasan por la app web (ver `mobile/lib/api.ts`).

```bash
cd mobile
cp .env.ejemplo .env      # los mismos valores de Supabase, con prefijo EXPO_PUBLIC_
npm install && npx expo start
```

**Cómo se comprueba que se ven igual.** Desde la raíz:

| | |
|---|---|
| `npm run verificar` | Tipos, las dos guardas y las pruebas |
| `npm run comparar:build` | Construye las dos apps y las resta píxel por píxel |
| `npm run comparar` | Lo mismo, sin volver a construir |

`scripts/verificar-iconos.mjs` falla si los íconos de la web y los del teléfono
dejan de decir lo mismo. `scripts/verificar-clases.mjs` falla si el código del
teléfono usa una clase de Tailwind que NativeWind descarta —varias se descartan
en silencio, sin un solo error en consola—. `scripts/verificar-toques.mjs` falla
si algo se puede tocar y no hace nada: un botón sin manejador, o un valor de
contexto que se prende y nadie lee. Y `scripts/comparar-galeria.mjs`
fotografía las mismas piezas en las dos apps y las compara; lo que ya se miró y
se aceptó está en `scripts/diferencias-conocidas.json`, para que la herramienta
no quede siempre en rojo.

## Estructura

| | |
|---|---|
| `lib/db.ts` | Todo el acceso a datos; cada función pide de quién son |
| `lib/supabase/` | Clientes (navegador, servidor, service role) y sesión |
| `lib/format.ts` | Moneda, fechas y zona horaria del usuario |
| `lib/chat/` | El agente: herramientas, confirmación determinista y presupuestos |
| `lib/chat/transports/` | Lo único que sabe de canales: Evolution y Telegram |
| `supabase/migrations/` | El esquema, con RLS |
| `mobile/` | La app de Expo: `app/` son las pantallas, `componentes/` las piezas |
| `scripts/` | Las guardas, las pruebas y la comparación visual |
