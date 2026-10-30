import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {canonicalOption} from '@pdmc/contratos/inconsistencias/option-value';
import {FORMAS_CORRECCION,MOTIVOS} from '@pdmc/contratos/inconsistencias/options';
import {editSchema} from '../src/inconsistencias/service.ts';
import {adjustmentFromCount,bulkInconsistencySchema} from '@pdmc/contratos/inconsistencias/bulk';
import {updateInconsistencySelection} from '@pdmc/contratos/inconsistencias/selection';

test('los catálogos normalizan valores vigentes y rechazan motivos inventados',()=>{
  assert.equal(canonicalOption('Diferencia de conteo confirmada',MOTIVOS),'Diferencia de conteo confirmada');
  assert.equal(canonicalOption('Ajuste de inventario',FORMAS_CORRECCION),'Ajuste de inventario');
  const payload={id:randomUUID(),version:1,conteoFisico:10,motivo:'Diferencia de conteo confirmada',responsable:'FACTURACION',comentarioAdmin:null,formaCorreccion:'Ajuste de inventario',numeroCorreccion:null,unidadesAjustadas:0,unidadesSinResolver:1,resuelto:false,ajustar:'',cantidadAjuste:null,numeroAjuste:null,veredicto:'',ajustado:false};
  const result=editSchema.parse(payload);
  assert.equal(result.motivo,'Diferencia de conteo confirmada');
  assert.equal(result.responsable,'FACTURACION');
  assert.equal(result.formaCorreccion,'Ajuste de inventario');
  const empty=editSchema.parse({...payload,motivo:null,formaCorreccion:null,ajustar:null,veredicto:null});
  assert.equal(empty.motivo,null);
  assert.equal(empty.formaCorreccion,null);
  assert.equal(editSchema.safeParse({...payload,motivo:'Motivo inventado'}).success,false);
  assert.equal(editSchema.safeParse({...payload,responsable:'INVENTADO'}).success,false);
});

test('lote valida acción, casos únicos y número de ajuste solo cuando corresponde',()=>{
  const cases=[{id:randomUUID(),version:1},{id:randomUUID(),version:2}];
  const followup=bulkInconsistencySchema.parse({cases,action:'seguimiento',comentarioAdmin:'Investigación común'});
  assert.equal(followup.action,'seguimiento');
  assert.equal(bulkInconsistencySchema.safeParse({cases,action:'resolver'}).success,false);
  assert.equal(bulkInconsistencySchema.safeParse({cases,action:'ajustar',numeroAjuste:''}).success,false);
  assert.equal(bulkInconsistencySchema.safeParse({cases,action:'resolver',motivo:'Diferencia de conteo confirmada',numeroAjuste:'A-1'}).success,false);
  assert.equal(bulkInconsistencySchema.safeParse({cases:[cases[0],cases[0]],action:'resolver',motivo:'Diferencia de conteo confirmada'}).success,false);
  assert.equal(bulkInconsistencySchema.parse({cases,action:'resolver',motivo:'Diferencia de conteo confirmada'}).motivo,'Diferencia de conteo confirmada');
});

test('ajuste masivo calcula cada cantidad y sentido por separado',()=>{
  assert.deepEqual(adjustmentFromCount(12,10),{quantity:2,type:'Positivo',verdict:'AJUSTE POSITIVO POR SOBRANTE FÍSICO CONFIRMADO'});
  assert.deepEqual(adjustmentFromCount(6,10),{quantity:4,type:'Negativo',verdict:'AJUSTE NEGATIVO POR FALTANTE FÍSICO CONFIRMADO'});
  assert.equal(adjustmentFromCount(null,10),null);
  assert.equal(adjustmentFromCount(10,10),null);
  assert.equal(adjustmentFromCount(10,10.5),null);
});

test('selección masiva conserva páginas y solo admite pendientes del mismo tipo',()=>{
  const a={id:'a',tipoError:'Faltante físico',resuelto:false};
  const b={id:'b',tipoError:'Faltante físico',resuelto:false};
  const other={id:'c',tipoError:'Sobrante físico',resuelto:false};
  const closed={id:'d',tipoError:'Faltante físico',resuelto:true};
  const first=updateInconsistencySelection({},[a,other,closed],true);
  assert.deepEqual(Object.keys(first),['a']);
  const second=updateInconsistencySelection(first,[b],true);
  assert.deepEqual(Object.keys(second),['a','b']);
  assert.deepEqual(Object.keys(updateInconsistencySelection(second,[b],false)),['a']);
  assert.deepEqual(Object.keys(updateInconsistencySelection(first,[b],true,1)),['a']);
});
