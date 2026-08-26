import ChatInterface from '@/components/ChatInterface';

export default function ChatPage() {
  // `flex-1 min-h-0`: se queda con el alto que sobra del encuadre del layout.
  // El `min-h-0` no es de adorno — sin él un ítem flex no se achica por debajo
  // de su contenido, la conversación empuja el panel hacia abajo y el campo de
  // escribir termina fuera de la pantalla.
  return <ChatInterface alto="flex-1 min-h-0" />;
}
