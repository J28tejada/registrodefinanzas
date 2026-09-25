import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Bell, Check, Loader2, X } from 'lucide-react-native';
import Texto from './Texto';
import Selector from './Selector';
import CampoDeFecha from './CampoDeFecha';
import { db } from '../lib/datos';
import { createCard, updateCard } from '@compartido/db';
import { leerCamposDeCiclo } from '@compartido/tarjetas-campos';
import {
  Card, CardKind, CARD_GROUPS, CARD_KIND_LABEL, LedgerColor, LEDGER_COLOR_MAP,
  etiquetaUltimosDigitos, llevaSaldo,
} from '@compartido/types';
import { useColores } from '../lib/colores';

const COLORES = Object.keys(LEDGER_COLOR_MAP) as LedgerColor[];

const TIPOS = CARD_GROUPS.flatMap(({ titulo, kinds }) =>
  kinds.map(t => ({ valor: t, etiqueta: CARD_KIND_LABEL[t], grupo: titulo })),
);

interface Borrador {
  name: string;
  kind: CardKind;
  last4: string;
  issuer: string;
  color: LedgerColor;
  /** Los del ciclo van como texto: un campo vacío no es cero, es "sin poner". */
  credit_limit: string;
  statement_day: string;
  due_day: string;
  opening_balance: string;
  opening_date: string;
  alerts: boolean;
}

const VACIO: Borrador = {
  name: '', kind: 'credit', last4: '', issuer: '', color: 'blue',
  credit_limit: '', statement_day: '', due_day: '',
  opening_balance: '', opening_date: '', alerts: true,
};

/** Texto a número, o null si quedó vacío. Vacío significa "sin configurar". */
function oNulo(valor: string): number | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * El gemelo de components/CardForm.tsx.
 *
 * La web manda el borrador a `/api/cards`, que valida y guarda. Acá se guarda
 * derecho contra la base, así que la validación del ciclo tiene que correr de
 * este lado: es `leerCamposDeCiclo`, la misma función que usa la ruta, traída
 * de `lib/`. Sin eso un día de corte 45 entraría sin chistar y el cálculo del
 * próximo corte devolvería cualquier cosa el resto del año.
 */
export default function FormularioDeTarjeta({
  card, usuario, onListo, onCancelar,
}: {
  /** Presente = edición. Ausente = alta. */
  card?: Card;
  usuario: string;
  onListo: () => void | Promise<void>;
  onCancelar: () => void;
}) {
  const paleta = useColores();
  const [borrador, setBorrador] = useState<Borrador>(
    card
      ? {
          name: card.name, kind: card.kind, last4: card.last4,
          issuer: card.issuer, color: card.color,
          credit_limit: card.credit_limit != null ? String(card.credit_limit) : '',
          statement_day: card.statement_day != null ? String(card.statement_day) : '',
          due_day: card.due_day != null ? String(card.due_day) : '',
          // El saldo inicial en cero no se muestra: es el valor por defecto y
          // llenarlo con un "0" hace parecer que se configuró algo.
          opening_balance: card.opening_balance ? String(card.opening_balance) : '',
          opening_date: card.opening_date ?? '',
          alerts: card.alerts,
        }
      : VACIO,
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    const name = borrador.name.trim();
    if (!name) return;
    setGuardando(true);
    setError('');
    try {
      // Solo las de crédito llevan ciclo. Si se cambió el tipo, los campos se
      // mandan en null para que no quede un día de corte colgado en una tarjeta
      // de débito.
      const deCredito = llevaSaldo(borrador);
      const ciclo = leerCamposDeCiclo({
        credit_limit: deCredito ? oNulo(borrador.credit_limit) : null,
        statement_day: deCredito ? oNulo(borrador.statement_day) : null,
        due_day: deCredito ? oNulo(borrador.due_day) : null,
        opening_balance: deCredito ? oNulo(borrador.opening_balance) ?? 0 : 0,
        opening_date: deCredito ? borrador.opening_date || null : null,
        alerts: deCredito ? borrador.alerts : true,
      });
      if (!ciclo.ok) { setError(ciclo.error); return; }

      const comunes = {
        name,
        kind: borrador.kind,
        last4: borrador.last4,
        issuer: borrador.issuer.trim(),
        color: borrador.color,
        ...ciclo.campos,
      };

      const res = card
        ? await updateCard(db(usuario), card.id, comunes)
        : await createCard(db(usuario), comunes);
      if (!res.ok) { setError(res.error); return; }
      await onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-2.5">
      <Texto className="text-sm font-medium text-tinta">
        {card ? 'Editar medio de pago' : 'Nuevo medio de pago'}
      </Texto>

      <TextInput
        value={borrador.name}
        onChangeText={t => setBorrador(b => ({ ...b, name: t }))}
        placeholder="Nombre — ej: Visa Popular, Ahorros BHD"
        placeholderTextColor={paleta.tinta2}
        autoFocus
        maxLength={40}
        className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
      />

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Selector
            value={borrador.kind}
            opciones={TIPOS}
            onChange={v => setBorrador(b => ({ ...b, kind: v as CardKind }))}
            titulo="Tipo"
          />
        </View>
        <TextInput
          keyboardType="number-pad"
          value={borrador.last4}
          onChangeText={t => setBorrador(b => ({ ...b, last4: t.replace(/\D/g, '').slice(0, 4) }))}
          placeholder={etiquetaUltimosDigitos(borrador.kind)}
          placeholderTextColor={paleta.tinta2}
          className="flex-1 bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
        />
      </View>

      <TextInput
        value={borrador.issuer}
        onChangeText={t => setBorrador(b => ({ ...b, issuer: t }))}
        placeholder={borrador.kind === 'checking' || borrador.kind === 'savings'
          ? 'Banco'
          : 'Banco (opcional)'}
        placeholderTextColor={paleta.tinta2}
        maxLength={40}
        className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
      />

      {/* Lo propio de una tarjeta de crédito: el cupo y el ciclo. Solo acá,
          porque el efectivo y una cuenta de ahorro no deben nada ni tienen
          fecha de corte. Todo opcional: la tarjeta se puede cargar hoy y
          configurarse después. */}
      {llevaSaldo(borrador) ? (
        <View className="border border-linea rounded-xl p-3 gap-2.5 bg-fondo">
          <Texto className="text-xs font-medium text-tinta-2">
            Saldo y ciclo
          </Texto>

          <View className="gap-1">
            <Texto className="text-xs text-tinta-2 leading-6">Límite de crédito</Texto>
            <TextInput
              keyboardType="decimal-pad"
              value={borrador.credit_limit}
              onChangeText={t => setBorrador(b => ({ ...b, credit_limit: t }))}
              placeholder="Opcional — para ver cuánto llevás consumido"
              placeholderTextColor={paleta.tinta2}
              className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
            />
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Texto className="text-xs text-tinta-2 leading-6">Día de corte</Texto>
              <TextInput
                keyboardType="number-pad"
                value={borrador.statement_day}
                onChangeText={t => setBorrador(b => ({ ...b, statement_day: t.replace(/\D/g, '').slice(0, 2) }))}
                placeholder="25"
                placeholderTextColor={paleta.tinta2}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
              />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-xs text-tinta-2 leading-6">Día de pago</Texto>
              <TextInput
                keyboardType="number-pad"
                value={borrador.due_day}
                onChangeText={t => setBorrador(b => ({ ...b, due_day: t.replace(/\D/g, '').slice(0, 2) }))}
                placeholder="10"
                placeholderTextColor={paleta.tinta2}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
              />
            </View>
          </View>
          <Texto className="text-2xs text-tinta-2">
            Si el día de pago es anterior al de corte, se entiende que vence el mes
            siguiente. En los meses cortos se corre al último día.
          </Texto>

          <View className="flex-row gap-2">
            <View className="flex-1 gap-1">
              <Texto className="text-xs text-tinta-2 leading-6">Ya debías</Texto>
              <TextInput
                keyboardType="decimal-pad"
                value={borrador.opening_balance}
                onChangeText={t => setBorrador(b => ({ ...b, opening_balance: t }))}
                placeholder="0"
                placeholderTextColor={paleta.tinta2}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
              />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-xs text-tinta-2 leading-6">Desde</Texto>
              <CampoDeFecha
                value={borrador.opening_date}
                onChange={v => setBorrador(b => ({ ...b, opening_date: v }))}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5"
              />
            </View>
          </View>
          <Texto className="text-2xs text-tinta-2">
            Lo que ya debías cuando empezaste a seguirla acá. Los movimientos
            anteriores a esa fecha no se suman: ya están adentro de ese monto.
          </Texto>

          {/* El `<input type="checkbox">` no existe en React Native: se dibuja
              el cuadradito a mano y toda la fila hace de etiqueta, igual que el
              <label> de la web. */}
          <Pressable
            onPress={() => setBorrador(b => ({ ...b, alerts: !b.alerts }))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: borrador.alerts }}
            className="flex-row items-start gap-2 pt-0.5"
          >
            <View className={`w-4 h-4 mt-0.5 rounded border items-center justify-center ${
              borrador.alerts ? 'bg-primario border-primario' : 'border-linea-fuerte'
            }`}>
              {borrador.alerts ? <Check size={12} color={paleta.sobrePrimario} /> : null}
            </View>
            <View className="flex-row items-center gap-1.5 flex-1">
              <Bell size={14} color={paleta.tinta2} />
              <Texto className="text-xs text-tinta-2 flex-1">
                Avisarme tres días antes del corte y del pago
              </Texto>
            </View>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-1.5 pt-0.5">
        {COLORES.map(c => (
          <Pressable
            key={c}
            onPress={() => setBorrador(b => ({ ...b, color: c }))}
            accessibilityLabel={`Color ${c}`}
            className={`w-7 h-7 rounded-md overflow-hidden flex-row ${
              borrador.color === c ? 'border-2 border-tinta' : ''
            }`}
            style={borrador.color === c ? { transform: [{ scale: 1.1 }] } : undefined}
          >
            {/* La web pinta el degradado de dos tramos con `linear-gradient` al
                35%. Acá son dos vistas: un degradado nativo pediría otra
                dependencia para dibujar un corte duro que no es un degradado. */}
            <View style={{ flex: 35, backgroundColor: LEDGER_COLOR_MAP[c].dark }} />
            <View style={{ flex: 65, backgroundColor: LEDGER_COLOR_MAP[c].main }} />
          </Pressable>
        ))}
      </View>

      {error ? <Texto className="text-xs text-peligro">{error}</Texto> : null}

      <View className="flex-row gap-2 pt-0.5">
        <Pressable
          onPress={onCancelar}
          className="flex-1 py-2.5 bg-hundido active:bg-presionado rounded-lg flex-row items-center justify-center gap-1.5"
        >
          <X size={16} color={paleta.tinta} />
          <Texto className="text-tinta text-sm">Cancelar</Texto>
        </Pressable>
        <Pressable
          onPress={guardar}
          disabled={guardando || !borrador.name.trim()}
          style={guardando || !borrador.name.trim() ? { opacity: 0.5 } : undefined}
          className="flex-1 py-2.5 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-1.5"
        >
          {guardando ? <Loader2 size={16} color={paleta.sobrePrimario} /> : <Check size={16} color={paleta.sobrePrimario} />}
          <Texto className="text-sobre-primario text-sm font-medium">Guardar</Texto>
        </Pressable>
      </View>
    </View>
  );
}
