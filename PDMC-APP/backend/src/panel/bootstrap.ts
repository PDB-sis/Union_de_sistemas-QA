import "server-only";
import { pageSession } from "@backend/auth/page";
import type {DashboardData} from "@shared/dashboard-contract";
import { dashboardData } from "./dashboard-data";
import { Authorization } from "@backend/auth/authorization";
import { getDb } from "@backend/db";
import { allows, allowsGeneralNegatives, permissions } from "@shared/auth/permissions";
import { hasPermission } from "@shared/auth/permissions";
import { redirect } from "next/navigation";
import { transferDashboardData } from "@backend/transferencias/consulta";
import { StoreService } from "@backend/tienda/service";

export async function loadAdministration(){
  const user=await pageSession();
  const grants=await new Authorization(getDb(),user.id).grants();
  return {user,canManage:allows(grants,"usuarios.administrar"),canAudit:hasPermission(grants,"auditoria.leer")};
}
export async function loadStore(){
  const user=await pageSession(),db=getDb(),access=new Authorization(db,user.id);
  await access.permitted("tienda.panel");
  return {user,initialData:await new StoreService(db,access).dashboard()};
}

export async function loadDashboard() {
  const user = await pageSession();
  const access = new Authorization(getDb(),user.id);
  const grants = await access.grants();
  if(grants.some(grant=>grant.rol==="ADMINISTRADOR"&&grant.ubicacionId===null))redirect("/administracion");
  if (hasPermission(grants,"tienda.panel") && !hasPermission(grants,"panel.leer")) redirect("/tienda");
  const available = permissions.filter(p=>hasPermission(grants,p));
  const national = permissions.filter(p=>allows(grants,p));
  const locations = await getDb().bodega.findMany({where:{activa:true},select:{id:true,codigo:true,ubicacion:{select:{id:true,regionId:true}}}});
  const warehouses = Object.fromEntries(locations.flatMap(b=>{
    const enabled=permissions.filter(p=>b.codigo==="PDMC_GENERAL"?allowsGeneralNegatives(grants,p):Boolean(b.ubicacion&&allows(grants,p,b.ubicacion)));
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
    data={...baseData,errorCases,allowedBillers,operationalStoreNames,snapshot:{...baseData.snapshot,generatedAt:transferSource.lastImport?.importedAt.toISOString()??baseData.snapshot.generatedAt,exportDateColumnAvailable:false},aggregates:{...baseData.aggregates,totalTransfers:transferSource.aggregates.totalTransfers,exported:transferSource.aggregates.exported,reported:transferSource.aggregates.reported},transfers:transferSource.transfers,pendingReports:transferSource.pendingReports,stores:transferSource.stores,billers:transferSource.billers};
  }
  return {data,user,capabilities:{available,national,warehouses}};
}
