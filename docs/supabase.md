# Supabase: base de datos, login y storage

La app corre sobre Supabase. Cada usuario tiene sus propias cuentas,
movimientos y presupuestos, y **RLS lo hace cumplir en la base**, no en el
código: aunque una consulta se olvide de filtrar, Postgres no devuelve filas
ajenas.

---

## Puesta en marcha

### 1. Crear el proyecto

En [supabase.com](https://supabase.com) → New project. Anotá la contraseña de
la base: no se vuelve a mostrar.

### 2. Correr la migración

Database → SQL Editor → New query, pegá los archivos de
[`supabase/migrations/`](../supabase/migrations/) **en orden** y ejecutalos:
primero `0001_init.sql`, después `0002_canales.sql`. Eso crea:

| | |
|---|---|
| `user_settings` | moneda, formato regional y zona horaria de cada usuario |
| `ledgers`, `transactions` | cuentas y movimientos |
| `budgets` | topes mensuales por categoría |
| `email_connections` | tokens de Gmail |
| `chat_links`, `chat_link_codes`, `chat_messages`, `pending_actions` | los agentes de WhatsApp y Telegram |
| funciones `summary_by_category`, `ledger_stats`, `spent_by_category` | los `GROUP BY`, que PostgREST no sabe hacer |
| bucket `receipts` | comprobantes, privado |
| políticas RLS | una por tabla: `user_id = auth.uid()` |

Es idempotente: se puede volver a correr sin romper nada.

### 3. Variables de entorno

Project Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL         https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY    la clave "anon public"
SUPABASE_SERVICE_ROLE_KEY        la clave "service_role"
```

`SUPABASE_SERVICE_ROLE_KEY` **salta RLS**. La usa únicamente el webhook de
WhatsApp, que llega sin sesión de navegador y resuelve al usuario por el
teléfono vinculado. Nunca la pongas en una variable `NEXT_PUBLIC_`: viajaría al
navegador y cualquiera podría leer y escribir los datos de todos.

### 4. Correo de confirmación

Authentication → Providers → Email viene activado por defecto y pide confirmar
la dirección. Agregá tu dominio en Authentication → URL Configuration →
Redirect URLs:

```
https://tu-app.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

Sin eso, el enlace del correo rebota. Para probar rápido podés desactivar
"Confirm email" en Providers → Email.

---

## Cómo se conecta el código

| Archivo | Cliente | Para qué |
|---|---|---|
| `lib/supabase/browser.ts` | anon, navegador | login y logout |
| `lib/supabase/server.ts` | anon + cookies | rutas y componentes de servidor; pasa por RLS |
| `lib/supabase/admin.ts` | service role | webhook de WhatsApp y cron; salta RLS |
| `lib/supabase/session.ts` | — | `requireDb()` y `conSesion()`: no hay forma de consultar sin decir de quién son los datos |
| `lib/supabase/admins.ts` | — | `ADMIN_EMAILS`: quién puede tocar la conexión de los canales, que es compartida |
| `middleware.ts` | — | refresca la sesión y manda a `/login` lo que no tiene |

Todas las funciones de `lib/db.ts` reciben un `Db = { supabase, userId }` y
filtran por `user_id` **siempre**, incluso donde RLS ya lo haría. Es redundante
con la sesión del usuario y es lo único que separa a un usuario de otro en el
camino de la service role.

---

## Migrar datos de la instalación anterior

Si venías de la versión con Vercel Postgres, los datos no se mueven solos.
Como no había usuarios, todo pertenece a la persona que usaba la app:

1. Creá tu usuario en la app nueva (`/login` → crear cuenta) y anotá su id:
   Authentication → Users, columna UID.
2. Exportá las tablas viejas a CSV (`ledgers`, `transactions`).
3. Importalas en Supabase (Table Editor → Import data from CSV) a tablas
   temporales, y de ahí insertá con tu `user_id`:

```sql
insert into public.ledgers (id, user_id, name, color, type, description, created_at)
select id::uuid, 'TU-USER-ID'::uuid, name, color, type, description, created_at::timestamptz
  from ledgers_import;

insert into public.transactions
       (id, user_id, ledger_id, type, scope, amount, category, description, date, source, created_at)
select id::uuid, 'TU-USER-ID'::uuid, nullif(ledger_id,'')::uuid, type, scope,
       amount::numeric, category, description, date::date,
       coalesce(nullif(source,''), 'manual'), created_at::timestamptz
  from transactions_import;
```

Ojo con dos cosas: los ids viejos eran texto y las columnas nuevas son `uuid`
(si no eran UUID válidos, dejá que la base genere ids nuevos y no copies la
columna `id`); y `date` pasó de texto a `date`.

Hacelo antes de que la gente empiece a cargar datos nuevos: no hay
deduplicación.

## Cuentas compartidas

`supabase/migrations/0003_cuentas_compartidas.sql` agrega la posibilidad de que
una cuenta tenga más de una persona: una pareja llevando los gastos del hogar,
por ejemplo. Correla en el SQL Editor después de `0002_canales.sql`.

Qué cambia:

- **`ledger_members`** dice quién entra a cada cuenta y con qué rol. Quien la
  crea queda `owner`; a quien invita entra como `member`. La migración da de
  alta como dueño a los dueños actuales, así que nada se pierde.
- **`ledger_invites`** guarda un código de 6 caracteres que vence a los 7 días.
  Hay uno vivo por cuenta: generar otro borra el anterior, para que un código
  que circuló de más deje de servir.
- **`profiles`** es un espejo público de `auth.users`. Hace falta porque
  `auth.users` no es legible desde el cliente y la pantalla de miembros tiene
  que mostrar nombre y correo. Se mantiene solo con un trigger.

Lo importante es el cambio de RLS. Antes alcanzaba con `user_id = auth.uid()`:
cada fila era de una sola persona. Ahora un gasto que carga tu pareja en la
cuenta del hogar lleva **su** `user_id`, y vos igual tenés que verlo. Entonces
las políticas de `ledgers` y `transactions` pasan a mirar la membresía de la
cuenta, no el dueño de la fila.

Eso trae un detalle: las políticas consultan `ledger_members`, que tiene su
propia RLS. Sin cuidado, Postgres entra en recursión infinita al evaluarlas.
Por eso los helpers (`es_miembro`, `es_dueno`, `cuentas_visibles`) son
`SECURITY DEFINER`: saltan RLS para poder responder la pregunta.

Los agregados (`summary_by_category`, `ledger_stats`) también cambian: filtraban
por `t.user_id = p_user`, que dejaba fuera lo que carga la otra persona. Ahora
miran la cuenta. Siguen siendo `SECURITY INVOKER`, así que pasar otro `p_user`
sigue sin servir de nada para un usuario autenticado.

Qué **no** se comparte: los presupuestos, la conexión de Gmail y la
configuración regional siguen siendo de cada quien.

Quien recibe un código todavía no es miembro, así que no puede leer
`ledger_invites`. El canje va por `aceptar_invitacion(p_code)`, una función
`SECURITY DEFINER` que valida el código y lo suma como miembro.
