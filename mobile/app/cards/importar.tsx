import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AlertButton, Pressable, ScrollView, TextInput, View,
} from 'react-native';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, FileUp, KeyRound, Undo2 } from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import Pantalla, { ALTO_DE_LA_BARRA } from '../../componentes/Pantalla';
import ResumenDeExtracto, { BotonDeImportar, CajaDeError } from '../../componentes/ResumenDeExtracto';
import RevisionDeExtracto from '../../componentes/RevisionDeExtracto';
import HojaDeLineaDeExtracto from '../../componentes/HojaDeLineaDeExtracto';
import { useCuenta } from '../../componentes/ContextoDeCuenta';
import { useCategorias } from '../../componentes/ContextoDeCategorias';
import { useSesion } from '../../componentes/ContextoDeSesion';
import { useFormatters } from '../../componentes/ContextoDeAjustes';
import { db } from '../../lib/datos';
import { FALTA_LA_API, SIN_SESION, hayApi, llamarApi } from '../../lib/api';
import { elegirPdf } from '../../lib/pdf';
import { useColores } from '../../lib/colores';
import {
  cargarContextoDeExtracto, deshacerImportacion, getCategoriesWithUsage, importarEstadoDeCuenta,
} from '@compartido/db';
import { leerConsultaDeContexto } from '@compartido/extractos-campos';
import type { Category } from '@compartido/types';
import {
  CambioDePlan, IdDeSeccion, Plan, SeccionDeVista, aplicarCambio, armarPedido, hojaDeLinea,
  libroSugerido, loQueSeCrea, planearImportacion, vistaDelPlan,
} from '@compartido/extractos/planear';
import {
  ERROR_AL_DESHACER, ERROR_DE_IMPORTACION_GENERICO, FALTA_MIGRACION, MENSAJES_DE_LECTURA,
  mensajeNoCuadra,
} from '@compartido/extractos/textos';
import {
  PANTALLA, fechaDeFila, textoDelPie, textoDeshecho, textoListo, yaEstabanImportados,
} from '@compartido/extractos/textos-plan';
import type {
  CodigoDeLectura, ContextoDeExtracto, ExtractoLeido, MotivoNoCuadra, ResultadoDeImportacion,
} from '@compartido/extractos/tipos';

/**
 * El gemelo de app/cards/importar/page.tsx.
 *
 * Los mismos pasos que la web: elegir el PDF → (la contraseña, si tiene) →
 * leerlo → revisar → importar → listo, con la opción de deshacer.
 *
 * Lo único que pasa por la web es leer el PDF: pdf.js no corre en el teléfono.
 * Todo lo demás va derecho a Supabase con las mismas funciones de `lib/db.ts`
 * que usan las rutas de la web —el contexto, importar, deshacer—, y el plan lo
 * arma el mismo `lib/extractos/planear.ts`. Acá solo se dibuja y se pide.
 */

/** Lo que la importación creó para poder anotar: deshacer no lo borra. */
type Creado = ReturnType<typeof loQueSeCrea>;

type Paso =
  | { tipo: 'elegir'; error: string }
  | { tipo: 'clave'; error: string }
  | { tipo: 'leyendo' }
  | { tipo: 'revisar' }
  | { tipo: 'listo'; resultado: ResultadoDeImportacion; creado: Creado; deshaciendo: boolean; error: string }
  | { tipo: 'deshecho'; cardId: string; creado: Creado };

/** Lo que contesta la ruta de leer: el estado leído, o el código de por qué no. */
type RespuestaDeLectura = { extracto?: ExtractoLeido; codigo?: string; motivo?: string; fecha?: string; error?: string };

/** Las categorías de un libro. Null si no llegaron: sin ellas no hay plan posible. */
async function categoriasDe(usuario: string, ledgerId: string): Promise<Category[] | null> {
  try {
    return await getCategoriesWithUsage(db(usuario), ledgerId);
  } catch {
    return null;
  }
}

export default function ImportarEstado() {
  const paleta = useColores();
  const insets = useSafeAreaInsets();
  const { card } = useLocalSearchParams<{ card?: string }>();
  const cardPedida = typeof card === 'string' && card ? card : null;
  const { ledgers, currentLedger, notifyTransactionSaved, refreshLedgers } = useCuenta();
  const { refrescar: refrescarCategorias } = useCategorias();
  const { session } = useSesion();
  const usuario = session?.user?.id;
  const fmt = useFormatters();
  const dinero = useCallback((centavos: number) => fmt.money(centavos / 100), [fmt]);
  // Leer el PDF tarda: lo que se mira al terminar son las cuentas de ESE momento,
  // no las que había cuando se eligió el archivo (pueden no haber llegado aún).
  const cuentasRef = useRef({ ledgers, currentLedger });
  cuentasRef.current = { ledgers, currentLedger };

  const scrollRef = useRef<ScrollView>(null);
  /** Dónde arranca cada sección dentro de la pantalla, para llevar hasta ella. */
  const posiciones = useRef<Partial<Record<IdDeSeccion, number>>>({});
  /*
   * El PDF, en memoria y solo mientras hace falta: entre que se pide la
   * contraseña y que se escribe. Ya leído no sirve para nada más —lo que se
   * importa sale de lo leído— y se suelta.
   */
  const pdfRef = useRef<string | null>(null);
  /*
   * Cada PDF elegido es un intento nuevo. Lo pedido para el anterior (importar,
   * deshacer, las categorías de otro libro) puede volver tarde: si el intento
   * cambió, se descarta en vez de pisar la pantalla del PDF nuevo.
   */
  const intentoRef = useRef(0);

  const [paso, setPaso] = useState<Paso>({ tipo: 'elegir', error: '' });
  // La contraseña vive solo en el campo: se manda una vez y se borra.
  const [clave, setClave] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [abiertas, setAbiertas] = useState<Partial<Record<IdDeSeccion, boolean>>>({});
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  const [cambiandoLibro, setCambiandoLibro] = useState(false);
  const [importando, setImportando] = useState(false);
  const [errorDeImportacion, setErrorDeImportacion] = useState('');

  const vista = useMemo(() => (plan ? vistaDelPlan(plan) : null), [plan]);
  const hoja = useMemo(
    () => (plan && filaAbierta ? hojaDeLinea(plan, filaAbierta) : null),
    [plan, filaAbierta],
  );

  const nombreDe = (id: string) => cuentasRef.current.ledgers.find(l => l.id === id)?.name ?? null;

  const reiniciar = () => {
    intentoRef.current += 1;
    pdfRef.current = null;
    setClave('');
    setPlan(null);
    setAbiertas({});
    setFilaAbierta(null);
    setCambiandoLibro(false);
    setImportando(false);
    setErrorDeImportacion('');
  };

  /*
   * La web desmonta la página al irse; acá el Stack la deja montada debajo de
   * la que se abrió. Con la contraseña pedida, eso es el PDF entero y la clave a
   * medio escribir guardados en una pantalla que no se ve: al perder el foco se
   * sueltan, y al volver se elige de nuevo.
   */
  const pasoRef = useRef(paso);
  pasoRef.current = paso;
  const soltarAlSalir = useRef(() => {});
  soltarAlSalir.current = () => {
    if (pasoRef.current.tipo !== 'clave') return;
    reiniciar();
    setPaso({ tipo: 'elegir', error: '' });
  };
  useFocusEffect(useCallback(() => () => soltarAlSalir.current(), []));

  const mensajeDeLectura = (datos: RespuestaDeLectura | null) => {
    const codigo = datos?.codigo;
    if (codigo === 'NO_CUADRA') {
      // La fecha dice en qué renglón se perdió: es lo que permite ver que no
      // es un PDF roto sino una línea que no se entendió.
      const fecha = datos?.fecha ? fechaDeFila(datos.fecha, fmt.today()) : undefined;
      return mensajeNoCuadra(datos?.motivo as MotivoNoCuadra | undefined, fecha);
    }
    if (codigo && codigo in MENSAJES_DE_LECTURA) return MENSAJES_DE_LECTURA[codigo as CodigoDeLectura];
    // Sin JSON no contestó la ruta sino algo en el camino (un 504, un proxy).
    if (!datos) return PANTALLA.sinConexion;
    // Sin código es que no llegó al lector (la sesión, por ejemplo): eso dice `error`.
    return datos.error ?? MENSAJES_DE_LECTURA.ILEGIBLE;
  };

  /** Lo leído, contra lo que ya está anotado: de acá sale el plan. */
  const preparar = async (extracto: ExtractoLeido) => {
    if (!usuario) { setPaso({ tipo: 'elegir', error: PANTALLA.sinContexto }); return; }

    // La misma validación que hace la ruta de la web antes de pedir el
    // contexto: acá no hay ruta en el medio, y su error es para la persona.
    const leida = leerConsultaDeContexto({
      banco: extracto.banco, ultimos4: extracto.ultimos4, desde: extracto.desde, hasta: extracto.hasta,
    });
    if (!leida.ok) { setPaso({ tipo: 'elegir', error: leida.error }); return; }
    let ctx: ContextoDeExtracto;
    try {
      ctx = await cargarContextoDeExtracto(db(usuario), leida.consulta);
    } catch {
      setPaso({ tipo: 'elegir', error: PANTALLA.sinContexto });
      return;
    }

    // El libro donde se anotó lo último pagado con esta cuenta; si no hay, el
    // que se está mirando; si tampoco, el primero.
    const { ledgers: libros, currentLedger: actual } = cuentasRef.current;
    const sugerido = libroSugerido(extracto, ctx, cardPedida);
    const valido = sugerido && (libros.length === 0 || libros.some(l => l.id === sugerido)) ? sugerido : null;
    const ledgerId = valido ?? actual?.id ?? libros[0]?.id;
    if (!ledgerId) { setPaso({ tipo: 'elegir', error: PANTALLA.sinLibro }); return; }

    // Las del libro destino y no las del contexto de categorías, que son las
    // del libro que se está mirando: pueden ser otro.
    const categorias = await categoriasDe(usuario, ledgerId);
    if (!categorias) { setPaso({ tipo: 'elegir', error: PANTALLA.sinCategorias }); return; }

    setPlan(planearImportacion(extracto, ctx, {
      ledgerId, ledgerName: nombreDe(ledgerId), categorias, cuentaPedida: cardPedida, hoy: fmt.today(),
    }));
    setPaso({ tipo: 'revisar' });
  };

  const leer = async (pdf: string, conClave?: string) => {
    setPaso({ tipo: 'leyendo' });
    let res: Response;
    let datos: RespuestaDeLectura | null;
    try {
      res = await llamarApi('/api/statements/leer', {
        method: 'POST',
        body: conClave ? { pdf, clave: conClave } : { pdf },
      });
      datos = await res.json().catch(() => null);
    } catch (e) {
      // No llegó: el PDF no tiene nada que ver. Lo que `llamarApi` tira antes
      // de salir (sin sesión, sin la dirección de la web) ya dice qué falta.
      pdfRef.current = null;
      const propio = e instanceof Error && (e.message === SIN_SESION || e.message === FALTA_LA_API);
      setPaso({ tipo: 'elegir', error: propio ? e.message : PANTALLA.sinConexion });
      return;
    }

    if (!res.ok || !datos?.extracto) {
      if (datos?.codigo === 'CLAVE_REQUERIDA') { setPaso({ tipo: 'clave', error: '' }); return; }
      if (datos?.codigo === 'CLAVE_INCORRECTA') {
        setPaso({ tipo: 'clave', error: MENSAJES_DE_LECTURA.CLAVE_INCORRECTA });
        return;
      }
      pdfRef.current = null;
      setPaso({ tipo: 'elegir', error: mensajeDeLectura(datos) });
      return;
    }
    pdfRef.current = null;
    await preparar(datos.extracto);
  };

  /** Abre el selector de archivos del teléfono y, si se eligió uno, lo manda a leer. */
  const elegirArchivo = async () => {
    // Sin la dirección de la web no hay quién lea el PDF: mejor decirlo antes
    // de que la persona lo busque.
    if (!hayApi) { setPaso({ tipo: 'elegir', error: FALTA_LA_API }); return; }
    const elegido = await elegirPdf();
    if (elegido.tipo === 'cancelado') return;
    reiniciar();
    if (elegido.tipo === 'error') {
      setPaso({ tipo: 'elegir', error: MENSAJES_DE_LECTURA[elegido.codigo] });
      return;
    }
    pdfRef.current = elegido.base64;
    await leer(elegido.base64);
  };

  /** Vuelve al principio y abre el selector de archivos, en el mismo toque. */
  const elegirOtro = () => {
    reiniciar();
    setPaso({ tipo: 'elegir', error: '' });
    elegirArchivo();
  };

  const abrirConClave = async () => {
    const pdf = pdfRef.current;
    if (!pdf || !clave) return;
    const usada = clave;
    setClave('');
    await leer(pdf, usada);
  };

  const cambiar = (destino: string | null, cambio: CambioDePlan) => {
    setPlan(p => (p ? aplicarCambio(p, destino, cambio) : p));
  };

  const cambiarLibro = async (ledgerId: string) => {
    if (!plan || !usuario || ledgerId === plan.ledgerId) return;
    const intento = intentoRef.current;
    setCambiandoLibro(true);
    setErrorDeImportacion('');
    const categorias = await categoriasDe(usuario, ledgerId);
    if (intento !== intentoRef.current) return;
    setCambiandoLibro(false);
    if (!categorias) { setErrorDeImportacion(PANTALLA.sinCategorias); return; }
    cambiar(null, { tipo: 'libro', ledgerId, categorias, ledgerName: nombreDe(ledgerId) });
  };

  const abierta = (s: SeccionDeVista) => abiertas[s.id] ?? !s.plegada;

  /** Un conteo del resumen lleva a su sección, abriéndola si estaba plegada. */
  const irA = (id: IdDeSeccion) => {
    setAbiertas(a => ({ ...a, [id]: true }));
    // Después de pintarla abierta, como en la web. El margen es el de su
    // `scroll-mt-20`: la barra de arriba, que flota encima del contenido, más
    // un respiro para que el título no quede pegado a ella.
    requestAnimationFrame(() => {
      const y = posiciones.current[id];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - (insets.top + ALTO_DE_LA_BARRA + 24)), animated: true });
    });
  };

  const importar = async () => {
    // Con el libro cambiando, el pedido saldría con el anterior.
    if (!plan || !usuario || importando || cambiandoLibro) return;
    const intento = intentoRef.current;
    const vigente = () => intento === intentoRef.current;
    const pedido = armarPedido(plan);
    setImportando(true);
    setErrorDeImportacion('');
    try {
      const res = await importarEstadoDeCuenta(db(usuario), pedido);
      const creado = loQueSeCrea(pedido);
      if (res.ok) {
        // Lo importado aparece en Movimientos, en la cuenta y en los saldos sin
        // recargar, y la categoría de cargos, si se creó, en los selectores.
        // Aunque la pantalla ya esté en otro PDF: la base cambió igual.
        notifyTransactionSaved();
        refreshLedgers();
        if (creado.categoria) refrescarCategorias();
      }
      if (!vigente()) return;
      if (!res.ok) {
        setErrorDeImportacion(res.faltaMigracion ? FALTA_MIGRACION : res.error);
        return;
      }
      setPaso({ tipo: 'listo', resultado: res.resultado, creado, deshaciendo: false, error: '' });
      setPlan(null);
      setFilaAbierta(null);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch {
      if (vigente()) setErrorDeImportacion(ERROR_DE_IMPORTACION_GENERICO);
    } finally {
      if (vigente()) setImportando(false);
    }
  };

  const deshacer = async (resultado: ResultadoDeImportacion, creado: Creado) => {
    if (!usuario) return;
    const intento = intentoRef.current;
    setPaso({ tipo: 'listo', resultado, creado, deshaciendo: true, error: '' });
    try {
      const res = await deshacerImportacion(db(usuario), resultado.importId);
      if (res.ok) {
        notifyTransactionSaved();
        refreshLedgers();
      }
      if (intento !== intentoRef.current) return;
      if (!res.ok) {
        setPaso({ tipo: 'listo', resultado, creado, deshaciendo: false, error: res.error });
        return;
      }
      setPaso({ tipo: 'deshecho', cardId: resultado.cardId, creado });
    } catch {
      if (intento !== intentoRef.current) return;
      setPaso({ tipo: 'listo', resultado, creado, deshaciendo: false, error: ERROR_AL_DESHACER });
    }
  };

  /** Se pregunta antes, como el `confirm` de la web: borra de una todo lo importado. */
  const preguntarDeshacer = () => {
    if (paso.tipo !== 'listo' || paso.deshaciendo) return;
    const { resultado, creado } = paso;
    const botones: AlertButton[] = [
      { text: PANTALLA.cancelar, style: 'cancel' },
      { text: PANTALLA.deshacer, style: 'destructive', onPress: () => { deshacer(resultado, creado); } },
    ];
    Alert.alert(PANTALLA.confirmarDeshacer, undefined, botones);
  };

  // El libro elegido siempre está en la lista, aunque las cuentas no hayan llegado todavía.
  const libros = ledgers.map(l => ({ id: l.id, nombre: l.name }));
  if (plan && !libros.some(l => l.id === plan.ledgerId)) {
    libros.unshift({ id: plan.ledgerId, nombre: plan.ledgerName ?? '' });
  }

  return (
    <Pantalla ref={scrollRef} className="gap-6" keyboardShouldPersistTaps="handled">
      {/* `dismissTo` y no un Link común: ese apila la Billetera encima y esta
          pantalla queda viva debajo, con lo que tenga en memoria. */}
      <Link href="/cards" dismissTo asChild>
        <Pressable className="self-start flex-row items-center gap-1.5">
          <ArrowLeft size={16} color={paleta.tinta2} />
          <Texto className="text-sm text-tinta-2">{PANTALLA.volver}</Texto>
        </Pressable>
      </Link>

      <View>
        <Texto className="text-xl font-semibold text-tinta">{PANTALLA.titulo}</Texto>
        <Texto className="text-tinta-2 text-sm">{PANTALLA.subtitulo}</Texto>
      </View>

      {paso.tipo === 'elegir' ? (
        <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 gap-4">
          <View className="flex-row items-start gap-3">
            <View className="w-11 h-11 bg-hundido rounded-xl items-center justify-center">
              <FileUp size={20} color={paleta.tinta2} />
            </View>
            <View className="flex-1 gap-1.5">
              <Texto className="text-sm text-tinta">{PANTALLA.explicacion}</Texto>
              <Texto className="text-2xs text-tinta-2">{PANTALLA.alcance}</Texto>
            </View>
          </View>
          {paso.error ? <CajaDeError texto={paso.error} /> : null}
          <Pressable
            onPress={elegirArchivo}
            accessibilityRole="button"
            className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
          >
            <FileUp size={16} color={paleta.sobrePrimario} />
            <Texto className="text-sm font-medium text-sobre-primario">
              {paso.error ? PANTALLA.elegirOtroPdf : PANTALLA.elegirPdf}
            </Texto>
          </Pressable>
        </View>
      ) : null}

      {paso.tipo === 'clave' ? (
        <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 gap-4">
          <View className="flex-row items-start gap-3">
            <View className="w-11 h-11 bg-hundido rounded-xl items-center justify-center">
              <KeyRound size={20} color={paleta.tinta2} />
            </View>
            <View className="flex-1 gap-1">
              <Texto className="text-sm font-medium text-tinta">{MENSAJES_DE_LECTURA.CLAVE_REQUERIDA}</Texto>
              <Texto className="text-sm text-tinta-2">{PANTALLA.claveExplicacion}</Texto>
            </View>
          </View>
          <View className="gap-1.5">
            <Texto className="text-xs text-tinta-2 font-medium">{PANTALLA.claveCampo}</Texto>
            <TextInput
              value={clave}
              onChangeText={setClave}
              onSubmitEditing={abrirConClave}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType="go"
              accessibilityLabel={PANTALLA.claveCampo}
              className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:border-tinta-3"
              style={{ fontFamily: 'Inter_400Regular' }}
            />
          </View>
          {paso.error ? <CajaDeError texto={paso.error} /> : null}
          <View className="flex-row gap-3">
            <Pressable
              onPress={elegirOtro}
              accessibilityRole="button"
              className="flex-1 py-2.5 bg-hundido active:bg-presionado rounded-lg items-center"
            >
              <Texto className="text-sm text-tinta">{PANTALLA.elegirOtroPdf}</Texto>
            </Pressable>
            <Pressable
              onPress={abrirConClave}
              disabled={!clave}
              accessibilityRole="button"
              className="flex-1 py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center"
              style={!clave ? { opacity: 0.5 } : undefined}
            >
              <Texto className="text-sm font-medium text-sobre-primario">{PANTALLA.abrir}</Texto>
            </Pressable>
          </View>
        </View>
      ) : null}

      {paso.tipo === 'leyendo' ? (
        <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl px-5 py-10 items-center gap-3">
          <ActivityIndicator size="small" color={paleta.tinta2} />
          <Texto className="text-sm text-tinta-2 text-center">{PANTALLA.leyendo}</Texto>
        </View>
      ) : null}

      {paso.tipo === 'revisar' && plan && vista ? (
        <>
          <ResumenDeExtracto
            resumen={vista.resumen}
            boton={vista.boton}
            dinero={dinero}
            libros={libros}
            libroId={plan.ledgerId}
            onLibro={cambiarLibro}
            cambiandoLibro={cambiandoLibro}
            onCambio={cambiar}
            onConteo={irA}
            onImportar={importar}
            importando={importando}
            error={errorDeImportacion}
          />

          {vista.secciones.map(s => (
            // Cada sección anota dónde quedó: es lo que permite saltar hasta
            // ella desde su conteo, que en la web hace `scrollIntoView` solo.
            <View key={s.id} onLayout={e => { posiciones.current[s.id] = e.nativeEvent.layout.y; }}>
              <RevisionDeExtracto
                seccion={s}
                abierta={abierta(s)}
                onAlternar={() => setAbiertas(a => ({ ...a, [s.id]: !abierta(s) }))}
                dinero={dinero}
                categorias={plan.categorias}
                onCambio={cambiar}
                onAbrirFila={setFilaAbierta}
              />
            </View>
          ))}

          <View className="gap-3">
            <Texto className="text-xs text-tinta-2">
              {textoDelPie(dinero(vista.pie.gastosCentavos), dinero(vista.pie.ingresosCentavos), vista.pie.sinDecidir)}
            </Texto>
            <BotonDeImportar boton={vista.boton} importando={importando} ocupado={cambiandoLibro} onImportar={importar} />
            {errorDeImportacion ? <CajaDeError texto={errorDeImportacion} /> : null}
            {/* Mientras importa no se cambia de PDF: lo que conteste es de este. */}
            <Pressable
              onPress={elegirOtro}
              disabled={importando}
              accessibilityRole="button"
              className="self-center py-1"
              style={importando ? { opacity: 0.5 } : undefined}
            >
              <Texto className="text-xs text-tinta-2">{PANTALLA.elegirOtroPdf}</Texto>
            </Pressable>
          </View>

          <HojaDeLineaDeExtracto
            hoja={hoja}
            dinero={dinero}
            categorias={plan.categorias}
            onCambio={cambiar}
            onCerrar={() => setFilaAbierta(null)}
          />
        </>
      ) : null}

      {paso.tipo === 'listo' ? (
        <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 gap-4">
          <View className="px-4 py-3 bg-acento/10 border border-acento/20 rounded-xl flex-row items-start gap-2">
            <View className="mt-0.5"><CheckCircle2 size={16} color={paleta.acento} /></View>
            <View className="flex-1 gap-1">
              <Texto className="text-sm text-acento">
                {textoListo(paso.resultado.creados, paso.resultado.enlazados, paso.resultado.pagos, paso.resultado.omitidos)}
              </Texto>
              {paso.resultado.yaEstaban > 0 ? (
                <Texto className="text-sm text-acento">{yaEstabanImportados(paso.resultado.yaEstaban)}</Texto>
              ) : null}
            </View>
          </View>
          {paso.error ? <CajaDeError texto={paso.error} /> : null}
          <View className="gap-2">
            <Link href={`/cards/${paso.resultado.cardId}` as never} asChild>
              <Pressable className="w-full py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center">
                <Texto className="text-sm font-medium text-sobre-primario">{PANTALLA.verLaCuenta}</Texto>
              </Pressable>
            </Link>
            <Pressable
              onPress={elegirOtro}
              disabled={paso.deshaciendo}
              accessibilityRole="button"
              className="w-full py-2.5 bg-hundido active:bg-presionado rounded-lg items-center"
              style={paso.deshaciendo ? { opacity: 0.5 } : undefined}
            >
              <Texto className="text-sm text-tinta">{PANTALLA.importarOtro}</Texto>
            </Pressable>
            <Pressable
              onPress={preguntarDeshacer}
              disabled={paso.deshaciendo}
              accessibilityRole="button"
              className="w-full py-2.5 bg-hundido active:bg-presionado rounded-lg flex-row items-center justify-center gap-2"
              style={paso.deshaciendo ? { opacity: 0.5 } : undefined}
            >
              {paso.deshaciendo
                ? <ActivityIndicator size="small" color={paleta.tinta} />
                : <Undo2 size={16} color={paleta.tinta} />}
              <Texto className="text-sm text-tinta">{PANTALLA.deshacer}</Texto>
            </Pressable>
          </View>
        </View>
      ) : null}

      {paso.tipo === 'deshecho' ? (
        <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 gap-4">
          <View className="flex-row items-start gap-2">
            <View className="mt-0.5"><Undo2 size={16} color={paleta.tinta2} /></View>
            <Texto className="flex-1 text-sm text-tinta">{textoDeshecho(paso.creado.cuenta, paso.creado.categoria)}</Texto>
          </View>
          <View className="gap-2">
            <Pressable
              onPress={elegirOtro}
              accessibilityRole="button"
              className="w-full py-2.5 bg-primario active:bg-primario/85 rounded-lg items-center"
            >
              <Texto className="text-sm font-medium text-sobre-primario">{PANTALLA.importarOtro}</Texto>
            </Pressable>
            <Link href={`/cards/${paso.cardId}` as never} asChild>
              <Pressable className="w-full py-2.5 bg-hundido active:bg-presionado rounded-lg items-center">
                <Texto className="text-sm text-tinta">{PANTALLA.verLaCuenta}</Texto>
              </Pressable>
            </Link>
          </View>
        </View>
      ) : null}
    </Pantalla>
  );
}
