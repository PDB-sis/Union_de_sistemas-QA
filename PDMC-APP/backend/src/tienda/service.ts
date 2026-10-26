import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {Prisma,type PrismaClient} from "../../../generated/prisma/client";
import type {Permission} from "../../../shared/auth/permissions";
import {productCode} from "../../../shared/negativos/presentation";
import {STORE_REPORT_REASONS,STORE_REPORT_SUBREASONS,UNKNOWN_BARCODE_REASONS} from "../../../shared/tienda/model";
import {transferType} from "../../../shared/transferencias/classification";
import {Authorization,denied} from "../auth/authorization";
import {NegativosError,uuid} from "../negativos/validation";

const reasonValues=STORE_REPORT_REASONS.map(item=>item[0]) as ["FALTANTE","SOBRANTE","CRUCE","DANADO","VENCIDO","OTRO"];
const subreasonValues=Object.values(STORE_REPORT_SUBREASONS).flat().map(item=>item[0]) as ["UNIDADES_MAS_PAQUETE","NO_ESTA_TRANSFERENCIA","UNIDADES_MENOS_PAQUETE","NO_ESTA_FISICO"];
const reportSchema=z.object({
  solicitudId:uuid,
  tiendaId:uuid,
  transferencia:z.string().trim().min(1).max(128),
  codigoBarra:z.string().trim().min(1).max(128),
  codigoCruce:z.string().trim().max(128).optional(),
  motivo:z.enum(reasonValues),
  submotivo:z.enum(subreasonValues).optional(),
  detalleOtro:z.string().trim().max(300).optional(),
  cantidad:z.number().int().min(1).max(1_000_000),
}).strict().superRefine((value,ctx)=>{
  if(value.motivo==="CRUCE"&&!value.codigoCruce)ctx.addIssue({code:"custom",path:["codigoCruce"],message:"Código del producto cruzado requerido."});
  if(value.motivo==="OTRO"&&!value.detalleOtro)ctx.addIssue({code:"custom",path:["detalleOtro"],message:"Describa el motivo."});
  if(value.motivo==="SOBRANTE"&&!STORE_REPORT_SUBREASONS.SOBRANTE.some(([id])=>id===value.submotivo))ctx.addIssue({code:"custom",path:["submotivo"],message:"Seleccione el tipo de sobrante."});
  if(value.motivo==="FALTANTE"&&!STORE_REPORT_SUBREASONS.FALTANTE.some(([id])=>id===value.submotivo))ctx.addIssue({code:"custom",path:["submotivo"],message:"Seleccione el tipo de faltante."});
});
const transferSchema=z.object({solicitudId:uuid,tiendaId:uuid,transferencia:z.string().trim().min(1).max(128)}).strict();
const orderSchema=z.object({tiendaId:uuid,observaciones:z.string().trim().max(1000).optional(),items:z.array(z.object({productoId:uuid,cantidad:z.number().int().min(1).max(9999)}).strict()).min(1).max(100)}).strict().superRefine((value,ctx)=>{if(new Set(value.items.map(item=>item.productoId)).size!==value.items.length)ctx.addIssue({code:"custom",path:["items"],message:"Cada producto debe aparecer una sola vez."})});
const unknownReasonValues=UNKNOWN_BARCODE_REASONS.map(item=>item[0]) as ["CODIGO_MEZCLADO_PAQUETE","OTRA_PRENDA","OTRO"];
const unknownSchema=transferSchema.extend({codigoBarraNoInventario:z.string().trim().min(1).max(128),motivo:z.enum(unknownReasonValues),codigoBarraTransferencia:z.string().trim().max(128).optional(),cantidadPaquete:z.number().int().min(1).max(1_000_000).optional(),cantidadCodigoNoInventario:z.number().int().min(1).max(1_000_000).optional(),cantidad:z.number().int().min(1).max(1_000_000).optional(),detalle:z.string().trim().max(500).optional()}).strict().superRefine((value,ctx)=>{
  if(value.motivo==="CODIGO_MEZCLADO_PAQUETE"){
    if(!value.codigoBarraTransferencia)ctx.addIssue({code:"custom",path:["codigoBarraTransferencia"],message:"Indique el código esperado en la transferencia."});
    if(!value.cantidadPaquete)ctx.addIssue({code:"custom",path:["cantidadPaquete"],message:"Indique la cantidad del paquete."});
    if(!value.cantidadCodigoNoInventario)ctx.addIssue({code:"custom",path:["cantidadCodigoNoInventario"],message:"Indique cuántas unidades llegaron con el código no existente."});
    if(value.cantidadPaquete&&value.cantidadCodigoNoInventario&&value.cantidadCodigoNoInventario>value.cantidadPaquete)ctx.addIssue({code:"custom",path:["cantidadCodigoNoInventario"],message:"No puede superar la cantidad del paquete."});
  }
  if(value.motivo==="OTRA_PRENDA"&&(!value.cantidad||!value.detalle))ctx.addIssue({code:"custom",path:["detalle"],message:"Indique cantidad y explicación."});
  if(value.motivo==="OTRO"&&!value.detalle)ctx.addIssue({code:"custom",path:["detalle"],message:"Explique la incidencia."});
});

export class StoreService{
  constructor(private db:PrismaClient,private access:Authorization){}

  private async stores(permission:Permission){
    return (await this.access.locationScope(permission,"TIENDA")).rows;
  }

  private async transferRows(stores:readonly {id:string;nombre:string}[]){
    const ids=stores.map(store=>store.id),rows=await this.db.transferenciaConsulta.findMany({where:{tiendaId:{in:ids},estado:"Exportada",bajaEn:null},include:{tienda:{select:{nombre:true}}},orderBy:[{fecha:"desc"},{numero:"desc"}]});
    return rows.map(row=>{const description=row.observacion??"";return {id:row.numero,date:row.fecha.toISOString().slice(0,10),exportDate:"",store:row.tienda!.nombre,units:row.unidades,description,type:transferType(description),tiendaId:row.tiendaId!,tiendaNombre:row.tienda!.nombre,deadline:null,remaining:null,deadlineStatus:"SIN_FECHA" as const}});
  }

  async dashboard(){
    const stores=await this.stores("tienda.panel"),ids=stores.map(item=>item.id),names=stores.map(item=>item.nombre);
    const [completed,pendingUnknown,reportKeys]=await Promise.all([this.db.reporteTransferenciaTienda.findMany({where:{tiendaId:{in:ids}},select:{id:true,tiendaId:true,transferencia:true,sinIncidencias:true,createdAt:true,tienda:{select:{nombre:true}},inconsistencias:{where:{tipoError:{not:"Código no registrado"}},select:{id:true,codigoBarra:true,referencia:true,tipoError:true,cantidadErrada:true,motivoReporte:true,submotivoReporte:true,detalleOtro:true,motivo:true,comentarioAdmin:true,formaCorreccion:true,resuelto:true,producto:{select:{descripcion:true}}},orderBy:{createdAt:"asc"}},codigosNoInventario:{select:{id:true,codigoBarraNoInventario:true,motivo:true,codigoBarraTransferencia:true,cantidadPaquete:true,cantidadCodigoNoInventario:true,cantidad:true,detalle:true},orderBy:{createdAt:"asc"}}},orderBy:{createdAt:"desc"}}),this.db.inconsistenciaCodigoNoInventario.findMany({where:{tiendaId:{in:ids},reporteTiendaId:null},include:{tienda:{select:{nombre:true}}},orderBy:{createdAt:"desc"}}),this.db.reporteTransferenciaTienda.findMany({where:{tiendaId:{in:ids}},select:{tiendaId:true,transferencia:true}})]);
    const completedKeys=new Set(reportKeys.map(item=>`${item.tiendaId}:${item.transferencia}`));
    const transfers=(await this.transferRows(stores)).filter(item=>!completedKeys.has(`${item.tiendaId}:${item.id}`));
    const territory:Prisma.InconsistenciaWhereInput={OR:[{tiendaId:{in:ids}},...names.map(name=>({tiendaId:null,sucursal:{equals:name,mode:"insensitive" as const}}))]};
    const [open,recent]=await Promise.all([
      this.db.inconsistencia.count({where:{AND:[territory,{resuelto:false}]}}),
      this.db.inconsistencia.findMany({where:territory,take:8,orderBy:{createdAt:"desc"},select:{id:true,createdAt:true,sucursal:true,transferencia:true,codigoBarra:true,tipoError:true,cantidadErrada:true,resuelto:true,ajustado:true,grupoReporteId:true,claveCruce:true}}),
    ]);
    const unknownGroups=new Map<string,typeof pendingUnknown>();for(const row of pendingUnknown){const key=`${row.tiendaId}:${row.transferencia}`,group=unknownGroups.get(key)??[];group.push(row);unknownGroups.set(key,group)}
    const reports=[...completed.map(item=>({id:item.id,transferencia:item.transferencia,tienda:item.tienda.nombre,sinIncidencias:item.sinIncidencias,finalizado:true,createdAt:item.createdAt,detalles:[...item.inconsistencias.map(row=>({id:row.id,tipo:"PRODUCTO" as const,codigoBarra:row.codigoBarra,descripcion:row.producto?.descripcion??row.referencia,tipoError:row.tipoError,cantidad:row.cantidadErrada,motivo:row.motivoReporte,submotivo:row.submotivoReporte,detalle:row.detalleOtro,observacionAdmin:[row.motivo,row.comentarioAdmin,row.formaCorreccion].filter(Boolean).join(" · ")||null,resuelto:row.resuelto})),...item.codigosNoInventario.map(row=>({id:row.id,tipo:"CODIGO_NO_REGISTRADO" as const,codigoBarra:row.codigoBarraNoInventario,descripcion:null,tipoError:"Código no registrado",cantidad:row.cantidadCodigoNoInventario??row.cantidad??1,motivo:row.motivo,submotivo:null,detalle:row.detalle,observacionAdmin:null,codigoBarraTransferencia:row.codigoBarraTransferencia,cantidadPaquete:row.cantidadPaquete,resuelto:false}))]})),...[...unknownGroups.entries()].map(([key,rows])=>({id:`pendiente:${key}`,transferencia:rows[0].transferencia,tienda:rows[0].tienda.nombre,sinIncidencias:false,finalizado:false,createdAt:rows[0].createdAt,detalles:rows.map(row=>({id:row.id,tipo:"CODIGO_NO_REGISTRADO" as const,codigoBarra:row.codigoBarraNoInventario,descripcion:null,tipoError:"Código no registrado",cantidad:row.cantidadCodigoNoInventario??row.cantidad??1,motivo:row.motivo,submotivo:null,detalle:row.detalle,observacionAdmin:null,codigoBarraTransferencia:row.codigoBarraTransferencia,cantidadPaquete:row.cantidadPaquete,resuelto:false}))}))].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
    return {stores,metrics:{pendingTransfers:transfers.length,openCases:open+pendingUnknown.length,urgentTransfers:0},dateReliable:false,transfers,recent,reports};
  }

  async product(raw:unknown){
    await this.access.permitted("inconsistencias.reportar");
    const input=z.object({codigo:z.string().trim().min(1).max(128)}).parse(raw),code=productCode(input.codigo);
    const product=await this.db.producto.findUnique({where:{codigoBarra:code},select:{id:true,codigoBarra:true,referencia:true,descripcion:true,marca:true,activo:true}});
    if(!product?.activo)throw new NegativosError(404,"PRODUCTO","El código no está activo en el inventario vigente.");
    const inventory=await this.db.inventarioActual.findFirst({where:{productoId:product.id,activo:true},select:{existencia:true,bodegaProductoId:true,bodegaProducto:{select:{nombre:true}}}});
    if(!inventory)throw new NegativosError(404,"PRODUCTO","El código no está activo en el inventario vigente.");
    return {...product,inventarios:[{existencia:inventory.existencia,bodegaProductoId:inventory.bodegaProductoId,bodegaProducto:inventory.bodegaProducto}]};
  }

  async orderCatalog(raw:unknown){
    await this.access.permitted("tienda.panel");
    const input=z.object({q:z.string().trim().max(200).default(""),linea:z.string().trim().max(200).default(""),marca:z.string().trim().max(200).default(""),skip:z.coerce.number().int().min(0).max(1_000_000).default(0),take:z.coerce.number().int().min(1).max(60).default(24)}).parse(raw);
    const base:Prisma.ProductoWhereInput={activo:true,inventarios:{some:{activo:true}}};
    const where:Prisma.ProductoWhereInput={...base,...(input.linea?{linea:{equals:input.linea,mode:"insensitive"}}:{}),...(input.marca?{marca:{equals:input.marca,mode:"insensitive"}}:{}),...(input.q?{OR:[{codigoBarra:{contains:input.q,mode:"insensitive"}},{referencia:{contains:input.q,mode:"insensitive"}},{descripcion:{contains:input.q,mode:"insensitive"}}]}:{})};
    const [rows,total,lines,brands]=await this.db.$transaction([
      this.db.producto.findMany({where,skip:input.skip,take:input.take,orderBy:[{marca:"asc"},{descripcion:"asc"},{codigoBarra:"asc"}],select:{id:true,codigoBarra:true,referencia:true,descripcion:true,marca:true,linea:true,categoria:true}}),
      this.db.producto.count({where}),
      this.db.producto.findMany({where:{...base,linea:{not:null}},distinct:["linea"],select:{linea:true},orderBy:{linea:"asc"}}),
      this.db.producto.findMany({where:{...base,marca:{not:null},...(input.linea?{linea:{equals:input.linea,mode:"insensitive"}}:{})},distinct:["marca"],select:{marca:true},orderBy:{marca:"asc"}}),
    ]);
    return {rows,total,skip:input.skip,take:input.take,lineas:lines.map(item=>item.linea).filter(Boolean),marcas:brands.map(item=>item.marca).filter(Boolean)};
  }

  async orders(){
    const stores=await this.stores("tienda.panel"),ids=stores.map(item=>item.id);
    return this.db.pedidoTienda.findMany({where:{tiendaId:{in:ids}},take:50,orderBy:{createdAt:"desc"},select:{id:true,codigo:true,estado:true,observaciones:true,createdAt:true,tienda:{select:{nombre:true}},items:{select:{cantidadSolicitada:true,producto:{select:{codigoBarra:true,referencia:true,descripcion:true,marca:true,linea:true}}}}}});
  }

  async createOrder(raw:unknown){
    const input=orderSchema.parse(raw),stores=await this.stores("tienda.panel"),store=stores.find(item=>item.id===input.tiendaId);
    if(!store)throw denied();
    const ids=input.items.map(item=>item.productoId),products=await this.db.producto.findMany({where:{id:{in:ids},activo:true,inventarios:{some:{activo:true}}},select:{id:true}});
    if(products.length!==ids.length)throw new NegativosError(422,"PRODUCTOS","Uno o más productos ya no están activos en el inventario.");
    const code=`PED-${new Date().toISOString().replace(/\D/g,"").slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    return this.db.$transaction(async tx=>{
      const order=await tx.pedidoTienda.create({data:{codigo:code,tiendaId:store.id,solicitadoPorId:this.access.userId!,observaciones:input.observaciones||null,items:{create:input.items.map(item=>({productoId:item.productoId,cantidadSolicitada:item.cantidad}))}},include:{tienda:{select:{nombre:true}},items:{include:{producto:{select:{codigoBarra:true,referencia:true,descripcion:true,marca:true,linea:true}}}}}});
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"PedidoTienda",entidadId:order.id,accion:"PEDIDO_ENVIADO",motivo:`Pedido ${code} enviado por ${store.nombre}`,valorNuevo:{tiendaId:store.id,productos:input.items.length,unidades:input.items.reduce((sum,item)=>sum+item.cantidad,0)}}});
      return order;
    });
  }

  private async authorizedTransfer(input:{tiendaId:string;transferencia:string}){
    const stores=await this.stores("inconsistencias.reportar"),store=stores.find(item=>item.id===input.tiendaId);
    if(!store)throw denied();
    const transfer=(await this.transferRows(stores)).find(item=>item.id===input.transferencia&&item.tiendaId===store.id);
    if(!transfer)throw new NegativosError(422,"TRANSFERENCIA","Seleccione una transferencia pendiente de su tienda.");
    return {store,transfer};
  }

  async reportSuccessful(raw:unknown){
    const input=transferSchema.parse(raw),{store}=await this.authorizedTransfer(input);
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${store.id}:${input.transferencia}`}))`);
      const existing=await tx.reporteTransferenciaTienda.findUnique({where:{tiendaId_transferencia:{tiendaId:store.id,transferencia:input.transferencia}}});
      if(existing)return {repetida:true,reporte:existing};
      const report=await tx.reporteTransferenciaTienda.create({data:{solicitudId:input.solicitudId,tiendaId:store.id,reportadoPorId:this.access.userId!,transferencia:input.transferencia,sinIncidencias:true}});
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"ReporteTransferenciaTienda",entidadId:report.id,accion:"TRANSFERENCIA_SIN_INCIDENCIAS",motivo:`Transferencia ${input.transferencia} recibida sin errores en ${store.nombre}`,valorNuevo:{tiendaId:store.id,transferencia:input.transferencia,sinIncidencias:true}}});
      return {repetida:false,reporte:report};
    });
  }

  async completeWithIncidents(raw:unknown){
    const input=transferSchema.parse(raw),{store}=await this.authorizedTransfer(input);
    const [known,unknown]=await Promise.all([
      this.db.inconsistencia.count({where:{tiendaId:store.id,transferencia:input.transferencia,tipoError:{not:"Código no registrado"}}}),
      this.db.inconsistenciaCodigoNoInventario.count({where:{tiendaId:store.id,transferencia:input.transferencia}}),
    ]);
    if(known+unknown===0)throw new NegativosError(422,"SIN_INCONSISTENCIAS","Agregue al menos una inconsistencia antes de finalizar el reporte.");
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${store.id}:${input.transferencia}`}))`);
      const existing=await tx.reporteTransferenciaTienda.findUnique({where:{tiendaId_transferencia:{tiendaId:store.id,transferencia:input.transferencia}}});
      if(existing)return {repetida:true,reporte:existing};
      const report=await tx.reporteTransferenciaTienda.create({data:{solicitudId:input.solicitudId,tiendaId:store.id,reportadoPorId:this.access.userId!,transferencia:input.transferencia,sinIncidencias:false}});
      await Promise.all([
        tx.inconsistencia.updateMany({where:{tiendaId:store.id,transferencia:input.transferencia,reporteTiendaId:null},data:{reporteTiendaId:report.id}}),
        tx.inconsistenciaCodigoNoInventario.updateMany({where:{tiendaId:store.id,transferencia:input.transferencia,reporteTiendaId:null},data:{reporteTiendaId:report.id}}),
      ]);
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"ReporteTransferenciaTienda",entidadId:report.id,accion:"TRANSFERENCIA_CON_INCIDENCIAS",motivo:`Transferencia ${input.transferencia} reportada con ${known+unknown} inconsistencia(s) en ${store.nombre}`,valorNuevo:{tiendaId:store.id,transferencia:input.transferencia,sinIncidencias:false,inconsistencias:known,codigosNoInventario:unknown}}});
      return {repetida:false,reporte:report};
    });
  }

  async reportUnknownBarcode(raw:unknown){
    const input=unknownSchema.parse(raw),{store}=await this.authorizedTransfer(input),unknownCode=productCode(input.codigoBarraNoInventario);
    if(await this.db.producto.findUnique({where:{codigoBarra:unknownCode},select:{id:true}}))throw new NegativosError(409,"CODIGO_EXISTENTE","El código sí existe en el inventario; use el reporte normal.");
    let expectedCode:string|null=null;
    if(input.motivo==="CODIGO_MEZCLADO_PAQUETE"){
      expectedCode=productCode(input.codigoBarraTransferencia!);
      if(!await this.db.producto.findUnique({where:{codigoBarra:expectedCode},select:{id:true}}))throw new NegativosError(422,"CODIGO_TRANSFERENCIA","El código esperado tampoco existe en el inventario.");
    }
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${this.access.userId}:${input.solicitudId}`}))`);
      const existing=await tx.inconsistenciaCodigoNoInventario.findUnique({where:{solicitudId:input.solicitudId}});
      if(existing)return {repetida:true,caso:existing};
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${store.id}:${input.transferencia}:${unknownCode}`}))`);
      if(await tx.inconsistencia.findFirst({where:{tiendaId:store.id,transferencia:input.transferencia,codigoBarra:unknownCode},select:{id:true}}))throw new NegativosError(409,"CODIGO_REPETIDO","Este código de barras ya tiene una inconsistencia en la transferencia.");
      const row=await tx.inconsistenciaCodigoNoInventario.create({data:{solicitudId:input.solicitudId,tiendaId:store.id,reportadoPorId:this.access.userId!,transferencia:input.transferencia,codigoBarraNoInventario:unknownCode,motivo:input.motivo,codigoBarraTransferencia:expectedCode,cantidadPaquete:input.cantidadPaquete,cantidadCodigoNoInventario:input.cantidadCodigoNoInventario,cantidad:input.cantidad,detalle:input.detalle}});
      const reportedQuantity=input.cantidadCodigoNoInventario??input.cantidad??1;
      await tx.inconsistencia.create({data:{sourceKey:createHash("sha256").update(`app:unknown:${input.solicitudId}`).digest("hex"),motivoReporte:"OTRO",detalleOtro:input.detalle??`Código no registrado: ${input.motivo.replaceAll("_"," ")}`,tiendaId:store.id,reportadoPorId:this.access.userId,grupoReporteId:input.solicitudId,fecha:new Date(),sucursal:store.nombre,transferencia:input.transferencia,codigoBarra:unknownCode,tipoError:"Código no registrado",cantidadErrada:reportedQuantity,unidadesSinResolver:reportedQuantity,usuarioPdmc:(await tx.usuario.findUniqueOrThrow({where:{id:this.access.userId},select:{email:true}})).email}});
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"InconsistenciaCodigoNoInventario",entidadId:row.id,accion:"REPORTAR_CODIGO_NO_INVENTARIO",motivo:`Código no registrado reportado desde ${store.nombre}`,valorNuevo:{tiendaId:store.id,transferencia:input.transferencia,codigoBarraNoInventario:unknownCode,motivo:input.motivo,codigoBarraTransferencia:expectedCode,cantidadPaquete:input.cantidadPaquete,cantidadCodigoNoInventario:input.cantidadCodigoNoInventario,cantidad:input.cantidad,detalle:input.detalle}}});
      return {repetida:false,caso:row};
    });
  }

  async report(raw:unknown){
    const input=reportSchema.parse(raw),{store}=await this.authorizedTransfer(input);
    const originalCode=productCode(input.codigoBarra),crossCode=input.codigoCruce?productCode(input.codigoCruce):null;
    if(input.motivo==="CRUCE"&&crossCode===originalCode)throw new NegativosError(422,"CRUCE","Los productos del cruce deben ser diferentes.");
    const codes=[originalCode,...(crossCode?[crossCode]:[])],products=await this.db.producto.findMany({where:{codigoBarra:{in:codes}},include:{inventarios:{take:1}}}),byCode=new Map(products.map(item=>[item.codigoBarra,item]));
    if(codes.some(code=>!byCode.has(code)))throw new NegativosError(404,"PRODUCTO","Uno de los códigos no existe en el inventario vigente.");
    const user=await this.db.usuario.findUniqueOrThrow({where:{id:this.access.userId},select:{email:true}}),correlation=randomUUID(),crossKey=input.motivo==="CRUCE"?randomUUID():null;
    const definitions=input.motivo==="CRUCE"?[{code:originalCode,type:"faltante físico"},{code:crossCode!,type:"Sobrante físico"}]:[{code:originalCode,type:{FALTANTE:"faltante físico",SOBRANTE:"Sobrante físico",DANADO:"Producto dañado",VENCIDO:"Producto vencido",OTRO:"Otro"}[input.motivo]}];
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${this.access.userId}:${input.solicitudId}`}))`);
      const existing=await tx.inconsistencia.findMany({where:{grupoReporteId:input.solicitudId,reportadoPorId:this.access.userId},orderBy:{createdAt:"asc"}});
      if(existing.length)return {repetida:true,casos:existing};
      for(const code of [...codes].sort())await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${store.id}:${input.transferencia}:${code}`}))`);
      if(await tx.inconsistencia.findFirst({where:{tiendaId:store.id,transferencia:input.transferencia,codigoBarra:{in:codes}},select:{codigoBarra:true}}))throw new NegativosError(409,"CODIGO_REPETIDO","Uno de los códigos de barras ya tiene una inconsistencia en la transferencia.");
      const rows=[];
      for(let index=0;index<definitions.length;index++){
        const definition=definitions[index],product=byCode.get(definition.code)!;
        const id=randomUUID(),sourceKey=createHash("sha256").update(`app:${this.access.userId}:${input.solicitudId}:${index}`).digest("hex");
        const row=await tx.inconsistencia.create({data:{id,sourceKey,motivoReporte:input.motivo,submotivoReporte:input.submotivo,detalleOtro:input.detalleOtro||null,tiendaId:store.id,reportadoPorId:this.access.userId,grupoReporteId:input.solicitudId,claveCruce:crossKey,fecha:new Date(),sucursal:store.nombre,transferencia:input.transferencia,codigoBarra:product.codigoBarra,referencia:product.referencia,tipoError:definition.type,cantidadErrada:input.cantidad,unidadesSinResolver:input.cantidad,claveUnica:crossKey,productoId:product.id,bodegaProductoId:product.inventarios[0]?.bodegaProductoId??null,usuarioPdmc:user.email}});
        await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"Inconsistencia",entidadId:row.id,accion:"REPORTAR_INCONSISTENCIA_TIENDA",motivo:`Reporte ${input.motivo} desde ${store.nombre}`,valorAnterior:Prisma.JsonNull,valorNuevo:{tiendaId:store.id,transferencia:input.transferencia,codigoBarra:product.codigoBarra,tipoError:definition.type,cantidad:input.cantidad,grupoReporteId:input.solicitudId,claveCruce:crossKey},correlacionId:correlation}});
        rows.push(row);
      }
      return {repetida:false,casos:rows};
    });
  }
}

