/**
 * Dice QUÉ se corrió y cuánto, no solo que algo difiere.
 *
 * El comparador de píxeles contesta "17,38% distinto", que es un número sin
 * dirección: no dice si sobra un margen, si un texto envuelve o si toda la
 * pantalla arrancó veinte píxeles más abajo. Esto compara la GEOMETRÍA — cada
 * bloque de texto, con su posición y su tamaño — y ordena por lo que más se
 * movió.
 *
 * Empareja por el texto, que es lo único que las dos apps tienen en común:
 * las clases se compilan distinto y los ids no existen del lado de la web.
 *
 *   node scripts/comparar-geometria.mjs /login
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = process.argv[2] || '/login';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json',
};

function servirExport(dir, puerto) {
  const s = createServer((req, res) => {
    const r = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    for (const c of [path.join(dir, r), path.join(dir, r + '.html'), path.join(dir, r, 'index.html')]) {
      if (existsSync(c) && statSync(c).isFile()) {
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(c)] ?? 'application/octet-stream' });
        res.end(readFileSync(c));
        return;
      }
    }
    res.writeHead(404); res.end();
  });
  s.listen(puerto);
  return () => s.close();
}

function servirNext(puerto) {
  const p = spawn('npx', ['next', 'start', '-p', String(puerto)],
    { cwd: RAIZ, stdio: 'ignore', detached: true });
  return () => { try { process.kill(-p.pid); } catch {} };
}

async function esperar(url, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${url} no contestó`);
}

/** Cada bloque de texto visible, con dónde está y cuánto mide. */
async function geometria(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const todos = process.argv.includes('--todos');
  return page.evaluate((incluirContenedores) => {
    const salida = [];
    const visto = new Set();
    for (const el of document.querySelectorAll('*')) {
      // Por defecto solo las hojas: un contenedor repite el texto de sus hijos
      // y ensuciaría el emparejamiento. Con --todos entran también, que es lo
      // que hace falta para medir un botón con ícono adentro — su alto no está
      // en ninguna hoja.
      if (!incluirContenedores && el.children.length > 0) continue;
      if (incluirContenedores && el.children.length > 3) continue;
      const texto = (el.textContent || '').trim();
      if (!texto || texto.length > 60) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const clave = texto + '|' + salida.filter(s => s.texto === texto).length;
      if (visto.has(clave)) continue;
      visto.add(clave);
      salida.push({
        texto, clave,
        x: Math.round(r.x), y: Math.round(r.y),
        ancho: Math.round(r.width), alto: Math.round(r.height),
      });
    }
    return salida;
  }, todos);
}

const apagarWeb = servirNext(8851);
const apagarMovil = servirExport(path.join(RAIZ, 'mobile', 'dist'), 8852);
let navegador;
try {
  await esperar(`http://127.0.0.1:8851${RUTA}`);
  await esperar(`http://127.0.0.1:8852${RUTA}`);
  navegador = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await navegador.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });

  const web = await geometria(await ctx.newPage(), `http://127.0.0.1:8851${RUTA}`);
  const movil = await geometria(await ctx.newPage(), `http://127.0.0.1:8852${RUTA}`);

  const porClave = new Map(movil.map(m => [m.clave, m]));
  const filas = [];
  for (const w of web) {
    const m = porClave.get(w.clave);
    if (!m) { filas.push({ texto: w.texto, falta: 'no está en el teléfono' }); continue; }
    porClave.delete(w.clave);
    filas.push({
      texto: w.texto,
      dy: m.y - w.y, dx: m.x - w.x,
      dAncho: m.ancho - w.ancho, dAlto: m.alto - w.alto,
    });
  }
  for (const m of porClave.values()) filas.push({ texto: m.texto, falta: 'no está en la web' });

  // Por defecto, lo que más se movió primero. Con --orden, en el orden en que
  // aparecen en la pantalla: es lo que sirve para encontrar DÓNDE empieza a
  // correrse todo, porque un corrimiento arriba arrastra a todo lo de abajo y
  // ordenado por magnitud los culpables quedan mezclados con los arrastrados.
  if (!process.argv.includes('--orden')) {
    const peso = f => f.falta ? 9999 : Math.abs(f.dy) + Math.abs(f.dx) + Math.abs(f.dAlto);
    filas.sort((a, b) => peso(b) - peso(a));
  }

  console.log(`\n  ${RUTA} — ${filas.length} bloques de texto\n`);
  console.log('  Δy    Δx   Δancho Δalto  texto');
  console.log('  ────────────────────────────────────────────────');
  for (const f of filas.slice(0, 25)) {
    if (f.falta) { console.log(`  ${'—'.padEnd(24)} ${f.texto.slice(0, 32)}  (${f.falta})`); continue; }
    const n = (v, w = 5) => (v === 0 ? '·' : (v > 0 ? '+' : '') + v).padStart(w);
    console.log(`  ${n(f.dy)} ${n(f.dx)} ${n(f.dAncho, 6)} ${n(f.dAlto, 6)}  ${f.texto.slice(0, 32)}`);
  }
  const movidos = filas.filter(f => !f.falta && (f.dy || f.dx || f.dAncho || f.dAlto));
  console.log(`\n  ${filas.length - movidos.length} en su lugar, ${movidos.length} movidos, ` +
    `${filas.filter(f => f.falta).length} sin pareja`);
} finally {
  if (navegador) await navegador.close();
  apagarWeb();
  apagarMovil();
}
