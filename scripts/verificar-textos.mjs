/**
 * Comprueba que la web y el teléfono le digan al usuario EXACTAMENTE lo mismo.
 *
 * La comparación de píxeles (`scripts/comparar-galeria.mjs`) mide el dibujo con
 * datos de mentira: si un cartel de error dice "No se pudo guardar" de un lado y
 * "No se pudo guardar." del otro, nunca se ven los dos juntos y la foto sale
 * idéntica. Esto lee el código de cada par de gemelos y compara las cadenas que
 * llegan a la pantalla.
 *
 * Lee el árbol de TypeScript, no expresiones regulares: un `<p>` partido en tres
 * renglones, un ternario dentro de llaves o un `Alert.alert` con acentos no se
 * pescan a ojo, y una regex que lo intente termina con más excepciones que
 * reglas.
 *
 *   node scripts/verificar-textos.mjs            todos los pares
 *   node scripts/verificar-textos.mjs Resumen    solo los que coincidan
 *   node scripts/verificar-textos.mjs --listar   qué textos ve en cada uno
 *   node scripts/verificar-textos.mjs --extraer components/Navigation.tsx
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(import.meta.url)('typescript');

/**
 * Los gemelos: qué archivo de la web le corresponde a cuál del teléfono.
 *
 * Escrito a mano y no adivinado por el nombre a propósito: los nombres no se
 * parecen (`SummaryCard` ↔ `TarjetaDeResumen`) y adivinar significaría que un
 * archivo mal bautizado deja de compararse sin que nadie se entere.
 *
 * Esta lista es además el estado del port: lo que todavía no está acá, no está
 * portado. Agregar el par es parte de portar la pantalla.
 */
const PARES = [
  ['components/SummaryCard.tsx', 'mobile/componentes/TarjetaDeResumen.tsx'],
  ['components/BudgetBar.tsx', 'mobile/componentes/BarraDePresupuesto.tsx'],
  ['components/CategoryIcon.tsx', 'mobile/componentes/IconoDeCategoria.tsx'],
  ['components/CategoriesContext.tsx', 'mobile/componentes/ContextoDeCategorias.tsx'],
  ['components/SettingsContext.tsx', 'mobile/componentes/ContextoDeAjustes.tsx'],
];

/**
 * Diferencias aceptadas, con el motivo al lado.
 *
 * Cada renglón es una deuda o una imposibilidad, no una excepción de trámite: si
 * la lista crece sin motivos escritos, la comprobación deja de significar algo.
 */
const PERDONADAS = [
  {
    par: 'components/CategoriesContext.tsx',
    textos: [
      'No se pudieron cargar las categorías.',
      'No se pudieron cargar las categorías. Revisá la conexión.',
    ],
    porque: 'el teléfono todavía no las trae de la base; el proveedor las recibe por props',
  },
  {
    par: 'components/SettingsContext.tsx',
    textos: ['No se pudo guardar la configuración'],
    porque: 'el teléfono todavía no guarda ajustes; usa los valores por defecto',
  },
];

/** Atributos de JSX cuyo valor lo lee una persona. */
const PROPS_VISIBLES = new Set([
  'placeholder', 'title', 'alt', 'label',
  'aria-label', 'accessibilityLabel', 'accessibilityHint',
]);

/** Claves de objeto cuyo valor termina en pantalla. */
const CLAVES_VISIBLES = new Set(['label', 'titulo', 'texto', 'title', 'placeholder', 'etiqueta']);

/** Funciones cuyo argumento de texto lo lee una persona. */
const FUNCIONES_VISIBLES = new Set([
  'confirm', 'alert', 'Alert.alert',
  'setError', 'setErrorCat', 'setDeleteError', 'onError', 'setAviso', 'Error',
]);

/** Cadenas que no son prosa aunque estén dentro del JSX. */
const esRuido = t =>
  t === ''
  || /^[\s·—…,.:;{}()[\]/+-]*$/.test(t)   // separadores sueltos y {' '}
  || /^#[0-9a-fA-F]{3,8}$/.test(t)        // colores
  || /^\/[\w/[\]-]*$/.test(t)             // rutas: /transactions, /cards/[id]
  || /^[a-z][\w.-]*\/[\w./-]+$/.test(t)   // tipos MIME, paquetes
  || /^\{\}[^\p{L}]*$/u.test(t);          // moldes sin prosa: `{}-01`

const leer = p => readFileSync(path.join(RAIZ, p), 'utf8');

/** Las entidades HTML que usa la web y el teléfono escribe derecho. */
const ENTIDADES = { '&quot;': '"', '&apos;': "'", '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

/**
 * Deja el texto en su forma comparable.
 *
 * Los saltos de renglón del código no se ven en pantalla, así que un texto
 * partido en tres tiene que dar lo mismo que el mismo texto en uno solo. Y lo
 * interpolado se reemplaza por `{}`: `fmt.money(x)` del lado de la web es el
 * mismo hueco que del lado del teléfono, y lo que se compara es el molde.
 */
const normalizar = t => t
  .replace(/&\w+;|&#\d+;/g, e => ENTIDADES[e] ?? e)
  .replace(/\s+/g, ' ')
  .trim();

/** Rearma un template literal con `{}` donde va cada interpolación. */
function molde(nodo) {
  if (ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  return nodo.head.text + nodo.templateSpans.map(s => '{}' + s.literal.text).join('');
}

/** El nombre de lo que se está llamando: `confirm`, `Alert.alert`, `Error`. */
function nombreLlamado(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return `${nombreLlamado(expr.expression)}.${expr.name.text}`;
  return '';
}

/** Todos los textos que un archivo le muestra a una persona. */
function textosDe(ruta) {
  const fuente = ts.createSourceFile(ruta, leer(ruta), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const textos = [];
  const guardar = t => { const n = normalizar(t); if (!esRuido(n)) textos.push(n); };

  const esLiteral = n => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
  const literal = n => (ts.isStringLiteral(n) ? n.text : molde(n));

  // `enJsx` marca que lo que se está recorriendo se dibuja: dentro de unas
  // llaves de JSX toda cadena termina en pantalla, y fuera casi ninguna.
  (function visitar(nodo, enJsx) {
    if (ts.isJsxText(nodo)) { guardar(nodo.text); return; }

    if (ts.isJsxAttribute(nodo)) {
      // Los atributos que no se leen —className, style, href— no se miran
      // siquiera: es ahí donde viven las clases de Tailwind, que se parecen
      // demasiado a texto como para filtrarlas después.
      const nombre = nodo.name.getText(fuente);
      if (!PROPS_VISIBLES.has(nombre)) return;
      if (nodo.initializer) visitar(nodo.initializer, true);
      return;
    }

    if (ts.isPropertyAssignment(nodo) && CLAVES_VISIBLES.has(nodo.name.getText(fuente).replace(/['"]/g, ''))) {
      if (esLiteral(nodo.initializer)) guardar(literal(nodo.initializer));
    }

    if ((ts.isCallExpression(nodo) || ts.isNewExpression(nodo))
        && FUNCIONES_VISIBLES.has(nombreLlamado(nodo.expression))) {
      // Todo literal que haya adentro del argumento, por hondo que esté: el
      // grueso de los carteles de error son un `??` o un ternario —
      // `setError(datos.error ?? 'No se pudo guardar')`— y quedarse con el
      // argumento entero solo cuando es una cadena pelada los perdería casi
      // todos.
      for (const arg of nodo.arguments ?? []) {
        (function hondo(n) {
          if (esLiteral(n)) { guardar(literal(n)); return; }
          n.forEachChild(hondo);
        })(arg);
      }
    }

    // Una cadena comparada con === no se dibuja, se decide con ella:
    // `variant === 'balance'` vive dentro del JSX y no es un texto.
    const comparada = nodo.parent && ts.isBinaryExpression(nodo.parent)
      && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]
        .includes(nodo.parent.operatorToken.kind);

    if (enJsx && esLiteral(nodo) && !comparada) guardar(literal(nodo));

    nodo.forEachChild(hijo => visitar(hijo, enJsx || ts.isJsxExpression(nodo)));
  })(fuente, false);

  return textos;
}

/** Cuántas veces aparece cada texto: repetir un cartel también es una diferencia. */
const contar = lista => lista.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());

const args = process.argv.slice(2);
const listar = args.includes('--listar');
const iExtraer = args.indexOf('--extraer');
const filtro = args.filter((a, i) => !a.startsWith('--') && i - 1 !== iExtraer)[0];

// Para cuando toca agregar un par: muestra qué ve el extractor en un archivo
// suelto, antes de que haya gemelo con quien compararlo.
if (iExtraer >= 0) {
  const ruta = args[iExtraer + 1];
  if (!ruta || !existsSync(path.join(RAIZ, ruta))) {
    console.error(`No existe: ${ruta ?? '(falta la ruta)'}`);
    process.exit(1);
  }
  const textos = textosDe(ruta);
  console.log(`\n  ${ruta} — ${textos.length} texto(s)\n`);
  for (const t of textos) console.log(`  · ${t}`);
  process.exit(0);
}

const pares = PARES.filter(([w, m]) => !filtro || w.includes(filtro) || m.includes(filtro));
if (pares.length === 0) {
  console.error(filtro ? `Ningún par contiene "${filtro}".` : 'No hay pares declarados.');
  process.exit(1);
}

let fallaron = 0;
for (const [rutaWeb, rutaMovil] of pares) {
  const faltantes = [rutaWeb, rutaMovil].filter(r => !existsSync(path.join(RAIZ, r)));
  if (faltantes.length) {
    console.error(`✗ ${rutaWeb}\n    no existe: ${faltantes.join(', ')}`);
    fallaron++;
    continue;
  }

  const perdon = new Set(PERDONADAS.filter(p => p.par === rutaWeb).flatMap(p => p.textos));
  const web = contar(textosDe(rutaWeb).filter(t => !perdon.has(t)));
  const movil = contar(textosDe(rutaMovil).filter(t => !perdon.has(t)));

  const diferencias = [];
  for (const [t, n] of web) {
    const m = movil.get(t) ?? 0;
    if (m < n) diferencias.push(`solo en la web${n - m > 1 ? ` (×${n - m})` : ''}: «${t}»`);
  }
  for (const [t, n] of movil) {
    const w = web.get(t) ?? 0;
    if (w < n) diferencias.push(`solo en el teléfono${n - w > 1 ? ` (×${n - w})` : ''}: «${t}»`);
  }

  if (listar) {
    console.log(`\n  ${rutaWeb} ↔ ${rutaMovil}`);
    for (const t of new Set([...web.keys(), ...movil.keys()])) console.log(`    · ${t}`);
  }

  if (diferencias.length) {
    fallaron++;
    console.error(`✗ ${rutaWeb} ↔ ${rutaMovil}`);
    diferencias.forEach(d => console.error(`    ${d}`));
  } else if (!listar) {
    console.log(`✓ ${path.basename(rutaWeb)} ↔ ${path.basename(rutaMovil)}  ${web.size} texto(s)`);
  }
}

if (PERDONADAS.length && !listar) {
  console.log(`\n  Diferencias aceptadas a propósito:`);
  for (const p of PERDONADAS) {
    console.log(`  · ${path.basename(p.par)}: ${p.textos.length} texto(s) — ${p.porque}`);
  }
}

if (fallaron) {
  console.error(`\n✗ ${fallaron} par(es) dicen cosas distintas`);
  process.exit(1);
}
console.log(`\n✓ ${pares.length} par(es) dicen exactamente lo mismo`);
