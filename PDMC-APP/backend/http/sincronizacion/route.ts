import {endpoint} from "@backend/negativos/http";
import {getDb} from "@backend/db";
import {NegativosError} from "@backend/negativos/validation";
import {ejecutarModulo} from "@backend/sync/ejecutar";
import {modulos,type ModuloId} from "@backend/sync/modulos";
import {sqlServerSyncEnabled} from "@backend/sync/sqlserver";
import type {Permission} from "@shared/auth/permissions";

// Mismo permiso que exigía la antigua carga manual de cada módulo.
const permisos:Record<ModuloId,Permission>={SUCURSALES:"ubicaciones.administrar",FACTURADORES:"usuarios.administrar",TRANSFERENCIAS:"transferencias.importar",DEVOLUCIONES:"devoluciones.importar",INVENTARIO:"inventario.administrar"};

export async function GET(request:Request){return endpoint(request,async(_,access)=>{
  await access.grants();
  const estados=await getDb().sincronizacionEstado.findMany({select:{modulo:true,ultimoExitoEn:true,ultimoIntentoEn:true,ultimoError:true}});
  return {activa:sqlServerSyncEnabled(),estados};
});}

/**
 * Botón "Actualizar": ejecuta ahora la consulta del módulo en SQL Server.
 * ?publicar=1 (solo inventario) publica además la fotografía de negativos.
 */
export async function POST(request:Request){return endpoint(request,async(_,access)=>{
  const url=new URL(request.url),id=url.searchParams.get("modulo"),modulo=modulos.find(item=>item.id===id),publicarNegativos=url.searchParams.get("publicar")==="1";
  if(!modulo)throw new NegativosError(404,"MODULO","Módulo de sincronización desconocido.");
  if(publicarNegativos&&modulo.id!=="INVENTARIO")throw new NegativosError(422,"PUBLICAR","Solo el inventario publica fotografías de negativos.");
  await access.national(permisos[modulo.id]);
  if(!sqlServerSyncEnabled())throw new NegativosError(409,"DESACTIVADA","Las consultas a SQL Server están desactivadas (PDMC_SQLSERVER_ENABLED).");
  const result=await ejecutarModulo(getDb(),modulo,{publicarNegativos});
  if(result.estado==="OMITIDA")throw new NegativosError(409,"EN_CURSO","Ya se está actualizando. Intente de nuevo en unos minutos.");
  if(result.estado==="FALLIDA")throw new NegativosError(502,"SQL_SERVER",result.error);
  return {estado:result.estado,totalFilas:result.totalFilas};
});}
