import ChatIA from '../../componentes/ChatIA';

/**
 * El gemelo de app/chat/page.tsx.
 *
 * El alto lo resuelve el layout con `flex-1`, así que acá no hay nada que
 * calcular: la conversación se queda con lo que sobra entre la barra de
 * pestañas y el borde de abajo, y el campo de escribir queda siempre a la vista.
 */
export default function Asistente() {
  return <ChatIA />;
}
