import "server-only";
import { auditActor } from "../audit-context";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { hashPassword, passwordSchema, verifyPassword } from "./password";

export class AuthError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
export const emailSchema = z.string().trim().min(3).max(254).regex(/^[\p{L}\p{N}._@-]+$/u,"Use solo letras, números, punto, guion o guion bajo.").transform(s=>s.toLowerCase());
export const loginSchema = z.object({email:emailSchema,password:z.string().min(1).max(128)}).strict();
const digest = (s:string) => createHash("sha256").update(s).digest("hex");
const userSelect = {id:true,email:true,nombre:true,rol:true,estado:true,activo:true,debeCambiarPassword:true,passwordTemporalHasta:true} as const;
const permitted = (u:{activo:boolean;estado:string}) => u.activo && ["ACTIVO","INVITADO"].includes(u.estado);
export async function authAudit(tx:Prisma.TransactionClient,action:string,userId:string|null,reason:string,metadata?:Prisma.InputJsonValue) {
  await tx.auditoria.create({data:{entidad:"Autenticacion",entidadId:userId ?? randomUUID(),usuarioId:userId,origen:auditActor().origen,accion:action,motivo:reason,...(metadata?{valorNuevo:metadata}:{})}});
}
async function lockUser(tx:Prisma.TransactionClient,id:string) {
  await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${id}::uuid FOR UPDATE`;
}
export async function userByEmail(db:Prisma.TransactionClient,email:string) {
  // Exact case-insensitive identity; '%' and '_' must never act as ILIKE patterns.
  const rows=await db.$queryRaw<{id:string}[]>`SELECT id FROM "Usuario" WHERE lower(email)=${email.toLowerCase()} LIMIT 1`;
  return rows[0]?db.usuario.findUnique({where:{id:rows[0].id}}):null;
}
export class AuthService {
  constructor(private db:PrismaClient) {}
  async throttle(identifier:string,limit=10) {
    await this.db.intentoAcceso.deleteMany({where:{expiresAt:{lte:new Date()}}});
    const window = Math.floor(Date.now() / 900000);
    const clave = digest(`${window}:${identifier}`), expiresAt = new Date((window+1)*900000);
    const row = await this.db.intentoAcceso.upsert({where:{clave},create:{clave,expiresAt},update:{intentos:{increment:1}}});
    if (row.intentos > limit) {
      await authAudit(this.db,"LOGIN_FALLIDO",null,"Límite temporal de intentos alcanzado",{identificador:digest(identifier)});
      throw new AuthError(429,"INTENTOS","Demasiados intentos. Espere 15 minutos y vuelva a intentar.");
    }
  }
  async login(raw:unknown) {
    const input = loginSchema.parse(raw);
    await this.throttle("login-global",100);
    await this.throttle(`login:${input.email}`);
    const user = await userByEmail(this.db,input.email);
    const correct = await verifyPassword(input.password,user?.passwordHash ?? null);
    return this.db.$transaction(async tx => {
      if (user) await lockUser(tx,user.id);
      const fresh = user ? await tx.usuario.findUnique({where:{id:user.id}}) : null;
      if (!correct || !fresh || !permitted(fresh) || fresh.passwordHash !== user?.passwordHash ||
        (fresh.debeCambiarPassword && (!fresh.passwordTemporalHasta || fresh.passwordTemporalHasta <= new Date()))) {
        await authAudit(tx,"LOGIN_FALLIDO",fresh?.id ?? null,"Credenciales no válidas o cuenta no disponible",{identificador:digest(input.email)});
        return null;
      }
      const token = randomBytes(32).toString("base64url");
      const seconds = fresh.debeCambiarPassword || fresh.estado === "INVITADO" ? 900 : 8*3600;
      await tx.sesionUsuario.deleteMany({where:{usuarioId:fresh.id,expiresAt:{lte:new Date()}}});
      await tx.sesionUsuario.create({data:{usuarioId:fresh.id,tokenHash:digest(token),expiresAt:new Date(Date.now()+seconds*1000)}});
      await authAudit(tx,"LOGIN_EXITOSO",fresh.id,"Inicio de sesión correcto");
      return {token,seconds,debeCambiarPassword:fresh.debeCambiarPassword || fresh.estado === "INVITADO"};
    }).then(result=>{
      if (!result) throw new AuthError(401,"CREDENCIALES","Usuario o contraseña no válidos, o cuenta no disponible.");
      return result;
    });
  }
  async session(token:string|undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = await this.db.sesionUsuario.findUnique({where:{tokenHash:digest(token)},include:{usuario:{select:userSelect}}});
    if (!session || session.expiresAt <= new Date() || !permitted(session.usuario)) return null;
    const u = session.usuario;
    if (u.debeCambiarPassword && (!u.passwordTemporalHasta || u.passwordTemporalHasta <= new Date())) return null;
    return {id:session.id,usuario:{id:u.id,email:u.email,nombre:u.nombre,rol:u.rol,debeCambiarPassword:u.debeCambiarPassword || u.estado === "INVITADO"}};
  }
  async logout(token:string|undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.db.$transaction(async tx=>{
      const session = await tx.sesionUsuario.findUnique({where:{tokenHash:digest(token)}});
      if (!session) return;
      await lockUser(tx,session.usuarioId);
      const removed = await tx.sesionUsuario.deleteMany({where:{id:session.id}});
      if (removed.count) await authAudit(tx,"LOGOUT",session.usuarioId,"Cierre de sesión");
    });
  }
  async changePassword(token:string|undefined,raw:unknown) {
    const input = z.object({actual:z.string().min(1).max(128),nueva:passwordSchema}).strict().parse(raw);
    const session = await this.session(token);
    if (!session) throw new AuthError(401,"SESION","Inicie sesión para continuar.");
    await this.throttle(`password:${session.usuario.id}`,5);
    const user = await this.db.usuario.findUniqueOrThrow({where:{id:session.usuario.id}});
    if (!await verifyPassword(input.actual,user.passwordHash)) {
      await authAudit(this.db,"PASSWORD_FALLIDO",user.id,"Contraseña actual incorrecta");
      throw new AuthError(401,"PASSWORD","La contraseña actual no es correcta.");
    }
    if (input.actual === input.nueva) throw new AuthError(422,"PASSWORD","La nueva contraseña debe ser diferente.");
    const hashed = await hashPassword(input.nueva);
    await this.db.$transaction(async tx=>{
      await lockUser(tx,user.id);
      const fresh = await tx.usuario.findUniqueOrThrow({where:{id:user.id}});
      const still = await tx.sesionUsuario.findUnique({where:{id:session.id}});
      if (!still || still.expiresAt <= new Date() || !permitted(fresh) || fresh.passwordHash !== user.passwordHash ||
        (fresh.debeCambiarPassword && (!fresh.passwordTemporalHasta || fresh.passwordTemporalHasta <= new Date())))
        throw new AuthError(401,"SESION","La sesión cambió. Inicie sesión nuevamente.");
      await tx.usuario.update({where:{id:user.id},data:{passwordHash:hashed,debeCambiarPassword:false,passwordTemporalHasta:null,passwordChangedAt:new Date(),estado:"ACTIVO"}});
      await tx.sesionUsuario.deleteMany({where:{usuarioId:user.id}});
      await authAudit(tx,"PASSWORD_CAMBIADO",user.id,"Contraseña cambiada; sesiones anteriores revocadas");
    });
  }
}
