// Revisión en celular: entra con cada rol, abre cada módulo a ancho de teléfono y falla si algo
// se sale de la pantalla (desplazamiento horizontal o elementos cortados fuera de un contenedor
// con su propio desplazamiento). Deja una captura por pantalla en tests/e2e/.salida/movil.
// Uso: npm run build -w frontend && npm run test:movil
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { backendDir, cargarEntorno, salida, servidorPdmc } from "./entorno.mjs";
import { PrismaClient } from "../../backend/generated/prisma/client.ts";
import { hashPassword } from "../../backend/src/auth/password.ts";

cargarEntorno();
const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString || (!process.env.TEST_DATABASE_URL && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(connectionString).hostname))) throw new Error("Configure una base de pruebas local.");
const anchos = (process.env.PDMC_MOVIL_ANCHOS ?? "360,390").split(",").map(Number);
const schema = `pdmc_movil_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString });
await admin.connect();
await admin.query(`CREATE SCHEMA "${schema}"`);
await admin.query(`SET search_path TO "${schema}"`);
for (const entry of (await readdir(new URL("../../backend/prisma/migrations", import.meta.url), { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)))
  await admin.query((await readFile(new URL(`../../backend/prisma/migrations/${entry.name}/migration.sql`, import.meta.url), "utf8")).replaceAll('"public"', `"${schema}"`));
const isolatedUrl = new URL(connectionString); isolatedUrl.searchParams.set("schema", schema);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }) });
const capturas = resolve(salida, "movil");
await rm(capturas, { recursive: true, force: true }); await mkdir(capturas, { recursive: true });

// Datos de ejemplo con textos largos, como los reales: una región, su bodega, dos tiendas y transferencias.
const region = await db.ubicacion.create({ data: { codigo: "OCCIDENTE", nombre: "Región Occidente", tipo: "REGION" } });
const bodegaUbicacion = await db.ubicacion.create({ data: { codigo: "999997", nombre: "BODEGA MARACAIBO", tipo: "BODEGA", regionId: region.id, dimIdTienda: 2004 } });
await db.bodega.create({ data: { codigo: "999997", nombre: "BODEGA MARACAIBO", ubicacionId: bodegaUbicacion.id } });
const tiendas = [];
for (const [codigo, nombre] of [["1010103", "SUC. CENTRO COMERCIAL GALERÍAS MALL MARACAIBO"], ["1010104", "SUC. SAMBIL"]]) {
  const ubicacion = await db.ubicacion.create({ data: { codigo, nombre, tipo: "TIENDA", regionId: region.id, dimIdTienda: Number(codigo.slice(-4)) } });
  await db.tienda.create({ data: { codigo, nombre, ubicacionId: ubicacion.id } });
  tiendas.push(ubicacion);
}
const carga = await db.transferenciaConsultaImport.create({ data: { nombreArchivo: "movil", hashArchivo: randomUUID().replaceAll("-", ""), totalFilas: 6, resumen: {} } });
const hoy = new Date(), dia = n => new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - n));
for (const [i, [estado, observacion, codigo]] of [["Exportada", "CORRECCIÓN de la transferencia 120034 por diferencia en caja 4 de la tienda Galerías", "NOREIMA"], ["Exportada", "Despacho regular de mercancía de temporada", "MARIA01"], ["Aprobada", "rotacion entre tiendas", "AUXILIAR4"], ["Abierta", "", "MARIA01"], ["Exportada", "Despacho", "NOREIMA"]].entries())
  await db.transferenciaConsulta.create({ data: { numero: String(120030 + i), fecha: dia(i), codigoFacturador: codigo, codigoTiendaConsulta: tiendas[i % 2].codigo, tiendaId: tiendas[i % 2].id, estado, observacion, unidades: 120 + i * 37, cantidadCodigos: 4 + i, ultimaImportacionId: carga.id, origenId: bodegaUbicacion.id, exportadaEn: estado === "Exportada" ? dia(i) : null } });

// El facturador NOREIMA tiene cuenta: sus transferencias quedan enlazadas a su perfil y una tiene un error confirmado.
const noreima = await db.perfilLaboral.create({ data: { codigo: "NOREIMA", nombre: "Noreima Facturadora de Occidente", tipo: "FACTURACION" } });
await db.transferenciaConsulta.updateMany({ where: { codigoFacturador: "NOREIMA" }, data: { facturadorId: noreima.id } });
await db.inconsistencia.create({ data: { sourceKey: randomUUID().replaceAll("-", ""), fecha: hoy, sucursal: tiendas[0].nombre, tiendaId: tiendas[0].id, transferencia: "120030", codigoBarra: "7701234567890", tipoError: "Faltante físico", cantidadErrada: 4, responsable: "FACTURACION", motivo: "Error por facturador (Físico Faltante)" } });
const password = randomBytes(18).toString("base64url"), hash = await hashPassword(password);
const roles = [
  ["administrador", "ADMINISTRADOR", null],
  ["mejora", "MEJORA_CONTINUA", region.id],
  ["tienda", "TIENDA", tiendas[0].id],
  ["rectificacion", "RECTIFICACION", bodegaUbicacion.id],
  ["jefe", "JEFE_BODEGA", bodegaUbicacion.id],
  ["recepcion", "RECEPCION", bodegaUbicacion.id],
  ["auditoria", "AUDITORIA", region.id],
  ["facturacion", "FACTURACION", region.id],
];
for (const [nombre, rol, ubicacionId] of roles)
  await db.usuario.create({ data: { email: `${nombre}@movil.test`, nombre: `Usuario de ${nombre} con nombre largo`, rol, passwordHash: hash, estado: "ACTIVO", activo: true, debeCambiarPassword: false, asignaciones: { create: { rol, ubicacionId } } } });

await db.vinculoOperativo.create({ data: { usuarioId: (await db.usuario.findUniqueOrThrow({ where: { email: "facturacion@movil.test" } })).id, perfilId: noreima.id } });
const listener = createServer();
await new Promise(r => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port; await new Promise(r => listener.close(r));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, servidorPdmc, { cwd: backendDir, windowsHide: true, stdio: "ignore", env: { ...process.env, PORT: String(port), DATABASE_URL: isolatedUrl.toString(), PDMC_AUTH_ORIGIN: origin, PDMC_SQLSERVER_ENABLED: "false", PDMC_SYNC_HABILITADA: "false" } });
const profile = resolve(salida, `pdmc-movil-${randomUUID()}`); await mkdir(profile);
const edgePath = process.env.PDMC_TEST_EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(check, message, ms = 30000) { const end = Date.now() + ms; while (Date.now() < end) { if (await check()) return; await sleep(100); } throw new Error(message); }
let browser, socket;
const fallas = [];
try {
  await until(async () => { try { return (await fetch(origin)).ok; } catch { return false; } }, "El servidor no inició");
  browser = spawn(edgePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let debugPort;
  await until(async () => { try { debugPort = (await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; return true; } catch { return false; } }, "Edge no inició");
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.addEventListener("open", r, { once: true }); socket.addEventListener("error", j, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener("message", event => { const m = JSON.parse(event.data), cb = pending.get(m.id); if (cb) { pending.delete(m.id); m.error ? cb.reject(new Error(m.error.message)) : cb.resolve(m.result); } });
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { resolve: r, reject: j }); socket.send(JSON.stringify({ id: n, method, params })); setTimeout(() => { if (pending.delete(n)) j(new Error(`Tiempo agotado: ${method}`)); }, 30000); });
  const evaluate = async expression => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const hidratado = sel => `[...document.querySelectorAll(${JSON.stringify(sel)})].some(e=>e.offsetWidth&&Object.keys(e).some(k=>k.startsWith('__reactProps$')))`;
  const fill = (label, value) => evaluate(`(()=>{const el=document.querySelector('[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  // Lo que se sale del ancho: se ignora lo que está dentro de un contenedor con desplazamiento propio
  // (tablas, carriles de pestañas) y la insignia de Netlify, que no existe en local.
  const medir = `(()=>{const W=innerWidth,out=[];
    // Solo un contenedor que se desplaza deja ver lo que no cabe; uno que lo oculta lo corta.
    const dentro=el=>{for(let p=el.parentElement;p&&p!==document.documentElement;p=p.parentElement){const s=getComputedStyle(p);if(/(auto|scroll)/.test(s.overflowX)&&p!==document.body){const r=p.getBoundingClientRect();if(r.right<=W+1&&r.left>=-1)return true}}return false};
    // Cuenta lo que el usuario necesita ver o tocar: texto propio, controles e imágenes; no los adornos.
    const util=el=>el.matches('button,a,input,select,textarea,img,svg,[role=button],th,td')||[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    for(const el of document.querySelectorAll('body *')){const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      if(r.width<=1||r.height<=1||s.visibility==='hidden'||el.closest('[aria-hidden=true],.sr-only')||!util(el)||(r.right<=W+1&&r.left>=-1)||dentro(el))continue;
      if([...el.children].some(c=>{const q=c.getBoundingClientRect();return q.right>W+1||q.left<-1}))continue;
      out.push(el.tagName.toLowerCase()+'.'+[...el.classList].slice(0,4).join('.')+' ['+Math.round(r.left)+'→'+Math.round(r.right)+'] '+(el.innerText||el.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,50))}
    // Pestañas aplastadas: un grupo visible que quedó casi sin ancho porque otro control ocupa la fila.
    for(const el of document.querySelectorAll('[role=tablist],nav')){const r=el.getBoundingClientRect(),st=getComputedStyle(el);if(st.display!=='none'&&el.querySelector('button')&&r.height>0&&r.width<60)out.push('pestañas sin ancho: '+(el.getAttribute('aria-label')||el.tagName.toLowerCase())+' ['+Math.round(r.width)+' px]')}
    // La insignia de Netlify ocupa unos 190×60 px de la esquina inferior derecha: ningún control fijo debe quedar debajo.
    const H=innerHeight,insignia={left:W-190,top:H-60};
    for(const el of document.querySelectorAll('button,a,input,select,[role=button]')){let fijo=false;for(let p=el;p;p=p.parentElement)if(getComputedStyle(p).position==='fixed'&&p.id!=='nl-badge-frame'){fijo=true;break}
      if(!fijo||el.closest('[role=dialog]'))continue;const r=el.getBoundingClientRect();
      if(r.width>1&&r.right>insignia.left&&r.bottom>insignia.top&&r.left<W&&r.top<H)out.push('bajo la insignia de Netlify: '+el.tagName.toLowerCase()+' '+(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,30))}
    return {ancho:W,documento:document.documentElement.scrollWidth,cortados:out.slice(0,10),total:out.length}})()`;
  const revisar = async (rol, pantalla, ancho) => {
    await sleep(900);
    const r = await evaluate(medir);
    const nombre = `${ancho}-${rol}-${pantalla}`.normalize("NFD").replace(/[^\w-]+/g, "-").toLowerCase();
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(resolve(capturas, `${nombre}.png`), Buffer.from(shot.data, "base64"));
    const mal = r.documento > r.ancho + 1 || r.total > 0;
    console.info(`${mal ? "✗" : "✓"} ${ancho}px ${rol} · ${pantalla}${mal ? ` — documento ${r.documento}px, ${r.total} elemento(s) cortado(s)` : ""}`);
    if (mal) { fallas.push({ ancho, rol, pantalla, ...r }); for (const c of r.cortados) console.info(`    ${c}`); }
  };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  // Simula la insignia que Netlify inyecta en los sitios gratuitos (mismo id, tamaño y posición).
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `document.addEventListener("DOMContentLoaded",()=>{const f=document.createElement("iframe");f.id="nl-badge-frame";f.style.cssText="position:fixed;bottom:0;right:0;border:0;width:216px;height:92px;z-index:2147483645;pointer-events:none;background:transparent";document.body.appendChild(f)})` });
  for (const ancho of anchos) {
    await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: 800, deviceScaleFactor: 1, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await send("Network.clearBrowserCookies");
    await send("Page.navigate", { url: `${origin}/login` });
    await until(() => evaluate(hidratado('[aria-label="Usuario"]')), "No cargó el inicio de sesión");
    await revisar("anonimo", "inicio-de-sesion", ancho);
    for (const [rol] of roles) {
      await send("Network.clearBrowserCookies");
      await send("Page.navigate", { url: `${origin}/login` });
      await until(() => evaluate(hidratado('[aria-label="Usuario"]')), "No cargó el inicio de sesión");
      await fill("Usuario", `${rol}@movil.test`); await fill("Contraseña", password);
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Iniciar sesión').click()`);
      await until(() => evaluate(`location.pathname!=='/login'&&(${hidratado(".workspace-tab, .store-liquid-nav button")})`), `No entró: ${rol}`);
      const tabs = await evaluate(`[...document.querySelectorAll('.workspace-tab, .store-liquid-nav button')].filter(b=>b.offsetWidth).map(b=>b.innerText.split('\\n')[0].trim())`);
      const inicio = await evaluate("location.href");
      for (const tab of tabs.filter(t => t !== "QA")) {
        // Algunas vistas (QA) reemplazan la navegación: cada módulo se abre desde el inicio.
        await send("Page.navigate", { url: inicio });
        await until(() => evaluate(hidratado(".workspace-tab, .store-liquid-nav button")), `No volvió al inicio: ${rol}`);
        const abierto = await evaluate(`(()=>{const b=[...document.querySelectorAll('.workspace-tab, .store-liquid-nav button')].find(b=>b.offsetWidth&&b.innerText.split('\\n')[0].trim()===${JSON.stringify(tab)});b?.click();return Boolean(b)})()`);
        if (!abierto) { console.info(`? ${ancho}px ${rol} · ${tab}: la pestaña ya no está visible`); continue; }
        await revisar(rol, tab, ancho);
      }
      // Ajustes de cuenta (modo y paleta de colores) desde el botón del encabezado de la tienda.
      if (await evaluate(`(()=>{const b=document.querySelector('[aria-label="Ajustes de la cuenta"]');b?.click();return Boolean(b)})()`)) {
        await until(() => evaluate(`document.body.textContent.includes("Paleta de colores")`), `Los ajustes no muestran la paleta: ${rol}`);
        await revisar(rol, "ajustes-de-cuenta", ancho);
      }
      // El facturador ve sus transferencias y abre el detalle de productos de una de ellas.
      if (rol === "facturacion") {
        await send("Page.navigate", { url: inicio });
        await until(() => evaluate(hidratado(".workspace-tab")), "No volvió al espacio del facturador");
        await evaluate(`[...document.querySelectorAll('.workspace-tab')].find(b=>b.innerText.includes('Transferencias')).click()`);
        await until(() => evaluate(`document.body.textContent.includes("#120030")`), "El facturador no ve su transferencia #120030");
        await evaluate(`[...document.querySelectorAll('button')].find(b=>b.offsetWidth&&b.textContent.trim()==='Detalle').click()`);
        await until(() => evaluate(`Boolean(document.querySelector('[role="dialog"]')?.textContent.includes("Transferencia #120030"))`), "No abrió el detalle de la transferencia");
        await revisar(rol, "detalle-de-transferencia", ancho);
      }
    }
  }
  console.info(fallas.length ? `\n${fallas.length} pantalla(s) con contenido fuera del ancho. Capturas en ${capturas}` : `\nTodas las pantallas caben en ${anchos.join(" y ")} px. Capturas en ${capturas}`);
  process.exitCode = fallas.length ? 1 : 0;
} finally {
  socket?.close(); browser?.kill(); server.kill();
  await db.$disconnect();
  if (!/^pdmc_movil_[a-f0-9]{32}$/.test(schema)) throw new Error("Esquema de prueba inválido.");
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  await sleep(500); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
