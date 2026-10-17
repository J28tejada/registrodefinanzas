import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Lock, X } from 'lucide-react-native';
import Texto from './Texto';
import Vidrio from './Vidrio';
import Selector from './Selector';
import { Dinero, Monto, NUMEROS_PAREJOS, Pildora, SOMBRA_CHICA } from './RevisionDeExtracto';
import { useColores } from '../lib/colores';
import type { Category } from '@compartido/types';
import type { CambioDePlan, HojaDeLinea } from '@compartido/extractos/planear';
import { HOJA, OPCIONES } from '@compartido/extractos/textos-plan';

/**
 * La hoja de una línea del estado de cuenta: todo lo que se puede hacer con
 * ella, más allá de las píldoras de la fila. El gemelo de
 * components/BankStatementLineSheet.tsx.
 *
 * Las opciones, los candidatos, las tarjetas y el porqué de la categoría
 * vienen de `hojaDeLinea`, que ya sabe cuáles valen para el signo y el
 * contexto de la línea: acá no se decide ninguna. Lo único propio es lo que
 * todavía no es un cambio — lo que se está escribiendo en la descripción, la
 * casilla de "usar en las otras" y qué lista se abrió —.
 *
 * Solo props, para que la galería la dibuje: con `enLinea` va sin el `Modal`.
 */
export default function HojaDeLineaDeExtracto({
  hoja, dinero, categorias, onCambio, onCerrar, enLinea = false,
}: {
  /** Null = cerrada. */
  hoja: HojaDeLinea | null;
  dinero: Dinero;
  /** Las del libro donde se anota: las únicas que la base acepta para esta línea. */
  categorias: Category[];
  onCambio: (clave: string, cambio: CambioDePlan) => void;
  onCerrar: () => void;
  /** Para la galería: el panel suelto, sin fondo ni `Modal`. */
  enLinea?: boolean;
}) {
  const paleta = useColores();
  const insets = useSafeAreaInsets();
  const clave = hoja?.clave ?? null;
  const [lista, setLista] = useState<'linked' | 'card_payment' | null>(null);
  // Prendida por defecto: casi siempre que se corrige un comercio es para todas sus compras.
  const [extender, setExtender] = useState(true);
  const [descripcion, setDescripcion] = useState(hoja?.descripcion ?? '');

  // Lo de recién vuelve a cero con cada línea, no con cada cambio: elegir la
  // categoría rearma la hoja entera y no puede borrar lo que se está escribiendo.
  useEffect(() => {
    setLista(null);
    setExtender(true);
    setDescripcion(hoja?.descripcion ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (!hoja) return null;

  const cambiar = (cambio: CambioDePlan) => onCambio(hoja.clave, cambio);

  const guardarDescripcion = () => {
    if (!hoja.categoria) return;
    if (descripcion.trim() !== hoja.descripcion) cambiar({ tipo: 'descripcion', descripcion });
  };

  const listo = () => {
    guardarDescripcion();
    onCerrar();
  };

  const elegida = (id: string) => hoja.opciones.some(o => o.id === id && o.elegida);
  const verCandidatos = hoja.candidatos.length > 0 && (lista === 'linked' || elegida('linked'));
  const verTarjetas = hoja.tarjetas.length > 0 && (lista === 'card_payment' || elegida('card_payment'));

  const cuerpo = (
    <>
      {/* Lo del banco no se edita: la fecha y el monto son lo que cuadra
          contra los saldos, y cambiarlos rompería esa cuenta. */}
      <View className="gap-1">
        <Texto className="text-sm font-medium text-tinta">{hoja.descripcion}</Texto>
        <Monto monto={hoja.monto} dinero={dinero} className="text-2xl font-semibold" />
        <Texto className="text-xs text-tinta-2">{hoja.fechas}</Texto>
      </View>

      {hoja.bloqueada ? (
        <View className="px-3 py-2.5 bg-hundido rounded-xl flex-row items-start gap-2">
          <View className="mt-0.5"><Lock size={16} color={paleta.tinta2} /></View>
          <Texto className="flex-1 text-sm text-tinta-2">{hoja.motivo}</Texto>
        </View>
      ) : (
        <>
          {hoja.motivo ? <Texto className="text-sm text-tinta-2 -mt-2">{hoja.motivo}</Texto> : null}

          <View className="gap-3">
            <View className="flex-row flex-wrap gap-2">
              {hoja.opciones.map(o => (
                <Pildora
                  key={o.id}
                  texto={o.texto}
                  elegida={o.elegida}
                  grande
                  onElegir={() => {
                    if (o.cambio) cambiar(o.cambio);
                    // "Ya está anotado" y "Pago de tarjeta" muestran su lista
                    // aunque haya uno solo: hay que ver con qué quedó.
                    setLista(o.id === 'linked' || o.id === 'card_payment' ? o.id : null);
                  }}
                />
              ))}
            </View>

            {verCandidatos ? (
              <View className="gap-1.5">
                {hoja.candidatos.map(c => (
                  <Eleccion key={c.id} elegida={c.elegido} onElegir={() => cambiar(c.cambio)}>
                    <View className="flex-1 gap-0.5">
                      <Texto className="text-sm text-tinta">{c.texto}</Texto>
                      {c.detalle ? <Texto className="text-xs text-tinta-2">{c.detalle}</Texto> : null}
                    </View>
                    <Texto className="text-sm text-tinta" style={NUMEROS_PAREJOS}>{dinero(c.centavos)}</Texto>
                  </Eleccion>
                ))}
              </View>
            ) : null}

            {verTarjetas ? (
              <View className="gap-1.5">
                {hoja.tarjetas.map(t => (
                  <Eleccion key={t.id} elegida={t.elegida} onElegir={() => cambiar(t.cambio)}>
                    <Texto className="flex-1 text-sm text-tinta">{t.texto}</Texto>
                  </Eleccion>
                ))}
              </View>
            ) : null}
          </View>

          {hoja.categoria ? (
            <SelectorDeCategoria
              categoria={hoja.categoria}
              categorias={categorias}
              onElegir={(categoria, subcategoria) => cambiar({
                tipo: 'categoria', categoria, subcategoria, extender: extender && !!hoja.extender,
              })}
            />
          ) : null}

          {hoja.extender ? (
            <Pressable
              onPress={() => setExtender(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: extender }}
              className="-mt-2 flex-row items-start gap-2.5"
            >
              <View
                className={`w-4 h-4 mt-0.5 rounded border items-center justify-center ${
                  extender ? 'bg-primario border-primario' : 'bg-hundido border-linea-fuerte'
                }`}
              >
                {extender ? <Check size={12} color={paleta.sobrePrimario} strokeWidth={3} /> : null}
              </View>
              <Texto className="flex-1 text-sm text-tinta">{hoja.extender.texto}</Texto>
            </Pressable>
          ) : null}

          {/* Solo para lo que se anota: un enlace o un pago no guardan descripción. */}
          {hoja.categoria ? (
            <View className="gap-1.5">
              <Texto className="text-xs text-tinta-2 font-medium">{HOJA.descripcion}</Texto>
              <TextInput
                value={descripcion}
                maxLength={120}
                onChangeText={setDescripcion}
                onBlur={guardarDescripcion}
                onSubmitEditing={guardarDescripcion}
                returnKeyType="done"
                accessibilityLabel={HOJA.descripcion}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:border-tinta-3"
                style={{ fontFamily: 'Inter_400Regular' }}
              />
            </View>
          ) : null}
        </>
      )}
    </>
  );

  const panel = (
    <Vidrio className={`border border-t-borde-luz border-linea ${enLinea ? 'rounded-2xl' : 'rounded-t-2xl max-h-[92%]'}`}>
      <View className="px-5 py-4 border-b border-linea flex-row items-center justify-between gap-3">
        <Texto className="text-base font-semibold text-tinta">{hoja.titulo}</Texto>
        <Pressable onPress={onCerrar} accessibilityLabel={HOJA.cerrar} hitSlop={8} className="p-1 -m-1">
          <X size={20} color={paleta.tinta2} />
        </Pressable>
      </View>

      {/* El cuerpo es lo único que se desplaza: el título y "Listo" quedan
          siempre a mano, la misma partición que la web (cabecera, cuerpo, pie). */}
      {enLinea ? (
        <View className="px-5 py-4 gap-5">{cuerpo}</View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 py-4 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {cuerpo}
        </ScrollView>
      )}

      {/* Lo mismo que el `pb-safe` de la web: en un teléfono la hoja llega al
          borde, y sin el margen "Listo" queda debajo de la barra de gestos.
          Nunca menos de 16. */}
      <View
        className="px-5 pt-4 border-t border-linea"
        style={{ paddingBottom: enLinea ? 16 : Math.max(16, insets.bottom) }}
      >
        <Pressable
          onPress={listo}
          accessibilityRole="button"
          className="w-full py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center"
        >
          <Texto className="text-sm font-medium text-sobre-primario">{hoja.listo}</Texto>
        </Pressable>
      </View>
    </Vidrio>
  );

  if (enLinea) return panel;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={listo}>
      {/* La hoja sube con el teclado: si no, tapa la descripción que se está escribiendo. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-black/40 justify-end"
      >
        {/* Tocar afuera es lo mismo que "Listo": guarda lo escrito y cierra. */}
        <Pressable onPress={listo} accessibilityLabel={HOJA.cerrar} className="flex-1" />
        {panel}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Una fila que se elige de una lista (un candidato, una tarjeta), con su círculo dibujado a mano. */
function Eleccion({
  elegida, onElegir, children,
}: {
  elegida: boolean;
  onElegir: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onElegir}
      accessibilityRole="radio"
      accessibilityState={{ checked: elegida }}
      className={`w-full px-3 py-2.5 rounded-xl border flex-row items-center gap-3 ${
        elegida ? 'bg-elevado border-linea-fuerte' : 'bg-hundido border-transparent'
      }`}
      style={elegida ? SOMBRA_CHICA : undefined}
    >
      <View
        className={`w-4 h-4 rounded-full border-2 items-center justify-center ${
          elegida ? 'border-tinta' : 'border-tinta-3'
        }`}
      >
        {elegida ? <View className="w-2 h-2 rounded-full bg-tinta" /> : null}
      </View>
      {children}
    </Pressable>
  );
}

/**
 * La categoría y, si tiene, la subcategoría: dos selectores, como en el alta de
 * un movimiento. Solo las del tipo de la línea (un cargo no puede ir a una
 * categoría de ingreso: la base lo rechaza).
 */
function SelectorDeCategoria({
  categoria, categorias, onElegir,
}: {
  categoria: NonNullable<HojaDeLinea['categoria']>;
  categorias: Category[];
  onElegir: (categoria: string, subcategoria: string | null) => void;
}) {
  const principales = categorias.filter(c => c.type === categoria.tipo && !c.parent_id);
  const actual = principales.find(c => c.name === categoria.categoria) ?? null;
  const subs = actual
    ? categorias.filter(c => c.parent_id === actual.id).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    : [];
  // 'Cargos bancarios' todavía no existe: se crea al importar, pero tiene que
  // verse elegida.
  const nueva = categoria.categoria && !actual ? categoria.categoria : null;

  return (
    <View className="gap-3">
      <View className="gap-1.5">
        <Texto className="text-xs text-tinta-2 font-medium">{HOJA.categoria}</Texto>
        {/* Sin categoría, el selector muestra "Elegí una categoría" en vez de
            una opción: es el `<option disabled>` de la web. */}
        <Selector
          titulo={HOJA.categoria}
          value={categoria.categoria ?? ''}
          onChange={v => onElegir(v, null)}
          placeholder={OPCIONES.elegirCategoria}
          opciones={[
            ...(nueva ? [{ valor: nueva, etiqueta: nueva }] : []),
            ...principales.map(c => ({ valor: c.name, etiqueta: c.name })),
          ]}
        />
        {/* Pegado a la categoría que explica, no al final: si está debajo de la
            subcategoría parece que habla de ella. */}
        {categoria.porque ? <Texto className="text-xs text-tinta-2">{categoria.porque}</Texto> : null}
      </View>

      {actual && subs.length > 0 ? (
        <View className="gap-1.5">
          <Texto className="text-xs text-tinta-2 font-medium">{HOJA.subcategoria}</Texto>
          <Selector
            titulo={HOJA.subcategoria}
            value={categoria.subcategoria ?? ''}
            onChange={v => onElegir(actual.name, v || null)}
            opciones={[
              { valor: '', etiqueta: HOJA.sinSubcategoria },
              ...subs.map(c => ({ valor: c.name, etiqueta: c.name })),
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}
