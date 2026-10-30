import type {Estado} from "./model";
export function negativeNextAction(estado:Estado,hasCount:boolean){
  if(estado==="SOLUCIONADO"||estado==="CERRADO_SIN_AJUSTE")return "Expediente cerrado. Consulta el historial para revisar la decisión.";
  if(estado==="AJUSTE_REALIZADO")return "El ajuste ya fue registrado. Verifica el resultado y confirma el cierre.";
  if(estado==="AJUSTE_AUTORIZADO")return "Ejecuta el ajuste y registra su número. Después pasará a Listos para cerrar.";
  if(estado==="PENDIENTE_VERIFICAR")return "El código dejó de aparecer en la fotografía. Confirma la causa antes de solucionarlo.";
  if(!hasCount)return "Registra el conteo físico. La investigación conservará el sistema observado al contar.";
  return "Documenta la causa y la decisión. Autoriza el ajuste cuando corresponda o cierra con una solución documentada.";
}
