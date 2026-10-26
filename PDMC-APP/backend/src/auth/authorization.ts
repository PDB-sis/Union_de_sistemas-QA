import "server-only";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { allows, allowsGeneralNegatives, hasPermission, permissionMatrix, type Permission } from "../../../shared/auth/permissions";
import { AuthError } from "./service";

export const denied = () => new AuthError(403, "PERMISO", "No tiene permiso para esta operación o ubicación.");
export class Authorization {
  constructor(private db: PrismaClient, readonly userId?: string) {}
  async grants() {
    if (!this.userId) throw denied();
    const user = await this.db.usuario.findUnique({where:{id:this.userId}, select:{activo:true,estado:true,debeCambiarPassword:true}});
    if (!user?.activo || user.estado !== "ACTIVO" || user.debeCambiarPassword) throw denied();
    return this.db.asignacionAcceso.findMany({where:{usuarioId:this.userId}, include:{ubicacion:true}});
  }
  async national(permission: Permission) {
    if (!allows(await this.grants(), permission)) throw denied();
  }
  async permitted(permission: Permission) {
    if (!hasPermission(await this.grants(), permission)) throw denied();
  }
  async has(permission:Permission){return hasPermission(await this.grants(),permission);}
  async locationScope(permission:Permission,type:"REGION"|"BODEGA"|"TIENDA") {
    const grants=await this.grants();
    if(!hasPermission(grants,permission))throw denied();
    const national=allows(grants,permission),selected=grants.filter(g=>permissionMatrix[g.rol].includes(permission));
    const rows=await this.db.ubicacion.findMany({where:national?{tipo:type}:{tipo:type,OR:[
      {id:{in:selected.filter(g=>g.ubicacion?.tipo===type).map(g=>g.ubicacionId!)}},
      ...(type!=="REGION"?[{regionId:{in:selected.filter(g=>g.ubicacion?.tipo==="REGION").map(g=>g.ubicacionId!)}}]:[]),
    ]},select:{id:true,codigo:true,nombre:true,regionId:true},orderBy:{nombre:"asc"}});
    return {national,rows};
  }
  async warehouseWhere(permission: Permission): Promise<Prisma.BodegaWhereInput> {
    const grants = await this.grants();
    if (!hasPermission(grants, permission)) throw denied();
    if (allows(grants, permission)) return {};
    const selected = grants.filter(g => permissionMatrix[g.rol].includes(permission));
    const regional={ubicacion:{is:{OR:[{id:{in:selected.flatMap(g=>g.ubicacionId?[g.ubicacionId]:[])}},
      {regionId:{in:selected.filter(g=>g.ubicacion?.tipo==="REGION").map(g=>g.ubicacionId!)}}]}}};
    const canUseGeneralNegatives=allowsGeneralNegatives(selected,permission);
    return canUseGeneralNegatives?{OR:[regional,{codigo:"PDMC_GENERAL"}]}:regional;
  }
  async warehouse(permission: Permission, id: string) {
    const where = await this.warehouseWhere(permission);
    if (!await this.db.bodega.findFirst({where:{AND:[where,{id,activa:true}]},select:{id:true}})) throw denied();
  }
  async filter(permission: Permission, id?: string): Promise<Prisma.StringFilter | string> {
    if (id) {await this.warehouse(permission,id); return id;}
    const where = await this.warehouseWhere(permission);
    const rows = await this.db.bodega.findMany({where, select:{id:true}});
    return {in:rows.map(b=>b.id)};
  }
  async canWarehouse(permission: Permission, id: string) {
    try { await this.warehouse(permission,id); return true; } catch (error) { if(error instanceof AuthError&&error.status===403)return false;throw error; }
  }
  async caseFields(bodegaId: string, before: {estado:string;numeroAjuste:string|null;conteoFisico:unknown;bodegaProductoId:string|null;motivo:string|null;documentoRelacionado:string|null;veredicto:string|null;observaciones:string|null}, after: {estado?:string;numeroAjuste?:string;conteoFisico?:string;bodegaProductoId?:string|null;motivo?:string;documentoRelacionado?:string;veredicto?:string;observaciones?:string}) {
    const edits=await this.canWarehouse("negativos.editar",bodegaId);
    if(!edits) {
      await this.warehouse("negativos.conteo",bodegaId);
      const text=(value:unknown)=>String(value??"").trim();
      const protectedChange=after.estado!==undefined&&after.estado!==before.estado ||
        after.bodegaProductoId!==undefined&&after.bodegaProductoId!==before.bodegaProductoId ||
        after.motivo!==undefined&&text(after.motivo)!==text(before.motivo) ||
        after.documentoRelacionado!==undefined&&text(after.documentoRelacionado)!==text(before.documentoRelacionado) ||
        after.veredicto!==undefined&&text(after.veredicto)!==text(before.veredicto) ||
        after.numeroAjuste!==undefined&&text(after.numeroAjuste)!==text(before.numeroAjuste) ||
        after.observaciones!==undefined&&text(after.observaciones)!==text(before.observaciones);
      if(protectedChange)throw denied();
      return;
    }
    if (after.estado !== undefined && after.estado !== before.estado) {
      await this.warehouse("negativos.estado", bodegaId);
      if (["AJUSTE_AUTORIZADO","ESPERANDO_DECISION"].includes(after.estado)) await this.warehouse("negativos.aprobar",bodegaId);
      if (["AJUSTE_REALIZADO","SOLUCIONADO","CERRADO_SIN_AJUSTE"].includes(after.estado)) await this.warehouse("negativos.ajustar",bodegaId);
    }
    if (after.numeroAjuste !== undefined && after.numeroAjuste !== (before.numeroAjuste ?? "")) await this.warehouse("negativos.ajustar",bodegaId);
  }
}
