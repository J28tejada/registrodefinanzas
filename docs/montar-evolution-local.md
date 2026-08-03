# Montar el agente de WhatsApp en tu máquina

Guía para dejar Evolution API corriendo en una máquina que no se recicle —tu
Mac, un VPS, una Raspberry— y conectarlo con la app que ya está desplegada en
Vercel.

Está escrita para que la siga una persona o un agente con acceso a esa máquina.
Cada paso trae cómo verificar que salió bien: si algo falla, se sabe dónde.

**Lo que ya está hecho** (no hay que rehacerlo):

- La app está en producción y la base en Supabase, con todas las migraciones
  aplicadas hasta `0008_grupos.sql`.
- El código del agente está en `main`, incluido el soporte de grupos.
- Hay un número dedicado al bot, separado del personal.

**Lo que falta**: que Evolution corra de forma estable en un lugar propio.

---

## 0. Qué vas a necesitar a mano

| Dato | De dónde sale |
|---|---|
| Número del bot, con código de país | El que destinaste al bot, ej. `18299630599` |
| Acceso a ese teléfono | Para pegar el código de emparejamiento |
| Acceso a Vercel | Para poner tres variables de entorno |
| Docker instalado y corriendo | `docker --version` |

---

## 1. Levantar Evolution

```bash
git pull
cd evolution
cp .env.example .env
```

Editá `evolution/.env` y poné una clave larga al azar:

```bash
openssl rand -hex 32       # copiá el resultado a EVOLUTION_API_KEY
```

Guardala en algún lado: la misma va después en Vercel.

```bash
docker compose up -d
```

**Verificar:**

```bash
curl localhost:8080
```

Tiene que responder `{"status":200,"message":"Welcome to the Evolution API"...}`.
Si no contesta, mirá `docker compose logs evolution`.

> El compose usa la imagen `evoapicloud/evolution-api`. Si en algún lado ves
> `atendai/evolution-api`, está desactualizado: ese repositorio ya no existe y
> `docker pull` responde *"repository does not exist"*.

Los datos quedan en volúmenes y el servicio tiene `restart: unless-stopped`, así
que vuelve solo al prender la máquina y **el emparejamiento con WhatsApp
sobrevive**. Eso es todo el punto de moverlo acá.

---

## 2. Exponerlo a internet

Vercel tiene que poder entrar hasta Evolution, y `localhost:8080` no se ve desde
afuera.

Para probar rápido:

```bash
brew install cloudflared                        # macOS
cloudflared tunnel --url http://localhost:8080
```

Imprime una URL tipo `https://algo-algo.trycloudflare.com`. Esa es
`EVOLUTION_API_URL`.

**Verificar** desde otra terminal:

```bash
curl https://TU-URL.trycloudflare.com
```

Tiene que dar la misma respuesta que `localhost:8080`.

> **Esa URL cambia cada vez que reiniciás el túnel**, y hay que actualizarla en
> Vercel y reconfigurar el webhook. Sirve para probar; para dejarlo funcionando
> conviene un túnel con nombre:
>
> ```bash
> cloudflared tunnel login
> cloudflared tunnel create finanzas
> ```
>
> Da una URL fija y se puede instalar como servicio para que arranque solo.

---

## 3. Configurar Vercel

En Vercel → el proyecto → Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `EVOLUTION_API_URL` | La URL del túnel, sin barra al final |
| `EVOLUTION_API_KEY` | La misma de `evolution/.env` |
| `EVOLUTION_INSTANCE` | `finanzas` |
| `EVOLUTION_WEBHOOK_TOKEN` | Cualquier cadena larga al azar |

`EVOLUTION_WEBHOOK_TOKEN` no es opcional: sin él el webhook responde 503 y no
procesa nada. Un webhook abierto es una vía para que cualquiera escriba en las
finanzas ajenas.

**Redesplegá** después de guardarlas — Vercel no las toma en caliente.

---

## 4. Crear la instancia y el webhook

En la app → **WhatsApp** → **Crear instancia + webhook**.

**Verificar**: la pantalla debe mostrar la instancia creada y el webhook
apuntando a `https://tu-app.vercel.app/api/whatsapp/webhook?token=...`.

---

## 5. Emparejar el teléfono del bot

En la misma pantalla, escribí el número del bot con código de país y pedí
**Código**.

**Antes de pedirlo**, dejá abierta en el teléfono del bot la pantalla:
**WhatsApp → Ajustes → Dispositivos vinculados → Vincular con número de
teléfono**.

Los códigos **vencen en menos de un minuto**. Si te dice "incorrecto", casi
siempre es que venció: pedí otro con la pantalla ya lista.

**Verificar**: el estado de la instancia tiene que pasar a `open`.

---

## 6. Vincular tu chat privado

En la app → WhatsApp, elegí a qué cuenta van tus movimientos, generá el código
de 6 letras y mandáselo al bot **por privado**.

Debe responder que quedaste vinculado y, si es la primera vez, preguntarte cómo
querés que te llame.

**Verificar**: mandale `gasté 100 en prueba`, confirmá con `sí`, y fijate que
aparezca en la app. Después borralo.

---

## 7. El grupo

1. **Agregá el número del bot al grupo**, como un contacto más.
2. En la app, generá un código eligiendo la cuenta compartida (ej. *Gastos
   Hogar*) y mandalo **dentro del grupo**.

Debe responder: *"Listo, este grupo quedó vinculado a **Gastos Hogar** ✅"*.

3. **Cada integrante vincula además su chat privado** con el bot, con su propio
   código sacado desde su sesión en la app. Sin eso el bot le explica cómo
   hacerlo y no le anota nada: la cuenta sale del vínculo del grupo, pero a
   nombre de quién se anota sale del vínculo individual.

**Verificar**: que dos personas distintas carguen un gasto en el grupo y que en
la app cada uno aparezca con su autor. Preguntale al bot en el grupo *"¿quién
pagó el súper?"* — tiene que contestar bien.

---

## Si algo no funciona

**El bot no responde nada.** Mirá si el webhook llega: en los logs de Vercel
tiene que aparecer un `POST /api/whatsapp/webhook`. Si no aparece, el problema
está entre WhatsApp y tu máquina — revisá que el túnel siga vivo y que
`EVOLUTION_API_URL` en Vercel sea la URL actual.

**Llega el webhook pero no contesta.** Es el envío de vuelta. Buscá en los logs
`no se pudo enviar la respuesta`. Si dice `exists: false`, es un problema de
direccionamiento LID (ver `docs/whatsapp.md`); el código ya lo contempla, pero
si aparece algo nuevo ahí está el hilo.

**Nunca aparece el QR ni el código, y la instancia queda en `connecting` y pasa
a `close`.** Casi siempre es el certificado: si estás detrás de un proxy que
intercepta TLS, el contenedor no hereda el CA del sistema y Baileys no completa
el handshake. En los logs aparece `self-signed certificate in certificate
chain`. Se arregla montando el CA en el contenedor y apuntándole Node con
`NODE_EXTRA_CA_CERTS`. En una red doméstica normal esto no pasa.

**El túnel no levanta.** Cloudflare usa el puerto 7844 hacia su borde. Si la red
solo deja salir por 443, no va a conectar. En ese caso hace falta otra red, o un
VPS con dominio propio que no necesite túnel.

**El bot deja de contestar de golpe, después de andar bien.** Puede ser la cuota
diaria de Gemini, sobre todo si el grupo es conversador: el agente interpreta
todos los mensajes. El bot lo avisa cuando pasa.

---

## Contexto útil si algo hay que tocar

- `lib/chat/` tiene toda la lógica y es común a WhatsApp y Telegram.
- `lib/chat/handler.ts` es el orden en que se procesa cada mensaje.
- `app/api/whatsapp/webhook/route.ts` traduce el payload de Evolution.
- `docs/whatsapp.md` explica las decisiones de diseño y las trampas conocidas.
