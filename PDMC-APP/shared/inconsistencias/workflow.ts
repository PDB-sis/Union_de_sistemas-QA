// Ruta: Pendiente de conteo → Investigación → Corrección pendiente → Verificación → Solucionado.
// Registrar una corrección no la verifica, y no se cierra un caso con unidades pendientes.
export type OperationalCase={
  resuelto:boolean;conteoFisico:number|null;existenciaSistemaConteo?:number|null;cantidadErrada?:number;
  ajustado:boolean;correccionEjecutada?:boolean;formaCorreccion:string|null;numeroAjuste:string|null;numeroCorreccion?:string|null;
  responsable?:string;unidadesAjustadas?:number;unidadesSinResolver:number;
};
export const SIN_CORRECCION="Sin corrección: inventario correcto";
export const CORRECCION_EXTERNA="Pendiente de acción externa";
export const AJUSTE_INVENTARIO="Ajuste de inventario";

/** Formas que exigen registrar su ejecución (con número) antes de verificar y cerrar. */
export const requiereEjecucion=(forma:string|null)=>Boolean(forma)&&forma!==SIN_CORRECCION&&forma!==CORRECCION_EXTERNA;
export const correccionRegistrada=(value:Pick<OperationalCase,"ajustado"|"correccionEjecutada">)=>value.ajustado||Boolean(value.correccionEjecutada);

/** Unidades sin resolver: diferencia del conteo contra el sistema (o lo reportado) menos lo corregido. */
export function unidadesPendientes(value:Pick<OperationalCase,"conteoFisico"|"existenciaSistemaConteo"|"cantidadErrada"|"unidadesAjustadas"|"unidadesSinResolver">){
  const base=value.conteoFisico!==null&&value.existenciaSistemaConteo!==null&&value.existenciaSistemaConteo!==undefined
    ? Math.abs(value.conteoFisico-value.existenciaSistemaConteo)
    : value.cantidadErrada??value.unidadesSinResolver;
  return Math.max(0,base-(value.unidadesAjustadas??0));
}

export function inconsistencyStage(value:OperationalCase){
  if(value.resuelto)return "cerrados";
  if(value.conteoFisico===null)return "pendientes";
  if(correccionRegistrada(value)||value.formaCorreccion===SIN_CORRECCION)return "verificar";
  if(value.formaCorreccion)return "corregir";
  return "gestion";
}
export const stageLabels={pendientes:"Pendiente de conteo",gestion:"En investigación",corregir:"Corrección pendiente",verificar:"Por verificar",cerrados:"Solucionado"} as const;

export function closureIssue(value:OperationalCase){
  if(!value.resuelto)return null;
  if(value.conteoFisico===null)return "Registre el conteo físico antes de cerrar el caso.";
  if(!value.formaCorreccion)return "Indique cómo se corrigió antes de cerrar el caso.";
  if(value.formaCorreccion===CORRECCION_EXTERNA)return "Confirme la acción externa realizada antes de cerrar el caso.";
  if(value.formaCorreccion!==SIN_CORRECCION&&(!value.responsable||value.responsable==="SIN_DETERMINAR"))return "Determine el responsable antes de cerrar el caso.";
  if(value.formaCorreccion===AJUSTE_INVENTARIO&&(!value.ajustado||!value.numeroAjuste?.trim()))return "Registre el ajuste ejecutado y su número antes de cerrar el caso.";
  if(requiereEjecucion(value.formaCorreccion)&&value.formaCorreccion!==AJUSTE_INVENTARIO&&(!value.correccionEjecutada||!value.numeroCorreccion?.trim()))return "Registre la corrección ejecutada y su número antes de cerrar el caso.";
  const pendientes=unidadesPendientes(value);
  if(pendientes>0)return `El caso todavía tiene ${pendientes} unidad${pendientes===1?"":"es"} sin resolver.`;
  return null;
}
