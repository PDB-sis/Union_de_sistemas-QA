import type { UsuarioSesion } from "@pdmc/contratos/auth/model";
import type { PanelFacturador, PanelInicio } from "@pdmc/contratos/panel";
import type {DashboardData} from "@pdmc/contratos/dashboard-contract";
import { dashboardData } from "./dashboard-data";
import { Authorization } from "@backend/auth/authorization";
import { getDb } from "@backend/db";
import type { PrismaClient } from "../../generated/prisma/client";
import { allows, permissions } from "@pdmc/contratos/auth/permissions";
import { hasPermission } from "@pdmc/contratos/auth/permissions";
import { transferDashboardData } from "@backend/transferencias/consulta";
import { StoreService } from "@backend/tienda/service";

// Datos iniciales de cada espacio. Los sirve GET /api/panel (src/http/panel/route.ts);
// el frontend decide la navegación con la respuesta (redirigir, acceso restringido, etc.).
export async function loadAdministration(user:UsuarioSesion){
  const grants=await new Authorization(getDb(),user.id).grants();
  return {user,canManage:allows(grants,"usuarios.administrar"),canAudit:hasPermission(grants,"auditoria.leer")};
}
export async function loadStore(user:UsuarioSesion){
  const db=getDb(),access=new Authorization(db,user.id);
  await access.permitted("tienda.panel");
  return {user,initialData:await new StoreService(db,access).dashboard()};
}

export async function loadDashboard(user:UsuarioSesion):Promise<PanelInicio> {
  const access = new Authorization(getDb(),user.id);
  const grants = await access.grants();
  if(grants.some(grant=>grant.rol==="ADMINISTRADOR"&&grant.ubicacionId===null))return {redirigir:"/administracion"};
  if (hasPermission(grants,"tienda.panel") && !hasPermission(grants,"panel.leer")) return {redirigir:"/tienda"};
  if (hasPermission(grants,"facturacion.propio") && !hasPermission(grants,"panel.leer")) return {redirigir:"/facturador"};
  const available = permissions.filter(p=>hasPermission(grants,p));
  const national = permissions.filter(p=>allows(grants,p));
  const locations = await getDb().bodega.findMany({where:{activa:true},select:{id:true,codigo:true,ubicacion:{select:{id:true,regionId:true}}}});
  const general = new Set<string>();for(const p of permissions)if(await access.allowsGeneral(grants,p))general.add(p);
  const warehouses = Object.fromEntries(locations.flatMap(b=>{
    const enabled=permissions.filter(p=>b.codigo==="PDMC_GENERAL"?general.has(p):Boolean(b.ubicacion&&allows(grants,p,b.ubicacion)));
    return enabled.length?[[b.id,enabled]]:[];
  }));
  let data:DashboardData|null=null;
  if(hasPermission(grants,"panel.leer")){
    const baseData=dashboardData as unknown as DashboardData;
    const storeScope=await access.locationScope("panel.leer","TIENDA");
    const storeIds=storeScope.rows.map(store=>store.id);
    const billerProfiles=user.rol==="FACTURACION"?await getDb().perfilLaboral.findMany({where:{tipo:"FACTURACION",activo:true,vinculos:{some:{usuarioId:user.id}}},select:{id:true,nombre:true},orderBy:{nombre:"asc"}}):undefined;
    const allowedBillers=billerProfiles?.map(profile=>profile.nombre),allowedBillerIds=billerProfiles?.map(profile=>profile.id);
    const allowedTransfers=await getDb().transferenciaConsulta.findMany({where:{bajaEn:null,...(storeScope.national?{}:{tiendaId:{in:storeIds}}),...(allowedBillerIds?{facturadorId:{in:allowedBillerIds}}:{})},select:{numero:true}});
    const transferNumbers=new Set(allowedTransfers.map(row=>row.numero));
    const rawIssues=await getDb().inconsistencia.findMany({where:{responsable:"FACTURACION",transferencia:{in:[...transferNumbers]},...(storeScope.national?{}:{tiendaId:{in:storeIds}})},select:{fecha:true,sucursal:true,transferencia:true,cantidadErrada:true,motivo:true,tipoError:true,resuelto:true,comentarioAdmin:true}});
    const errorCases=rawIssues.map(row=>({date:(row.fecha??new Date(0)).toISOString(),store:row.sucursal,transfer:row.transferencia,quantity:Math.abs(row.cantidadErrada),reason:row.motivo??row.tipoError,resolved:row.resuelto,observation:row.comentarioAdmin??undefined}));
    const transferSource=await transferDashboardData(getDb(),errorCases,storeScope.national?undefined:storeIds,allowedBillerIds);
    const operationalStoreNames=storeScope.rows.map(store=>store.nombre);
    data={...baseData,errorCases,allowedBillers,operationalStoreNames,snapshot:{...baseData.snapshot,generatedAt:transferSource.lastImport?.importedAt.toISOString()??baseData.snapshot.generatedAt,exportDateColumnAvailable:true},aggregates:{...baseData.aggregates,totalTransfers:transferSource.aggregates.totalTransfers,exported:transferSource.aggregates.exported,reported:transferSource.aggregates.reported},transfers:transferSource.transfers,pendingReports:transferSource.pendingReports,stores:transferSource.stores,billers:transferSource.billers};
  }
  return {data,user,capabilities:{available,national,warehouses}};
}

/**
 * Espacio del facturador: solo sus transferencias (por su código corporativo vinculado), sus errores
 * confirmados y, desde el frontend, sus observaciones. No depende de la región: un facturador ve todo
 * lo que facturó, y nada de otros facturadores.
 */
export async function loadBiller(user:UsuarioSesion):Promise<PanelFacturador>{
  return {user,...await billerData(getDb(),user.id)};
}

export async function billerData(db:PrismaClient,userId:string):Promise<Omit<PanelFacturador,"user">>{
  await new Authorization(db,userId).permitted("facturacion.propio");
  const perfiles=await db.perfilLaboral.findMany({where:{tipo:"FACTURACION",activo:true,vinculos:{some:{usuarioId:userId}}},select:{id:true,codigo:true,nombre:true},orderBy:{nombre:"asc"}});
  const ids=perfiles.map(perfil=>perfil.id);
  const propias=await db.transferenciaConsulta.findMany({where:{bajaEn:null,facturadorId:{in:ids}},select:{numero:true,tiendaId:true}});
  // Los números se repiten entre bodegas: el error cuenta solo si es de la misma tienda y número.
  const claves=new Set(propias.map(item=>`${item.tiendaId}:${item.numero}`));
  const casos=await db.inconsistencia.findMany({where:{responsable:"FACTURACION",transferencia:{in:[...new Set(propias.map(item=>item.numero))]}},select:{fecha:true,sucursal:true,transferencia:true,tiendaId:true,cantidadErrada:true,motivo:true,tipoError:true,resuelto:true,comentarioAdmin:true}});
  const errorCases=casos.filter(row=>!row.tiendaId||claves.has(`${row.tiendaId}:${row.transferencia}`)).map(row=>({date:(row.fecha??new Date(0)).toISOString(),store:row.sucursal,transfer:row.transferencia,quantity:Math.abs(row.cantidadErrada),reason:row.motivo??row.tipoError,resolved:row.resuelto,observation:row.comentarioAdmin??undefined}));
  const fuente=await transferDashboardData(db,errorCases,undefined,ids);
  return {perfiles,transfers:fuente.transfers,errorCases,actualizado:fuente.lastImport?.importedAt.toISOString()??null};
}
