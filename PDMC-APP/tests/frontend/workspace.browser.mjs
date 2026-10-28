import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createServer } from "node:net";
import nextEnv from "@next/env";
import pg from "pg";

// Prueba Windows/Edge sin dependencias adicionales. Perfil aislado, sin datos
// del navegador del usuario; PostgreSQL usa un esquema de pruebas aislado. Requiere build previo.
nextEnv.loadEnvConfig(process.cwd());
const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString || (!process.env.TEST_DATABASE_URL && !["127.0.0.1","localhost","[::1]"].includes(new URL(connectionString).hostname))) throw new Error("Configure una base de pruebas local.");
const schema = `pdmc_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({ connectionString });
await admin.connect();
await admin.query(`CREATE SCHEMA "${schema}"`);
await admin.query(`SET search_path TO "${schema}"`);
for (const entry of (await readdir(new URL("../../backend/prisma/migrations", import.meta.url), {withFileTypes:true})).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const sql=await readFile(new URL(`../../backend/prisma/migrations/${entry.name}/migration.sql`,import.meta.url),"utf8");
  await admin.query(sql.replaceAll('"public"',`"${schema}"`));
}
const isolatedUrl = new URL(connectionString); isolatedUrl.searchParams.set("schema",schema);
const edgePath = process.env.PDMC_TEST_EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const temporaryRoot = resolve(".next");
const profile = resolve(temporaryRoot, `pdmc-browser-${randomUUID()}`);
await mkdir(profile);
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const authEmail = `browser-${randomUUID()}@example.test`;
const temporaryPassword = randomBytes(24).toString("base64url");
await new Promise((resolve,reject)=>{
  const seed=spawn(process.execPath,["--conditions=react-server","--import","tsx","backend/scripts/crear-usuarios-iniciales.ts"],{windowsHide:true,stdio:"ignore",env:{...process.env,DATABASE_URL:isolatedUrl.toString(),PDMC_SEED_ADMINISTRADOR_EMAIL:authEmail,PDMC_SEED_ADMINISTRADOR_PASSWORD:temporaryPassword}});
  seed.on("error",reject);seed.on("exit",code=>code===0?resolve():reject(new Error("No se pudo preparar el usuario aislado")));
});
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: {...process.env,DATABASE_URL:isolatedUrl.toString(),PDMC_AUTH_ORIGIN:origin} });
let browser, socket;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(message);
}
try {
  await until(async () => { try { return (await fetch(origin)).ok; } catch { return false; } }, "El servidor no inició");
  await admin.query(`UPDATE "Usuario" SET estado='ACTIVO', "debeCambiarPassword"=false, "passwordTemporalHasta"=null WHERE email=$1`, [authEmail]);
  browser = spawn(edgePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let debugPort;
  await until(async () => { try { debugPort = (await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; return true; } catch { return false; } }, "Edge no inició");
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", event => {
    const response = JSON.parse(event.data);
    if (response.method === "Runtime.exceptionThrown") exceptions.push(response.params.exceptionDetails.text);
    const callback = pending.get(response.id);
    if (callback) {
      pending.delete(response.id);
      if (response.error) callback.reject(new Error(response.error.message));
      else callback.resolve(response.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id;
    const timeout = setTimeout(() => { pending.delete(commandId); reject(new Error(`Tiempo agotado: ${method}`)); }, 10000);
    pending.set(commandId, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const click = async label => {
    await until(()=>evaluate(`[...(document.querySelector('[role="dialog"]')??document).querySelectorAll('button')].some(b=>b.offsetWidth&&!b.disabled&&b.textContent.trim()===${JSON.stringify(label)}&&Object.keys(b).some(k=>k.startsWith('__reactProps$')))`),`Botón no disponible: ${label}`);
    return evaluate(`(() => { const element = [...(document.querySelector('[role="dialog"]')??document).querySelectorAll('button')].find(b => b.offsetWidth && !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}); element.click(); })()`);
  };
  const contains = async text => {
    try { await until(() => evaluate(`document.body?.textContent.includes(${JSON.stringify(text)}) ?? false`), `No apareció: ${text}`); }
    catch(error) { console.info(await evaluate("document.body?.innerText.slice(-2000) ?? 'Documento todavía no disponible'")); throw error; }
  };
  const fill = async (label,value) => {
    await until(()=>evaluate(`(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');return el&&Object.keys(el).some(k=>k.startsWith('__reactProps$'));})()`),`Campo no disponible: ${label}`);
    return evaluate(`(() => { const element=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']'); const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(element,${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const preview = resolve(temporaryRoot, "workspace-preview");
  await mkdir(preview, {recursive:true});
  const capture = async name => {
    await evaluate('document.fonts.ready');
    await sleep(450);
    const result = await send("Page.captureScreenshot", {format:"png"});
    await writeFile(resolve(preview, `${name}.png`), Buffer.from(result.data,"base64"));
  };
  const noOverflow = async () => assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), "La página desborda horizontalmente");
  const nav = async label => {
    await until(() => evaluate(`[...document.querySelectorAll('.workspace-tab')].some(b=>b.textContent.includes(${JSON.stringify(label)})&&Object.keys(b).some(k=>k.startsWith('__reactProps$')))`), "Navegación sin hidratar");
    await evaluate(`[...document.querySelectorAll('.workspace-tab')].find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);
  };
  await send("Page.addScriptToEvaluateOnNewDocument", {source:"localStorage.setItem('theme','light')"});
  await send("Page.navigate", {url:origin});
  await contains("Iniciar sesión");
  // Inicio de sesión en PC y en celular, sin desbordes.
  await capture("login-pc"); await noOverflow();
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await capture("login-movil"); await noOverflow();
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await fill("Usuario", authEmail); await fill("Contraseña",temporaryPassword); await click("Iniciar sesión");
  await contains("Administración nacional");
  await until(()=>evaluate('Boolean(document.querySelector(".workspace-navigation"))'), "No apareció navegación");
  assert.equal(await evaluate('document.querySelectorAll("aside").length'),0);
  await capture("admin-light");
  await nav("Usuarios"); await contains("Usuarios"); await noOverflow();
  await evaluate(`document.querySelector('[aria-label="Explorar módulos"]').click()`);
  await contains("Tu espacio de trabajo");
  await fill("Buscar módulo","regiones");
  assert.equal(await evaluate('document.querySelectorAll(".workspace-destination").length'),1);
  await evaluate('document.querySelector(".workspace-destination").click()');
  await until(()=>evaluate('!document.querySelector(".workspace-explorer")'), "El selector no cerró");
  await contains("Regiones y entidades");
  async function role(value) {
    await admin.query('UPDATE "Usuario" SET rol=$1 WHERE email=$2',[value,authEmail]);
    await admin.query('UPDATE "AsignacionAcceso" SET rol=$1 WHERE "usuarioId"=(SELECT id FROM "Usuario" WHERE email=$2)',[value,authEmail]);
    await send("Page.navigate",{url:origin});
  }
  // Casos de ejemplo para el panel lateral y el paso automático al siguiente caso.
  const actorId=(await admin.query('SELECT id FROM "Usuario" WHERE email=$1',[authEmail])).rows[0].id;
  const panelWarehouse=randomUUID();await admin.query('INSERT INTO "Bodega" (id,codigo,nombre,"updatedAt") VALUES ($1,$2,$3,now())',[panelWarehouse,"PANEL","Bodega del panel"]);
  const panelQuery=randomUUID();await admin.query('INSERT INTO "ConsultaInventario" (id,"usuarioId","nombreArchivo","fechaConsulta","hashArchivo","totalFilas") VALUES ($1,$2,$3,now(),$4,2)',[panelQuery,actorId,"panel.csv",randomBytes(32).toString("hex")]);
  for(const [index,code] of ["7700000000011","7700000000028"].entries()){
    const productId=randomUUID();
    await admin.query('INSERT INTO "Producto" (id,"codigoBarra",descripcion,"updatedAt") VALUES ($1,$2,$3,now())',[productId,code,`Producto del panel ${index+1}`]);
    await admin.query('INSERT INTO "InventarioActual" (id,"consultaId","productoId",existencia,activo) VALUES ($1,$2,$3,$4,true)',[randomUUID(),panelQuery,productId,-2-index]);
    await admin.query(`INSERT INTO "Negativo" (id,"productoId","bodegaId",estado,"conteoFisico","existenciaSistemaConteo","conteoRegistradoAt","primeraDeteccion","ultimaDeteccion","updatedAt") VALUES ($1,$2,$3,'En investigación',0,$4,now(),now(),now(),now())`,[randomUUID(),productId,panelWarehouse,-2-index]);
    await admin.query(`INSERT INTO "Inconsistencia" (id,"sourceKey",fecha,sucursal,transferencia,"codigoBarra","tipoError","cantidadErrada","conteoFisico","existenciaSistemaConteo","conteoRegistradoAt","unidadesSinResolver","updatedAt") VALUES ($1,$2,now(),'Tienda del panel',$3,$4,'Faltante físico',2,3,5,now(),2,now())`,[randomUUID(),randomUUID(),`9100${index}`,code]);
  }
  await role("MEJORA_CONTINUA");
  await contains("Mi día"); await contains("Una visión clara.");
  await capture("operacion-light"); await noOverflow();
  assert.equal(await evaluate('document.querySelectorAll("aside").length'),0);
  await nav("Transferencias"); await contains("Control de transferencias"); await capture("transferencias-light");
  // Selector de periodo: abre el calendario de meses y no permite meses futuros.
  await evaluate(`document.querySelector('[aria-label^="Periodo:"]').click()`);
  await until(()=>evaluate(`document.querySelectorAll('[role="group"][aria-label^="Meses de"] button').length===12`),"No abrió el calendario de meses");
  assert.ok(await evaluate(`document.querySelector('[role="group"][aria-label^="Meses de"] button[aria-pressed="true"]')!==null`),"El mes elegido no está marcado");
  await capture("periodo-abierto");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await until(()=>evaluate(`!document.querySelector('[role="group"][aria-label^="Meses de"]')`),"Escape no cierra el calendario");
  await nav("Negativos"); await contains("Control de negativos");
  assert.ok(await evaluate(`Boolean(document.querySelector('[data-testid="sidebar-negative-count"]'))`));
  // Negativos: tabla de 5 columnas, panel lateral junto a la tabla y siguiente caso al guardar.
  const activeRow=`document.querySelector('tr[aria-current="true"]')?.textContent??""`;
  await until(()=>evaluate('[...document.querySelectorAll("th")].some(th=>th.textContent==="Siguiente acción")'),"Falta la columna Siguiente acción en negativos");
  assert.equal(await evaluate('document.querySelectorAll(".negative-results thead th").length'),6);
  await click("Documentar y decidir");
  await until(()=>evaluate(`Boolean(document.querySelector('aside[aria-label="Expediente del negativo"] [aria-label="Observaciones"]'))`),"No abrió el panel del negativo");
  assert.ok(await evaluate('document.querySelector(".negative-results").getBoundingClientRect().width>500'),"La tabla de negativos no queda visible junto al panel");
  assert.equal(await evaluate('Boolean(document.querySelector(\'[aria-label="Veredicto"]\'))'),false);
  await evaluate(`document.querySelector(".negative-results").scrollIntoView({block:"start"});window.scrollBy(0,-110)`);
  await capture("negativos-panel");
  const firstNegative=await evaluate(activeRow);
  await click("Guardar expediente");
  await until(async()=>{const current=await evaluate(activeRow);return Boolean(current)&&current!==firstNegative;},"No se abrió el siguiente negativo");
  await evaluate(`document.querySelector('[aria-label="Cerrar expediente"]').click()`);
  // Inconsistencias: mismo comportamiento.
  await nav("Inconsistencias");
  await until(()=>evaluate('[...document.querySelectorAll("th")].some(th=>th.textContent==="Siguiente acción")'),"Falta la columna Siguiente acción en inconsistencias");
  await click("Investigar");
  await until(()=>evaluate(`Boolean(document.querySelector('aside[aria-label="Caso de inconsistencia"]'))`),"No abrió el panel de la inconsistencia");
  await evaluate(`document.querySelector('aside[aria-label="Caso de inconsistencia"]').scrollIntoView({block:"start"});window.scrollBy(0,-110)`);
  await capture("inconsistencias-panel"); await noOverflow();
  const firstCase=await evaluate(activeRow);
  await click("Guardar cambios");
  await until(async()=>{const current=await evaluate(activeRow);return Boolean(current)&&current!==firstCase;},"No se abrió la siguiente inconsistencia");
  await evaluate(`document.querySelector('[aria-label="Cerrar caso"]').click()`);
  await nav("Negativos"); await contains("Control de negativos");
  await evaluate('document.documentElement.classList.add("dark"); document.documentElement.style.colorScheme="dark"');
  await until(()=>evaluate('!document.body.textContent.includes("Cargando negativos")'), "Negativos no terminó de cargar");
  await capture("negativos-dark");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await noOverflow();
  await until(()=>evaluate(`(()=>{const rail=document.querySelector('.workspace-navigation-rail').getBoundingClientRect();const active=document.querySelector('.workspace-tab[aria-current="page"]').getBoundingClientRect();return active.left>=rail.left-1&&active.right<=rail.right+1;})()`),"El módulo activo no es visible en móvil");
  await capture("mobile-dark");
  await evaluate(`document.querySelector('[aria-label="Explorar módulos"]').click()`);
  await fill("Buscar módulo","inventario");
  await noOverflow();
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await until(()=>evaluate('!document.querySelector(".workspace-explorer")'),"Escape no cierra selector");
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'),"Explorar módulos");
  await evaluate(`document.querySelector('[aria-label="Abrir ajustes de cuenta"]').click()`);
  await contains("Ajustes de cuenta"); await noOverflow();
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await role("RECTIFICACION");
  await contains("Tu jornada de trabajo");
  assert.equal(await evaluate('document.querySelectorAll(".workspace-tab").length'),3);
  await nav("Negativos"); await contains("Control de negativos");
  await capture("rectificacion");
  assert.equal(await evaluate('document.querySelectorAll("aside").length'),0);
  await role("TIENDA"); await contains("Portal de tienda"); await capture("tienda");
  assert.deepEqual(exceptions,[]);
  console.info("Navegación verificada: administración, mejora continua, rectificación y tienda; búsqueda, permisos visibles, móvil, temas y foco. Capturas en .next/workspace-preview.");
  await send("Browser.close").catch(()=>{});
} finally {
  socket?.close();
  browser?.kill();
  server.kill();
  await sleep(1000);
  if (!profile.startsWith(temporaryRoot + sep) || !/^pdmc-browser-[a-f0-9-]+$/.test(profile.slice(temporaryRoot.length + 1))) throw new Error("Ruta de limpieza fuera del directorio temporal");
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => console.info("El perfil temporal de prueba permanece en .next; no contiene datos del usuario."));
  if(!/^pdmc_test_[a-f0-9]{32}$/.test(schema))throw new Error("Esquema de limpieza inválido");
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
}

