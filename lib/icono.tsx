/**
 * La billetera de la marca, en un solo lugar.
 *
 * La usan el favicon, el ícono de iOS y los del manifest. Tenerla repetida en
 * cada archivo terminaba en tres versiones que se iban desincronizando.
 */

/** Verde de la marca, el mismo `emerald-500` que usa la interfaz. */
export const COLOR_MARCA = '#10b981';

interface Opciones {
  /** Lado del cuadrado, en píxeles. */
  size: number;
  /**
   * Cuánto del lienzo ocupa la billetera, de 0 a 1.
   *
   * Android recorta los íconos `maskable` con formas distintas según el
   * lanzador, así que ahí conviene dejar más aire para que no se coma el dibujo.
   */
  proporcion?: number;
  /**
   * Radio de las esquinas. iOS aplica su propia máscara y le pasa por encima,
   * así que para el ícono de iOS va en 0.
   */
  radio?: number;
}

export function IconoMarca({ size, proporcion = 0.56, radio }: Opciones) {
  const glifo = Math.round(size * proporcion);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: COLOR_MARCA,
        borderRadius: radio ?? Math.round(size * 0.22),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={glifo}
        height={glifo}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
      </svg>
    </div>
  );
}
