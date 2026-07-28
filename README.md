# registrodefinanzas

App de finanzas personales con varias cuentas, chat con IA, importación desde
Gmail y un agente de WhatsApp.

## Agente de WhatsApp

Escribís, dictás o fotografiás el recibo, y el movimiento queda anotado después
de confirmarlo:

```
vos:  gasté 800 en el súper
bot:  ¿Anoto un gasto de $800.00 en Súper del sábado (Alimentación)?
vos:  sí
bot:  Listo ✅ −$800.00 · Súper del sábado · Alimentación · 26/07
```

Puesta en marcha y decisiones de diseño: [`docs/whatsapp.md`](docs/whatsapp.md).

## Desarrollo

```bash
npm install
npm run dev
```

Variables de entorno: copiá `.env.local.example` a `.env.local` y completalo.
