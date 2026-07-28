# Agente de WhatsApp

Implementación de [`agente-whatsapp-finanzas-personales.md`](../agente-whatsapp-finanzas-personales.md)
sobre esta app. El usuario escribe, dicta o fotografía un recibo por WhatsApp y
el movimiento queda anotado — siempre después de una confirmación.

```
Usuario  ──WhatsApp──▶  "gasté 800 en el súper"
                        "¿Anoto un gasto de $800.00 en Supermercado?"
         ──WhatsApp──▶  "sí"
                        "Listo ✅ −$800.00 · Súper del sábado · Alimentación · 26/07"
```

---

## Cómo está armado

```
WhatsApp
   │
   ▼
Evolution API  (self-hosted, Baileys)
   │  webhook POST
   ▼
app/api/whatsapp/webhook/route.ts
   │
   ├─ ¿audio?  → Evolution descifra → Gemini transcribe → texto
   ├─ ¿imagen? → Evolution descifra → se GUARDA → Gemini lee → texto
   │
   ▼
lib/whatsapp/handler.ts
   │
   ├─ 1. ¿código de vinculación?      → vincula teléfono ↔ usuario
   ├─ 2. ¿número autorizado?          → si no, invita a vincular
   ├─ 3. ¿responde a algo pendiente?  → APLICA (determinista, sin modelo)
   └─ 4. lib/whatsapp/agent.ts (Gemini + herramientas)
              │
              └─ la herramienta NO escribe: deja una acción PENDIENTE
   ▼
respuesta por Evolution
```

| Archivo | Qué hace |
|---|---|
| `lib/whatsapp/evolution.ts` | Cliente de Evolution API |
| `lib/whatsapp/db.ts` | Tablas y helpers propios del agente |
| `lib/whatsapp/pending.ts` | Lo determinista: clasificar sí/no, agrupar, escribir |
| `lib/whatsapp/agent.ts` | Prompt, herramientas y bucle del modelo |
| `lib/whatsapp/media.ts` | Audio → texto, foto → texto (y la foto se guarda) |
| `lib/whatsapp/handler.ts` | El orden de los cuatro pasos de arriba |
| `app/whatsapp/page.tsx` | Vinculación y diagnóstico |

Las tablas (`whatsapp_numbers`, `whatsapp_link_codes`, `whatsapp_messages`,
`pending_actions`) y el bucket `receipts` salen de
[`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql),
junto con el resto del esquema. Ver [`docs/supabase.md`](supabase.md).

**El teléfono identifica a la persona.** Un número pertenece a un solo usuario,
y el webhook —que llega sin sesión de navegador— resuelve de quién son las
finanzas a partir de ahí. Por eso entra con la service role y filtra por
`user_id` a mano en cada consulta.

---

## Puesta en marcha

### 1. Evolution API + túnel

Evolution tiene que ser alcanzable por HTTPS desde Vercel. Con Docker:

```bash
docker run -d --name evolution -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=poné-una-clave-larga \
  atendai/evolution-api:latest
```

Y un túnel para exponerlo:

```bash
cloudflared tunnel --url http://localhost:8080
```

La URL que imprime el túnel es `EVOLUTION_API_URL`.

### 2. Variables de entorno

En Vercel → Settings → Environment Variables (o `.env.local` en desarrollo):

```
EVOLUTION_API_URL          https://tu-tunel.example.com
EVOLUTION_API_KEY          la que pusiste en AUTHENTICATION_API_KEY
EVOLUTION_INSTANCE         finanzas
EVOLUTION_WEBHOOK_TOKEN    una cadena larga al azar
NEXT_PUBLIC_APP_URL        https://tu-app.vercel.app
GOOGLE_AI_API_KEY          llave de Google AI Studio
GEMINI_MODEL               gemini-3.1-flash-lite
SUPABASE_SERVICE_ROLE_KEY  la del proyecto de Supabase
```

`EVOLUTION_WEBHOOK_TOKEN` no es opcional: sin él el webhook devuelve 503 y no
procesa nada. Un webhook abierto es una vía para escribir en las finanzas de
cualquiera.

La moneda y la zona horaria **no** son variables de entorno: las elige cada
usuario en Configuración, y el agente las lee de ahí. Eso importa más de lo que
parece — el servidor corre en UTC, así que sin la zona del usuario un gasto de
las nueve de la noche quedaría anotado al día siguiente.

### 3. Instancia y webhook

En la app, entrá a **WhatsApp** y tocá **Crear instancia + webhook**. Eso llama a
`/instance/create` y deja el webhook apuntando a tu app con
`webhookByEvents: false` (ver más abajo por qué importa).

### 4. Conectar el teléfono

En la misma pantalla, escribí tu número con código de país y pedí **Código**.
Evolution devuelve un código de emparejamiento que se pega en
WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.

El QR también está, pero si abrís la app en el mismo teléfono que querés
vincular no podés escanear tu propia pantalla: el código es la vía principal.

### 5. Autorizar tu número

Elegí a qué cuenta van los movimientos, generá el código de 6 letras y mandáselo
por WhatsApp al bot. Vence a los 15 minutos y sirve una sola vez.

Sin este paso el bot no anota nada: cualquier número que le escriba recibe una
invitación a vincularse y nada más.

### 6. Probar

```
vos:  gasté 800 en el súper
bot:  ¿Anoto un gasto de RD$800.00 en Súper del sábado (Alimentación)?
vos:  sí
bot:  Listo ✅ −RD$800.00 · Súper del sábado · Alimentación · 26/07
      Guardado en: Personal

      ⚠️ Alimentación: te pasaste del presupuesto por RD$1,200.00
      (RD$9,200.00 de RD$8,000.00).
```

El símbolo sale de la moneda que elegiste en Configuración.

---

## Decisiones que importan

Las tres primeras son las que cambian el diseño; el resto es plomería.

### Las herramientas no escriben

`registrar_movimiento` guarda `{kind, payload, summary}` en `pending_actions` y
le devuelve al modelo *"PENDIENTE: … Pedile confirmación; no lo des por hecho"*.
Quien escribe es `aplicar()` en `pending.ts`, cuando el usuario confirma.

Tres consecuencias:

- El payload se aplica exactamente como se propuso, sin depender de que el
  modelo recuerde qué dijo.
- Un "sí" no gasta llamada al modelo, y es el mensaje más repetido del flujo.
- Si el modelo se cae a mitad de turno (cuota, timeout), la pendiente ya está
  guardada y el "sí" posterior la aplica igual.

Detalles: una sola pendiente viva por teléfono (con dos, un "sí" es ambiguo,
garantizado por un índice único parcial), vigencia de 30 minutos, y solo se
interpretan como sí/no los mensajes de **hasta 3 palabras** y por **frase
completa**. *"Sí pero eran 300"* es una corrección y va al modelo; *"no eran
300"* tampoco es un rechazo.

### Varias unidades: preguntar, no asumir

*"Me tomé 3 cafés de 150"* puede ser 450 o tres de 150. Lo decide el usuario, y
la pregunta va dentro de la confirmación:

```
3 × Café de $150.00 c/u (Alimentación, 26/07)
¿Lo anoto como 3 registros de $150.00 o uno solo de $450.00? (separados / juntos)
```

`separados` / `juntos` los interpreta `claseAgrupacion()`, no el modelo.
`agrupar` **no existe** en el esquema de la herramienta: si el modelo puede
decidirlo, lo inventa.

### Nada entra sin concepto

`descripcion` y `categoria` son requeridas en el esquema de la herramienta, y
`categoria` va como `enum` con las categorías reales de la app. Si falta el
concepto, la herramienta devuelve un error que le pide preguntarlo. Un monto sin
concepto entra igual pero es imposible de auditar después.

### Todo mensaje dice lo que el sistema sabe

Cuando algo falla, el mensaje trae el motivo: cuota agotada nombra el modelo y
aclara que la cuota es diaria; un modelo no disponible dice qué variable
cambiar; el cron devuelve por qué no envió en vez de un `{enviados: 0}` pelado.
Es barato al escribir el código y carísimo de descubrir desde afuera, sobre todo
para quien no puede abrir los logs.

### Con audio o foto, se muestra lo que se entendió

```
🎤 Escuché: "gasté ochocientos en el súper"

¿Anoto un gasto de $800.00 en Súper (Alimentación)?
```

Es la única forma de que el usuario detecte una lectura errada **antes** de
confirmar: *"ochocientos"* oído como *"ocho mil"* pasa desapercibido si solo ve
el resumen. Por eso la transcripción se pide **literal**.

La foto se guarda **antes** de leerla y aunque la lectura falle, y queda
adjunta al movimiento (link "recibo" en la lista de transacciones).

### Rastro de origen

Todo lo que escribe el agente lleva `source = 'whatsapp'`, y la lista de
transacciones lo muestra como *vía WhatsApp*. Una trazabilidad que solo sirve
consultando la base no le sirve al usuario.

### El aviso de presupuesto no lo da el modelo

Cuando un gasto confirmado deja una categoría al 80% o por encima del tope, el
mensaje lo agrega `aplicar()`, no el modelo. Es una cuenta, no una
interpretación: tiene que salir siempre que corresponda, y no puede depender de
que el modelo se acuerde de mirar. Si el cálculo falla, el aviso se omite pero
la confirmación del gasto sale igual: un problema mirando presupuestos no puede
tapar que la plata sí quedó anotada.

---

## Trampas conocidas

### `webhookByEvents` debe ir en `false`

Con `true`, Evolution le agrega el nombre del evento al final de la URL y el
webhook **nunca recibe nada**. El cuerpo va anidado bajo la clave `webhook`.
`setWebhook()` ya lo manda bien, y `/api/whatsapp/status` avisa si la instancia
quedó configurada de otra forma.

### La versión de Baileys que trae Evolution puede no entregar mensajes

Evolution 2.3.7 viene con `baileys 7.0.0-rc.9`. Con esa versión la instancia
autentica, queda `open`, **recibe** bien, y los envíos salen con
`status: PENDING` **y nunca se entregan** — sin error en la API ni en los logs.
Se resuelve actualizando a mano a `baileys@7.0.0-rc13` y recompilando.

El test que lo aísla en un paso: enviar al **propio número de la instancia**. Si
ese llega y a terceros no, el envío funciona y lo que falla es la negociación de
cifrado con otros contactos.

### El tier gratuito de Gemini es más chico de lo que parece

La cuota es **por día, por proyecto y por modelo**, y los modelos más nuevos
traen los topes más bajos. Un mensaje con herramientas gasta 2 llamadas o más
(pedirle que decida + devolverle el resultado); un audio o una foto suman una
más. Las variantes `lite` tienen cuota más holgada. Para uso real, facturación
activada.

Ojo: el listado de modelos de la API enumera modelos que *existen*, no los que
tu llave puede usar. Si `GEMINI_MODEL` da 404, el bot te lo dice con ese nombre.

### Las sesiones de Baileys se caen solas

Se desconectan sin aviso. `/api/whatsapp/status` reporta el estado; cuando dice
`close` hay que re-vincular desde la pantalla de WhatsApp.

### Vercel cachea `/api/version` antes que las funciones

Si probás justo después de un deploy y ves comportamiento viejo, esperá un
minuto antes de salir a buscar el bug.

---

## Costo por mensaje

Los esquemas de las herramientas viajan en **cada** llamada al modelo, así que
cada herramienta suelta encarece todos los mensajes, se use o no. Por eso hay
tres y no ocho: `registrar_movimiento`, `consultar` (parametrizada, en vez de
una herramienta por tipo de consulta) y `presupuesto`.

`consultar` devuelve **texto compacto, no JSON**, porque el resultado vuelve al
modelo y se paga como contexto en esa llamada y en el historial siguiente:

```
2026-07-01..2026-07-26: ingresos 45000, gastos 31200, balance 13800, 47 movs.
Últimos: 07-26 -800 Supermercado; 07-25 -350 Uber; 07-25 +45000 Sueldo
```

El prompt del sistema es corto a propósito: va en cada llamada y con modelos
chicos no llega al mínimo cacheable, así que cada token de más se paga siempre.

---

## Qué quedó afuera

- **Mensajes a terceros.** No hay: el agente le responde a quien le escribió y
  nada más. Eso evita el riesgo de que WhatsApp cierre el número por spam.
- **`metodo_pago` desde la app.** El agente lo captura y se guarda en
  `transactions.payment_method`, pero el formulario manual todavía no lo pide.
- **Una instancia de Evolution por usuario.** Hay una sola, compartida: todos
  los usuarios le escriben al mismo número de WhatsApp y se distinguen por su
  teléfono. Alcanza mientras el número sea tuyo; si querés que cada usuario
  conecte el suyo, `EVOLUTION_INSTANCE` tiene que dejar de ser una variable de
  entorno y pasar a ser una columna.

  Consecuencia inmediata: **crear la instancia o cerrarle la sesión afecta a
  todos**. Por eso `/api/whatsapp/instance` está detrás de `ADMIN_EMAILS`. Sin
  esa variable queda abierto a cualquier usuario autenticado — cómodo mientras
  seas el único, peligroso apenas haya una segunda cuenta. Definila.
