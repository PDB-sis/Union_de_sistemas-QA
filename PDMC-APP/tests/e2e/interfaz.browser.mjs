import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createServer } from "node:net";
import { backendDir, cargarEntorno, salida, scriptBackend, servidorPdmc } from "./entorno.mjs";
import pg from "pg";
import { checkAdministration } from "./admin.browser.mjs";

// Prueba Windows/Edge sin dependencias adicionales. Perfil aislado, sin datos
// del navegador del usuario ni escrituras en PostgreSQL. Requiere build previo.
cargarEntorno();
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
const temporaryRoot = salida;
const profile = resolve(temporaryRoot, `pdmc-browser-${randomUUID()}`);
await mkdir(profile);
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const authEmail = `browser-${randomUUID()}@example.test`;
const temporaryPassword = randomBytes(24).toString("base64url");
const finalPassword = randomBytes(24).toString("base64url");
await new Promise((resolve,reject)=>{
  const seed=spawn(process.execPath,scriptBackend("scripts/crear-usuarios-iniciales.ts"),{cwd:backendDir,windowsHide:true,stdio:"ignore",env:{...process.env,DATABASE_URL:isolatedUrl.toString(),PDMC_SEED_ADMINISTRADOR_EMAIL:authEmail,PDMC_SEED_ADMINISTRADOR_PASSWORD:temporaryPassword}});
  seed.on("error",reject);seed.on("exit",code=>code===0?resolve():reject(new Error("No se pudo preparar el usuario aislado")));
});
const server = spawn(process.execPath, servidorPdmc, { cwd: backendDir, windowsHide: true, stdio: "ignore", env: {...process.env,PORT:String(port),DATABASE_URL:isolatedUrl.toString(),PDMC_AUTH_ORIGIN:origin} });
let browser, socket, control;
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
  const query = `${origin}/api/negativos?bodegaId=${randomUUID()}`;
  assert.equal((await fetch(query)).status, 401);
  const anonymous=await fetch(origin,{redirect:"manual"});assert.equal(anonymous.status,307);assert.equal(anonymous.headers.get("location"),"/login");
  const bodega={id:randomUUID()};
  await admin.query('INSERT INTO "Bodega" (id,codigo,nombre,"updatedAt") VALUES ($1,$2,$3,now())',[bodega.id,"TEST","Prueba aislada"]);
  const physicalWarehouse=randomUUID();
  await admin.query('INSERT INTO "BodegaProducto" (id,nombre) VALUES ($1,$2)',[physicalWarehouse,"Ubicación física de prueba"]);

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
  const navigation = async label => {
    await until(()=>evaluate("[...document.querySelectorAll('aside button')].some(b=>Object.keys(b).some(k=>k.startsWith('__reactProps$')))"),"La navegación no se hidrató");
    return evaluate(`(() => { const element = [...document.querySelectorAll('aside button')].find(b => b.textContent.includes(${JSON.stringify(label)})); if (!element) throw new Error('Sección no encontrada'); element.click(); })()`);
  };
  const contains = async text => {
    try { await until(() => evaluate(`document.body?.innerText.includes(${JSON.stringify(text)}) ?? false`), `No apareció: ${text}`); }
    catch(error) { console.info(await evaluate("document.body?.innerText.slice(-2000) ?? 'Documento todavía no disponible'")); throw error; }
  };
  const fill = async (label,value) => {
    await until(()=>evaluate(`(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');return el&&Object.keys(el).some(k=>k.startsWith('__reactProps$'));})()`),`Campo no disponible: ${label}`);
    return evaluate(`(() => { const element=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']'); const proto=element.tagName==='SELECT'?HTMLSelectElement.prototype:element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(element,${JSON.stringify(value)}); element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (!localStorage.getItem('pdmc-prueba-preparada')) {
      localStorage.setItem('mc-proyectos', JSON.stringify([{ id:'proyecto-previo', name:'Proyecto conservado de prueba', next:'Seguimiento', status:'Pendiente', progress:0 }]));
      localStorage.setItem('mc-negativos-importados', JSON.stringify([{ code:'000-PDMC-TEST', brand:'Prueba', name:'Negativo conservado de prueba', system:-2, physical:'', warehouse:'Prueba', reason:'', verdict:'' }]));
      localStorage.setItem('pdmc-prueba-preparada', '1');
    }
  ` });
  await send("Page.navigate", { url: origin });
  await contains("Iniciar sesión");
  await fill("Usuario",authEmail);await fill("Contraseña",temporaryPassword);await click("Iniciar sesión");
  await contains("Antes de acceder al panel");
  assert.equal(await evaluate('fetch("/api/operacion/negativos/lista").then(r=>r.status)'),403);
  await fill("Contraseña actual",temporaryPassword);await fill("Nueva contraseña",finalPassword);await fill("Confirmar contraseña",finalPassword);await click("Cambiar contraseña");
  await contains("Contraseña actualizada.");
  await fill("Usuario",authEmail);await fill("Contraseña",finalPassword);await click("Iniciar sesión");
  await contains("Mi día");
  await checkAdministration({send,evaluate,click,fill,contains,until,origin});
  if(!process.env.PDMC_BROWSER_STORE_ONLY){
  await navigation("Proyectos");
  await contains("Proyecto conservado de prueba");
  await click("Nuevo proyecto");
  await evaluate(`(() => { const input = document.querySelector('[role="dialog"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Proyecto añadido en prueba'); input.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await click("Guardar");
  await contains("Proyecto añadido en prueba");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('mc-proyectos')).length"), 2);
  await navigation("Negativos");
  await contains("Hay datos de negativos en este navegador");
  await click("Configurar vista");
  await click("Migrar datos anteriores");
  await click("Preparar vista previa");
  await contains("1 expedientes");
  await fill("Fecha de migración","2025-01-01T00:00:00");
  await evaluate("document.querySelector('section[aria-label=\"Migración de datos locales\"] input[type=checkbox]').click()");
  await click("Confirmar migración única");
  await contains("La copia ya está guardada");
  assert.notEqual(await evaluate("localStorage.getItem('mc-negativos-importados')"),null);
  await click("Verificar y usar datos del servidor");
  await contains("Migración verificada");
  assert.equal(await evaluate("localStorage.getItem('mc-negativos-importados')"),null);
  await contains("Negativo conservado de prueba");
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Bodega de negativos"]\') === null'), true);
  assert.equal(await evaluate('Array.from(document.querySelectorAll("td")).some(td => td.textContent.trim() === "-2")'), true);
  assert.equal(await evaluate('Array.from(document.querySelectorAll("td")).some(td => td.textContent.includes("-2.0000"))'), false);
  await click("Gestionar");
  await contains("Conteo físico");
  await fill("Conteo físico","3");
  await until(()=>evaluate('document.querySelector(\'[aria-label="Bodega del producto"]\')?.options.length > 1'),"No cargó el catálogo de bodegas");
  await fill("Bodega del producto",physicalWarehouse);
  await fill("Observaciones","Persistido en PostgreSQL");
  await click("Guardar expediente");
  await contains("Seguimiento guardado en el servidor");
  await send("Page.reload");await contains("Mi día");await navigation("Negativos");await contains("Negativo conservado de prueba");
  await click("Gestionar");await contains("Conteo físico");
  await until(()=>evaluate("Boolean(document.querySelector('[aria-label=\"Observaciones\"]'))"),"El detalle no cargó");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Observaciones\"]').value"),"Persistido en PostgreSQL");
  await until(()=>evaluate('document.querySelector(\'[aria-label="Bodega del producto"]\')?.options.length > 1'),"No cargó el catálogo después de recargar");
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Bodega del producto"]\').value'),physicalWarehouse);
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Destino de importación"]\') === null'),true);
  // Segunda pestaña y contexto sin localStorage: ambos consultan PostgreSQL.
  const second=await send("Target.createTarget",{url:origin});
  const version=await(await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  control=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(resolve=>control.addEventListener("open",resolve,{once:true}));
  let rootCommand=0;
  const rootSend=(method,params={})=>new Promise((resolve,reject)=>{const id=++rootCommand;const timer=setTimeout(()=>reject(new Error(method)),10000);const listener=event=>{const r=JSON.parse(event.data);if(r.id===id){clearTimeout(timer);control.removeEventListener('message',listener);if(r.error)reject(new Error(r.error.message));else resolve(r.result);}};control.addEventListener('message',listener);control.send(JSON.stringify({id,method,params}));});
  const context=await rootSend("Target.createBrowserContext");
  const secondLogin=await fetch(`${origin}/api/auth/login`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({email:authEmail,password:finalPassword})});
  assert.equal(secondLogin.status,200);
  const sessionCookie=secondLogin.headers.get("set-cookie").split(";",1)[0];
  await rootSend("Storage.setCookies",{browserContextId:context.browserContextId,cookies:[{name:sessionCookie.split("=",1)[0],value:sessionCookie.slice(sessionCookie.indexOf("=")+1),url:origin,httpOnly:true,sameSite:"Lax"}]});
  const independent=await rootSend("Target.createTarget",{url:origin,browserContextId:context.browserContextId});
  // Las otras páginas ya están abiertas cuando cambia el seguimiento.
  await fill("Observaciones","Cambio visible después de refrescar");
  await click("Guardar expediente");
  await contains("Seguimiento guardado en el servidor");
  for(const target of [second,independent]) {
    const targetList=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const ws=new WebSocket(targetList.find(t=>t.id===target.targetId).webSocketDebuggerUrl);
    await new Promise(resolve=>ws.addEventListener("open",resolve,{once:true}));
    let command=0;
    const exec=expression=>new Promise((resolve,reject)=>{const current=++command;const timer=setTimeout(()=>reject(new Error('Segunda pestaña no respondió')),10000);const handler=event=>{const r=JSON.parse(event.data);if(r.id===current){clearTimeout(timer);ws.removeEventListener('message',handler);if(r.result?.exceptionDetails)reject(new Error('Error en pestaña'));else resolve(r.result?.result?.value);}};ws.addEventListener('message',handler);ws.send(JSON.stringify({id:current,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
    await exec("location.reload()");
    await until(()=>exec("[...document.querySelectorAll('aside button')].some(b=>Object.keys(b).some(k=>k.startsWith('__reactProps$')))"),"La segunda pestaña no cargó");
    await exec("[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Negativos')).click()");
    await until(()=>exec("document.body.innerText.includes('Negativo conservado de prueba')"),"No se reflejó PostgreSQL en otro contexto");
    await exec("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Gestionar').click()");
    await until(()=>exec("Boolean(document.querySelector('[aria-label=\"Observaciones\"]'))"),"Detalle no disponible");
    assert.equal(await exec("document.querySelector('[aria-label=\"Observaciones\"]').value"),"Cambio visible después de refrescar");
    ws.close();await send("Target.closeTarget",{targetId:target.targetId});
  }
  await rootSend("Target.disposeBrowserContext",{browserContextId:context.browserContextId});
  await send("Page.reload");await contains("Mi día");await navigation("Negativos");await contains("Negativo conservado de prueba");
  await evaluate("document.querySelector('[aria-label=\"Seleccionar página\"]').click()");
  await click("Aplicar a selección");await contains("Confirmar cambio masivo");
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Estado masivo"]\').options.length'),4);
  await fill("Estado masivo","AJUSTE_AUTORIZADO");
  await fill("Motivo compartido", "Diferencia de inventario compartida");
  await fill("Número de ajuste compartido", "AJ-2026-001");
  await click("Confirmar operación");await contains("Operación guardada");
  await contains("Diferencia de inventario compartida");await contains("AJ-2026-001");
  const csv=resolve(profile,"consulta.csv");
  await writeFile(csv,"Estado;CodigoBarra;Referencia;Talla;NombreMarca;CodigoMarca;Descripcion;Existencia;CategoriaNombre;Linea\nA;000-PDMC-TEST;R;M;Prueba;1;Negativo conservado de prueba;-1;C;L\nA;000-NUEVO;R;M;Prueba;1;Nuevo caso de prueba;-5;C;L","utf8");
  await click("Importar actualización");await fill("Fecha de consulta","2025-01-02T00:00:00");
  const root=await send("DOM.getDocument");const fileNode=await send("DOM.querySelector",{nodeId:root.root.nodeId,selector:'input[aria-label="Archivo CSV o TXT"]'});
  await send("DOM.setFileInputFiles",{nodeId:fileNode.nodeId,files:[csv]});
  await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Validar archivo'&&!b.disabled)"),"Archivo no cargado");
  await click("Validar archivo");await contains("2 aceptados");await click("Confirmar importación");await contains("Consulta guardada y comparada");
  await contains("2 códigos negativos actuales");
  await until(()=>evaluate('[...document.querySelectorAll(\'[data-testid="sidebar-negative-count"]\')].every(el=>el.textContent==="2")'),"El contador lateral no refleja la consulta actual");
  await fill("Buscar negativos","000-NUEVO");
  await until(()=>evaluate('document.querySelectorAll("tbody tr").length===1'),"La búsqueda no filtra la tabla");
  assert.equal(await evaluate('document.querySelector(\'[data-testid="sidebar-negative-count"]\').textContent'),"2");
  await fill("Buscar negativos","");
  await contains("Nuevo caso de prueba");
  assert.equal(await evaluate('[...document.querySelectorAll("p")].some(el=>el.textContent?.includes("Selecciona una tarjeta para filtrar"))'),true);
  assert.equal(await evaluate('Boolean(document.querySelector(\'select[aria-label="Filtrar negativos"] option[value="con_conteo"]\'))'),true);
  assert.equal(await evaluate('document.querySelector(".negative-results").compareDocumentPosition(document.querySelector(\'select[aria-label="Vista de negativos"]\'))===Node.DOCUMENT_POSITION_FOLLOWING'),true);
  assert.equal(await evaluate('document.querySelectorAll(\'button[aria-label^="Copiar código "]\').length'),2);
  await evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.__codigoCopiado=value}}})');
  await evaluate('document.querySelector(\'button[aria-label="Copiar código 000-NUEVO"]\').click()');
  await until(()=>evaluate('document.querySelector(\'button[aria-label="Copiar código 000-NUEVO"]\').title==="Código copiado"'),"El botón no confirmó la copia del código");
  assert.equal(await evaluate('window.__codigoCopiado'),"000-NUEVO");
  await until(()=>evaluate('document.querySelector("tbody tr td:nth-child(2) strong")?.textContent === "000-NUEVO"'),"Mayor negativo no aparece primero");
  await fill("Ordenar negativos","cantidad_asc");
  await until(()=>evaluate('document.querySelector("tbody tr td:nth-child(2) strong")?.textContent === "000-PDMC-TEST"'),"Menor negativo no aparece primero");
  await fill("Filtrar negativos","AJUSTE_AUTORIZADO");
  await until(()=>evaluate('document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody")?.textContent.includes("Aprobado para ajuste")'),"El filtro agrupado no se aplica");
  await fill("Filtrar negativos","all");
  await contains("Nuevo caso de prueba");
  const shot = await send("Page.captureScreenshot",{format:"png"});
  await writeFile(resolve(salida,"negativos-vista.png"),Buffer.from(shot.data,"base64"));
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),"La tabla desborda la página en móvil");
  await evaluate('document.querySelector(\'button[aria-label="Abrir menú"]\').click()');
  await until(()=>evaluate('Boolean(document.querySelector(\'[role="dialog"] button[aria-label="Ajustes de cuenta"]\'))'),"Ajustes no está disponible en el menú móvil");
  await evaluate('document.querySelector(\'[role="dialog"] button[aria-label="Ajustes de cuenta"]\').click()');
  await contains("Seguridad de tu cuenta");
  await until(()=>evaluate('!document.querySelector(\'[role="dialog"]\')'),"El menú móvil no se cerró al entrar en ajustes");
  const accountShot=await send("Page.captureScreenshot",{format:"png"});
  await writeFile(resolve(salida,"cuenta-vista.png"),Buffer.from(accountShot.data,"base64"));
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigation("Negativos");await contains("Nuevo caso de prueba");
  await navigation("Carga de inventario");await contains("Inventario vigente");
  await contains("Actualizar desde SQL Server");
  await navigation("Negativos");await contains("Nuevo caso de prueba");
  const adminCookies=await send("Network.getAllCookies");
  const adminSession=adminCookies.cookies.find(cookie=>cookie.name==="pdmc-session-local")?.value;
  assert.ok(adminSession,"No se encontró la sesión administrativa para restaurarla");
  const rectUser=randomUUID(),rectToken=randomBytes(32).toString("base64url");
  await admin.query('INSERT INTO "Usuario" (id,email,nombre,estado,"debeCambiarPassword","updatedAt") VALUES ($1,$2,$3,\'ACTIVO\',false,now())',[rectUser,`${randomUUID()}@example.test`,"Cuenta de rectificación"]);
  await admin.query('INSERT INTO "AsignacionAcceso" (id,"usuarioId",rol,"ubicacionId") VALUES ($1,$2,\'RECTIFICACION\',null)',[randomUUID(),rectUser]);
  await admin.query('INSERT INTO "SesionUsuario" (id,"usuarioId","tokenHash","expiresAt") VALUES ($1,$2,$3,now()+interval \'10 minutes\')',[randomUUID(),rectUser,createHash("sha256").update(rectToken).digest("hex")]);
  await send("Network.setCookie",{name:"pdmc-session-local",value:rectToken,url:origin,httpOnly:true,sameSite:"Lax"});
  await send("Page.navigate",{url:origin});await contains("Cuenta de rectificación");await contains("Registrar conteo");
  assert.equal(await evaluate('[...document.querySelectorAll("aside button")].some(button=>button.textContent?.includes("Carga de inventario"))'),false);
  await click("Registrar conteo");await contains("Tu acceso de Rectificación permite registrar únicamente el conteo físico");
  assert.equal(await evaluate('Boolean(document.querySelector(\'[aria-label="Conteo físico"]\'))'),true);
  for(const label of ["Estado","Motivo","Documento relacionado","Veredicto","Número de ajuste","Observaciones","Bodega del producto"])assert.equal(await evaluate(`![...document.querySelectorAll('[aria-label]')].some(element=>element.getAttribute('aria-label')===${JSON.stringify(label)})`),true,label);
  await fill("Conteo físico","4");await click("Guardar conteo físico");await contains("Seguimiento guardado en el servidor");
  await send("Network.setCookie",{name:"pdmc-session-local",value:adminSession,url:origin,httpOnly:true,sameSite:"Lax"});
  await send("Page.navigate",{url:origin});await contains("Mi día");await navigation("Negativos");await contains("Nuevo caso de prueba");
  await click("Deshacer consulta");await fill("Motivo de anulación","Archivo equivocado en prueba");await click("Confirmar operación");await contains("Operación guardada");
  await until(()=>evaluate('document.querySelector(\'[data-testid="sidebar-negative-count"]\')?.textContent==="1"'),"El contador lateral no se actualizó al deshacer");
  await until(()=>evaluate("!document.body.innerText.includes('Nuevo caso de prueba')"),"La consulta no se deshizo");
  await click("Gestionar");await contains("Conteo físico");await click("Anular expediente");await fill("Motivo de anulación","Anulación de prueba");await click("Confirmar operación");await contains("Sin negativos en este filtro");
  await fill("Filtrar negativos","anulados");await contains("Negativo conservado de prueba");
  await navigation("Transferencias");
  await contains("Página 1 de");
  await navigation("Inconsistencias");
  assert.ok(await evaluate('document.querySelectorAll("tbody tr").length<=25'),"Inconsistencias no limita las filas visibles");
  await click("Siguiente");await contains("Página 2 de");
  await fill("Buscar inconsistencias","zzzz_sin_resultados_de_prueba");await contains("No hay inconsistencias para esta búsqueda");
  await fill("Buscar inconsistencias","");await contains("Página 1 de");
  await until(()=>evaluate('Boolean(document.querySelector(\'[aria-label="Bodega del producto en inconsistencia"]\') && !document.querySelector(\'[aria-label="Bodega del producto en inconsistencia"]\').disabled)'),"No cargó la ubicación de inconsistencias");
  await fill("Bodega del producto en inconsistencia",physicalWarehouse);
  await until(()=>evaluate('!document.querySelector(\'[aria-label="Bodega del producto en inconsistencia"]\').disabled'),"No terminó de guardar la inconsistencia");
  await send("Page.reload");await contains("Mi día");await navigation("Inconsistencias");
  await until(()=>evaluate(`document.querySelector('[aria-label="Bodega del producto en inconsistencia"]')?.value === ${JSON.stringify(physicalWarehouse)}`),"La bodega de la inconsistencia no persistió");
  await navigation("Transferencias");await contains("Página 1 de");
  await click("Siguiente");
  await contains("Página 2 de");
  await evaluate(`(() => { const input = document.querySelector('input[placeholder^="Buscar transferencia"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ' '); input.dispatchEvent(new Event('input', { bubbles:true })); })()`);
  await contains("Página 1 de");
  for (const section of ["Inconsistencias", "Etiquetado", "Facturación", "Proyectos"]) {
    await navigation(section);
    await sleep(150);
  }
  await contains("Proyecto conservado de prueba");
  await contains("Proyecto añadido en prueba");
  await send("Page.reload");
  await contains("Mi día");
  await navigation("Proyectos");
  await contains("Proyecto añadido en prueba");
  assert.equal(await evaluate('document.querySelector("header").innerText.includes("Cerrar sesión")'),false);
  await navigation("Ajustes de cuenta");await contains("Seguridad de tu cuenta");await contains("Abrir administración");
  await click("Cerrar sesión");await contains("Iniciar sesión");
  assert.equal(await evaluate('fetch("/api/operacion/negativos/lista").then(r=>r.status)'),401);
  }
  // Sesión aislada de tienda: la página no entrega el conjunto nacional ni
  // siquiera en HTML/RSC, y los controles no habilitan importación o ajustes.
  const regionId=randomUUID(),storeId=randomUUID(),storeWarehouse=randomUUID(),storeUser=randomUUID();
  await admin.query('INSERT INTO "Ubicacion" (id,codigo,nombre,tipo) VALUES ($1,$2,$3,\'REGION\')',[regionId,randomUUID(),"Región de navegador"]);
  await admin.query('INSERT INTO "Ubicacion" (id,codigo,nombre,tipo,"regionId") VALUES ($1,$2,$3,\'TIENDA\',$4)',[storeId,randomUUID(),"C.C. CARIBE ZULIA (HECTOR YARCE)",regionId]);
  await admin.query('INSERT INTO "Bodega" (id,codigo,nombre,"ubicacionId","updatedAt") VALUES ($1,$2,$3,$4,now())',[storeWarehouse,randomUUID(),"C.C. CARIBE ZULIA (HECTOR YARCE)",storeId]);
  await admin.query('INSERT INTO "Usuario" (id,email,nombre,estado,"debeCambiarPassword","updatedAt") VALUES ($1,$2,$3,\'ACTIVO\',false,now())',[storeUser,`${randomUUID()}@example.test`,"Cuenta de tienda"]);
  await admin.query('INSERT INTO "AsignacionAcceso" (id,"usuarioId",rol,"ubicacionId") VALUES ($1,$2,\'TIENDA\',$3)',[randomUUID(),storeUser,storeId]);
  const storeProduct=randomUUID();
  await admin.query('INSERT INTO "Producto" (id,"codigoBarra",descripcion,"updatedAt") VALUES ($1,$2,$3,now())',[storeProduct,"6900000000999","Producto para reporte de tienda"]);
  const storeToken=randomBytes(32).toString("base64url");
  await admin.query('INSERT INTO "SesionUsuario" (id,"usuarioId","tokenHash","expiresAt") VALUES ($1,$2,$3,now()+interval \'10 minutes\')',[randomUUID(),storeUser,createHash("sha256").update(storeToken).digest("hex")]);
  const storeHeaders={cookie:`pdmc-session-local=${storeToken}`};
  const storeHtml=await (await fetch(origin,{headers:storeHeaders})).text();
  for(const marker of ["operationalStoreNames","pendingReports","billers","Negativo conservado de prueba"])assert.equal(storeHtml.includes(marker),false,marker);
  const storeRsc=await (await fetch(origin,{headers:{...storeHeaders,RSC:"1"}})).text();
  for(const marker of ["operationalStoreNames","pendingReports","billers"])assert.equal(storeRsc.includes(marker),false,marker);
  assert.equal((await fetch(`${origin}/api/negativos?bodegaId=${bodega.id}`,{headers:storeHeaders})).status,403);
  await send("Network.setCookie",{name:"pdmc-session-local",value:storeToken,url:origin,httpOnly:true,sameSite:"Lax"});
  await send("Page.navigate",{url:origin});await contains("Cuenta de tienda");
  await contains("OPERACIÓN DE TIENDA");await contains("TRANSFERENCIAS PENDIENTES");
  await click("Reportar inconsistencia");await contains("NUEVO REPORTE");
  await fill("Código de barras","6900000000999");await click("Buscar producto");await contains("Producto para reporte de tienda");
  await click("Continuar");await click("Faltante");await click("Continuar");await click("2");await click("Continuar");
  await contains("2 unidades");await click("Enviar reporte");await contains("Últimos reportes");
  assert.equal((await admin.query('SELECT count(*)::int AS total FROM "Inconsistencia" WHERE "reportadoPorId"=$1',[storeUser])).rows[0].total,1);
  await click("Pendientes");await contains("#78749");
  await admin.query('DELETE FROM "AsignacionAcceso" WHERE "usuarioId"=$1',[storeUser]);
  assert.equal(await evaluate('fetch("/api/operacion/negativos/lista").then(r=>r.status)'),403);
  await send("Page.navigate",{url:origin});await contains("Su cuenta no tiene permisos asignados.");
  assert.deepEqual(exceptions, []);
  console.info("Módulo Tienda: inicio, reporte guiado, persistencia, transferencias y revocación correctos.");
  console.info("Sesión 2.1: login, cambio obligatorio, sesión persistente y logout correctos. Regresión 1.3: migración, seguimiento, dos contextos, selección masiva, ordenación, importación y anulación correctos.");
  await send("Browser.close").catch(() => {});
} finally {
  socket?.close();
  control?.close();
  browser?.kill();
  server.kill();
  await sleep(1000);
  if (!profile.startsWith(temporaryRoot + sep) || !/^pdmc-browser-[a-f0-9-]+$/.test(profile.slice(temporaryRoot.length + 1))) throw new Error("Ruta de limpieza fuera del directorio temporal");
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => console.info("El perfil temporal de prueba permanece en tests/e2e/.salida; no contiene datos del usuario."));
  if(!/^pdmc_test_[a-f0-9]{32}$/.test(schema))throw new Error("Esquema de limpieza inválido");
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
}

