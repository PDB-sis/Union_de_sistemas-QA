import type {Estado} from "./model";
import {esMotivoNegativo} from "./reasons";

// Ruta del expediente: Contar → Investigar → Corregir → Verificar → Solucionado.
// Los 10 estados históricos se conservan; aquí solo se decide qué cambios son válidos.
export type EtapaNegativo="CONTAR"|"INVESTIGAR"|"CORREGIR"|"VERIFICAR"|"SOLUCIONADO";
export const etapasNegativo:Record<EtapaNegativo,string>={CONTAR:"Contar",INVESTIGAR:"Investigar",CORREGIR:"Corregir",VERIFICAR:"Verificar",SOLUCIONADO:"Solucionado"};

const investigacion:readonly Estado[]=["NUEVO","EN_INVESTIGACION","ESPERANDO_CONTEO","ESPERANDO_DECISION","REABIERTO"];
const cerrados:readonly Estado[]=["SOLUCIONADO","CERRADO_SIN_AJUSTE"];

export function etapaNegativo(estado:Estado,tieneConteo:boolean):EtapaNegativo{
  if(cerrados.includes(estado))return "SOLUCIONADO";
  if(estado==="AJUSTE_REALIZADO"||estado==="PENDIENTE_VERIFICAR")return "VERIFICAR";
  if(estado==="AJUSTE_AUTORIZADO")return "CORREGIR";
  return tieneConteo?"INVESTIGAR":"CONTAR";
}

/** Estados a los que puede pasar un expediente; el propio estado siempre se conserva. */
export function destinosNegativo(estado:Estado,tieneConteo:boolean):Estado[]{
  const mismo=[estado];
  if(cerrados.includes(estado))return [...mismo,"REABIERTO"];
  if(estado==="AJUSTE_REALIZADO")return [...mismo,"SOLUCIONADO","REABIERTO","EN_INVESTIGACION"];
  if(estado==="PENDIENTE_VERIFICAR")return [...mismo,"SOLUCIONADO","CERRADO_SIN_AJUSTE","REABIERTO"];
  if(estado==="AJUSTE_AUTORIZADO")return [...mismo,"AJUSTE_REALIZADO","EN_INVESTIGACION","ESPERANDO_DECISION"];
  const abiertos=investigacion.filter(item=>item!==estado&&item!=="NUEVO"&&item!=="REABIERTO");
  return tieneConteo?[...mismo,...abiertos,"AJUSTE_AUTORIZADO","CERRADO_SIN_AJUSTE"]:[...mismo,...abiertos];
}

export type CambioNegativo={
  antes:{estado:Estado;conteoFisico:string|null};
  despues:{estado:Estado;conteoFisico:string|null;motivo:string;numeroAjuste:string;observaciones:string};
};

/** Devuelve el motivo del rechazo o null si el cambio de estado es válido. */
export function validarCambioNegativo({antes,despues}:CambioNegativo):string|null{
  if(antes.estado===despues.estado)return null;
  const tieneConteo=Boolean(despues.conteoFisico);
  if(!destinosNegativo(antes.estado,Boolean(antes.conteoFisico)||tieneConteo).includes(despues.estado))
    return "Ese cambio no corresponde a la etapa del expediente. Siga la ruta Contar → Investigar → Corregir → Verificar.";
  if(cerrados.includes(antes.estado)&&!despues.observaciones.trim())return "Explique en observaciones por qué se reabre el expediente.";
  if(despues.estado==="AJUSTE_AUTORIZADO"||despues.estado==="AJUSTE_REALIZADO"){
    if(!tieneConteo)return "Registre el conteo físico antes de aprobar o ejecutar un ajuste.";
    if(!esMotivoNegativo(despues.motivo))return "Seleccione la causa del negativo antes de aprobar el ajuste.";
  }
  if(despues.estado==="AJUSTE_REALIZADO"&&!despues.numeroAjuste.trim())return "Indique el número de ajuste antes de marcar el caso como ajustado.";
  if(despues.estado==="CERRADO_SIN_AJUSTE"&&!despues.motivo.trim())return "Indique la causa antes de cerrar sin ajuste.";
  if(despues.estado==="SOLUCIONADO"&&antes.estado==="PENDIENTE_VERIFICAR"&&!despues.motivo.trim()&&!despues.observaciones.trim())
    return "El producto dejó de estar negativo sin una corrección registrada: documente la causa antes de solucionarlo.";
  return null;
}

export type VerificacionNegativo={puedeCerrar:boolean;mensaje:string};

/**
 * Evidencia para cerrar un ajuste: el inventario vigente debe ser posterior al ajuste
 * y el producto ya no debe estar negativo. Que el caso desaparezca no lo soluciona.
 */
export function verificarAjusteNegativo({ajusteAt,inventarioAt,existencia}:{ajusteAt:Date|null;inventarioAt:Date|null;existencia:string|null}):VerificacionNegativo{
  if(!inventarioAt)return {puedeCerrar:false,mensaje:"No hay inventario vigente para verificar el ajuste."};
  if(ajusteAt&&inventarioAt<=ajusteAt)return {puedeCerrar:false,mensaje:"El inventario vigente es anterior al ajuste. Espere la próxima actualización para verificarlo."};
  const cantidad=Number(existencia??"0");
  if(cantidad<0)return {puedeCerrar:false,mensaje:`Sigue en ${existencia} en el inventario vigente. Reabra la investigación.`};
  return {puedeCerrar:true,mensaje:"Ya no aparece negativo en el inventario vigente."};
}
