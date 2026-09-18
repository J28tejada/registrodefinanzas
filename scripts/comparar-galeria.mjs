/**
 * Compara la galería de componentes de la web con la del teléfono, pieza por
 * pieza y píxel por píxel.
 *
 * Es la respuesta a "asegurate de que quede idéntica". Sin esto, "idéntico" es
 * una intención; con esto es un número que sube o baja y que se puede exigir.
 *
 * Cómo funciona: las dos apps publican `/galeria`, que dibuja los MISMOS
 * especímenes de `lib/galeria.ts` con sus componentes reales. Este script las
 * sirve como estáticos, fotografía cada pieza por su id en las dos y las resta.
 *
 * Antes de correrlo:
 *   npm run build                      (la web)
 *   cd mobile && npm run export:web    (el teléfono)
 *
 * Después:
 *   node scripts/comparar-galeria.mjs [--umbral 0.5]
 *
 * El diff de cada pieza queda en scratch/galeria/, con la web, el teléfono y la
 * resta lado a lado, para mirar qué se movió.
 */
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'scratch', 'galeria');

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
// Un poco de tolerancia por el antialiasing: las dos pilas dibujan el texto con
// motores distintos y un borde puede diferir en un tono sin que nada esté mal.
const UMBRAL = Number(opcion('umbral', '0.5'));

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * Las diferencias ya miradas y entendidas.
 *
 * Cada una con su tope: lo aceptado es ESA diferencia, no cualquier diferencia
 * futura en el mismo lugar. Si el número sube, vuelve a fallar.
 */
const CONOCIDAS = JSON.parse(
  readFileSync(path.join(RAIZ, 'scripts', 'diferencias-conocidas.json'), 'utf8'),
).piezas;

/**
 * Pantallas enteras que existen en las dos apps y se pueden ver sin sesión.
 *
 * La galería compara componentes sueltos; esto compara la pantalla armada, que
 * es donde aparecen las diferencias de espaciado, de orden y de alto que una
 * pieza aislada no muestra.
 *
 * Solo entran las públicas: el resto necesita una sesión y datos, y compararlas
 * pide un usuario de prueba con las mismas filas en los dos lados — otra etapa.
 */
const PANTALLAS = [
  { ruta: '/login', nombre: 'login', ancho: 393, alto: 852 },
];

/**
 * Sirve el export de Expo con URLs limpias.
 *
 * No alcanza con un servidor de estáticos cualquiera: expo-router mira
 * `location.pathname` para decidir qué pantalla dibujar, así que pedir
 * `/galeria.html` le da una ruta que no conoce y responde "Unmatched Route".
 * Hay que servir el archivo `galeria.html` DESDE la ruta `/galeria`.
 */
function servirExport(dir, puerto) {
  const tipos = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json',
  };
  const servidor = createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const candidatos = ruta.endsWith('/')
      ? [path.join(dir, ruta, 'index.html')]
      : [path.join(dir, ruta), path.join(dir, ruta + '.html')];
    for (const c of candidatos) {
      if (existsSync(c) && statSync(c).isFile()) {
        res.writeHead(200, { 'Content-Type': tipos[path.extname(c)] ?? 'application/octet-stream' });
        res.end(readFileSync(c));
        return;
      }
    }
    res.writeHead(404); res.end('no está');
  });
  servidor.listen(puerto);
  return () => servidor.close();
}

/**
 * La web se levanta con `next start`, no como estáticos.
 *
 * La app tiene rutas de API dinámicas, así que no hay export estático posible:
 * hace falta el servidor de Next aunque la galería en sí no consulte nada.
 */
function servirNext(puerto) {
  const p = spawn('npx', ['next', 'start', '-p', String(puerto)], {
    cwd: RAIZ, stdio: 'ignore', detached: true,
    // Las variables públicas van incrustadas desde la construcción, no desde
    // acá: ver scripts/construir-para-comparar.sh.
    env: { ...process.env },
  });
  return () => { try { process.kill(-p.pid); } catch {} };
}

/** Espera a que un servidor conteste, hasta `intentos` veces. */
async function esperar(url, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* todavía no levantó */ }
    await new Promise(listo => setTimeout(listo, 500));
  }
  throw new Error(`${url} no contestó a tiempo`);
}

async function capturarPiezas(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  // El export de Expo hidrata después de pintar; sin esta espera se fotografía
  // el HTML estático sin estilos aplicados.
  await page.waitForTimeout(1200);
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-pieza], [id]')]
      .map(e => e.getAttribute('data-pieza') || e.id)
      .filter(id => id && !id.startsWith('root') && !id.startsWith('__')));

  const capturas = new Map();
  for (const id of new Set(ids)) {
    // Los ids son claves de la galería: minúsculas y guiones, así que no hace
    // falta escaparlos para el selector.
    const el = page.locator(`[data-pieza="${id}"], [id="${id}"]`).first();
    if (!(await el.count())) continue;
    try {
      capturas.set(id, await el.screenshot());
    } catch { /* una pieza sin tamaño no se puede fotografiar */ }
  }
  return capturas;
}

function comparar(aBuf, bBuf) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { distintos: null, total: null, alto: [a.height, b.height], ancho: [a.width, b.width] };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const distintos = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
  return { distintos, total: a.width * a.height, diff: PNG.sync.write(diff) };
}

if (!existsSync(path.join(RAIZ, 'mobile', 'dist', 'galeria.html'))) {
  console.error('Falta el export del teléfono. Corré: npm run comparar:build');
  process.exit(1);
}

/*
 * Que las dos apps se hayan construido apuntando al mismo backend inventado.
 *
 * Si una se construyó con las variables y la otra no, la comparación mide esa
 * diferencia y no el diseño — el login de una muestra el aviso de "faltan
 * variables" y el de la otra no, y salta como una regresión que no existe. Pasa
 * en cuanto alguien corre el export a mano en lugar de `npm run comparar:build`.
 */
const bundles = readdirSync(path.join(RAIZ, 'mobile', 'dist', '_expo', 'static', 'js', 'web'));
const bundleMovil = bundles.find(f => f.endsWith('.js'));
const configurado = bundleMovil && readFileSync(
  path.join(RAIZ, 'mobile', 'dist', '_expo', 'static', 'js', 'web', bundleMovil), 'utf8',
).includes('galeria.invalid');
if (!configurado) {
  console.error('El export del teléfono no trae las variables de la comparación.');
  console.error('Se construyó a mano, no con `npm run comparar:build`, y las dos apps');
  console.error('quedarían con distinta configuración. Corré: npm run comparar:build');
  process.exit(1);
}

const apagarWeb = servirNext(8821);
const apagarMovil = servirExport(path.join(RAIZ, 'mobile', 'dist'), 8822);

let navegador;
try {
  await esperar('http://127.0.0.1:8821/galeria');
  await esperar('http://127.0.0.1:8822/galeria');
  navegador = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  mkdirSync(SALIDA, { recursive: true });
  const ctx = await navegador.newContext({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });

  const web = await capturarPiezas(await ctx.newPage(), 'http://127.0.0.1:8821/galeria');
  const movil = await capturarPiezas(await ctx.newPage(), 'http://127.0.0.1:8822/galeria');

  // Las pantallas enteras, al mismo tamaño que un teléfono.
  const ctxPantalla = await navegador.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  for (const p of PANTALLAS) {
    const paginaWeb = await ctxPantalla.newPage();
    const paginaMovil = await ctxPantalla.newPage();
    await paginaWeb.goto(`http://127.0.0.1:8821${p.ruta}`, { waitUntil: 'networkidle' });
    await paginaMovil.goto(`http://127.0.0.1:8822${p.ruta}`, { waitUntil: 'networkidle' });
    await paginaWeb.waitForTimeout(1200);
    await paginaMovil.waitForTimeout(1200);
    web.set(`pantalla-${p.nombre}`, await paginaWeb.screenshot());
    movil.set(`pantalla-${p.nombre}`, await paginaMovil.screenshot());
    await paginaWeb.close();
    await paginaMovil.close();
  }

  const ids = [...web.keys()].filter(id => movil.has(id));
  const soloWeb = [...web.keys()].filter(id => !movil.has(id));
  const soloMovil = [...movil.keys()].filter(id => !web.has(id));

  let peor = 0;
  let nuevas = 0;
  const filas = [];
  for (const id of ids) {
    writeFileSync(path.join(SALIDA, `${id}.web.png`), web.get(id));
    writeFileSync(path.join(SALIDA, `${id}.movil.png`), movil.get(id));
    const r = comparar(web.get(id), movil.get(id));
    const conocida = CONOCIDAS[id];
    if (r.distintos === null) {
      const nota = `tamaños distintos: web ${r.ancho[0]}x${r.alto[0]}, móvil ${r.ancho[1]}x${r.alto[1]}`;
      filas.push({ id, pct: null, nota, conocida: Boolean(conocida) });
      if (!conocida) { peor = 100; nuevas++; }
      continue;
    }
    const pct = (r.distintos / r.total) * 100;
    const tope = conocida ? conocida.tope : UMBRAL;
    if (pct > tope) { peor = Math.max(peor, pct); nuevas++; }
    if (pct > 0) writeFileSync(path.join(SALIDA, `${id}.diff.png`), r.diff);
    filas.push({ id, pct, conocida: Boolean(conocida), tope });
  }

  console.log(`\n  pieza                          diferencia`);
  console.log(`  ──────────────────────────────────────────`);
  for (const f of filas.sort((a, b) => (b.pct ?? 101) - (a.pct ?? 101))) {
    const excede = f.pct === null ? !f.conocida : f.pct > (f.tope ?? UMBRAL);
    // `!` es "conocida y dentro de lo aceptado": no está bien, pero ya se miró.
    const marca = excede ? '✗' : f.conocida ? '!' : f.pct > 0 ? '~' : '✓';
    const valor = f.pct === null ? f.nota : `${f.pct.toFixed(2)}%`;
    console.log(`  ${marca} ${f.id.padEnd(28)} ${valor}`);
  }

  if (soloWeb.length) console.log(`\n  Solo en la web: ${soloWeb.join(', ')}`);
  if (soloMovil.length) console.log(`  Solo en el teléfono: ${soloMovil.join(', ')}`);

  const yaMiradas = filas.filter(f => f.conocida).length;
  console.log(`\n  ${ids.length} piezas comparadas · ${yaMiradas} con una diferencia ya conocida`);
  console.log(`  Las imágenes quedaron en scratch/galeria/`);

  const falla = nuevas > 0 || soloWeb.length > 0 || soloMovil.length > 0;
  if (falla) {
    console.error(`\n  ✗ ${nuevas} diferencia(s) NUEVA(s), por encima de lo aceptado`);
  } else {
    console.log(`\n  ✓ ninguna diferencia nueva` +
      (yaMiradas ? ` (${yaMiradas} conocidas siguen abiertas: ver scripts/diferencias-conocidas.json)` : ''));
  }
  process.exitCode = falla ? 1 : 0;
} finally {
  if (navegador) await navegador.close();
  apagarWeb();
  apagarMovil();
}
