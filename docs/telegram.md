# Agente de Telegram

El mismo agente que WhatsApp, por otro canal. Lo que decide qué se registra —la
confirmación, el agrupado, los presupuestos, la trazabilidad— vive en
`lib/chat/` y no sabe por dónde entró el mensaje.

---

## Por qué es más simple que WhatsApp

| | WhatsApp (Evolution) | Telegram |
|---|---|---|
| Servidor propio | Sí, con Baileys y su base | No |
| Túnel HTTPS | Sí, Evolution tiene que ser alcanzable | No: Telegram le pega a tu app |
| Multiusuario | Una instancia por número | Un bot atiende a todos, cada chat con su id |
| Sesión | Se cae sola, hay que re-vincular | El token no vence |
| Medios | Cifrados, hay que pedírselos a Evolution | `getFile` y listo |

En la práctica: Telegram se configura en cinco minutos y no necesita que tengas
nada prendido. La contra es que tus contactos tienen que usar Telegram.

---

## Puesta en marcha

### 1. Crear el bot

En Telegram, abrí [@BotFather](https://t.me/BotFather) y mandale `/newbot`.
Te va a pedir un nombre y un usuario que termine en `bot`. Al final te devuelve
un token con esta pinta:

```
8123456789:AAF3k9_ejemplo_no_uses_este_token_XyZ
```

### 2. Variables de entorno

En Vercel → Settings → Environment Variables:

```
TELEGRAM_BOT_TOKEN        el que te dio BotFather
TELEGRAM_WEBHOOK_SECRET   una cadena larga al azar, la inventás vos
NEXT_PUBLIC_APP_URL       https://tu-app.vercel.app
```

`TELEGRAM_WEBHOOK_SECRET` no es opcional: viaja en la cabecera
`X-Telegram-Bot-Api-Secret-Token` de cada update y es lo único que impide que
cualquiera le postee movimientos falsos a tus finanzas. Sin él el webhook
devuelve 503 y no procesa nada.

### 3. Registrar el webhook

En la app, entrá a **Telegram** y tocá **Registrar webhook**. Eso le dice a
Telegram a dónde mandarte los mensajes. La pantalla te muestra si quedó bien, y
si Telegram tuvo problemas para entregar, el último error textual.

### 4. Autorizar tu chat

Generá el código de 6 letras, abrí el bot en Telegram y mandáselo. Vence a los
15 minutos y sirve una sola vez.

Sin este paso el bot no anota nada: cualquiera que le escriba recibe una
invitación a vincularse y nada más. Es importante — un bot de Telegram es
público, cualquiera que sepa su nombre puede escribirle.

### 5. Probar

```
vos:  gasté 800 en el súper
bot:  ¿Anoto un gasto de RD$800.00 en Súper del sábado (Alimentación)?
vos:  sí
bot:  Listo ✅ −RD$800.00 · Súper del sábado · Alimentación · 26/07
      Guardado en: Personal
```

---

## Qué entiende

- **Texto** — "gasté 800 en el súper", "me pagaron 45000 el viernes".
- **Notas de voz** — se transcriben literalmente y te muestro qué escuché antes
  de que confirmes. *"Ochocientos"* oído como *"ocho mil"* pasa desapercibido si
  solo ves el resumen.
- **Fotos de recibos** — se leen y la foto queda adjunta al movimiento. También
  sirve mandarla "como archivo", sin comprimir.
- **Consultas** — "¿cuánto gasté este mes?", "¿cómo voy con el presupuesto?".

Lo que **no**: stickers, videos, ubicaciones y documentos que no sean imágenes.
El bot te dice qué mandaste y que no lo puede interpretar, en vez de quedarse
callado.

---

## Detalles de la implementación

**Solo chats privados.** Los mensajes de grupos y canales se descartan sin
responder. El agente le habla al dueño de la plata y a nadie más.

**El id del mensaje lleva el chat adelante** (`<chat_id>:<message_id>`). Los
`message_id` de Telegram son únicos por chat, no globales: sin el prefijo, dos
usuarios distintos podrían colisionar y el segundo mensaje se descartaría como
duplicado.

**Sin `parse_mode`.** Las descripciones que escribe el usuario pueden traer
guiones bajos o asteriscos, y con Markdown activado Telegram rechaza el mensaje
o lo deforma. Va todo como texto plano.

**Un bot para toda la app.** Registrar o borrar el webhook afecta a todos los
usuarios, así que esa acción está detrás de `ADMIN_EMAILS`.

---

## Trampas conocidas

### El bot no responde y la pantalla dice "webhook registrado"

Mirá el último error de entrega en la pantalla de Telegram: ahí aparece textual
lo que Telegram no pudo hacer. Lo más común es que `NEXT_PUBLIC_APP_URL` esté
mal y el webhook haya quedado apuntando a otro lado.

### "Wrong response from the webhook: 401 Unauthorized"

`TELEGRAM_WEBHOOK_SECRET` cambió después de registrar el webhook. Volvé a tocar
**Registrar webhook** para que Telegram mande el secreto nuevo.

### Archivos de más de 20 MB

`getFile` no los sirve. Una nota de voz nunca llega a ese tamaño, pero un video
o una foto enorme mandada como archivo sí: el bot avisa con el tamaño exacto.

### La cuota de Gemini

Igual que en WhatsApp: es por día, por proyecto y por modelo, y un mensaje con
herramientas gasta dos llamadas o más. Si se agota, el bot lo dice con el nombre
del modelo en vez de un "hubo un problema". Ver
[`docs/whatsapp.md`](whatsapp.md#el-tier-gratuito-de-gemini-es-más-chico-de-lo-que-parece).

---

## Los dos canales a la vez

Podés tener WhatsApp y Telegram funcionando al mismo tiempo, cada uno apuntando
a una cuenta distinta si querés. Comparten:

- el mismo código de vinculación (uno sirve para cualquiera de los dos),
- las mismas acciones pendientes, aunque **cada conversación tiene la suya**:
  un "sí" por Telegram no confirma algo que quedó pendiente en WhatsApp,
- el mismo recordatorio diario, que sale por el canal de cada conversación.

En la lista de transacciones cada movimiento dice de dónde salió: *vía WhatsApp*
o *vía Telegram*.
