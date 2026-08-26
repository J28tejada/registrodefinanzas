import { redirect } from 'next/navigation';

/** Ver la nota en `app/whatsapp/page.tsx`: la ruta vieja sigue funcionando. */
export default function TelegramRedirect() {
  redirect('/chat/telegram');
}
