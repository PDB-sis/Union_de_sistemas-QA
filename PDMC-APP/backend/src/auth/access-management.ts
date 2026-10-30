import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { roles, type Rol } from "@pdmc/contratos/auth/model";
import { allows, permissionMatrix, type Permission } from "@pdmc/contratos/auth/permissions";
import { AuthError, emailSchema, userByEmail } from "./service";
import { denied } from "./authorization";

export const administrativeRoles = (permission: Permission) => (Object.keys(roles) as Rol[]).filter(r=>permissionMatrix[r].includes(permission));
// El operador del servidor es un canal de recuperación; admite administrador invitado.
export async function requireOperator(db: Prisma.TransactionClient, id: string, permission: Permission) {
  const actor=await db.usuario.findUnique({where:{id},include:{asignaciones:{include:{ubicacion:true}}}});
  if (!actor?.activo || !["ACTIVO","INVITADO"].includes(actor.estado) || !allows(actor.asignaciones,permission)) throw denied();
  return actor;
}
const assignment = z.object({rol:z.enum(Object.keys(roles) as [Rol,...Rol[]]),ubicacionCodigo:z.string().trim().min(1).max(80).nullable()}).strict();
export const assignmentsSchema = z.array(assignment).max(100).refine(a=>new Set(a.map(g=>`${g.rol}:${g.ubicacionCodigo}`)).size===a.length,"Asignaciones duplicadas");

export async function manageAccess(db: PrismaClient, env: Record<string,string|undefined>) {
  const actorEmail=emailSchema.parse(env.PDMC_ADMIN_ACTOR_EMAIL);
  const motivo=z.string().trim().min(5).max(2000).parse(env.PDMC_ADMIN_MOTIVO);
  const targetEmail=emailSchema.parse(env.PDMC_ACCESO_USUARIO_EMAIL);
  const grants=assignmentsSchema.parse(JSON.parse(env.PDMC_ACCESO_ASIGNACIONES ?? "null"));
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(210001)::text`;
    const actor=await userByEmail(tx,actorEmail), target=await userByEmail(tx,targetEmail);
    if(!actor)throw denied();
    await requireOperator(tx,actor.id,"accesos.administrar");
    if(!target)throw new AuthError(404,"USUARIO","Usuario no encontrado.");
    const data:{usuarioId:string;rol:Rol;ubicacionId:string|null}[]=[];
    for(const g of grants) {
      const location=g.ubicacionCodigo?await tx.ubicacion.findUnique({where:{codigo:g.ubicacionCodigo}}):null;
      if(g.ubicacionCodigo&&!location)throw new AuthError(422,"UBICACION","Una ubicación no existe.");
      if(!location&&g.rol!=="ADMINISTRADOR")throw new AuthError(422,"REGION","Cada rol operativo necesita su región, bodega o tienda. No existen cuentas operativas de alcance nacional.");
      data.push({usuarioId:target.id,rol:g.rol,ubicacionId:location?.id??null});
    }
    const before=await tx.asignacionAcceso.findMany({where:{usuarioId:target.id}});
    const canonical=(rows:typeof data)=>rows.map(g=>`${g.rol}:${g.ubicacionId}`).sort().join("|");
    const changed=canonical(before)!==canonical(data);
    if(!changed)return {modificado:false,asignaciones:data.length};
    await tx.asignacionAcceso.deleteMany({where:{usuarioId:target.id}});
    await tx.asignacionAcceso.createMany({data});
    const remaining=await tx.asignacionAcceso.count({where:{rol:{in:administrativeRoles("accesos.administrar")},ubicacionId:null,usuario:{activo:true,estado:{in:["ACTIVO","INVITADO"]}}}});
    if(!remaining)throw new AuthError(409,"ULTIMO_ADMIN","Debe conservar un administrador nacional habilitado.");
    if(changed) {
      await tx.sesionUsuario.deleteMany({where:{usuarioId:target.id}});
      await tx.auditoria.create({data:{usuarioId:actor.id,entidad:"Autorizacion",entidadId:target.id,accion:"ACCESOS_REEMPLAZADOS",motivo,
        valorAnterior:before.map(g=>({rol:g.rol,ubicacionId:g.ubicacionId})),valorNuevo:data.map(g=>({rol:g.rol,ubicacionId:g.ubicacionId}))}});
    }
    return {modificado:changed,asignaciones:data.length};
  });
}

export async function manageLocation(db: PrismaClient,env: Record<string,string|undefined>) {
  const actorEmail=emailSchema.parse(env.PDMC_ADMIN_ACTOR_EMAIL);
  const motivo=z.string().trim().min(5).max(2000).parse(env.PDMC_ADMIN_MOTIVO);
  const input=z.object({codigo:z.string().trim().min(1).max(80),nombre:z.string().trim().min(1).max(200),tipo:z.enum(["REGION","BODEGA","TIENDA"]),regionCodigo:z.string().min(1).optional(),bodegaId:z.string().uuid().optional()}).strict().parse(JSON.parse(env.PDMC_UBICACION ?? "null"));
  if((input.tipo==="REGION")===Boolean(input.regionCodigo) || (input.tipo==="REGION"&&input.bodegaId))throw new AuthError(422,"JERARQUIA","Las bodegas y tiendas requieren región; una región no tiene padre ni depósito.");
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(210001)::text`;
    const actor=await userByEmail(tx,actorEmail);if(!actor)throw denied();
    await requireOperator(tx,actor.id,"ubicaciones.administrar");
    const region=input.regionCodigo?await tx.ubicacion.findUnique({where:{codigo:input.regionCodigo}}):null;
    if(input.regionCodigo&&region?.tipo!=="REGION")throw new AuthError(422,"REGION","Región inexistente.");
    const existing=await tx.ubicacion.findUnique({where:{codigo:input.codigo},include:{bodega:true}});
    if(existing) {
      if(existing.tipo!==input.tipo||existing.regionId!==(region?.id??null)||existing.nombre!==input.nombre||(input.bodegaId&&existing.bodega?.id!==input.bodegaId))throw new AuthError(409,"UBICACION_EXISTENTE","El código ya existe con otra configuración.");
      return {creada:false,id:existing.id};
    }
    const location=await tx.ubicacion.create({data:{codigo:input.codigo,nombre:input.nombre,tipo:input.tipo,regionId:region?.id}});
    if(input.tipo!=="REGION") {
      if(input.bodegaId) {
        const linked=await tx.bodega.updateMany({where:{id:input.bodegaId,ubicacionId:null,activa:true},data:{ubicacionId:location.id}});
        if(linked.count!==1)throw new AuthError(409,"BODEGA","Depósito inexistente, inactivo o ya vinculado.");
      } else await tx.bodega.create({data:{codigo:input.codigo,nombre:input.nombre,ubicacionId:location.id}});
    }
    await tx.auditoria.create({data:{usuarioId:actor.id,entidad:"Ubicacion",entidadId:location.id,accion:"UBICACION_CREADA",motivo,valorNuevo:input}});
    return {creada:true,id:location.id};
  });
}
