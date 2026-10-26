import "server-only";
import {z} from "zod";
import type {Prisma,PrismaClient} from "../../../generated/prisma/client";
import {INCONSISTENCY_OPTIONS,FORMAS_CORRECCION,MOTIVOS,RESPONSABLES,TIPOS_AJUSTE,VEREDICTOS} from "../../../shared/inconsistencias/options";
import {closureIssue} from "../../../shared/inconsistencias/workflow";
import {canonicalOption} from "../../../shared/inconsistencias/option-value";
import {adjustmentFromCount,bulkInconsistencySchema} from "../../../shared/inconsistencias/bulk";
import {countVisibility,countWorkflow} from "../../../shared/workflow/count-routing";
import {currentMonth,monthRange} from "../../../shared/month";
import {denied,Authorization} from "../auth/authorization";
import {NegativosError,uuid} from "../negativos/validation";
const option=<T extends readonly [string,...string[]]>(values:T)=>z.preprocess(v=>typeof v==="string"?canonicalOption(v,values):v,z.union([z.enum(values),z.literal(""),z.null()])).transform(v=>v||null);

export const editSchema=z.object({
  id:uuid,version:z.number().int().min(1),conteoFisico:z.number().int().min(0).max(10_000_000).nullable(),motivo:option(MOTIVOS),responsable:z.enum(RESPONSABLES),comentarioAdmin:z.string().trim().max(5000).nullable(),
  formaCorreccion:option(FORMAS_CORRECCION),numeroCorreccion:z.string().trim().max(100).nullable(),
  unidadesAjustadas:z.number().int().min(0).max(10_000_000),unidadesSinResolver:z.number().int().min(0).max(10_000_000),
  resuelto:z.boolean(),ajustar:option(TIPOS_AJUSTE),cantidadAjuste:z.number().int().min(0).max(10_000_000).nullable(),
  numeroAjuste:z.string().trim().max(128).nullable(),veredicto:option(VEREDICTOS),ajustado:z.boolean(),
}).strict();

export class InconsistencyService{
  constructor(private db:PrismaClient,private access:Authorization){}
  private async assertCaseAccess(permission:"inconsistencias.editar"|"inconsistencias.conteo",row:{tiendaId:string|null;sucursal:string}){
    const scope=await this.access.locationScope(permission,"TIENDA");
    if(!scope.national&&!scope.rows.some(store=>row.tiendaId?store.id===row.tiendaId:store.nombre.toLocaleLowerCase()===row.sucursal.toLocaleLowerCase()))throw denied();
  }
  async productProblems(raw:unknown){
    await this.access.permitted("productos.problemas.leer");
    const input=z.object({mes:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(currentMonth())}).parse(raw);
    const storeScope=await this.access.locationScope("inconsistencias.leer","TIENDA");
    const rows=await this.db.inconsistencia.findMany({where:{fecha:monthRange(input.mes),...(!storeScope.national?{tiendaId:{in:storeScope.rows.map(store=>store.id)}}:{})},select:{codigoBarra:true,referencia:true,cantidadErrada:true,resuelto:true,producto:{select:{descripcion:true,marca:true}}}});
    const grouped=new Map<string,{codigoBarra:string;referencia:string|null;descripcion:string|null;marca:string|null;casos:number;unidades:number;pendientes:number}>();
    for(const row of rows){const current=grouped.get(row.codigoBarra)??{codigoBarra:row.codigoBarra,referencia:row.referencia,descripcion:row.producto?.descripcion??null,marca:row.producto?.marca??null,casos:0,unidades:0,pendientes:0};current.casos++;current.unidades+=row.cantidadErrada;if(!row.resuelto)current.pendientes++;grouped.set(row.codigoBarra,current)}
    return {mes:input.mes,totalProductos:grouped.size,rows:[...grouped.values()].sort((a,b)=>b.casos-a.casos||b.unidades-a.unidades).slice(0,20)};
  }
  async list(raw:unknown){
    await this.access.permitted("inconsistencias.leer");
    const storeScope=await this.access.locationScope("inconsistencias.leer","TIENDA");
    const canCount=await this.access.has("inconsistencias.conteo"),canEdit=await this.access.has("inconsistencias.editar");
    const automaticWorkflow=countWorkflow(canCount,canEdit);
    const input=z.object({q:z.string().trim().max(200).default(""),mes:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(currentMonth()),estado:z.enum(["todos","pendientes","resueltos","ajuste"]).default("pendientes"),tipo:z.enum(["todos","faltantes","sobrantes"]).default("todos"),sucursal:z.string().trim().max(250).default(""),bodegaProductoId:uuid.or(z.literal("")).default(""),flujo:z.enum(["todos","trabajo"]).default("todos"),cola:z.enum(["automatica","pendientes","gestion","corregir","verificar"]).default("automatica"),skip:z.coerce.number().int().min(0).max(1_000_000).default(0),take:z.coerce.number().int().min(1).max(100).default(25)}).parse(raw);
    const workflow=input.cola==="pendientes"&&canEdit?"conteo":input.cola==="gestion"&&canEdit?"gestion":automaticWorkflow;
    const source:Prisma.InconsistenciaWhereInput={};
    const territory:Prisma.InconsistenciaWhereInput=storeScope.national?{}:{OR:[{tiendaId:{in:storeScope.rows.map(store=>store.id)}},...storeScope.rows.map(store=>({tiendaId:null,sucursal:{equals:store.nombre,mode:"insensitive" as const}}))]};
    const summaryFlow:Prisma.InconsistenciaWhereInput={AND:[territory,...(input.bodegaProductoId?[{OR:[{bodegaProductoId:input.bodegaProductoId},{bodegaProductoId:null,producto:{inventarios:{some:{bodegaProductoId:input.bodegaProductoId}}}}]}]:[])],fecha:monthRange(input.mes),...(input.sucursal?{sucursal:input.sucursal}:{}),...(input.tipo==="faltantes"?{tipoError:{contains:"faltante",mode:"insensitive"}}:input.tipo==="sobrantes"?{tipoError:{contains:"sobrante",mode:"insensitive"}}:{})};
    const queue:Prisma.InconsistenciaWhereInput=input.cola==="gestion"?{conteoFisico:{not:null},ajustado:false,formaCorreccion:null}:input.cola==="corregir"?{conteoFisico:{not:null},ajustado:false,formaCorreccion:{not:null}}:input.cola==="verificar"?{conteoFisico:{not:null},ajustado:true}:{};
    const flow:Prisma.InconsistenciaWhereInput={...(input.flujo==="trabajo"?countVisibility(workflow):{}),...(input.flujo==="trabajo"&&canEdit?queue:{}),...source,fecha:monthRange(input.mes)};
    const where:Prisma.InconsistenciaWhereInput={
      ...flow,
      ...(input.estado==="pendientes"?{resuelto:false}:input.estado==="resueltos"?{resuelto:true}:input.estado==="ajuste"?{OR:[{ajustar:{not:null}},{ajustado:true}]}:{}),
      ...(input.sucursal?{sucursal:input.sucursal}:{}),
      ...(input.tipo==="faltantes"?{tipoError:{contains:"faltante",mode:"insensitive"}}:input.tipo==="sobrantes"?{tipoError:{contains:"sobrante",mode:"insensitive"}}:{}),
      AND:[
        ...(!storeScope.national?[{OR:[{tiendaId:{in:storeScope.rows.map(store=>store.id)}},...storeScope.rows.map(store=>({tiendaId:null,sucursal:{equals:store.nombre,mode:"insensitive" as const}}))]}]:[]),
        ...(input.bodegaProductoId?[{OR:[{bodegaProductoId:input.bodegaProductoId},{bodegaProductoId:null,producto:{inventarios:{some:{bodegaProductoId:input.bodegaProductoId}}}}]}]:[]),
        ...(input.q?[{OR:[{transferencia:{contains:input.q,mode:"insensitive" as const}},{codigoBarra:{contains:input.q,mode:"insensitive" as const}},{referencia:{contains:input.q,mode:"insensitive" as const}},{comentarioAdmin:{contains:input.q,mode:"insensitive" as const}}]}]:[]),
      ],
    };
    const [rows,total,summary,stores,warehouses]=await Promise.all([
      this.db.inconsistencia.findMany({where,skip:input.skip,take:input.take,orderBy:[{resuelto:"asc"},{fecha:"asc"},{id:"asc"}],include:{bodegaProducto:true,producto:{include:{inventarios:{include:{bodegaProducto:true},take:5}}}}}),
      this.db.inconsistencia.count({where}),
      Promise.all([this.db.inconsistencia.count({where:summaryFlow}),this.db.inconsistencia.count({where:{...summaryFlow,resuelto:false}}),this.db.inconsistencia.count({where:{...summaryFlow,resuelto:true}}),this.db.inconsistencia.count({where:{...summaryFlow,ajustado:true}}),this.db.inconsistencia.count({where:{...summaryFlow,resuelto:false,conteoFisico:null}}),this.db.inconsistencia.count({where:{...summaryFlow,resuelto:false,conteoFisico:{not:null},ajustado:false,formaCorreccion:null}}),this.db.inconsistencia.count({where:{...summaryFlow,resuelto:false,conteoFisico:{not:null},ajustado:false,formaCorreccion:{not:null}}}),this.db.inconsistencia.count({where:{...summaryFlow,resuelto:false,conteoFisico:{not:null},ajustado:true}})]),
      this.db.inconsistencia.findMany({where:territory,distinct:["sucursal"],select:{sucursal:true},orderBy:{sucursal:"asc"}}),
      this.db.bodegaProducto.findMany({select:{id:true,nombre:true},orderBy:{nombre:"asc"}}),
    ]);
    return {workflow,rows,total,skip:input.skip,take:input.take,summary:{total:summary[0],pendientes:summary[1],resueltos:summary[2],ajustados:summary[3],sinConteo:summary[4],conConteo:summary[5],porCorregir:summary[6],porVerificar:summary[7]},stores:stores.map(x=>x.sucursal),warehouses,options:INCONSISTENCY_OPTIONS};
  }
  async update(raw:unknown){
    await this.access.permitted("inconsistencias.editar");const input=editSchema.parse(raw);
    const issue=closureIssue(input);if(issue)throw new NegativosError(422,"CIERRE_INCOMPLETO",issue);
    if(input.ajustado&&(!input.ajustar||!input.cantidadAjuste||!input.numeroAjuste||!input.veredicto))throw new NegativosError(422,"AJUSTE_INCOMPLETO","Para marcar Ajustado complete tipo, cantidad, número de ajuste y veredicto.");
    if(input.resuelto&&!input.motivo&&!input.formaCorreccion)throw new NegativosError(422,"CIERRE_INCOMPLETO","Para resolver el caso indique el motivo o cómo se corrigió.");
    const user=await this.db.usuario.findUniqueOrThrow({where:{id:this.access.userId},select:{email:true,nombre:true}}),before=await this.db.inconsistencia.findUnique({where:{id:input.id},include:{producto:{include:{inventarios:{take:1}}}}});if(!before)throw new NegativosError(404,"CASO","La inconsistencia no existe.");if(before.version!==input.version)throw new NegativosError(409,"VERSION","El caso cambió; actualice la vista.");if(before.conteoFisico===null)throw new NegativosError(409,"CONTEO_PENDIENTE","Rectificación debe registrar el conteo físico antes de gestionar este caso.");
    await this.assertCaseAccess("inconsistencias.editar",before);
    const countChanged=input.conteoFisico!==before.conteoFisico||Boolean(input.conteoFisico!==null&&before.existenciaSistemaConteo===null),inventory=before.producto?.inventarios[0];
    if(countChanged&&input.conteoFisico!==null&&!inventory)throw new NegativosError(422,"INVENTARIO_NO_DISPONIBLE","No se puede registrar el conteo porque el producto no está en el inventario vigente.");
    const values={conteoFisico:input.conteoFisico,...(countChanged?{existenciaSistemaConteo:input.conteoFisico===null?null:Number(inventory!.existencia),conteoRegistradoAt:input.conteoFisico===null?null:new Date()}:{}),motivo:input.motivo,responsable:input.responsable,comentarioAdmin:input.comentarioAdmin||null,formaCorreccion:input.formaCorreccion,numeroCorreccion:input.numeroCorreccion||null,unidadesAjustadas:input.unidadesAjustadas,unidadesSinResolver:input.unidadesSinResolver,resuelto:input.resuelto,ajustar:input.ajustar,cantidadAjuste:input.cantidadAjuste||null,numeroAjuste:input.numeroAjuste||null,veredicto:input.veredicto,ajustado:input.ajustado,actualizadoPorId:this.access.userId,usuarioPdmc:user.email,version:{increment:1}} as const;
    const after=await this.db.$transaction(async tx=>{const changed=await tx.inconsistencia.updateMany({where:{id:input.id,version:input.version},data:values});if(!changed.count)throw new NegativosError(409,"VERSION","El caso cambió; actualice la vista.");const result=await tx.inconsistencia.findUniqueOrThrow({where:{id:input.id}});await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"Inconsistencia",entidadId:input.id,accion:"EDITAR_SEGUIMIENTO",motivo:"Seguimiento editado desde PDMC",valorAnterior:{motivo:before.motivo,responsable:before.responsable,formaCorreccion:before.formaCorreccion,resuelto:before.resuelto,numeroAjuste:before.numeroAjuste,ajustado:before.ajustado},valorNuevo:{motivo:result.motivo,responsable:result.responsable,formaCorreccion:result.formaCorreccion,resuelto:result.resuelto,numeroAjuste:result.numeroAjuste,ajustado:result.ajustado}}});return result;});
    return after;
  }
  async updateMany(raw:unknown){
    await this.access.permitted("inconsistencias.editar");
    const input=bulkInconsistencySchema.parse(raw),ids=input.cases.map(item=>item.id);
    const user=await this.db.usuario.findUniqueOrThrow({where:{id:this.access.userId},select:{email:true}});
    const updated=await this.db.$transaction(async tx=>{
      const current=await tx.inconsistencia.findMany({where:{id:{in:ids}},include:{producto:{include:{inventarios:{take:1}}}}});
      if(current.length!==ids.length)throw new NegativosError(404,"CASO","Alguno de los casos seleccionados ya no existe.");
      for(const row of current)await this.assertCaseAccess("inconsistencias.editar",row);
      const byId=new Map(current.map(item=>[item.id,item]));
      if(input.cases.some(item=>byId.get(item.id)?.version!==item.version))throw new NegativosError(409,"VERSION","Algún caso cambió; actualice la lista y vuelva a seleccionarlo.");
      if(current.some(item=>item.resuelto))throw new NegativosError(422,"ESTADO","Seleccione únicamente inconsistencias pendientes.");
      if(current.some(item=>item.conteoFisico===null))throw new NegativosError(422,"CONTEO_PENDIENTE","Todos los casos deben tener conteo físico antes de gestionarlos.");
      if(input.action==="ajustar"&&current.some(item=>item.ajustado))throw new NegativosError(422,"AJUSTE","Algún caso ya tiene un ajuste registrado; revíselo individualmente antes de repetirlo.");
      if(new Set(current.map(item=>item.tipoError.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase())).size!==1)throw new NegativosError(422,"TIPO","El lote debe contener el mismo tipo de inconsistencia.");
      const results=[];
      for(const item of input.cases){
        const before=byId.get(item.id)!;
        if(input.action==="ajustar"&&(item.systemQuantity===undefined||item.systemQuantity!==before.existenciaSistemaConteo))throw new NegativosError(409,"INVENTARIO","La fotografía de inventario cambió; actualice la lista antes de ajustar.");
        const adjustment=input.action==="ajustar"?adjustmentFromCount(before.conteoFisico,before.existenciaSistemaConteo):null;
        if(input.action==="ajustar"&&!adjustment)throw new NegativosError(422,"CONTEO","Para ajustar, todos los casos deben tener conteo físico e inventario vigentes con diferencia entera distinta de cero.");
        const changes:Prisma.InconsistenciaUncheckedUpdateManyInput={
          ...(input.motivo?{motivo:input.motivo}:{}),
          ...(input.responsable?{responsable:input.responsable}:{}),
          ...(input.formaCorreccion?{formaCorreccion:input.formaCorreccion}:{}),
          ...(input.comentarioAdmin?{comentarioAdmin:input.comentarioAdmin}:{}),
          ...(input.numeroCorreccion?{numeroCorreccion:input.numeroCorreccion}:{}),
          ...(input.action==="resolver"?{resuelto:true,unidadesSinResolver:0}:{}),
          ...(adjustment?{formaCorreccion:"Ajuste de inventario",resuelto:false,ajustado:true,ajustar:adjustment.type,cantidadAjuste:adjustment.quantity,numeroAjuste:input.numeroAjuste,veredicto:adjustment.verdict,unidadesAjustadas:adjustment.quantity,unidadesSinResolver:0}:{}),
          actualizadoPorId:this.access.userId,usuarioPdmc:user.email,version:{increment:1},
        };
        const issue=closureIssue({...before,resuelto:input.action==="resolver",formaCorreccion:input.formaCorreccion??before.formaCorreccion,unidadesSinResolver:input.action==="resolver"?0:before.unidadesSinResolver});if(issue)throw new NegativosError(422,"CIERRE_INCOMPLETO",issue);
        const changed=await tx.inconsistencia.updateMany({where:{id:item.id,version:item.version},data:changes});
        if(!changed.count)throw new NegativosError(409,"VERSION","Algún caso cambió; actualice la lista y vuelva a seleccionarlo.");
        const after=await tx.inconsistencia.findUniqueOrThrow({where:{id:item.id}});
        await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"Inconsistencia",entidadId:item.id,accion:"EDITAR_SEGUIMIENTO_MASIVO",motivo:`Acción masiva: ${input.action}`,valorAnterior:{motivo:before.motivo,responsable:before.responsable,formaCorreccion:before.formaCorreccion,resuelto:before.resuelto,ajustado:before.ajustado,numeroAjuste:before.numeroAjuste},valorNuevo:{motivo:after.motivo,responsable:after.responsable,formaCorreccion:after.formaCorreccion,resuelto:after.resuelto,ajustado:after.ajustado,numeroAjuste:after.numeroAjuste,cantidadAjuste:after.cantidadAjuste}}});
        results.push(after);
      }
      return results;
    },{timeout:30_000});
    return {actualizados:updated.length};
  }
  async count(raw:unknown){
    await this.access.permitted("inconsistencias.conteo");const input=z.object({id:uuid,version:z.number().int().min(1),conteoFisico:z.number().int().min(0).max(10_000_000).nullable()}).strict().parse(raw);
    const before=await this.db.inconsistencia.findUnique({where:{id:input.id},include:{producto:{include:{inventarios:{take:1}}}}});if(!before)throw new NegativosError(404,"CASO","La inconsistencia no existe.");if(before.version!==input.version)throw new NegativosError(409,"VERSION","El caso cambió; actualice la vista.");if(before.conteoFisico!==null)throw new NegativosError(409,"CONTEO_REGISTRADO","El caso ya fue contado y pasó al equipo de gestión.");
    await this.assertCaseAccess("inconsistencias.conteo",before);
    const inventory=before.producto?.inventarios[0],unknownCode=before.tipoError==="Código no registrado";if(input.conteoFisico!==null&&!inventory&&!unknownCode)throw new NegativosError(422,"INVENTARIO_NO_DISPONIBLE","No se puede registrar el conteo porque el producto no está en el inventario vigente.");
    const changed=await this.db.inconsistencia.updateMany({where:{id:input.id,version:input.version,conteoFisico:null},data:{conteoFisico:input.conteoFisico,existenciaSistemaConteo:input.conteoFisico===null?null:unknownCode?0:Number(inventory!.existencia),conteoRegistradoAt:input.conteoFisico===null?null:new Date(),actualizadoPorId:this.access.userId,version:{increment:1}}});if(!changed.count)throw new NegativosError(409,"VERSION","El caso cambió; actualice la vista.");
    const after=await this.db.inconsistencia.findUniqueOrThrow({where:{id:input.id},include:{bodegaProducto:true,producto:{include:{inventarios:{include:{bodegaProducto:true},take:5}}}}});
    await this.db.auditoria.create({data:{usuarioId:this.access.userId,entidad:"Inconsistencia",entidadId:input.id,accion:"REGISTRAR_CONTEO_FISICO",motivo:"Conteo físico registrado desde PDMC",valorAnterior:{conteoFisico:before.conteoFisico,existenciaSistemaConteo:before.existenciaSistemaConteo},valorNuevo:{conteoFisico:after.conteoFisico,existenciaSistemaConteo:after.existenciaSistemaConteo,conteoRegistradoAt:after.conteoRegistradoAt}}});return after;
  }
}
