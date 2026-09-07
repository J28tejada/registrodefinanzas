'use client';

import { COLORES_CATEGORIA, GRUPOS_DE_ICONOS, ICONOS_CATEGORIA } from '@/lib/iconos-categoria';
import { LEDGER_COLOR_MAP, TransactionType } from '@/lib/types';
import CategoryIcon from './CategoryIcon';

/**
 * Elegir el dibujo de una categoría: primero el color, después el ícono.
 *
 * El color arriba y no abajo porque tiñe a todos los íconos de la grilla: se
 * elige una vez y después se recorre la grilla viendo ya cómo va a quedar, en
 * lugar de elegir un ícono a ciegas y descubrir el color después.
 */
export default function IconPicker({
  icon, color, type, onIcon, onColor,
}: {
  icon: string | null;
  color: string | null;
  type: TransactionType;
  onIcon: (clave: string) => void;
  onColor: (color: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {/* "Sin color" primero: es el estado de arranque y tiene que poder
            recuperarse, no solo abandonarse. */}
        <button
          type="button"
          onClick={() => onColor(null)}
          aria-label="Sin color"
          className={`w-7 h-7 rounded-md bg-slate-700 border border-slate-600 transition-transform ${
            color === null ? 'ring-2 ring-white scale-110' : ''
          }`}
        />
        {COLORES_CATEGORIA.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onColor(c)}
            aria-label={`Color ${c}`}
            className={`w-7 h-7 rounded-md transition-transform ${color === c ? 'ring-2 ring-white scale-110' : ''}`}
            style={{ background: LEDGER_COLOR_MAP[c].main }}
          />
        ))}
      </div>

      {/* Alto tope y scroll: setenta íconos sueltos empujarían el nombre y los
          botones de guardar fuera de la pantalla del teléfono. */}
      <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
        {GRUPOS_DE_ICONOS.map(({ titulo, claves }) => (
          <div key={titulo} className="space-y-1.5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">{titulo}</p>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {claves.map(clave => {
                const Icono = ICONOS_CATEGORIA[clave];
                const elegido = icon === clave;
                return (
                  <button
                    key={clave}
                    type="button"
                    onClick={() => onIcon(clave)}
                    aria-label={clave}
                    aria-pressed={elegido}
                    className={`aspect-square rounded-lg flex items-center justify-center transition-colors ${
                      elegido ? 'ring-2 ring-emerald-400' : 'hover:bg-slate-800'
                    }`}
                  >
                    {elegido
                      ? <CategoryIcon icon={clave} color={color} type={type} size="sm" />
                      : <Icono className="w-4 h-4 text-slate-400" strokeWidth={1.75} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
