import {createHash,randomBytes} from "node:crypto";
import {z} from "zod";
import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {Authorization,denied} from "../auth/authorization";
import {AuthService} from "../auth/service";
import {verifyPassword} from "../auth/password";
import {NegativosError} from "../negativos/validation";
import {createResetBackup,type ResetBackup} from "./reset-backup";
import {resetMaintenance} from "../maintenance";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const password=z.string().min(1).max(128);
const prepareSchema=z.object({password}).strict();
const executeSchema=z.object({id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/),password,confirmacion:z.literal("RESTABLECER PDMC DESDE CERO"),acepto:z.literal(true)}).strict();
const tables=Object.values(Prisma.ModelName).sort();
const counted=tables.filter(t=>t!=="RestablecimientoProyecto");
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
async function counts(db:Prisma.TransactionClient){
  const result:Record<string,number>={};
  for(const table of counted){const [row]=await db.$queryRawUnsafe<{total:bigint}[]>(`SELECT count(*)::bigint AS total FROM ${quote(table)}`);result[table]=Number(row.total);}
  return result;
}

/**
 * Fecha de inicio de las consultas: el día (hora de Venezuela) del último restablecimiento.
 * Desde entonces las consultas con fecha (transferencias y devoluciones) solo traen lo de ese
 * día en adelante. Sin restablecimientos, null: se trae todo.
 */
export async function consultasDesde(db:Pick<PrismaClient,"restablecimientoProyecto">){
  const ultimo=await db.restablecimientoProyecto.findFirst({where:{consumidoAt:{not:null}},orderBy:{consumidoAt:"desc"},select:{consumidoAt:true}});
  if(!ultimo?.consumidoAt)return null;
  const dia=ultimo.consumidoAt.toLocaleDateString("en-CA",{timeZone:"America/Caracas"});
  return new Date(`${dia}T00:00:00.000Z`);
}
/** Mientras haya un restablecimiento preparado (máximo 10 minutos), la sincronización se pausa: si no, sus cargas cambian los totales revisados. */
export async function restablecimientoPendiente(db:Pick<PrismaClient,"restablecimientoProyecto">){
  return Boolean(await db.restablecimientoProyecto.findFirst({where:{consumidoAt:null,expiresAt:{gt:new Date()}},select:{id:true}}));
}
/** La cuenta de sistema de transición (PDMC_SYNC_USUARIO_EMAIL, sin contraseña) sobrevive al restablecimiento para que las consultas sigan. */
async function cuentaDeTransicion(tx:Prisma.TransactionClient){
  const email=process.env.PDMC_SYNC_USUARIO_EMAIL?.trim().toLowerCase();
  return email?tx.usuario.findFirst({where:{email,passwordHash:null},select:{id:true}}):null;
}
export class ProjectReset {
  constructor(private db:PrismaClient,private access:Authorization,private sessionToken:string,private backup:(schema:string)=>Promise<ResetBackup>=createResetBackup){}
  private async authorize(){
    const grants=await this.access.grants();
    if(!grants.some(g=>g.rol==="ADMINISTRADOR"&&g.ubicacionId===null))throw denied();
  }
  private async password(value:string){
    await new AuthService(this.db).throttle(`restablecimiento:${this.access.userId}`,5);
    const user=await this.db.usuario.findUniqueOrThrow({where:{id:this.access.userId}});
    if(!await verifyPassword(value,user.passwordHash))throw new NegativosError(403,"PASSWORD","La contraseña actual no es correcta.");
    return user;
  }
  async preview(){
    await this.authorize();
    const [totals,sistema]=await this.db.$transaction(async tx=>[await counts(tx),await cuentaDeTransicion(tx)] as const,{isolationLevel:"RepeatableRead"});
    const actor=await this.db.usuario.findUniqueOrThrow({where:{id:this.access.userId},select:{nombre:true,email:true}});
    const conservados:Record<string,number>={Usuario:sistema?2:1,AsignacionAcceso:1};
    return {actor,tablas:counted.map(tabla=>({tabla,cantidad:Math.max(0,totals[tabla]-(conservados[tabla]??0))})),frase:"RESTABLECER PDMC DESDE CERO"};
  }
  async prepare(raw:unknown){
    await this.authorize();const input=prepareSchema.parse(raw);await this.password(input.password);
    const token=randomBytes(32).toString("hex"),now=Date.now();
    const challenge=await this.db.$transaction(async tx=>{
      // Con una carga en curso los totales cambiarían antes de confirmar. Las siguientes se pausan
      // en cuanto exista esta preparación (restablecimientoPendiente).
      const enCurso=await tx.sincronizacionEstado.findMany({where:{bloqueoHasta:{gt:new Date()}},select:{modulo:true}});
      if(enCurso.length)throw new NegativosError(409,"SINCRONIZANDO",`Hay una actualización en curso (${enCurso.map(e=>e.modulo).join(", ")}). Espere a que termine y prepare de nuevo.`);
      await tx.restablecimientoProyecto.deleteMany({where:{usuarioId:this.access.userId,consumidoAt:null}});
      return tx.restablecimientoProyecto.create({data:{usuarioId:this.access.userId!,tokenHash:digest(token),sesionHash:digest(this.sessionToken),conteos:await counts(tx),disponibleDesde:new Date(now+30000),expiresAt:new Date(now+10*60000)}});
    });
    return {id:challenge.id,token,disponibleDesde:challenge.disponibleDesde,expiresAt:challenge.expiresAt};
  }
  async execute(raw:unknown){
    await this.authorize();const input=executeSchema.parse(raw),actor=await this.password(input.password);
    return resetMaintenance(()=>this.db.$transaction(async tx=>{
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19102026)`;
      const [{schema}]=await tx.$queryRaw<{schema:string}[]>`SELECT current_schema() AS schema`;
      const actual=await tx.$queryRaw<{tablename:string}[]>`SELECT tablename FROM pg_tables WHERE schemaname=${schema} AND tablename<>'_prisma_migrations' ORDER BY tablename`;
      if(actual.map(r=>r.tablename).sort().join()!==tables.join())throw new NegativosError(409,"ESQUEMA","La estructura de la base no coincide con esta versión. Actualice las migraciones antes de restablecer.");
      await tx.$executeRawUnsafe(`LOCK TABLE ${tables.map(quote).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
      const challenge=await tx.restablecimientoProyecto.findUnique({where:{id:input.id}});
      if(!challenge||challenge.usuarioId!==actor.id||challenge.tokenHash!==digest(input.token)||challenge.sesionHash!==digest(this.sessionToken)||challenge.consumidoAt||challenge.expiresAt<=new Date())throw new NegativosError(409,"CONFIRMACION","La confirmación venció o ya fue utilizada. Prepare nuevamente el restablecimiento.");
      if(challenge.disponibleDesde>new Date())throw new NegativosError(409,"ESPERA","Espere los 30 segundos de seguridad antes de confirmar.");
      const fresh=await tx.usuario.findUniqueOrThrow({where:{id:actor.id},include:{asignaciones:true}});
      const session=await tx.sesionUsuario.findUnique({where:{tokenHash:digest(this.sessionToken)}});
      if(!session||session.usuarioId!==actor.id||session.expiresAt<=new Date()||!fresh.activo||fresh.estado!=="ACTIVO"||fresh.debeCambiarPassword||fresh.passwordHash!==actor.passwordHash||!fresh.asignaciones.some(g=>g.rol==="ADMINISTRADOR"&&g.ubicacionId===null))throw denied();
      const before=await counts(tx),expected=challenge.conteos as Record<string,number>;
      // Los intentos de acceso y sesiones cambian normalmente durante la confirmación.
      if(counted.some(t=>!["IntentoAcceso","SesionUsuario"].includes(t)&&before[t]!==expected[t]))throw new NegativosError(409,"DATOS_CAMBIARON","Se registraron cambios desde la revisión. Revise los totales y prepare nuevamente el restablecimiento.");
      const backup=await this.backup(schema);
      if(!/^pdmc-[\w.-]+\.dump$/.test(backup.nombre)||!/^[a-f0-9]{64}$/.test(backup.sha256)||backup.bytes<100)throw new NegativosError(503,"RESPALDO_REQUERIDO","El respaldo no es válido. No se borró ningún dato.");
      const truncated=tables.filter(t=>!["Usuario","RestablecimientoProyecto"].includes(t));
      // Lista cerrada, sin CASCADE: una dependencia nueva aborta la transacción.
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${truncated.map(quote).join(",")}`);
      // Queda solo este restablecimiento: su fecha es desde cuándo traen datos las consultas (consultasDesde).
      const sistema=await cuentaDeTransicion(tx);
      await tx.restablecimientoProyecto.deleteMany({where:{id:{not:challenge.id}}});
      await tx.usuario.deleteMany({where:{id:{notIn:[actor.id,...(sistema?[sistema.id]:[])]}}});
      await tx.usuario.update({where:{id:actor.id},data:{rol:"ADMINISTRADOR"}});
      await tx.asignacionAcceso.create({data:{usuarioId:actor.id,rol:"ADMINISTRADOR",ubicacionId:null}});
      const after=await counts(tx);
      const esperado:Record<string,number>={Usuario:sistema?2:1,AsignacionAcceso:1};
      if(counted.some(t=>after[t]!==(esperado[t]??0)))throw new NegativosError(503,"VERIFICACION","La verificación de limpieza falló. Se revirtieron los cambios.");
      await tx.restablecimientoProyecto.update({where:{id:challenge.id},data:{consumidoAt:new Date(),respaldoNombre:backup.nombre,respaldoSha256:backup.sha256}});
      await tx.auditoria.create({data:{usuarioId:actor.id,entidad:"RestablecimientoProyecto",entidadId:challenge.id,accion:"RESTABLECER_PROYECTO",motivo:"Restablecimiento total confirmado por el administrador con contraseña, frase y respaldo verificado",valorAnterior:before,valorNuevo:{respaldo:backup.nombre,sha256:backup.sha256,bytes:backup.bytes,administradorConservado:actor.id}}});
      return {restablecido:true,respaldo:backup.nombre,sha256:backup.sha256};
    },{timeout:600000,maxWait:10000}));
  }
}
