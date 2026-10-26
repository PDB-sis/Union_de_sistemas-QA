export type OperationalCase={resuelto:boolean;conteoFisico:number|null;ajustado:boolean;formaCorreccion:string|null;numeroAjuste:string|null;unidadesSinResolver:number};
export function inconsistencyStage(value:OperationalCase){
  if(value.resuelto)return "cerrados";
  if(value.conteoFisico===null)return "pendientes";
  if(value.ajustado)return "verificar";
  if(value.formaCorreccion)return "corregir";
  return "gestion";
}
export const stageLabels={pendientes:"Pendiente de conteo",gestion:"En investigación",corregir:"Corrección pendiente",verificar:"Por verificar",cerrados:"Solucionado"} as const;
export function closureIssue(value:OperationalCase){
  if(!value.resuelto)return null;
  if(value.conteoFisico===null)return "Registre el conteo físico antes de cerrar el caso.";
  if(value.unidadesSinResolver>0)return "El caso todavía tiene unidades sin resolver.";
  if(value.formaCorreccion==="Pendiente de acción externa")return "Confirme la acción externa realizada antes de cerrar el caso.";
  if(value.formaCorreccion==="Ajuste de inventario"&&(!value.ajustado||!value.numeroAjuste?.trim()))return "Registre el ajuste ejecutado y su número antes de cerrar el caso.";
  return null;
}
