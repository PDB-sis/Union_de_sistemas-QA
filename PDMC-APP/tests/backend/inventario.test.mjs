import {test} from "node:test";
import assert from "node:assert/strict";
import {validateInventory} from "../../backend/src/inventario/service.ts";

const base={nombreArchivo:"inventario.csv",fechaConsulta:"2026-09-15",contenido:"Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea\n1;=\"000123\";R1;Zapato;15;Dama;Calzado\n0;000124;R2;Cartera;-2;Dama;Accesorios"};
test("inventario conserva códigos, deriva la bodega de línea y valida estado",()=>{
  const result=validateInventory(base);
  assert.equal(result.summary.aceptados,2);assert.equal(result.rows[0].codigoBarra,"000123");assert.equal(result.rows[0].bodega,"Calzado");assert.equal(result.rows[1].activo,false);
  const invalid=validateInventory({...base,contenido:base.contenido.replace("\n1;","\nTal vez;")});
  assert.equal(invalid.summary.rechazados,1);assert.equal(invalid.summary.errores[0].campo,"Estado");
});

test("inventario acepta comillas literales dentro de descripciones exportadas por SQL",()=>{
  const input={...base,contenido:'Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea\n1;CTYFGUYGIHLKK;328;328 YOYI"S VESTIDO DE NIÑA;0,00;UNISEX;UNISEX'};
  const result=validateInventory(input);
  assert.equal(result.summary.rechazados,0);
  assert.equal(result.rows[0].descripcion,'328 YOYI"S VESTIDO DE NIÑA');
});

test("inventario elimina el envoltorio de Excel en todos los textos del producto",()=>{
  const result=validateInventory({...base,contenido:'Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea;Marca\n1;="000125";="R3";="Producto limpio";2;="Dama";="Calzado";="Marca limpia"'});
  assert.deepEqual({...result.rows[0],fila:undefined,bodega:undefined,existencia:undefined,activo:undefined},{fila:undefined,codigoBarra:"000125",referencia:"R3",descripcion:"Producto limpio",existencia:undefined,activo:undefined,categoria:"Dama",linea:"Calzado",marca:"Marca limpia",bodega:undefined});
});
test("inventario rechaza duplicados por código y bodega",()=>{
  const duplicate=validateInventory({...base,contenido:base.contenido+"\n1;000123;R1;Zapato;8;Dama;Calzado"});
  assert.equal(duplicate.summary.rechazados,2);
  assert.ok(duplicate.summary.errores.every(e=>e.campo==="CodigoBarra/Linea"));
});

test("inventario rechaza filas sin línea y no las fuerza como válidas",()=>{
  const input={...base,contenido:"Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea\n1;000999;R9;Producto sin línea;2;Dama;"};
  const result=validateInventory(input);
  assert.equal(result.summary.aceptados,0);
  assert.equal(result.summary.rechazados,1);
  assert.equal(result.summary.errores.some(error=>error.campo==="Linea"),true);
});


test("inventario conserva la marca nueva y admite archivos anteriores sin esa columna",()=>{
  const current=validateInventory({...base,contenido:"Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea;Marca\n1;000777;R7;Producto con marca;4;Dama;Calzado;Marca real"});
  assert.equal(current.summary.rechazados,0);
  assert.equal(current.rows[0].marca,"Marca real");
  assert.equal(validateInventory(base).rows[0].marca,"");
  const tooLong="M".repeat(201),invalid=validateInventory({...base,contenido:`Estado;CodigoBarra;Referencia;Descripcion;Existencia;Categoria;Linea;Marca\n1;000778;R8;Producto;4;Dama;Calzado;${tooLong}`});
  assert.equal(invalid.summary.errores.some(error=>error.campo==="Marca"),true);
});
