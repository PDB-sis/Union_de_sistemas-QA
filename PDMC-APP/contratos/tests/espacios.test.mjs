import test from "node:test";
import assert from "node:assert/strict";
import {espacios,espaciosDe,permisoDeSeccion,rutaDeRol} from "../src/auth/espacios.ts";
import {permissionMatrix} from "../src/auth/permissions.ts";
import {roles} from "../src/auth/model.ts";

test("cada espacio ofrece solo secciones que su rol puede abrir, y siempre su Mi día",()=>{
  for(const [id,espacio] of Object.entries(espacios)){
    assert.equal(espacio.secciones[0],"hoy",`${id} empieza en Mi día`);
    assert.equal(espacio.ruta,`/${id}`);
    for(const seccion of espacio.secciones){
      const permiso=permisoDeSeccion[seccion];
      if(permiso)assert.ok(permissionMatrix[espacio.rol].includes(permiso),`${id} ofrece ${seccion} sin ${permiso}`);
    }
  }
});

test("cada rol tiene su dirección y los roles operativos su propio espacio",()=>{
  for(const rol of Object.keys(roles))assert.ok(rutaDeRol[rol],`Falta la dirección de ${rol}`);
  assert.deepEqual(espaciosDe(["JEFE_BODEGA","RECTIFICACION"]),["jefe-bodega","rectificacion"]);
  assert.deepEqual(espaciosDe(["TIENDA"]),[]);
  assert.equal(new Set(Object.values(espacios).map(e=>e.rol)).size,Object.keys(espacios).length);
});
