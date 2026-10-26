import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";

// Runs inside the isolated PostgreSQL schema and Edge profile of interfaz.browser.
export async function checkAdministration({send,evaluate,click,fill,contains,until,origin}) {
  const prefix=`admin-browser-${randomUUID()}`,email=`${prefix}@example.test`,temporary=randomBytes(24).toString("base64url");
  const fillLabel=async(label,value)=>{
    await until(()=>evaluate(`[...document.querySelectorAll('[role="dialog"] label')].some(l=>l.textContent.startsWith(${JSON.stringify(label)})&&l.querySelector('input'))`),`Campo administrativo no disponible: ${label}`);
    await evaluate(`(()=>{const el=[...document.querySelectorAll('[role="dialog"] label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)})).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  };
  const rowAction=async(label)=>{
    await until(()=>evaluate(`[...document.querySelectorAll('tr')].some(r=>r.textContent.includes(${JSON.stringify(email)})&&[...r.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)}))`),`Acción de usuario no disponible: ${label}`);
    await evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(${JSON.stringify(email)}));[...row.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()})()`);
  };
  const waitOptions=label=>until(()=>evaluate(`document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']')?.options.length>1`),`Opciones no cargadas: ${label}`);
  const confirm=()=>evaluate(`document.querySelector('[role="dialog"] input[type=checkbox]').click()`);
  await send("Page.navigate",{url:`${origin}/administracion`});await contains("Usuarios y accesos");
  await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Crear usuario'&&Object.keys(b).some(k=>k.startsWith('__reactProps$')))"),"Administración no se hidrató");
  await click("Crear usuario");await fillLabel("Nombre",prefix);await fillLabel("Usuario de acceso",email);await fillLabel("Contraseña temporal",temporary);await fill("Rol a asignar","ADMINISTRADOR");await click("Agregar rol");await fillLabel("Motivo del cambio","Alta para comprobar administración");await click("Guardar usuario");await contains("Operación guardada");await contains(email);
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(temporary)})`),false);
  const users=await evaluate(`fetch('/api/admin/usuarios?q='+encodeURIComponent(${JSON.stringify(email)})).then(r=>r.json())`);
  assert.equal(users.data.total,1);assert.equal("passwordHash" in users.data.rows[0],false);assert.equal("passwordTemporal" in users.data.rows[0],false);
  await rowAction("Editar");assert.equal(await evaluate("document.querySelectorAll('[role=dialog] input[type=password]').length"),0);await fillLabel("Nombre",`${prefix} editado`);await fillLabel("Motivo del cambio","Corregir nombre visible de prueba");await click("Guardar usuario");await contains(`${prefix} editado`);
  await rowAction("Bloquear");await fillLabel("Motivo","Bloqueo confirmado de prueba");await confirm();await click("Bloquear usuario");await contains("BLOQUEADO");
  await rowAction("Reactivar");await fillLabel("Motivo","Reactivación confirmada de prueba");await confirm();await click("Reactivar usuario");
  await until(()=>evaluate(`[...document.querySelectorAll('tr')].some(r=>r.textContent.includes(${JSON.stringify(email)})&&r.textContent.includes('INVITADO'))`),"No se reactivó el invitado");
  await rowAction("Restablecer clave");const replacement=randomBytes(24).toString("base64url");await fillLabel("Nueva contraseña temporal",replacement);await fillLabel("Motivo","Restablecimiento confirmado de prueba");await confirm();await click("Restablecer contraseña");await until(()=>evaluate("!document.querySelector('[role=dialog]')"),"No terminó el restablecimiento");
  await click("Regiones y entidades");await click("Crear entidad");await fill("Tipo de entidad","REGION");await fillLabel("Código único",`${prefix}-region`);await fillLabel("Nombre",`${prefix} región`);await fillLabel("Motivo","Crear región operativa de prueba");await click("Crear entidad");await contains(`${prefix} región`);
  const region=await evaluate(`fetch('/api/admin/entidades?q='+encodeURIComponent(${JSON.stringify(prefix)})).then(r=>r.json()).then(r=>r.data.rows.find(e=>e.tipo==='REGION').id)`);
  await click("Crear entidad");await fill("Tipo de entidad","TIENDA");await fillLabel("Código único",`${prefix}-tienda`);await fillLabel("Nombre",`${prefix} tienda`);await waitOptions("Región");await fill("Región",region);await fillLabel("Motivo","Crear tienda operativa de prueba");await click("Crear entidad");await contains(`${prefix} tienda`);
  const store=await evaluate(`fetch('/api/admin/entidades?q='+encodeURIComponent(${JSON.stringify(prefix)})).then(r=>r.json()).then(r=>r.data.rows.find(e=>e.tipo==='TIENDA').id)`);
  await click("Usuarios y accesos");await fill("Buscar usuarios",email);await contains(email);await rowAction("Editar");await click("Quitar");await waitOptions("Tienda");await fill("Tienda",store);await click("Vincular cuenta de tienda");await fillLabel("Motivo del cambio","Asignar rol y alcance de tienda");await click("Guardar usuario");await contains(`${prefix} tienda`);
  await send("Page.reload");await contains("Usuarios y accesos");await fill("Buscar usuarios",email);await contains(`${prefix} tienda`);
  await click("Auditoría");await until(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Antes / después')"),"No cargó auditoría");await click("Antes / después");await contains("Detalle de auditoría");assert.equal(await evaluate("document.querySelector('[role=dialog]').innerText.includes('passwordHash')"),false);await click("Cerrar");
  const screenshot=await send("Page.captureScreenshot",{format:"png"});await writeFile(".next/admin-sesion-2-3.png",Buffer.from(screenshot.data,"base64"));
  console.info("Administración en navegador: alta, edición, bloqueo/reactivación, restablecimiento, entidades territoriales, alcance persistente y auditoría: OK.");
  await send("Page.navigate",{url:origin});await contains("Mi día");
}
