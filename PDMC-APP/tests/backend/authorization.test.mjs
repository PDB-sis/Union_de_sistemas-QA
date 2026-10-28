import {test} from "node:test";
import assert from "node:assert/strict";
import {allows,allowsGeneralNegatives,hasPermission} from "../../shared/auth/permissions.ts";
import {assignmentsSchema} from "../../backend/src/auth/access-management.ts";
const grant=(rol,ubicacionId=null,tipo="TIENDA")=>({rol,ubicacionId,ubicacion:ubicacionId?{tipo}:null});
test("denegación por defecto, ámbito nacional explícito y combinación sin producto cruzado",()=>{
  assert.equal(allows([],"negativos.leer"),false);
  const grants=[grant("AUDITORIA"),grant("RECTIFICACION","A")];
  assert.equal(allows(grants,"negativos.leer",{id:"B",regionId:"R"}),true);
  assert.equal(allows(grants,"negativos.conteo",{id:"A",regionId:"R"}),true);
  assert.equal(allows(grants,"negativos.ajustar",{id:"A",regionId:"R"}),false);
  assert.equal(allows(grants,"negativos.ajustar",{id:"B",regionId:"R"}),false);
  assert.equal(allows(grants,"negativos.ajustar"),false);
  assert.equal(hasPermission(grants,"negativos.conteo"),true);
  assert.equal(allows([grant("TIENDA","R","REGION")],"negativos.leer",{id:"A",regionId:"R"}),true);
  assert.equal(allows([grant("TIENDA","R","TIENDA")],"negativos.leer",{id:"A",regionId:"R"}),false);
  assert.equal(allows([grant("DESCONOCIDO")],"negativos.leer"),false);
});

test("Mejora Continua regional puede accionar la bodega general de negativos",()=>{
  const regional=[grant("MEJORA_CONTINUA","R","REGION")];
  assert.equal(allowsGeneralNegatives(regional,"negativos.editar"),true);
  assert.equal(allowsGeneralNegatives(regional,"negativos.estado"),true);
  assert.equal(allowsGeneralNegatives(regional,"negativos.aprobar"),true);
  assert.equal(allowsGeneralNegatives(regional,"negativos.ajustar"),true);
  assert.equal(allowsGeneralNegatives([grant("RECTIFICACION","R","REGION")],"negativos.editar"),false);
  assert.equal(allowsGeneralNegatives(regional,"inconsistencias.editar"),false);
});
test("asignaciones requieren rol válido y alcance explícito; rechazan duplicados",()=>{
  assert.throws(()=>assignmentsSchema.parse([{rol:"TIENDA"}]));
  assert.throws(()=>assignmentsSchema.parse([{rol:"ROOT",ubicacionCodigo:null}]));
  assert.throws(()=>assignmentsSchema.parse([{rol:"TIENDA",ubicacionCodigo:"A"},{rol:"TIENDA",ubicacionCodigo:"A"}]));
  assert.equal(assignmentsSchema.parse([{rol:"TIENDA",ubicacionCodigo:"A"},{rol:"TIENDA",ubicacionCodigo:"B"}]).length,2);
});
