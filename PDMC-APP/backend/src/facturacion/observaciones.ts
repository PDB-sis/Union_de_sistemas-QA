import {z} from "zod";
import type {Prisma,PrismaClient} from "../../generated/prisma/client";
import {allows,permissionMatrix} from "@pdmc/contratos/auth/permissions";
import {Authorization,denied} from "../auth/authorization";
import {NegativosError,uuid} from "../negativos/validation";

const querySchema=z.object({perfilId:uuid.optional()});
const createSchema=z.object({
  perfilId:uuid,
  titulo:z.string().trim().min(4).max(160),
  detalle:z.string().trim().min(8).max(5000),
  prioridad:z.enum(["BAJA","MEDIA","ALTA"]).default("MEDIA"),
  transferencia:z.string().trim().max(128).optional().transform(value=>value||null),
}).strict();
const statusSchema=z.object({id:uuid,estado:z.enum(["LEIDA","ATENDIDA"])}).strict();

export class BillingObservationService{
  constructor(private db:PrismaClient,private access:Authorization){}

  private async profileWhere(permission:"facturacion.leer"|"facturacion.observar"):Promise<Prisma.PerfilLaboralWhereInput>{
    const grants=await this.access.grants();
    const relevant=grants.filter(grant=>permissionMatrix[grant.rol].includes(permission));
    if(!relevant.length)throw denied();
    const billingAccount=relevant.some(grant=>grant.rol==="FACTURACION");
    if(billingAccount)return {tipo:"FACTURACION",activo:true,vinculos:{some:{usuarioId:this.access.userId}}};
    if(allows(grants,permission))return {tipo:"FACTURACION",activo:true};
    const regionIds=relevant.filter(grant=>grant.ubicacion?.tipo==="REGION"&&grant.ubicacionId).map(grant=>grant.ubicacionId!);
    const locationIds=relevant.flatMap(grant=>grant.ubicacionId?[grant.ubicacionId]:[]);
    return {tipo:"FACTURACION",activo:true,OR:[
      {ubicacionId:{in:locationIds}},
      {ubicacion:{regionId:{in:regionIds}}},
      {vinculos:{some:{usuario:{asignaciones:{some:{ubicacionId:{in:locationIds}}}}}}},
    ]};
  }

  private async profile(id:string,permission:"facturacion.leer"|"facturacion.observar"){
    const profile=await this.db.perfilLaboral.findFirst({where:{AND:[await this.profileWhere(permission),{id}]},select:{id:true,codigo:true,nombre:true}});
    if(!profile)throw denied();
    return profile;
  }

  async list(raw:unknown){
    await this.access.permitted("facturacion.leer");
    const input=querySchema.parse(raw),where=await this.profileWhere("facturacion.leer");
    const profiles=await this.db.perfilLaboral.findMany({where,select:{id:true,codigo:true,nombre:true},orderBy:{nombre:"asc"}});
    const allowedIds=profiles.map(profile=>profile.id),selected=input.perfilId&&allowedIds.includes(input.perfilId)?input.perfilId:null;
    if(input.perfilId&&!selected)throw denied();
    const observations=await this.db.observacionFacturador.findMany({
      where:{perfilId:selected??{in:allowedIds}},
      include:{perfil:{select:{codigo:true,nombre:true}},autor:{select:{nombre:true}}},
      orderBy:[{createdAt:"desc"}],take:300,
    });
    return {profiles,canCreate:await this.access.has("facturacion.observar"),observations};
  }

  async create(raw:unknown){
    await this.access.permitted("facturacion.observar");
    const input=createSchema.parse(raw),profile=await this.profile(input.perfilId,"facturacion.observar");
    if(input.transferencia){
      const transfer=await this.db.transferenciaConsulta.findFirst({where:{numero:input.transferencia,facturadorId:profile.id,bajaEn:null},select:{id:true}});
      if(!transfer)throw new NegativosError(422,"TRANSFERENCIA","La transferencia indicada no pertenece a este facturador.");
    }
    return this.db.$transaction(async tx=>{
      const observation=await tx.observacionFacturador.create({data:{...input,autorId:this.access.userId!},include:{perfil:{select:{codigo:true,nombre:true}},autor:{select:{nombre:true}}}});
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"ObservacionFacturador",entidadId:observation.id,accion:"CREAR_OBSERVACION_MEJORA",motivo:`Observación de mejora para ${profile.codigo}`,valorNuevo:{perfilId:profile.id,titulo:observation.titulo,prioridad:observation.prioridad,transferencia:observation.transferencia}}});
      return observation;
    });
  }

  async updateStatus(raw:unknown){
    await this.access.permitted("facturacion.leer");
    if(!(await this.access.grants()).some(grant=>grant.rol==="FACTURACION"))throw denied();
    const input=statusSchema.parse(raw),current=await this.db.observacionFacturador.findUnique({where:{id:input.id},select:{id:true,perfilId:true,estado:true}});
    if(!current)throw new NegativosError(404,"OBSERVACION","La observación no existe.");
    await this.profile(current.perfilId,"facturacion.leer");
    const now=new Date(),updated=await this.db.observacionFacturador.update({where:{id:current.id},data:{estado:input.estado,...(input.estado==="LEIDA"?{leidaAt:now}:{leidaAt:now,atendidaAt:now})},include:{perfil:{select:{codigo:true,nombre:true}},autor:{select:{nombre:true}}}});
    await this.db.auditoria.create({data:{usuarioId:this.access.userId,entidad:"ObservacionFacturador",entidadId:updated.id,accion:"ACTUALIZAR_OBSERVACION_MEJORA",motivo:`Observación marcada como ${input.estado.toLowerCase()}`,valorAnterior:{estado:current.estado},valorNuevo:{estado:updated.estado}}});
    return updated;
  }
}
