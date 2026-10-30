import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { roles, type Rol } from "@pdmc/contratos/auth/model";
import { allows, hasPermission, permissionMatrix, type Permission, type Grant } from "@pdmc/contratos/auth/permissions";
import { AuthError, emailSchema } from "../auth/service";
import { hashPassword, passwordSchema, verifyPassword } from "../auth/password";
import { denied } from "../auth/authorization";
import { lockWarehouse, operationalHistory } from "../negativos/operations";

const id = z.string().uuid();
const reason = z.string().trim().min(5).max(2000);
const name = z.string().trim().min(1).max(200);
const code = z.string().trim().min(1).max(80).transform(s=>s.toUpperCase());
const role = z.enum(Object.keys(roles) as [Rol,...Rol[]]);
export const grantSchema = z.array(z.object({rol:role,ubicacionId:id.nullable()}).strict()).max(100)
  .refine(rows=>new Set(rows.map(g=>`${g.rol}:${g.ubicacionId}`)).size===rows.length,"Asignaciones duplicadas");
const billingCode = code.nullable().default(null);
export const createUserSchema = z.object({email:emailSchema,nombre:name,passwordTemporal:passwordSchema,asignaciones:grantSchema,codigoFacturador:billingCode,motivo:reason}).strict();
export const editUserSchema = z.object({id,version:z.string().datetime(),nombre:name,email:emailSchema,asignaciones:grantSchema,codigoFacturador:billingCode,motivo:reason}).strict();
const pageSchema = z.object({q:z.string().trim().max(200).default(""),skip:z.coerce.number().int().min(0).max(100000).default(0),take:z.coerce.number().int().min(1).max(100).default(25)});
const userFilters = pageSchema.extend({estado:z.enum(["INVITADO","ACTIVO","BLOQUEADO","INACTIVO"]).optional(),rol:role.optional(),ubicacionId:id.optional()}).strict();
const safeUser = {id:true,email:true,nombre:true,estado:true,activo:true,debeCambiarPassword:true,passwordTemporalHasta:true,updatedAt:true,
  asignaciones:{select:{rol:true,ubicacionId:true,ubicacion:{select:{nombre:true,codigo:true,tipo:true}}}},
  vinculosOperativos:{where:{perfil:{tipo:"FACTURACION"}},select:{perfilId:true,perfil:{select:{codigo:true,nombre:true}}}},
  _count:{select:{asignados:true}}} as const;
const json = (v:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(v));
const canonical = (rows:{rol:Rol;ubicacionId:string|null}[])=>rows.map(g=>`${g.rol}:${g.ubicacionId}`).sort().join("|");
// A delegation must cover every permission of a role at the requested territory.
export function canDelegate(actor:Grant[], target:Grant[]) {
  return target.every(g=>permissionMatrix[g.rol].every(p=>allows(actor,p,g.ubicacionId?{id:g.ubicacionId,regionId:(g.ubicacion as {regionId?:string|null})?.regionId??null}:undefined)));
}
export async function ensureActiveAdministrator(tx:Prisma.TransactionClient) {
  const candidates=await tx.usuario.findMany({where:{activo:true,estado:"ACTIVO",debeCambiarPassword:false},select:{asignaciones:{include:{ubicacion:true}}}});
  if(!candidates.some(u=>allows(u.asignaciones,"accesos.administrar")&&allows(u.asignaciones,"usuarios.administrar")))
    throw new AuthError(409,"ULTIMO_ADMIN","Debe conservar al menos un administrador activo con acceso completo y contraseña definitiva.");
}
export class Administration {
  constructor(private db:PrismaClient, private actorId:string, private origin="ADMINISTRACION_WEB") {}
  private async actor(tx:Prisma.TransactionClient, permission:Permission) {
    const u=await tx.usuario.findUnique({where:{id:this.actorId},include:{asignaciones:{include:{ubicacion:true}}}});
    if(!u?.activo||u.estado!=="ACTIVO"||u.debeCambiarPassword||!allows(u.asignaciones,permission))throw denied();
    return u;
  }
  private async permittedActor(permission:Permission) {
    const user=await this.db.usuario.findUnique({where:{id:this.actorId},include:{asignaciones:{include:{ubicacion:true}}}});
    if(!user?.activo||user.estado!=="ACTIVO"||user.debeCambiarPassword||!hasPermission(user.asignaciones,permission))throw denied();
    return user;
  }
  private async mutation<T>(permission:Permission, fn:(tx:Prisma.TransactionClient,actor:Awaited<ReturnType<Administration["actor"]>>)=>Promise<T>) {
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(210001)::text`;
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${this.actorId}::uuid FOR UPDATE`;
      return fn(tx,await this.actor(tx,permission));
    },{timeout:30000});
  }
  private async audit(tx:Prisma.TransactionClient,entidad:string,entidadId:string,accion:string,motivo:string,before:unknown,after:unknown) {
    await tx.auditoria.create({data:{usuarioId:this.actorId,entidad,entidadId,accion,motivo,origen:this.origin,valorAnterior:json(before),valorNuevo:json(after)}});
  }
  private async grants(tx:Prisma.TransactionClient, rows:z.infer<typeof grantSchema>) {
    const result=[];
    for(const g of rows) {
      const location=g.ubicacionId?await tx.ubicacion.findUnique({where:{id:g.ubicacionId}}):null;
      if(g.ubicacionId&&!location)throw new AuthError(422,"UBICACION","La ubicación no existe.");
      if(g.rol==="ADMINISTRADOR"&&location)throw new AuthError(422,"ALCANCE","El administrador general gestiona todo el sistema y no se enlaza con una ubicación.");
      if(g.rol==="TIENDA"&&location?.tipo!=="TIENDA")throw new AuthError(422,"TIENDA","La cuenta de tienda debe enlazarse directamente con una tienda registrada.");
      // Sin alcance nacional: cada rol operativo trabaja sobre las bodegas y tiendas de su región.
      if(g.rol!=="ADMINISTRADOR"&&g.rol!=="TIENDA"&&location?.tipo!=="REGION")throw new AuthError(422,"REGION","Cada rol operativo debe enlazarse con una región. No existen cuentas operativas de alcance nacional.");
      result.push({...g,ubicacion:location});
    }
    return result;
  }
  private async target(tx:Prisma.TransactionClient,userId:string,actor:Awaited<ReturnType<Administration["actor"]>>) {
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${userId}::uuid FOR UPDATE`;
    const target=await tx.usuario.findUnique({where:{id:userId},include:{asignaciones:{include:{ubicacion:true}}}});
    if(!target)throw new AuthError(404,"USUARIO","Usuario no encontrado.");
    if(!canDelegate(actor.asignaciones,target.asignaciones))throw denied();
    return target;
  }
  private async preserveAdmin(tx:Prisma.TransactionClient) {
    await ensureActiveAdministrator(tx);
  }
  private async syncBillingProfile(tx:Prisma.TransactionClient,userId:string,userName:string,assignments:z.infer<typeof grantSchema>,billingCodeValue:string|null) {
    const hasBillingRole=assignments.some(g=>g.rol==="FACTURACION");
    if(hasBillingRole&&!billingCodeValue)throw new AuthError(422,"PERFIL_FACTURACION","Ingrese el código corporativo del facturador.");
    if(!hasBillingRole&&billingCodeValue)throw new AuthError(422,"PERFIL_FACTURACION","El código corporativo solo corresponde al rol Facturación.");
    const current=await tx.vinculoOperativo.findMany({where:{usuarioId:userId,perfil:{tipo:"FACTURACION"}},select:{id:true,perfilId:true,perfil:{select:{codigo:true}}}});
    if(current[0]?.perfil&&billingCodeValue&&current[0].perfil.codigo!==billingCodeValue)throw new AuthError(409,"CODIGO_FACTURADOR","El código corporativo es permanente. Cree otra cuenta si corresponde a otra persona.");
    let profileId:string|null=null;
    if(billingCodeValue) {
      const profile=await tx.perfilLaboral.upsert({where:{codigo:billingCodeValue},create:{codigo:billingCodeValue,nombre:userName,tipo:"FACTURACION"},update:{nombre:userName,activo:true},include:{vinculos:true}});
      if(profile.tipo!=="FACTURACION")throw new AuthError(409,"CODIGO_FACTURADOR","El código ya pertenece a otro tipo de registro.");
      if(profile.vinculos.some(link=>link.usuarioId!==userId))throw new AuthError(409,"PERFIL_EN_USO","Este código corporativo ya está vinculado a otra cuenta.");
      profileId=profile.id;
      // La cuenta puede crearse después de haber cargado la consulta corporativa.
      // En ese caso enlazamos también el histórico vigente que llegó con el mismo código.
      await Promise.all([
        tx.transferenciaConsulta.updateMany({where:{facturadorId:null,codigoFacturador:{equals:billingCodeValue,mode:"insensitive"}},data:{facturadorId:profile.id,codigoFacturador:profile.codigo}}),
        tx.devolucionConsulta.updateMany({where:{responsableId:null,codigoResponsable:{equals:billingCodeValue,mode:"insensitive"}},data:{responsableId:profile.id,codigoResponsable:profile.codigo}})
      ]);
    }
    await tx.vinculoOperativo.deleteMany({where:{id:{in:current.filter(link=>link.perfilId!==profileId).map(link=>link.id)}}});
    if(profileId&&!current.some(link=>link.perfilId===profileId))await tx.vinculoOperativo.create({data:{usuarioId:userId,perfilId:profileId}});
  }
  async users(raw:unknown) {
    await this.actor(this.db,"usuarios.administrar");
    const f=userFilters.parse(raw);
    const where:Prisma.UsuarioWhereInput={...(f.q?{OR:[{nombre:{contains:f.q,mode:"insensitive"}},{email:{contains:f.q,mode:"insensitive"}}]}:{}),estado:f.estado,
      ...((f.rol||f.ubicacionId)?{asignaciones:{some:{rol:f.rol,ubicacionId:f.ubicacionId}}}:{})};
    const [rows,total]=await this.db.$transaction([this.db.usuario.findMany({where,select:safeUser,orderBy:[{nombre:"asc"},{id:"asc"}],skip:f.skip,take:f.take}),this.db.usuario.count({where})]);
    return {rows,total};
  }
  async createUser(raw:unknown) {
    const input=createUserSchema.parse(raw);
    await this.actor(this.db,"usuarios.administrar");
    const hashed=await hashPassword(input.passwordTemporal);
    return this.mutation("usuarios.administrar",async(tx,actor)=>{
      if(!allows(actor.asignaciones,"accesos.administrar"))throw denied();
      if(!canDelegate(actor.asignaciones,await this.grants(tx,input.asignaciones)))throw denied();
      const u=await tx.usuario.create({data:{email:input.email,nombre:input.nombre,passwordHash:hashed,estado:"INVITADO",debeCambiarPassword:true,passwordTemporalHasta:new Date(Date.now()+48*3600000),
        rol:input.asignaciones[0]?.rol??"AUDITORIA",asignaciones:{create:input.asignaciones}},select:safeUser});
      await this.syncBillingProfile(tx,u.id,input.nombre,input.asignaciones,input.codigoFacturador);
      const result=await tx.usuario.findUniqueOrThrow({where:{id:u.id},select:safeUser});
      await this.audit(tx,"Usuario",u.id,"USUARIO_CREADO",input.motivo,null,result);
      return result;
    });
  }
  async editUser(raw:unknown) {
    const input=editUserSchema.parse(raw);
    return this.mutation("usuarios.administrar",async(tx,actor)=>{
      const target=await this.target(tx,input.id,actor);
      if(target.updatedAt.toISOString()!==input.version)throw new AuthError(409,"VERSION","El usuario cambió. Actualice la lista.");
      const changed=canonical(target.asignaciones)!==canonical(input.asignaciones);
      const currentBilling=await tx.vinculoOperativo.findMany({where:{usuarioId:target.id,perfil:{tipo:"FACTURACION"}},select:{perfilId:true}});
      const currentProfile=currentBilling[0]?.perfilId?await tx.perfilLaboral.findUnique({where:{id:currentBilling[0].perfilId},select:{codigo:true}}):null;
      const billingChanged=currentBilling.length!==Number(Boolean(input.codigoFacturador))||currentProfile?.codigo!==input.codigoFacturador;
      const accessChanged=changed||billingChanged;
      if(accessChanged&&target.id===actor.id)throw new AuthError(403,"AUTOELEVACION","Otro administrador debe autorizar los cambios de sus propios accesos.");
      if(accessChanged&&(!allows(actor.asignaciones,"accesos.administrar")||!canDelegate(actor.asignaciones,await this.grants(tx,input.asignaciones))))throw denied();
      const before=await tx.usuario.findUnique({where:{id:target.id},select:safeUser});
      if(changed) {
        await tx.asignacionAcceso.deleteMany({where:{usuarioId:target.id}});
        await tx.asignacionAcceso.createMany({data:input.asignaciones.map(g=>({...g,usuarioId:target.id}))});
      }
      await this.syncBillingProfile(tx,target.id,input.nombre,input.asignaciones,input.codigoFacturador);
      const after=await tx.usuario.update({where:{id:target.id},data:{nombre:input.nombre,email:input.email,rol:input.asignaciones[0]?.rol??"AUDITORIA"},select:safeUser});
      await this.preserveAdmin(tx);
      if(accessChanged||input.email!==target.email)await tx.sesionUsuario.deleteMany({where:{usuarioId:target.id}});
      await this.audit(tx,"Usuario",target.id,"USUARIO_EDITADO",input.motivo,before,after);
      return after;
    });
  }
  async password(raw:unknown) {
    const input=z.object({id,passwordTemporal:passwordSchema,motivo:reason}).strict().parse(raw);
    await this.actor(this.db,"usuarios.administrar");
    const hashed=await hashPassword(input.passwordTemporal);
    return this.mutation("usuarios.administrar",async(tx,actor)=>{
      const target=await this.target(tx,input.id,actor);
      if(target.id===actor.id)throw new AuthError(403,"PROPIA_PASSWORD","Use Cambiar contraseña para su propia cuenta.");
      if(await verifyPassword(input.passwordTemporal,target.passwordHash))throw new AuthError(422,"PASSWORD","Use una contraseña temporal diferente.");
      await tx.usuario.update({where:{id:target.id},data:{passwordHash:hashed,debeCambiarPassword:true,passwordTemporalHasta:new Date(Date.now()+48*3600000),passwordChangedAt:new Date()}});
      await this.preserveAdmin(tx);
      await tx.sesionUsuario.deleteMany({where:{usuarioId:target.id}});
      await this.audit(tx,"Usuario",target.id,"PASSWORD_RESTABLECIDO",input.motivo,{debeCambiarPassword:target.debeCambiarPassword},{debeCambiarPassword:true,vigenciaHoras:48});
      return {restablecida:true};
    });
  }
  async status(raw:unknown) {
    const input=z.object({id,estado:z.enum(["ACTIVO","BLOQUEADO","INACTIVO"]),transferirA:id.optional(),motivo:reason}).strict().parse(raw);
    return this.mutation("usuarios.administrar",async(tx,actor)=>{
      const target=await this.target(tx,input.id,actor);
      if(target.id===actor.id)throw new AuthError(403,"PROPIO_ESTADO","Otro administrador debe cambiar el estado de su cuenta.");
      let estado: "ACTIVO"|"INVITADO"|"BLOQUEADO"|"INACTIVO"=input.estado;
      if(estado==="ACTIVO") {
        if(!target.passwordHash)throw new AuthError(422,"PASSWORD","Establezca primero una contraseña temporal.");
        if(target.debeCambiarPassword) {
          if(!target.passwordTemporalHasta||target.passwordTemporalHasta<=new Date())throw new AuthError(422,"PASSWORD","Restablezca una contraseña temporal vigente antes de reactivar.");
          estado="INVITADO";
        }
      }
      if(input.transferirA&&input.estado==="ACTIVO")throw new AuthError(422,"TRANSFERENCIA","La reasignación acompaña al bloqueo o desactivación.");
      const transferidos=input.transferirA?await this.transfer(tx,target.id,input.transferirA,actor,input.motivo):0;
      const after=await tx.usuario.update({where:{id:target.id},data:{estado,activo:["ACTIVO","INVITADO"].includes(estado)},select:safeUser});
      await this.preserveAdmin(tx);
      await tx.sesionUsuario.deleteMany({where:{usuarioId:target.id}});
      await this.audit(tx,"Usuario",target.id,"ESTADO_USUARIO_CAMBIADO",input.motivo,{estado:target.estado,activo:target.activo},{estado,transferidos,transferirA:input.transferirA??null});
      return {usuario:after,transferidos};
    });
  }
  async transferCases(raw:unknown) {
    const input=z.object({id,transferirA:id,motivo:reason}).strict().parse(raw);
    return this.mutation("usuarios.administrar",async(tx,actor)=>{
      await this.target(tx,input.id,actor);
      return {transferidos:await this.transfer(tx,input.id,input.transferirA,actor,input.motivo)};
    });
  }
  private async transfer(tx:Prisma.TransactionClient,from:string,to:string,actor:Awaited<ReturnType<Administration["actor"]>>,motivo:string) {
    if(from===to)throw new AuthError(422,"RESPONSABLE","Seleccione otra cuenta.");
    const receiver=await this.target(tx,to,actor);
    if(!receiver.activo||receiver.estado!=="ACTIVO"||receiver.debeCambiarPassword)throw new AuthError(422,"RESPONSABLE","El nuevo responsable debe estar activo y haber cambiado su contraseña.");
    const where:Prisma.NegativoWhereInput={responsableId:from,anuladoAt:null,fusionadoEnId:null,estado:{notIn:["SOLUCIONADO","AJUSTE_REALIZADO","CERRADO_SIN_AJUSTE"]}};
    const warehouses=await tx.bodega.findMany({where:{negativos:{some:where}},include:{ubicacion:true},orderBy:{id:"asc"}});
    for(const b of warehouses) {
      const resource=b.ubicacion??undefined;
      if(!allows(actor.asignaciones,"negativos.editar",resource)||!allows(receiver.asignaciones,"negativos.editar",resource))throw denied();
      await lockWarehouse(tx,b.id);
    }
    const cases=await tx.negativo.findMany({where});
    for(const before of cases) {
      const after=await tx.negativo.update({where:{id:before.id},data:{responsableId:to,version:{increment:1}}});
      await operationalHistory(tx,before,after,"RESPONSABLE_TRANSFERIDO",motivo,this.actorId,this.origin);
    }
    await this.audit(tx,"Usuario",from,"CASOS_REASIGNADOS",motivo,{responsableId:from},{responsableId:to,casos:cases.map(c=>c.id)});
    return cases.length;
  }
  async entities(raw:unknown) {
    await this.actor(this.db,"ubicaciones.administrar");
    const f=pageSchema.extend({tipo:z.enum(["REGION","BODEGA","TIENDA"]).optional(),clase:z.literal("ubicaciones").default("ubicaciones"),regionId:z.union([id,z.literal("sin-region")]).optional()}).strict().parse(raw);
    const search=f.q?{OR:[{nombre:{contains:f.q,mode:"insensitive" as const}},{codigo:{contains:f.q,mode:"insensitive" as const}}]}:{};
    const regionWhere:Prisma.UbicacionWhereInput=f.regionId==="sin-region"?{tipo:{not:"REGION"},regionId:null}:f.regionId?{regionId:f.regionId}:{};
    const where:Prisma.UbicacionWhereInput={...search,...regionWhere,...(f.tipo?{tipo:{in:["REGION","BODEGA","TIENDA"].includes(f.tipo)?[f.tipo as "REGION"|"BODEGA"|"TIENDA"]:[]}}:{})};
    const [rows,total]=await this.db.$transaction([this.db.ubicacion.findMany({where,include:{region:true,tienda:true,vinculos:{select:{usuario:{select:{id:true,nombre:true,email:true}}}}},skip:f.skip,take:f.take,orderBy:[{nombre:"asc"},{id:"asc"}]}),this.db.ubicacion.count({where})]);
    return {rows,total};
  }
  async createEntity(raw:unknown) {
    const input=z.object({codigo:code,nombre:name,tipo:z.enum(["REGION","BODEGA","TIENDA"]),ubicacionId:id.nullable().default(null),motivo:reason}).strict().parse(raw);
    return this.mutation("ubicaciones.administrar",async tx=>{
      const parent=input.ubicacionId?await tx.ubicacion.findUnique({where:{id:input.ubicacionId}}):null;
      if(input.ubicacionId&&!parent)throw new AuthError(422,"UBICACION","Ubicación inexistente.");
      if(input.tipo==="REGION"?Boolean(parent):parent?.tipo!=="REGION")throw new AuthError(422,"REGION","Seleccione una región para tiendas y bodegas. Una región no tiene ubicación padre.");
      const entity=await tx.ubicacion.create({data:{codigo:input.codigo,nombre:input.nombre,tipo:input.tipo,regionId:parent?.id}});
      if(input.tipo==="TIENDA"){
        await tx.tienda.create({data:{codigo:entity.codigo,nombre:entity.nombre,ubicacionId:entity.id}});
        await Promise.all([
          tx.transferenciaConsulta.updateMany({where:{tiendaId:null,codigoTiendaConsulta:{equals:entity.codigo,mode:"insensitive"}},data:{tiendaId:entity.id,codigoTiendaConsulta:entity.codigo}}),
          tx.devolucionConsulta.updateMany({where:{tiendaId:null,codigoTiendaConsulta:{equals:entity.codigo,mode:"insensitive"}},data:{tiendaId:entity.id,codigoTiendaConsulta:entity.codigo}})
        ]);
      }
      // No crea destinos de importación ni altera el contexto general de negativos.
      if(input.tipo==="BODEGA")await tx.bodegaProducto.upsert({where:{nombre:input.nombre},create:{nombre:input.nombre},update:{}});
      await this.audit(tx,"Ubicacion",entity.id,"UBICACION_CREADA",input.motivo,null,entity);return entity;
    });
  }
  async link(raw:unknown) {
    const input=z.object({id,clase:z.literal("ubicaciones"),usuarios:z.array(id).max(100).refine(a=>new Set(a).size===a.length),motivo:reason}).strict().parse(raw);
    return this.mutation("ubicaciones.administrar",async(tx,actor)=>{
      if(!allows(actor.asignaciones,"usuarios.administrar"))throw denied();
      const entity=await tx.ubicacion.findUnique({where:{id:input.id}});
      if(!entity)throw new AuthError(404,"ENTIDAD","Entidad no encontrada.");
      for(const u of [...input.usuarios].sort())await this.target(tx,u,actor);
      const where={ubicacionId:input.id};
      const before=await tx.vinculoOperativo.findMany({where});
      await tx.vinculoOperativo.deleteMany({where});
      await tx.vinculoOperativo.createMany({data:input.usuarios.map(usuarioId=>({...where,usuarioId}))});
      let accesoTienda=false;
      if(entity.tipo==="TIENDA"){
        const previous=await tx.asignacionAcceso.findMany({where:{ubicacionId:input.id,rol:"TIENDA"},select:{usuarioId:true}});
        await tx.asignacionAcceso.deleteMany({where:{ubicacionId:input.id,rol:"TIENDA",usuarioId:{notIn:input.usuarios}}});
        await tx.asignacionAcceso.createMany({data:input.usuarios.map(usuarioId=>({usuarioId,ubicacionId:input.id,rol:"TIENDA"})),skipDuplicates:true});
        const affected=[...new Set([...previous.map(row=>row.usuarioId),...input.usuarios])];
        if(affected.length)await tx.sesionUsuario.deleteMany({where:{usuarioId:{in:affected}}});
        accesoTienda=true;
      }
      await this.audit(tx,"Ubicacion",input.id,"USUARIOS_VINCULADOS",input.motivo,before.map(v=>v.usuarioId),{usuarios:input.usuarios,accesoTienda});
      return {vinculados:input.usuarios.length};
    });
  }
  async updateEntity(raw:unknown) {
    const input=z.object({id,clase:z.literal("ubicaciones"),nombre:name,ubicacionId:id.nullable(),activa:z.boolean().optional(),motivo:reason}).strict().parse(raw);
    return this.mutation("ubicaciones.administrar",async tx=>{
      const before=await tx.ubicacion.findUnique({where:{id:input.id},include:{tienda:true}});if(!before)throw new AuthError(404,"ENTIDAD","Entidad no encontrada.");
      const region=input.ubicacionId?await tx.ubicacion.findUnique({where:{id:input.ubicacionId}}):null;
      if(before.tipo==="REGION"&&input.ubicacionId)throw new AuthError(422,"REGION","Una región no tiene región padre.");
      if(before.tipo!=="REGION"&&region?.tipo!=="REGION")throw new AuthError(422,"REGION","Las tiendas y bodegas deben pertenecer a una región.");
      const after=await tx.ubicacion.update({where:{id:input.id},data:{nombre:input.nombre,regionId:before.tipo==="REGION"?null:input.ubicacionId}});
      if(before.tipo==="TIENDA")await tx.tienda.upsert({where:{ubicacionId:input.id},create:{codigo:before.codigo,nombre:input.nombre,activa:input.activa??true,ubicacionId:input.id},update:{nombre:input.nombre,activa:input.activa}});
      await this.audit(tx,"Ubicacion",input.id,"UBICACION_EDITADA",input.motivo,before,after);return after;
    });
  }
  async assignStoresRegion(raw:unknown) {
    const input=z.object({tiendaIds:z.array(id).min(1).max(500).refine(values=>new Set(values).size===values.length,"No repita tiendas."),regionId:id,motivo:reason}).strict().parse(raw);
    return this.mutation("ubicaciones.administrar",async tx=>{
      const region=await tx.ubicacion.findUnique({where:{id:input.regionId}});
      if(region?.tipo!=="REGION")throw new AuthError(422,"REGION","Seleccione una región válida.");
      const stores=await tx.ubicacion.findMany({where:{id:{in:input.tiendaIds}},orderBy:{id:"asc"}});
      if(stores.length!==input.tiendaIds.length)throw new AuthError(404,"TIENDA","Alguna tienda seleccionada ya no existe.");
      if(stores.some(store=>store.tipo!=="TIENDA"))throw new AuthError(422,"TIENDA","La selección solo puede contener tiendas.");
      if(stores.some(store=>store.regionId!==null))throw new AuthError(409,"REGION","Alguna tienda ya tiene región. Actualice la lista antes de continuar.");
      const changed=await tx.ubicacion.updateMany({where:{id:{in:input.tiendaIds},tipo:"TIENDA",regionId:null},data:{regionId:region.id}});
      if(changed.count!==stores.length)throw new AuthError(409,"REGION","Las tiendas cambiaron durante la operación. Actualice la lista.");
      for(const store of stores)await this.audit(tx,"Ubicacion",store.id,"REGION_ASIGNADA_MASIVO",input.motivo,{regionId:null},{regionId:region.id,region:region.nombre});
      return {actualizadas:changed.count,region:{id:region.id,codigo:region.codigo,nombre:region.nombre}};
    });
  }
  async deleteEntity(raw:unknown) {
    const input=z.object({id,clase:z.literal("ubicaciones"),motivo:reason,confirmacion:z.literal("ELIMINAR")}).strict().parse(raw);
    return this.mutation("ubicaciones.administrar",async tx=>{
      const before=await tx.ubicacion.findUnique({where:{id:input.id},include:{tienda:true,bodega:{select:{id:true,_count:{select:{negativos:true}}}},_count:{select:{ubicaciones:true,asignaciones:true,perfiles:true,inconsistenciasReportadas:true,transferenciasReportadas:true,codigosNoInventario:true,transferenciasConsulta:true,pedidosTienda:true}}}});
      if(!before)throw new AuthError(404,"ENTIDAD","Entidad no encontrada.");
      const blockers=before._count,details=[
        [blockers.transferenciasConsulta,"transferencias cargadas"],
        [blockers.transferenciasReportadas,"reportes de transferencia"],
        [blockers.inconsistenciasReportadas,"inconsistencias"],
        [blockers.codigosNoInventario,"códigos no registrados"],
        [blockers.pedidosTienda,"pedidos"],
        [blockers.asignaciones,"accesos de usuario"],
        [blockers.perfiles,"perfiles laborales"],
        [blockers.ubicaciones,"ubicaciones dependientes"],
        [before.bodega?._count.negativos??0,"negativos"],
      ] as const,active=details.filter(([count])=>count>0);
      if(active.length)throw new AuthError(409,"ENTIDAD_EN_USO",`No puede eliminarse porque conserva ${active.map(([count,label])=>`${count} ${label}`).join(", ")}. Para probar el enlace, cree una tienda temporal con un código nuevo.`);
      await tx.vinculoOperativo.deleteMany({where:{ubicacionId:input.id}});
      if(before.tienda)await tx.tienda.delete({where:{id:before.tienda.id}});
      if(before.bodega)await tx.bodega.delete({where:{id:before.bodega.id}});
      await tx.ubicacion.delete({where:{id:input.id}});
      await this.audit(tx,"Ubicacion",input.id,"UBICACION_ELIMINADA",input.motivo,before,null);return {eliminada:true};
    });
  }
  async auditLog(raw:unknown) {
    const actor=await this.permittedActor("auditoria.leer");
    const f=pageSchema.extend({usuarioId:id.optional(),accion:z.string().max(80).optional(),entidad:z.string().max(80).optional(),entidadId:id.optional(),desde:z.string().datetime().optional(),hasta:z.string().datetime().optional()}).strict().parse(raw);
    if(f.desde&&f.hasta&&f.desde>f.hasta)throw new AuthError(422,"FECHA","El rango de fechas no es válido.");
    const base:Prisma.AuditoriaWhereInput={usuarioId:f.usuarioId,accion:f.accion,entidad:f.entidad,entidadId:f.entidadId,
      ...((f.desde||f.hasta)?{createdAt:{gte:f.desde,lte:f.hasta}}:{}),...(f.q?{OR:[{motivo:{contains:f.q,mode:"insensitive"}},{accion:{contains:f.q,mode:"insensitive"}},{origen:{contains:f.q,mode:"insensitive"}}]}:{})};
    const national=allows(actor.asignaciones,"auditoria.leer");
    let where=base;
    if(!national){
      const regionIds=actor.asignaciones.filter(grant=>grant.ubicacion?.tipo==="REGION"&&permissionMatrix[grant.rol].includes("auditoria.leer")).map(grant=>grant.ubicacionId!).filter(Boolean);
      const locations=await this.db.ubicacion.findMany({where:{OR:[{id:{in:regionIds}},{regionId:{in:regionIds}}]},select:{id:true,bodega:{select:{id:true}}}});
      const locationIds=locations.map(row=>row.id),warehouseIds=locations.flatMap(row=>row.bodega?[row.bodega.id]:[]);
      const [issues,reports,unknowns,orders,negatives]=await Promise.all([
        this.db.inconsistencia.findMany({where:{tiendaId:{in:locationIds}},select:{id:true}}),
        this.db.reporteTransferenciaTienda.findMany({where:{tiendaId:{in:locationIds}},select:{id:true}}),
        this.db.inconsistenciaCodigoNoInventario.findMany({where:{tiendaId:{in:locationIds}},select:{id:true}}),
        this.db.pedidoTienda.findMany({where:{tiendaId:{in:locationIds}},select:{id:true}}),
        this.db.negativo.findMany({where:{bodegaId:{in:warehouseIds}},select:{id:true}}),
      ]);
      const scope:Prisma.AuditoriaWhereInput={OR:[
        {entidad:"Ubicacion",entidadId:{in:locationIds}},
        {entidad:"Bodega",entidadId:{in:warehouseIds}},
        {entidad:"Inconsistencia",entidadId:{in:issues.map(row=>row.id)}},
        {entidad:"ReporteTransferenciaTienda",entidadId:{in:reports.map(row=>row.id)}},
        {entidad:"InconsistenciaCodigoNoInventario",entidadId:{in:unknowns.map(row=>row.id)}},
        {entidad:"PedidoTienda",entidadId:{in:orders.map(row=>row.id)}},
        {entidad:"Negativo",entidadId:{in:negatives.map(row=>row.id)}},
      ]};
      where={AND:[base,scope]};
    }
    const [rows,total]=await this.db.$transaction([this.db.auditoria.findMany({where,include:{usuario:{select:{id:true,nombre:true,email:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:f.skip,take:f.take}),this.db.auditoria.count({where})]);
    return {rows,total};
  }
}
