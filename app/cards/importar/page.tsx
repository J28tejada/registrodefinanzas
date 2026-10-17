'use client';

import { FormEvent, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, FileUp, KeyRound, Loader2, Undo2 } from 'lucide-react';
import BankStatementSummary, { BotonDeImportar, CajaDeError } from '@/components/BankStatementSummary';
import BankStatementReview from '@/components/BankStatementReview';
import BankStatementLineSheet from '@/components/BankStatementLineSheet';
import { useLedger } from '@/components/LedgerContext';
import { useCategories } from '@/components/CategoriesContext';
import { useFormatters } from '@/components/SettingsContext';
import type { Category } from '@/lib/types';
import { bytesABase64 } from '@/lib/extractos/base64';
import {
  CambioDePlan, IdDeSeccion, Plan, SeccionDeVista, aplicarCambio, armarPedido, hojaDeLinea,
  libroSugerido, loQueSeCrea, planearImportacion, vistaDelPlan,
} from '@/lib/extractos/planear';
import {
  ERROR_AL_DESHACER, ERROR_DE_IMPORTACION_GENERICO, FALTA_MIGRACION, LIMITE_PDF_BYTES,
  MENSAJES_DE_LECTURA, mensajeNoCuadra,
} from '@/lib/extractos/textos';
import {
  PANTALLA, fechaDeFila, textoDelPie, textoDeshecho, textoListo, yaEstabanImportados,
} from '@/lib/extractos/textos-plan';
import type {
  CodigoDeLectura, ContextoDeExtracto, ExtractoLeido, MotivoNoCuadra, ResultadoDeImportacion,
} from '@/lib/extractos/tipos';

/**
 * Importar el estado de cuenta de una cuenta de banco, del PDF a los movimientos.
 *
 * Una sola pantalla que pasa por sus pasos: elegir el PDF → (la contraseña, si
 * tiene) → leerlo → revisar → importar → listo, con la opción de deshacer. El
 * PDF lo lee el servidor (pdf.js no corre en el teléfono, y la misma ruta sirve
 * a las dos apps); todo lo demás —qué se anota, qué ya estaba, qué se pregunta—
 * lo arma `lib/extractos/planear.ts`, igual que en el teléfono. Acá solo se
 * dibuja y se pide.
 *
 * Con `?card=<id>` se entra desde una cuenta: el plan exige que el estado sea
 * de esa cuenta y avisa si no.
 *
 * El gemelo es mobile/app/cards/importar.tsx.
 */
export default function ImportarEstadoPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto pt-14 md:pt-0 flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-tinta-2" /></div>}>
      <ImportarEstado />
    </Suspense>
  );
}

/** Lo que la importación creó para poder anotar: deshacer no lo borra. */
type Creado = ReturnType<typeof loQueSeCrea>;

type Paso =
  | { tipo: 'elegir'; error: string }
  | { tipo: 'clave'; error: string }
  | { tipo: 'leyendo' }
  | { tipo: 'revisar' }
  | { tipo: 'listo'; resultado: ResultadoDeImportacion; creado: Creado; deshaciendo: boolean; error: string }
  | { tipo: 'deshecho'; cardId: string; creado: Creado };

/** Las categorías de un libro. Null si no llegaron: sin ellas no hay plan posible. */
async function categoriasDe(ledgerId: string): Promise<Category[] | null> {
  try {
    const res = await fetch(`/api/categories?ledger_id=${encodeURIComponent(ledgerId)}`);
    const datos = await res.json();
    return res.ok && Array.isArray(datos) ? (datos as Category[]) : null;
  } catch {
    return null;
  }
}

function ImportarEstado() {
  const cardPedida = useSearchParams().get('card');
  const { ledgers, currentLedger, notifyTransactionSaved, refreshLedgers } = useLedger();
  const { refrescar: refrescarCategorias } = useCategories();
  const fmt = useFormatters();
  const dinero = useCallback((centavos: number) => fmt.money(centavos / 100), [fmt]);
  // Leer el PDF tarda: lo que se mira al terminar son las cuentas de ESE momento,
  // no las que había cuando se eligió el archivo (pueden no haber llegado aún).
  const cuentasRef = useRef({ ledgers, currentLedger });
  cuentasRef.current = { ledgers, currentLedger };

  const elegirRef = useRef<HTMLInputElement>(null);
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

  /** Vuelve al principio y abre el selector de archivos, en el mismo toque. */
  const elegirOtro = () => {
    reiniciar();
    setPaso({ tipo: 'elegir', error: '' });
    elegirRef.current?.click();
  };

  const mensajeDeLectura = (datos: { codigo?: string; motivo?: string; fecha?: string; error?: string } | null) => {
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
    let ctx: ContextoDeExtracto;
    try {
      const consulta = new URLSearchParams({
        banco: extracto.banco, ultimos4: extracto.ultimos4, desde: extracto.desde, hasta: extracto.hasta,
      });
      const res = await fetch(`/api/statements/contexto?${consulta}`);
      const datos = await res.json();
      if (!res.ok) { setPaso({ tipo: 'elegir', error: datos?.error ?? PANTALLA.sinContexto }); return; }
      ctx = datos as ContextoDeExtracto;
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
    const categorias = await categoriasDe(ledgerId);
    if (!categorias) { setPaso({ tipo: 'elegir', error: PANTALLA.sinCategorias }); return; }

    setPlan(planearImportacion(extracto, ctx, {
      ledgerId, ledgerName: nombreDe(ledgerId), categorias, cuentaPedida: cardPedida, hoy: fmt.today(),
    }));
    setPaso({ tipo: 'revisar' });
  };

  const leer = async (pdf: string, conClave?: string) => {
    setPaso({ tipo: 'leyendo' });
    let res: Response;
    let datos: { extracto?: ExtractoLeido; codigo?: string; motivo?: string; fecha?: string; error?: string } | null;
    try {
      res = await fetch('/api/statements/leer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conClave ? { pdf, clave: conClave } : { pdf }),
      });
      datos = await res.json().catch(() => null);
    } catch {
      // No llegó: el PDF no tiene nada que ver. Se suelta igual, como al
      // fallar la lectura: para probar de nuevo se elige otra vez.
      pdfRef.current = null;
      setPaso({ tipo: 'elegir', error: PANTALLA.sinConexion });
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

  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    // Vaciado enseguida: si no, elegir el mismo archivo otra vez no dispara nada.
    e.target.value = '';
    if (!archivo) return;
    reiniciar();
    // Antes de subirlo: 3 MB de base64 viajando para que el servidor diga que
    // no es lo que se espera es tiempo y datos del teléfono perdidos.
    if (archivo.size > LIMITE_PDF_BYTES) {
      setPaso({ tipo: 'elegir', error: MENSAJES_DE_LECTURA.MUY_GRANDE });
      return;
    }
    setPaso({ tipo: 'leyendo' });
    let pdf: string;
    try {
      pdf = bytesABase64(new Uint8Array(await archivo.arrayBuffer()));
    } catch {
      setPaso({ tipo: 'elegir', error: MENSAJES_DE_LECTURA.ILEGIBLE });
      return;
    }
    pdfRef.current = pdf;
    await leer(pdf);
  };

  const abrirConClave = async (e: FormEvent) => {
    e.preventDefault();
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
    if (!plan || ledgerId === plan.ledgerId) return;
    const intento = intentoRef.current;
    setCambiandoLibro(true);
    setErrorDeImportacion('');
    const categorias = await categoriasDe(ledgerId);
    if (intento !== intentoRef.current) return;
    setCambiandoLibro(false);
    if (!categorias) { setErrorDeImportacion(PANTALLA.sinCategorias); return; }
    cambiar(null, { tipo: 'libro', ledgerId, categorias, ledgerName: nombreDe(ledgerId) });
  };

  const abierta = (s: SeccionDeVista) => abiertas[s.id] ?? !s.plegada;

  /** Un conteo del resumen lleva a su sección, abriéndola si estaba plegada. */
  const irA = (id: IdDeSeccion) => {
    setAbiertas(a => ({ ...a, [id]: true }));
    // Después de pintarla abierta: medida antes, el salto queda corto.
    requestAnimationFrame(() => {
      document.getElementById(`seccion-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const importar = async () => {
    // Con el libro cambiando, el pedido saldría con el anterior.
    if (!plan || importando || cambiandoLibro) return;
    const intento = intentoRef.current;
    const vigente = () => intento === intentoRef.current;
    const pedido = armarPedido(plan);
    setImportando(true);
    setErrorDeImportacion('');
    try {
      const res = await fetch('/api/statements/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pedido),
      });
      const datos = await res.json().catch(() => null);
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
        setErrorDeImportacion(datos?.faltaMigracion ? FALTA_MIGRACION : (datos?.error ?? ERROR_DE_IMPORTACION_GENERICO));
        return;
      }
      setPaso({ tipo: 'listo', resultado: datos as ResultadoDeImportacion, creado, deshaciendo: false, error: '' });
      setPlan(null);
      setFilaAbierta(null);
      window.scrollTo({ top: 0 });
    } catch {
      if (vigente()) setErrorDeImportacion(ERROR_DE_IMPORTACION_GENERICO);
    } finally {
      if (vigente()) setImportando(false);
    }
  };

  const deshacer = async () => {
    if (paso.tipo !== 'listo' || paso.deshaciendo) return;
    if (!confirm(PANTALLA.confirmarDeshacer)) return;
    const { resultado, creado } = paso;
    const intento = intentoRef.current;
    setPaso({ ...paso, deshaciendo: true, error: '' });
    try {
      const res = await fetch('/api/statements/deshacer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId: resultado.importId }),
      });
      const datos = await res.json().catch(() => null);
      if (res.ok) {
        notifyTransactionSaved();
        refreshLedgers();
      }
      if (intento !== intentoRef.current) return;
      if (!res.ok) {
        setPaso({ tipo: 'listo', resultado, creado, deshaciendo: false, error: datos?.error ?? ERROR_AL_DESHACER });
        return;
      }
      setPaso({ tipo: 'deshecho', cardId: resultado.cardId, creado });
    } catch {
      if (intento !== intentoRef.current) return;
      setPaso({ tipo: 'listo', resultado, creado, deshaciendo: false, error: ERROR_AL_DESHACER });
    }
  };

  // El libro elegido siempre está en la lista, aunque las cuentas no hayan llegado todavía.
  const libros = ledgers.map(l => ({ id: l.id, nombre: l.name }));
  if (plan && !libros.some(l => l.id === plan.ledgerId)) {
    libros.unshift({ id: plan.ledgerId, nombre: plan.ledgerName ?? '' });
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 pt-14 md:pt-0">
      <Link
        href="/cards"
        className="self-start flex items-center gap-1.5 text-sm text-tinta-2 hover:text-tinta transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {PANTALLA.volver}
      </Link>

      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-tinta">{PANTALLA.titulo}</h1>
        <p className="text-tinta-2 text-sm">{PANTALLA.subtitulo}</p>
      </div>

      <input
        ref={elegirRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={alElegir}
      />

      {paso.tipo === 'elegir' && (
        <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 bg-hundido rounded-xl flex items-center justify-center flex-shrink-0">
              <FileUp className="w-5 h-5 text-tinta-2" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <p className="text-sm text-tinta">{PANTALLA.explicacion}</p>
              <p className="text-2xs text-tinta-2">{PANTALLA.alcance}</p>
            </div>
          </div>
          {paso.error && <CajaDeError texto={paso.error} />}
          <button
            type="button"
            onClick={() => elegirRef.current?.click()}
            className="w-full py-3 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <FileUp className="w-4 h-4" />
            {paso.error ? PANTALLA.elegirOtroPdf : PANTALLA.elegirPdf}
          </button>
        </div>
      )}

      {paso.tipo === 'clave' && (
        <form
          onSubmit={abrirConClave}
          className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 bg-hundido rounded-xl flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-5 h-5 text-tinta-2" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p className="text-sm font-medium text-tinta">{MENSAJES_DE_LECTURA.CLAVE_REQUERIDA}</p>
              <p className="text-sm text-tinta-2">{PANTALLA.claveExplicacion}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clave-del-pdf" className="text-xs text-tinta-2 font-medium">{PANTALLA.claveCampo}</label>
            <input
              id="clave-del-pdf"
              type="password"
              autoFocus
              autoComplete="off"
              value={clave}
              onChange={e => setClave(e.target.value)}
              className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta focus:outline-none focus:border-tinta-3"
            />
          </div>
          {paso.error && <CajaDeError texto={paso.error} />}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={elegirOtro}
              className="flex-1 py-2.5 bg-hundido hover:bg-presionado text-tinta rounded-lg text-sm transition-colors"
            >
              {PANTALLA.elegirOtroPdf}
            </button>
            <button
              type="submit"
              disabled={!clave}
              className="flex-1 py-2.5 bg-primario hover:bg-primario/85 disabled:opacity-50 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
            >
              {PANTALLA.abrir}
            </button>
          </div>
        </form>
      )}

      {paso.tipo === 'leyendo' && (
        <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl px-5 py-10 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-tinta-2" />
          <p className="text-sm text-tinta-2 text-center">{PANTALLA.leyendo}</p>
        </div>
      )}

      {paso.tipo === 'revisar' && plan && vista && (
        <>
          <BankStatementSummary
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
            // El margen de arriba es la barra fija del teléfono: sin él, el
            // salto desde un conteo deja el título de la sección debajo.
            <div key={s.id} id={`seccion-${s.id}`} className="scroll-mt-20 md:scroll-mt-6">
              <BankStatementReview
                seccion={s}
                abierta={abierta(s)}
                onAlternar={() => setAbiertas(a => ({ ...a, [s.id]: !abierta(s) }))}
                dinero={dinero}
                categorias={plan.categorias}
                onCambio={cambiar}
                onAbrirFila={setFilaAbierta}
              />
            </div>
          ))}

          <div className="flex flex-col gap-3">
            <p className="text-xs text-tinta-2">
              {textoDelPie(dinero(vista.pie.gastosCentavos), dinero(vista.pie.ingresosCentavos), vista.pie.sinDecidir)}
            </p>
            <BotonDeImportar boton={vista.boton} importando={importando} ocupado={cambiandoLibro} onImportar={importar} />
            {errorDeImportacion && <CajaDeError texto={errorDeImportacion} />}
            {/* Mientras importa no se cambia de PDF: lo que conteste es de este. */}
            <button
              type="button"
              onClick={elegirOtro}
              disabled={importando}
              className="self-center py-1 text-xs text-tinta-2 hover:text-tinta disabled:opacity-50 transition-colors"
            >
              {PANTALLA.elegirOtroPdf}
            </button>
          </div>

          <BankStatementLineSheet
            hoja={hoja}
            dinero={dinero}
            categorias={plan.categorias}
            onCambio={cambiar}
            onCerrar={() => setFilaAbierta(null)}
          />
        </>
      )}

      {paso.tipo === 'listo' && (
        <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 flex flex-col gap-4">
          <div className="px-4 py-3 bg-acento/10 border border-acento/20 text-acento rounded-xl flex items-start gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p>
                {textoListo(paso.resultado.creados, paso.resultado.enlazados, paso.resultado.pagos, paso.resultado.omitidos)}
              </p>
              {paso.resultado.yaEstaban > 0 && <p>{yaEstabanImportados(paso.resultado.yaEstaban)}</p>}
            </div>
          </div>
          {paso.error && <CajaDeError texto={paso.error} />}
          <div className="flex flex-col sm:flex-row gap-2">
            <Link
              href={`/cards/${paso.resultado.cardId}`}
              className="flex-1 py-2.5 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
            >
              {PANTALLA.verLaCuenta}
            </Link>
            <button
              type="button"
              onClick={elegirOtro}
              disabled={paso.deshaciendo}
              className="flex-1 py-2.5 bg-hundido hover:bg-presionado disabled:opacity-50 text-tinta rounded-lg text-sm transition-colors"
            >
              {PANTALLA.importarOtro}
            </button>
            <button
              type="button"
              onClick={deshacer}
              disabled={paso.deshaciendo}
              className="flex-1 py-2.5 bg-hundido hover:bg-presionado disabled:opacity-50 text-tinta rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {paso.deshaciendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
              {PANTALLA.deshacer}
            </button>
          </div>
        </div>
      )}

      {paso.tipo === 'deshecho' && (
        <div className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 flex flex-col gap-4">
          <p className="flex items-start gap-2 text-sm text-tinta">
            <Undo2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-tinta-2" />
            <span className="flex-1 min-w-0">{textoDeshecho(paso.creado.cuenta, paso.creado.categoria)}</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={elegirOtro}
              className="flex-1 py-2.5 bg-primario hover:bg-primario/85 text-sobre-primario rounded-lg text-sm font-medium transition-colors"
            >
              {PANTALLA.importarOtro}
            </button>
            <Link
              href={`/cards/${paso.cardId}`}
              className="flex-1 py-2.5 bg-hundido hover:bg-presionado text-tinta rounded-lg text-sm transition-colors flex items-center justify-center"
            >
              {PANTALLA.verLaCuenta}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
