import {endpoint} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {NegativosError} from "@backend/negativos/validation";
import {ejecutarModulo} from "@backend/sync/ejecutar";
import {modulos,type ModuloId} from "@backend/sync/modulos";
import {sqlServerSyncEnabled} from "@backend/sync/sqlserver";
import {consultasDesde,restablecimientoPendiente} from "@backend/admin/reset";
import type {Permission} from "@pdmc/contratos/auth/permissions";

// Mismo permiso que exigía la antigua carga manual de cada módulo.
const permisos:Record<ModuloId,Permission>={SUCURSALES:"ubicaciones.administrar",FACTURADORES:"usuarios.administrar",TRANSFERENCIAS:"transferencias.importar",DEVOLUCIONES:"devoluciones.importar",INVENTARIO:"inventario.administrar"};

export async function GET(request:Request){return endpoint(request,async(_,access)=>{
  await access.grants();
  const [estados,desde,pausada]=await Promise.all([getDb().sincronizacionEstado.findMany({select:{modulo:true,ultimoExitoEn:true,ultimoIntentoEn:true,ultimoError:true}}),consultasDesde(getDb()),restablecimientoPendiente(getDb())]);
  // desde: día del último restablecimiento; las consultas con fecha solo traen desde ese día.
  return {activa:sqlServerSyncEnabled(),estados,desde:desde?.toISOString().slice(0,10)??null,pausada};
});}

/**
 * Botón "Actualizar ahora": ejecuta el módulo desde su fuente (agentes o SQL Server).
 * ?publicar=1 (solo inventario) publica además la fotografía de negativos.
 */
export async function POST(request:Request){return endpoint(request,async(_,access)=>{
  const url=new URL(request.url),id=url.searchParams.get("modulo"),modulo=modulos.find(item=>item.id===id),publicarNegativos=url.searchParams.get("publicar")==="1";
  if(!modulo)throw new NegativosError(404,"MODULO","Módulo de sincronización desconocido.");
  if(publicarNegativos&&modulo.id!=="INVENTARIO")throw new NegativosError(422,"PUBLICAR","Solo el inventario publica fotografías de negativos.");
  // El permiso viene del rol (el mismo que muestra el módulo), no de tener alcance nacional:
  // un usuario de Mejora Continua asignado a una región también puede actualizar.
  await access.permitted(permisos[modulo.id]);
  if(modulo.fuente.tipo==="SQLSERVER"&&!sqlServerSyncEnabled())throw new NegativosError(409,"DESACTIVADA","Las consultas a SQL Server están desactivadas (PDMC_SQLSERVER_ENABLED).");
  const result=await ejecutarModulo(getDb(),modulo,{publicarNegativos});
  if(result.estado==="PAUSADA")throw new NegativosError(409,"RESTABLECIMIENTO","Hay un restablecimiento del proyecto en preparación: las actualizaciones están en pausa hasta que se confirme o venza (máximo 10 minutos).");
  if(result.estado==="OMITIDA")throw new NegativosError(409,"EN_CURSO","Ya se está actualizando. Intente de nuevo en unos minutos.");
  if(result.estado==="FALLIDA")throw new NegativosError(502,"SINCRONIZACION",result.error);
  return {estado:result.estado,totalFilas:result.totalFilas};
});}
