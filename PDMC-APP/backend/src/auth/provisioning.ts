import { administrativeRoles, requireOperator } from "./access-management";
import "server-only";
import { z } from "zod";
import type { PrismaClient } from "../../../generated/prisma/client";
import { roles, type Rol } from "../../../shared/auth/model";
import { authAudit, AuthError, emailSchema, userByEmail } from "./service";
import { hashPassword, passwordSchema, verifyPassword } from "./password";

export function initialUsers(env:Record<string,string|undefined>) {
  const users=[];
  for(const rol of Object.keys(roles) as Rol[]) {
    const prefix=`PDMC_SEED_${rol}`;
    const email=env[`${prefix}_EMAIL`],nombre=env[`${prefix}_NOMBRE`],password=env[`${prefix}_PASSWORD`];
    if(!email&&!nombre&&!password)continue;
    users.push({rol,email:emailSchema.parse(email),nombre:z.string().trim().min(1).max(200).parse(nombre || roles[rol]),password:passwordSchema.parse(password)});
  }
  if(!users.length)throw new AuthError(422,"SEED_VACIO","Configure al menos una cuenta mediante variables PDMC_SEED_<ROL>_EMAIL y _PASSWORD.");
  if(new Set(users.map(u=>u.email)).size!==users.length)throw new AuthError(422,"DUPLICADOS","Cada rol inicial debe tener un correo distinto.");
  return users;
}
export async function provisionUsers(db:PrismaClient,env:Record<string,string|undefined>) {
  const users=initialUsers(env);
  const prepared:{rol:Rol;email:string;nombre:string;passwordHash:string|null}[]=[];
  for(const u of users) {
    const existing=await userByEmail(db,u.email);
    prepared.push({rol:u.rol,email:u.email,nombre:u.nombre,passwordHash:existing?null:await hashPassword(u.password)});
  }
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(210001)::text`;
    let creados=0,existentes=0;
    for(const u of prepared) {
      const existing=await userByEmail(tx,u.email);
      if(existing) {
        if(existing.rol!==u.rol)throw new AuthError(409,"ROL_EXISTENTE","Una cuenta existente tiene otro rol. El seed no cambia roles ni contraseñas.");
        existentes++;continue;
      }
      if(!u.passwordHash)throw new AuthError(409,"SEED_CONFLICTO","La cuenta cambió durante la preparación; reintente.");
      const user=await tx.usuario.create({data:{email:u.email,nombre:u.nombre,rol:u.rol,passwordHash:u.passwordHash,estado:"INVITADO",activo:true,debeCambiarPassword:true,passwordTemporalHasta:new Date(Date.now()+48*3600000)}});
      if(administrativeRoles("accesos.administrar").includes(u.rol)) await tx.asignacionAcceso.create({data:{usuarioId:user.id,rol:u.rol}});
      await authAudit(tx,"USUARIO_INICIAL_CREADO",user.id,"Cuenta temporal creada mediante comando del operador",{rol:u.rol});
      creados++;
    }
    return {creados,existentes};
  },{timeout:30000});
}

// This command is an administrative recovery channel, available only to the
// trusted server operator with the database environment. It is not an HTTP API.
export async function administerUser(db:PrismaClient,env:Record<string,string|undefined>) {
  const actorEmail=emailSchema.parse(env.PDMC_ADMIN_ACTOR_EMAIL);
  const email=emailSchema.parse(env.PDMC_ADMIN_USUARIO_EMAIL);
  const motivo=z.string().trim().min(5).max(2000).parse(env.PDMC_ADMIN_MOTIVO);
  const newPassword=env.PDMC_ADMIN_PASSWORD_TEMPORAL;
  const estado=env.PDMC_ADMIN_ESTADO ? z.enum(["INVITADO","ACTIVO","BLOQUEADO","INACTIVO"]).parse(env.PDMC_ADMIN_ESTADO) : undefined;
  if(Boolean(newPassword)===Boolean(estado))throw new AuthError(422,"OPERACION","Configure una contraseña temporal o un estado, una operación a la vez.");
  const actor=await userByEmail(db,actorEmail);
  if(!actor)throw new AuthError(403,"ADMIN","Se requiere un administrador existente y habilitado como responsable.");
  await requireOperator(db,actor.id,"usuarios.administrar");
  const hashed=newPassword?await hashPassword(newPassword):undefined;
  await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(210001)::text`;
    const user=await userByEmail(tx,email);
    if(!user)throw new AuthError(404,"USUARIO","Usuario no encontrado.");
    const lockIds=[...new Set([actor.id,user.id])].sort();
    for(const id of lockIds)await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${id}::uuid FOR UPDATE`;
    await requireOperator(tx,actor.id,"usuarios.administrar");
    const fresh=await tx.usuario.findUniqueOrThrow({where:{id:user.id}});
    if(newPassword&&await verifyPassword(newPassword,fresh.passwordHash))throw new AuthError(422,"PASSWORD","Utilice una contraseña temporal diferente.");
    if(estado==="ACTIVO"&&(!fresh.passwordHash||fresh.debeCambiarPassword))throw new AuthError(422,"ESTADO","La cuenta debe completar primero el cambio de contraseña temporal.");
    if(estado==="INVITADO"&&(!fresh.passwordHash||!fresh.debeCambiarPassword||!fresh.passwordTemporalHasta||fresh.passwordTemporalHasta<=new Date()))throw new AuthError(422,"ESTADO","Para invitar nuevamente, restablezca primero una contraseña temporal.");
    if(estado&&["BLOQUEADO","INACTIVO"].includes(estado)) {
      const others=await tx.usuario.count({where:{id:{not:fresh.id},asignaciones:{some:{rol:{in:administrativeRoles("accesos.administrar")},ubicacionId:null}},activo:true,estado:{in:["ACTIVO","INVITADO"]}}});
      if(!others)throw new AuthError(409,"ULTIMO_ADMIN","No se puede deshabilitar el último administrador.");
    }
    await tx.usuario.update({where:{id:user.id},data:hashed?{passwordHash:hashed,debeCambiarPassword:true,passwordTemporalHasta:new Date(Date.now()+48*3600000),passwordChangedAt:new Date()}:{estado,activo:estado==="ACTIVO"||estado==="INVITADO"}});
    await tx.sesionUsuario.deleteMany({where:{usuarioId:user.id}});
    await authAudit(tx,hashed?"PASSWORD_RESTABLECIDO":"ESTADO_USUARIO_CAMBIADO",actor.id,motivo,{usuarioObjetivo:user.id,...(estado?{estado}:{})});
  },{timeout:30000});
}
