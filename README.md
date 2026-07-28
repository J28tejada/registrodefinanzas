# registrodefinanzas

App de finanzas personales: varias cuentas, presupuestos mensuales, chat con IA,
importación desde Gmail y un agente de WhatsApp.

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

## Estructura

| | |
|---|---|
| `lib/db.ts` | Todo el acceso a datos; cada función pide de quién son |
| `lib/supabase/` | Clientes (navegador, servidor, service role) y sesión |
| `lib/format.ts` | Moneda, fechas y zona horaria del usuario |
| `lib/chat/` | El agente: herramientas, confirmación determinista y presupuestos |
| `lib/chat/transports/` | Lo único que sabe de canales: Evolution y Telegram |
| `supabase/migrations/` | El esquema, con RLS |
