import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, Info, Landmark,
} from 'lucide-react-native';
import Texto from './Texto';
import Selector from './Selector';
import { AlCambiar, Dinero, Interruptor, NUMEROS_PAREJOS } from './RevisionDeExtracto';
import { useColores } from '../lib/colores';
import type { AvisoDeVista, IdDeSeccion, ResumenDeVista, VistaDelPlan } from '@compartido/extractos/planear';
import { ANOTAR_EN, PANTALLA, textoDeSaldos } from '@compartido/extractos/textos-plan';

/**
 * El resumen de un estado de cuenta ya leído: de qué cuenta es, que cuadra con
 * el banco, dónde se anota, qué va a pasar con cada línea y el botón de
 * importar. El gemelo de components/BankStatementSummary.tsx.
 *
 * Va arriba de todo porque contesta lo que uno quiere saber antes de mirar
 * fila por fila: "¿leyó bien?" (la insignia y los saldos) y "¿qué va a hacer?"
 * (los conteos). Cada conteo lleva a su sección.
 *
 * Solo dibuja lo que trae `vistaDelPlan`; sin contextos ni pedidos, para que
 * la galería lo pueda mostrar.
 */
export default function ResumenDeExtracto({
  resumen, boton, dinero, libros, libroId, onLibro, cambiandoLibro = false, onCambio, onConteo,
  onImportar, importando = false, error = '',
}: {
  resumen: ResumenDeVista;
  boton: VistaDelPlan['boton'];
  dinero: Dinero;
  /** Los libros donde se puede anotar ("Personal", "Hogar"), para el selector "Anotar en". */
  libros: { id: string; nombre: string }[];
  libroId: string;
  onLibro: (id: string) => void;
  /** Mientras llegan las categorías del libro nuevo: el selector no se puede tocar. */
  cambiandoLibro?: boolean;
  onCambio: AlCambiar;
  /** Lleva a una sección (abriéndola si está plegada). */
  onConteo: (seccion: IdDeSeccion) => void;
  onImportar: () => void;
  importando?: boolean;
  /** El error de la última importación, debajo del botón que se tocó. */
  error?: string;
}) {
  const paleta = useColores();

  return (
    <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-4">
      <View className="flex-row items-start gap-3">
        <View className="w-10 h-10 bg-hundido rounded-xl items-center justify-center">
          <Landmark size={20} color={paleta.tinta2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Texto className="text-base font-semibold text-tinta">{resumen.titulo}</Texto>
          <Texto className="text-xs text-tinta-2">{resumen.subtitulo}</Texto>
        </View>
      </View>

      {/* La insignia en verde es de lo poco que sale bien a propósito: que el
          estado cuadre al centavo con los saldos del banco es lo que permite
          confiar en todo lo de abajo. */}
      <View className="gap-2">
        <View className="self-start px-2 py-1 bg-acento/10 rounded-full flex-row items-center gap-1.5">
          <CheckCircle2 size={14} color={paleta.acento} />
          <Texto className="text-xs font-medium text-acento">{resumen.insignia}</Texto>
        </View>
        <Texto className="text-xs text-tinta-2" style={NUMEROS_PAREJOS}>
          {textoDeSaldos(dinero(resumen.saldoInicialCentavos), dinero(resumen.saldoFinalCentavos))}
        </Texto>
      </View>

      <View className="border-t border-linea pt-4 flex-row items-center gap-3">
        <Texto className="text-sm text-tinta-2">{ANOTAR_EN}</Texto>
        <View className="flex-1">
          <Selector
            titulo={ANOTAR_EN}
            value={libroId}
            onChange={onLibro}
            cargando={cambiandoLibro}
            opciones={libros.map(l => ({ valor: l.id, etiqueta: l.nombre }))}
          />
        </View>
      </View>

      {resumen.avisos.length > 0 ? (
        <View className="gap-2">
          {resumen.avisos.map(a => <Aviso key={a.id} aviso={a} onCambio={onCambio} />)}
        </View>
      ) : null}

      {resumen.conteos.length > 0 || resumen.paraRevisar ? (
        <View className="border-t border-linea pt-2">
          {resumen.conteos.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => onConteo(c.seccion)}
              accessibilityRole="button"
              className={`py-2.5 flex-row items-center gap-2 ${i > 0 ? 'border-t border-linea' : ''}`}
            >
              <Texto className="flex-1 text-sm text-tinta">{c.texto}</Texto>
              <ChevronRight size={16} color={paleta.tinta3} />
            </Pressable>
          ))}
          {/* Lo único en ámbar de toda la pantalla: lo que falta decidir. Si no
              se decide no se anota, y eso hay que leerlo antes de tocar Importar. */}
          {resumen.paraRevisar ? (
            <Pressable
              onPress={() => onConteo('revisar')}
              accessibilityRole="button"
              className="mt-2 px-3 py-2.5 bg-aviso/10 rounded-xl flex-row items-start gap-2"
            >
              <View className="mt-0.5"><AlertTriangle size={16} color={paleta.aviso} /></View>
              <Texto className="flex-1 text-sm text-aviso">{resumen.paraRevisar}</Texto>
              <View className="mt-0.5"><ChevronRight size={16} color={paleta.aviso} /></View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="gap-2">
        <BotonDeImportar boton={boton} importando={importando} onImportar={onImportar} />
        {error ? <CajaDeError texto={error} /> : null}
      </View>
    </View>
  );
}

/**
 * Un aviso del resumen. Los que frenan la importación van en rojo: son la razón
 * de que el botón esté apagado. El resto es información y va en gris.
 */
function Aviso({ aviso, onCambio }: { aviso: AvisoDeVista; onCambio: AlCambiar }) {
  const paleta = useColores();
  // "Elegir otra" abre la lista de cuentas en el lugar, sin otra pantalla.
  const [abierto, setAbierto] = useState(false);
  const { accion } = aviso;
  const Icono = aviso.bloquea ? AlertCircle : Info;
  const verOpciones = aviso.opciones.length > 0 && (!accion || abierto);

  return (
    <View
      className={`border rounded-xl p-3 gap-2.5 ${
        aviso.bloquea ? 'bg-peligro/10 border-peligro/20' : 'bg-hundido border-linea'
      }`}
    >
      <View className="flex-row items-start gap-2">
        <View className="mt-0.5">
          <Icono size={16} color={aviso.bloquea ? paleta.peligro : paleta.tinta2} />
        </View>
        <Texto className={`flex-1 text-sm ${aviso.bloquea ? 'text-peligro' : 'text-tinta-2'}`}>{aviso.texto}</Texto>
      </View>

      {/* Todo lo de abajo arranca donde arranca el texto, no debajo del ícono. */}
      {accion ? (
        <View className="pl-6 flex-row">
          <Pressable
            onPress={() => (accion.cambio ? onCambio(null, accion.cambio) : setAbierto(v => !v))}
            accessibilityRole="button"
            accessibilityState={accion.cambio ? undefined : { expanded: abierto }}
            className="px-3 py-1.5 bg-panel border border-linea-fuerte rounded-lg flex-row items-center gap-1.5"
          >
            <Texto className="text-xs font-medium text-tinta">{accion.texto}</Texto>
            {!accion.cambio ? (
              <View style={abierto ? { transform: [{ rotate: '180deg' }] } : undefined}>
                <ChevronDown size={14} color={paleta.tinta2} />
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : null}

      {verOpciones ? (
        <View className="pl-6 gap-1.5">
          {aviso.opciones.map(o => (
            <Pressable
              key={o.id}
              onPress={() => onCambio(null, o.cambio)}
              accessibilityRole="button"
              className="w-full px-3 py-2 bg-panel border border-linea rounded-lg"
            >
              <Texto className="text-sm text-tinta">{o.texto}</Texto>
            </Pressable>
          ))}
        </View>
      ) : null}

      {aviso.interruptor ? (
        <View className="pl-6">
          <Interruptor interruptor={aviso.interruptor} onCambiar={c => onCambio(null, c)} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * El botón de importar. Va arriba, en el resumen, y otra vez al final de la
 * lista: en el teléfono no hay pie fijo, y después de revisar sesenta filas
 * nadie vuelve hasta arriba a buscarlo.
 */
export function BotonDeImportar({
  boton, importando = false, onImportar,
}: {
  boton: VistaDelPlan['boton'];
  importando?: boolean;
  onImportar: () => void;
}) {
  const paleta = useColores();
  // Sin nada que importar no es un botón apagado sino un dato: "ya se importó
  // el 2 oct." no se lee bien en negro al 50%.
  if (boton.n === 0) {
    return (
      <View className="w-full px-4 py-3 bg-hundido rounded-lg">
        <Texto className="text-sm text-tinta-2 text-center">{boton.texto}</Texto>
      </View>
    );
  }
  const apagado = !boton.habilitado || importando;
  return (
    <Pressable
      onPress={onImportar}
      disabled={apagado}
      accessibilityRole="button"
      className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
      style={apagado ? { opacity: 0.5 } : undefined}
    >
      {importando
        ? <ActivityIndicator size="small" color={paleta.sobrePrimario} />
        : <Download size={16} color={paleta.sobrePrimario} />}
      <Texto className="text-sm font-medium text-sobre-primario">
        {importando ? PANTALLA.importando : boton.texto}
      </Texto>
    </Pressable>
  );
}

/** Un error de la pantalla (leer, importar, deshacer): en rojo porque falló, y con el porqué. */
export function CajaDeError({ texto }: { texto: string }) {
  const paleta = useColores();
  return (
    <View className="px-3 py-2.5 bg-peligro/10 border border-peligro/20 rounded-xl flex-row items-start gap-2">
      <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
      <Texto className="flex-1 text-sm text-peligro">{texto}</Texto>
    </View>
  );
}
