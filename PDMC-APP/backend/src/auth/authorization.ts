import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { allows, hasPermission, permissionMatrix, type Permission, type Resource } from "@pdmc/contratos/auth/permissions";
import { AuthError } from "./service";
import { dimInventario } from "../sync/agente";

export const denied = () => new AuthError(403, "PERMISO", "No tiene permiso para esta operación o ubicación.");
export class Authorization {
  constructor(protected db: PrismaClient, readonly userId?: string) {}
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
  /**
   * La bodega general de Negativos guarda el inventario del sitio PDMC_INVENTARIO_DIM_ID: la ven solo
   * quienes cubren ese sitio (su bodega o su región). Otra región no ve esos negativos ni ese inventario.
   */
  private site?:Promise<Resource|null>;
  generalSite():Promise<Resource|null>{
    return this.site??=Promise.resolve().then(()=>this.db.ubicacion.findUnique({where:{dimIdTienda:dimInventario()},select:{id:true,regionId:true}})).catch(()=>null);
  }
  async allowsGeneral(grants:Awaited<ReturnType<Authorization["grants"]>>,permission:Permission){
    if(!permission.startsWith("negativos."))return false;
    const site=await this.generalSite();
    return Boolean(site&&allows(grants,permission,site));
  }
  /** El inventario de PDMC es el del sitio PDMC_INVENTARIO_DIM_ID: solo para quien cubre ese sitio. */
  async inventory(permission:Permission="inventario.administrar"){
    await this.permitted(permission);
    const site=await this.generalSite();
    if(!site||!allows(await this.grants(),permission,site))throw new AuthError(403,"INVENTARIO_REGION","El inventario y los negativos de tu región todavía no están conectados a PDMC: hoy PDMC lee el inventario de una sola bodega, de otra región.");
  }
  async locationScope(permission:Permission,type:"REGION"|"BODEGA"|"TIENDA") {
    const grants=await this.grants();
    if(!hasPermission(grants,permission))throw denied();
    const national=allows(grants,permission),selected=grants.filter(g=>permissionMatrix[g.rol].includes(permission));
    // Quien trabaja en una bodega (Jefe de bodega, Rectificación, Recepción) ve las tiendas que esa
    // bodega surte: sus inconsistencias, sus transferencias y los facturadores que las despacharon.
    const bodegas=selected.filter(g=>g.ubicacion?.tipo==="BODEGA").map(g=>g.ubicacionId!);
    const surtidas=!national&&type==="TIENDA"&&bodegas.length
      ?(await this.db.transferenciaConsulta.findMany({where:{origenId:{in:bodegas},tiendaId:{not:null}},distinct:["tiendaId"],select:{tiendaId:true}})).map(row=>row.tiendaId!):[];
    const rows=await this.db.ubicacion.findMany({where:national?{tipo:type}:{tipo:type,OR:[
      {id:{in:[...selected.filter(g=>g.ubicacion?.tipo===type).map(g=>g.ubicacionId!),...surtidas]}},
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
    const canUseGeneralNegatives=await this.allowsGeneral(selected,permission);
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

/**
 * Cargas automáticas del sincronizador, una por sitio (bodega). Las ejecuta el servidor (el botón
 * ya validó el rol de quien lo presiona) a nombre de la cuenta de sincronización de la región del
 * sitio. Esa cuenta solo puede importar, y solo los sitios de su región. La cuenta de transición
 * PDMC_SYNC_USUARIO_EMAIL (sin asignaciones) se usa en las regiones que aún no tienen la suya.
 */
const importacionesDelSistema: readonly Permission[] = ["inventario.administrar", "transferencias.importar", "devoluciones.importar"];
export class SystemAuthorization extends Authorization {
  constructor(db: PrismaClient, userId: string, private sitio?: Resource) { super(db, userId); }
  // La sincronización ya carga solo los sitios de su región (permitted, más abajo).
  async inventory(permission: Permission = "inventario.administrar") { await this.permitted(permission); }
  async permitted(permission: Permission) {
    if (!this.userId || !importacionesDelSistema.includes(permission)) throw denied();
    const user = await this.db.usuario.findUnique({where:{id:this.userId}, select:{email:true,activo:true,estado:true,asignaciones:{include:{ubicacion:true}}}});
    // Un error de configuración, no de permisos de quien presiona el botón: se dice cuál.
    if (!user?.activo || user.estado !== "ACTIVO") throw new AuthError(409, "CUENTA_SINCRONIZACION", `La cuenta de sincronización ${user?.email ?? ""} está inactiva o bloqueada. Reactívela en Administración → Sincronización.`);
    const regionales = user.asignaciones.filter(g => g.rol === "SINCRONIZACION");
    if (regionales.length && !(this.sitio && allows(regionales, permission, this.sitio)))
      throw new AuthError(403, "REGION_SINCRONIZACION", `La cuenta ${user.email} solo carga las bodegas de su región.`);
  }
}
