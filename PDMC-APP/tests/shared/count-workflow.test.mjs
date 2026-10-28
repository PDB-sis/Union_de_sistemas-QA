import assert from 'node:assert/strict';
import test from 'node:test';
import {countVisibility,countWorkflow} from '../../shared/workflow/count-routing.ts';

test('Rectificación recibe pendientes y gestión recibe únicamente casos contados',()=>{
  assert.equal(countWorkflow(true,false),'conteo');
  assert.deepEqual(countVisibility('conteo'),{conteoFisico:null});
  for(const permissions of [[false,true],[true,true],[false,false]]){
    assert.equal(countWorkflow(...permissions),'gestion');
    assert.deepEqual(countVisibility('gestion'),{conteoFisico:{not:null}});
  }
});
