import { redirect } from 'next/navigation';

/**
 * WhatsApp pasó a ser una pestaña del asistente.
 *
 * La ruta vieja sigue existiendo y redirige: quien la haya guardado en
 * favoritos o la tenga como acceso directo en la pantalla de inicio no puede
 * quedarse con un 404 porque cambiamos de opinión sobre el menú.
 */
export default function WhatsappRedirect() {
  redirect('/chat/whatsapp');
}
