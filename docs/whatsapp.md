# Agente de WhatsApp

Implementación de [`agente-whatsapp-finanzas-personales.md`](../agente-whatsapp-finanzas-personales.md)
sobre esta app. El usuario escribe, dicta o fotografía un recibo por WhatsApp y
el movimiento queda anotado — siempre después de una confirmación.

> El mismo agente funciona por Telegram, que se configura en cinco minutos y no
> necesita servidor propio ni túnel: ver [`docs/telegram.md`](telegram.md).
> Todo lo que decide qué se registra vive en `lib/chat/` y es común a los dos
> canales; acá se documenta lo específico de WhatsApp, que es la parte cara.

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
lib/chat/handler.ts
   │
   ├─ 1. ¿código de vinculación?      → vincula teléfono ↔ usuario
   ├─ 2. ¿número autorizado?          → si no, invita a vincular
   ├─ 3. ¿responde a algo pendiente?  → APLICA (determinista, sin modelo)
   └─ 4. lib/chat/agent.ts (Gemini + herramientas)
              │
              └─ la herramienta NO escribe: deja una acción PENDIENTE
   ▼
respuesta por Evolution
```

| Archivo | Qué hace |
|---|---|
| `lib/chat/transports/evolution.ts` | Cliente de Evolution API |
| `lib/chat/db.ts` | Tablas y helpers propios del agente |
| `lib/chat/pending.ts` | Lo determinista: clasificar sí/no, agrupar, escribir |
| `lib/chat/agent.ts` | Prompt, herramientas y bucle del modelo |
| `lib/chat/media.ts` | Audio → texto, foto → texto (y la foto se guarda) |
| `lib/chat/handler.ts` | El orden de los cuatro pasos de arriba |
| `app/whatsapp/page.tsx` | Vinculación y diagnóstico |

Las tablas (`chat_links`, `chat_link_codes`, `chat_messages`,
`pending_actions`) y el bucket `receipts` salen de
[`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql),
junto con el resto del esquema. Ver [`docs/supabase.md`](supabase.md).

**El teléfono identifica a la persona.** Un número pertenece a un solo usuario,
y el webhook —que llega sin sesión de navegador— resuelve de quién son las
finanzas a partir de ahí. Por eso entra con la service role y filtra por
`user_id` a mano en cada consulta.

---

## Puesta en marcha

### 1. Evolution API

Corre donde vos quieras mientras esté prendido: tu compu, un VPS chico, una
Raspberry. **No sirve una máquina que se apague o se recicle**: cada vez que
Evolution pierde su volumen hay que re-emparejar el teléfono a mano.

```bash
cd evolution
cp .env.example .env        # poné EVOLUTION_API_KEY (openssl rand -hex 32)
docker compose up -d
```

Comprobalo con `curl localhost:8080` — tiene que contestar *"Welcome to the
Evolution API"*.

El compose deja la base y la sesión de WhatsApp en volúmenes, así que el
emparejamiento sobrevive a reinicios y a `docker compose pull`. Con
`restart: unless-stopped`, Docker lo vuelve a levantar solo cuando prendés la
máquina.

> La imagen `atendai/evolution-api` que figuraba acá antes ya no existe: el
> proyecto la publica ahora bajo `evoapicloud/`. Con la vieja, `docker pull`
> responde *"repository does not exist"*.

### 1b. Túnel

Vercel tiene que poder entrar hasta Evolution, y `localhost:8080` no se ve desde
internet. El túnel resuelve eso sin abrir puertos en el router:

```bash
brew install cloudflared          # macOS; en Linux, ver docs de Cloudflare
cloudflared tunnel --url http://localhost:8080
```

La URL que imprime es `EVOLUTION_API_URL`.

**Ojo con el túnel rápido**: la URL cambia cada vez que lo reiniciás, y hay que
actualizarla en Vercel y volver a configurar el webhook. Si esto va a quedar
funcionando, conviene un túnel con nombre (`cloudflared tunnel create`), que da
una URL fija y se puede dejar como servicio.

Si Evolution corre en un VPS con dominio y HTTPS propio, no hace falta túnel:
esa URL ya es `EVOLUTION_API_URL`.

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

### Sin cuenta no se guarda: se pregunta

`chat_links.ledger_id` puede venir en null, y antes eso significaba anotar el
movimiento con `ledger_id` null. Esos movimientos quedan huérfanos: no aparecen
en ninguna vista de cuenta ni suman a ningún saldo.

Ahora, si hay una pendiente y el vínculo no tiene cuenta, el handler pregunta
cuál antes de aplicar y la deja fija en el vínculo. Preguntarlo en cada gasto
sería insoportable; preguntarlo una vez, no.

La respuesta se resuelve en código, no en el modelo: por número de la lista o
por nombre, exacto o parcial. Si el parcial encaja con dos cuentas se
repregunta, porque anotar en la equivocada es peor que insistir. Un "sí" nunca
elige cuenta, aunque se parezca a un nombre —`si` está dentro de `Simón`—.

Elegir la cuenta vale como confirmación, igual que responder la pregunta de
agrupación: el usuario ya vio el resumen cuando se le pidió confirmar.

### Las herramientas no escriben

`registrar_movimiento` guarda `{kind, payload, summary}` en `pending_actions` y
le devuelve al modelo *"PENDIENTE: … Pedile confirmación; no lo des por hecho"*.
Quien escribe es `aplicar()` en `lib/chat/pending.ts`, cuando el usuario confirma.

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

### Detrás de un proxy que intercepta TLS, el contenedor no genera QR

Si Evolution arranca bien, la instancia queda en `connecting`, pasa a `close` y
`/instance/connect` devuelve `{"count":0}` sin error visible, el problema suele
ser el certificado. En los logs del contenedor aparece:

```
self-signed certificate in certificate chain
```

Pasa en redes corporativas y en entornos que interceptan TLS: el host confía en
el CA de la intercepción, pero el contenedor no lo hereda. Baileys no puede
completar el handshake y nunca llega a emitir el QR.

Se arregla montando el CA y apuntándole Node:

```bash
docker run -d --name evolution --network host \
  -v /ruta/al/ca-bundle.crt:/ca/proxy-ca.crt:ro \
  -e NODE_EXTRA_CA_CERTS=/ca/proxy-ca.crt \
  ... resto de la config
```

Ojo con confundirlo con un bloqueo de red: WhatsApp usa WebSocket sobre 443, y
si 443 sale, el canal está. La prueba rápida, desde adentro del contenedor, es
abrir un socket a `web.whatsapp.com:443` y pedir el upgrade — tiene que
responder `101 Switching Protocols`.

### El mensaje entra pero la respuesta nunca sale (LID)

Si el webhook devuelve 200, el movimiento se procesa, y aun así el usuario no
recibe nada, mirá el log de la app. El síntoma es este:

```
Evolution POST /message/sendText/finanzas → 400:
{"jid":"147570949111810@s.whatsapp.net","exists":false}
```

Desde 2025 WhatsApp usa **direccionamiento LID**: en vez del teléfono, el chat
se identifica con `147570949111810@lid`. El payload lo avisa con
`addressingMode: 'lid'`.

Rearmar el destino como `<lo-que-venga>@s.whatsapp.net` produce entonces un JID
que no existe. Por eso se contesta al JID **tal cual llegó**, sin reconstruirlo.

Cuando el teléfono real viaja —en `key.remoteJidAlt` o `key.senderPn`— se
prefiere ese para el `external_id` del vínculo: así queda atado al número y no
al LID, que puede cambiar. El LID sirve igual como identificador de
conversación cuando el teléfono no viene.

El error es fácil de pasar por alto porque el envío falla en silencio: el
webhook ya respondió 200 y el fallo queda solo en la consola del servidor.

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

### Los errores no viajan crudos al chat

El usuario recibe qué pasó y qué hacer; el detalle técnico queda en el log,
unido por una `ref` corta que puede dictar por chat.

Antes se le mandaba el mensaje de error tal cual, con el argumento de que "uy,
tuve un problema" es imposible de diagnosticar para quien no puede abrir los
logs. El argumento era bueno pero la solución estaba mal: alguien que solo
quería anotar un gasto recibía

```
No pude procesar el mensaje. Motivo: [GoogleGenerativeAI Error]: Error fetching
from https://generativelanguage.googleapis.com/v1beta/models/...: [503 ...]
```

que además filtra URLs internas y el nombre del modelo.

Tres casos se distinguen porque cada uno se resuelve distinto:

- **Saturado** (503/502/500): se reintenta solo, hasta dos veces con espera
  creciente. Si igual falla, se le dice que pruebe en un minuto. Un 503 de
  Gemini es lo bastante frecuente como para que rendirse en el primer intento
  se note.
- **Cuota agotada**: vuelve mañana, y mientras tanto está la app.
- **Configuración** (modelo inexistente, falta la llave): no es algo que el
  usuario pueda resolver, así que se avisa sin nombrarle variables de entorno.

Si algo revienta fuera del agente, el webhook igual manda un aviso corto. Sin
eso el usuario no recibe nada y queda esperando una respuesta que no va a
llegar.

## Grupos

El agente también funciona dentro de un grupo de WhatsApp, que es donde mucha
gente ya comparte los gastos. Se vincula igual que un chat privado: se genera el
código en la app eligiendo la cuenta y se manda **dentro del grupo**.

Lo que cambia es de quién es cada gasto. Hasta acá una conversación era una
persona, así que el `external_id` alcanzaba para saberlo. En un grupo son dos
datos distintos:

- El **vínculo del grupo** dice a qué cuenta van los gastos.
- El **vínculo individual** de quien escribió dice a nombre de quién se anota.

Por eso cada integrante tiene que vincular además su chat privado. Sin eso el
bot le contesta cómo hacerlo y no anota nada suyo: si atribuyera todo a quien
vinculó el grupo se perdería el dato que justamente se quiere ver, que es quién
gastó qué. Y estar en el grupo no alcanza — hay que ser miembro de esa cuenta,
lo mismo que exige RLS.

Tres detalles que se resolvieron para que esto funcione:

- **Las pendientes son por persona**, no por conversación. El índice único pasó
  de `(external_id)` a `(external_id, participant)`: si fuera por conversación,
  el "sí" de uno aplicaría el gasto que propuso otro, y dos personas cargando a
  la vez se pisarían.
- **El historial que ve el modelo se acota a esa persona.** Mezclar las charlas
  de todos haría que tome el gasto de uno como si lo contara otro, y gastaría
  contexto en conversación ajena.
- **Quien escribió viene en `key.participant`**, no en `remoteJid`. Igual que
  con el chat 1 a 1, el LID puede reemplazar al teléfono, así que se prefieren
  `participantAlt` o `participantPn` cuando traen el número real: es lo que
  permite encontrar su vínculo individual.

El bot interpreta **todos** los mensajes del grupo, no solo los que lo
mencionan. Es cómodo, pero cada mensaje gasta una llamada al modelo: en el tier
gratuito de Gemini la cuota diaria se agota rápido si el grupo es conversador.
Si eso molesta, el cambio es acotado —filtrar en `interpretarWebhook` por
mención o por prefijo— y está aislado en un solo lugar.

### Dónde NO conviene correr Evolution

En un entorno efímero: un contenedor de CI, un sandbox de agente, cualquier cosa
que se recicle. Evolution guarda la sesión de WhatsApp en disco y, cuando ese
disco se va, el emparejamiento se pierde y hay que rehacerlo con el teléfono en
la mano. Además tiene que estar prendido para recibir los mensajes: si se apaga,
los que lleguen mientras tanto no se procesan.

Dos cosas que se descubrieron probándolo en un sandbox, por si aparecen:

- **Salida solo por 443.** El túnel de Cloudflare necesita el 7844, así que ahí
  no levanta. Baileys sí funciona: WhatsApp usa WebSocket sobre 443.
- **Proxy que intercepta TLS.** El contenedor no hereda el CA del host y Baileys
  no completa el handshake: la instancia queda en `connecting`, pasa a `close` y
  `/instance/connect` devuelve `{"count":0}` sin error visible. Se arregla
  montando el CA y apuntándole Node con `NODE_EXTRA_CA_CERTS`.

En una máquina normal ninguna de las dos aparece.
