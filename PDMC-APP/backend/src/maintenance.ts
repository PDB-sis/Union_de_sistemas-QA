import {NegativosError} from "./negativos/validation";
const runtime=globalThis as unknown as {pdmcMaintenance?:{active:number;resetting:boolean}};
function state(){return runtime.pdmcMaintenance??=( {active:0,resetting:false} );}
export function enterApiRequest(){
  const current=state();
  if(current.resetting)throw new NegativosError(503,"MANTENIMIENTO","El administrador está restableciendo PDMC. Espere a que termine.");
  current.active++;
  return ()=>{current.active--};
}
export async function resetMaintenance<T>(action:()=>Promise<T>){
  const current=state();
  if(current.resetting||current.active>1)throw new NegativosError(409,"SISTEMA_OCUPADO","Hay operaciones en curso. Espere a que terminen antes de restablecer.");
  current.resetting=true;
  try{return await action()}finally{current.resetting=false}
}
