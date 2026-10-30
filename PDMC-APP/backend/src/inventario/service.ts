import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { productCode } from "@pdmc/contratos/negativos/presentation";
import { negativeCutWindow,negativeWeekRange } from "@pdmc/contratos/negativos/cut-window";
import { Authorization } from "../auth/authorization";
import { NegativosError, normalizeHeader, parseDate, parseDelimitedTable, uuid } from "../negativos/validation";
import { compare, emptyComparison } from "../negativos/comparator";

const inputSchema=z.object({nombreArchivo:z.string().trim().min(1).max(255).regex(/\.(csv|txt)$/i),fechaConsulta:z.string(),contenido:z.string().max(100_000_000),publicarNegativos:z.boolean().default(false)}).strict();
type Row={fila:number;codigoBarra:string;referencia:string;descripcion:string;existencia:string;activo:boolean;categoria:string;linea:string;marca:string;bodega:string};
export type InventoryValidation={aceptados:number;rechazados:number;errores:{fila:number;campo:string;mensaje:string}[]};
const required=["Estado","CodigoBarra","Referencia","Descripcion","Existencia","Categoria","Linea"];
const batches=<T>(rows:readonly T[],size=4000)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));

export async function syncInventoryProductCatalog(tx:Prisma.TransactionClient,rows:readonly Row[]){
  const productRows=[...new Map(rows.map(row=>[row.codigoBarra,row])).values()];
  for(const batch of batches(productRows)){
    const productData=batch.map(row=>({codigoBarra:row.codigoBarra,referencia:row.referencia||null,descripcion:row.descripcion||null,marca:row.marca||null,activo:row.activo,categoria:row.categoria||null,linea:row.linea||null}));
    await tx.$executeRaw`INSERT INTO "Producto" ("id","codigoBarra","referencia","descripcion","marca","activo","categoria","linea","createdAt","updatedAt")
      SELECT gen_random_uuid(), data."codigoBarra", data."referencia", data."descripcion", data."marca", data."activo", data."categoria", data."linea", NOW(), NOW()
      FROM jsonb_to_recordset(${JSON.stringify(productData)}::jsonb) AS data("codigoBarra" text,"referencia" text,"descripcion" text,"marca" text,"activo" boolean,"categoria" text,"linea" text)
      ON CONFLICT ("codigoBarra") DO UPDATE SET "referencia"=EXCLUDED."referencia", "descripcion"=EXCLUDED."descripcion", "marca"=EXCLUDED."marca", "activo"=EXCLUDED."activo", "categoria"=EXCLUDED."categoria", "linea"=EXCLUDED."linea", "updatedAt"=NOW()`;
  }
  return productRows;
}

export function validateInventory(raw:unknown){
  const input=inputSchema.parse(raw);const fecha=parseDate(input.fechaConsulta);
  if(/[\u0000\uFFFD]/.test(input.contenido))throw new NegativosError(422,"CODIFICACION","El archivo debe ser texto UTF-8 válido.");
  const [header,...records]=parseDelimitedTable(input.contenido);const headers=header?.cells.map(normalizeHeader)??[];
  if(new Set(headers).size!==headers.length||headers.some(h=>!h)||required.some(h=>!headers.includes(normalizeHeader(h))))throw new NegativosError(422,"ENCABEZADOS",`Encabezados únicos requeridos: ${required.join(", ")}.`);
  if(records.length>400000)throw new NegativosError(413,"DEMASIADAS_FILAS","Máximo 400000 filas por carga.");
  const errores:InventoryValidation["errores"]=[],parsed:Row[]=[],keys=new Map<string,number[]>();
  const index=(name:string)=>headers.indexOf(normalizeHeader(name));
  for(const record of records){
    const get=(name:string)=>(record.cells[index(name)]??"").trim(),text=(name:string)=>productCode(get(name)),error=(campo:string,mensaje:string)=>errores.push({fila:record.fila,campo,mensaje});
    if(record.cells.length!==headers.length)error("fila","Número de columnas distinto al encabezado.");
    const codigoBarra=text("CodigoBarra"),referencia=text("Referencia"),descripcion=text("Descripcion"),categoria=text("Categoria"),linea=text("Linea"),marca=text("Marca"),bodega=linea,rawQuantity=get("Existencia").replace(",","."),status=normalizeHeader(get("Estado"));
    if(!codigoBarra||codigoBarra.length>128||/[\x00-\x1f]/.test(codigoBarra))error("CodigoBarra","Código requerido, máximo 128 caracteres.");
    if(!linea||linea.length>200)error("Linea","Línea requerida, máximo 200 caracteres; se utilizará como bodega.");
    if(!/^-??\d{1,14}(?:\.\d{1,4})??$/.test(rawQuantity))error("Existencia","Cantidad inválida: hasta 14 enteros y 4 decimales, sin separador de miles.");
    const active=status==="activo"||status==="si"||status==="1"||status==="true";
    if(!["activo","inactivo","si","no","1","0","true","false"].includes(status))error("Estado","Use 1/0, Activo/Inactivo, Sí/No o true/false.");
    if(referencia.length>200)error("Referencia","Máximo 200 caracteres.");
    if(categoria.length>200)error("Categoria","Máximo 200 caracteres.");
    if(marca.length>200)error("Marca","Máximo 200 caracteres.");
    if(descripcion.length>10000)error("Descripcion","Máximo 10000 caracteres.");
    const key=`${codigoBarra}\u0000${normalizeHeader(bodega)}`,seen=keys.get(key)??[];seen.push(record.fila);keys.set(key,seen);
    parsed.push({fila:record.fila,codigoBarra,referencia,descripcion,existencia:rawQuantity,activo:active,categoria,linea,marca,bodega});
  }
  for(const rows of keys.values())if(rows.length>1)for(const fila of rows)errores.push({fila,campo:"CodigoBarra/Linea",mensaje:`Producto duplicado para la misma línea en filas ${rows.join(", ")}.`});
  const rejected=new Set(errores.map(e=>e.fila)),rows=parsed.filter(r=>!rejected.has(r.fila));
  return {input,fecha,rows,summary:{aceptados:rows.length,rechazados:rejected.size,errores} satisfies InventoryValidation};
}

export class InventoryService{
  constructor(private db:PrismaClient,private access:Authorization){}
  async summary(){
    await this.access.permitted("inventario.administrar");
    const now=new Date(),week=negativeWeekRange(now),window=negativeCutWindow(now);
    const [latest,total,codes,mappings,bodegas,lastPhoto,weekCuts]=await Promise.all([this.db.consultaInventario.findFirst({orderBy:[{fechaConsulta:"desc"},{fechaImportacion:"desc"}]}),this.db.inventarioActual.count(),this.db.inventarioActual.groupBy({by:["productoId"]}),this.db.lineaInventario.findMany({include:{bodegaProducto:true},orderBy:{linea:"asc"}}),this.db.bodegaProducto.findMany({orderBy:{nombre:"asc"}}),this.db.fotoNegativos.findFirst({orderBy:[{fechaCorte:"desc"},{createdAt:"desc"}]}),this.db.fotoNegativos.count({where:{fechaCorte:week}})]);
    return {latest,total,codigos:codes.length,bodegasAsignadas:new Set(mappings.filter(x=>x.bodegaProductoId).map(x=>x.bodegaProductoId)).size,mappings,bodegas,negativos:{ultimaFoto:lastPhoto,cortesSemana:weekCuts,maximoSemanal:2,ventana:window.tipo,puedePublicar:weekCuts<2}};
  }
  async products(raw:unknown){
    await this.access.permitted("inventario.administrar");const input=z.object({linea:z.string().trim().min(1).max(200),q:z.string().trim().max(200).default(""),skip:z.coerce.number().int().min(0).default(0),take:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(raw);
    const where={subcategoria:{equals:input.linea,mode:"insensitive" as const},...(input.q?{producto:{OR:[{codigoBarra:{contains:input.q,mode:"insensitive" as const}},{referencia:{contains:input.q,mode:"insensitive" as const}},{descripcion:{contains:input.q,mode:"insensitive" as const}}]}}:{})};
    const [rows,total]=await this.db.$transaction([this.db.inventarioActual.findMany({where,skip:input.skip,take:input.take,orderBy:{producto:{codigoBarra:"asc"}},include:{producto:{include:{excepcionBodega:{include:{bodegaProducto:true}}}},bodegaProducto:true}}),this.db.inventarioActual.count({where})]);return {rows,total,skip:input.skip,take:input.take};
  }
  async assignProduct(raw:unknown){
    await this.access.permitted("inventario.administrar");const input=z.object({productoId:uuid,bodegaProductoId:uuid.nullable(),version:z.number().int().min(0)}).strict().parse(raw);
    return this.db.$transaction(async tx=>{
      const product=await tx.producto.findUnique({where:{id:input.productoId},include:{excepcionBodega:true}});if(!product)throw new NegativosError(404,"PRODUCTO","Producto inexistente.");
      const before=product.excepcionBodega;if((before?.version??0)!==input.version)throw new NegativosError(409,"VERSION","La excepción cambió. Actualice la vista.");
      if(input.bodegaProductoId&&!await tx.bodegaProducto.findUnique({where:{id:input.bodegaProductoId}}))throw new NegativosError(422,"BODEGA","Bodega inexistente.");
      if(input.bodegaProductoId){if(before)await tx.excepcionBodegaProducto.update({where:{id:before.id},data:{bodegaProductoId:input.bodegaProductoId,version:{increment:1}}});else await tx.excepcionBodegaProducto.create({data:{productoId:product.id,bodegaProductoId:input.bodegaProductoId}});}else if(before)await tx.excepcionBodegaProducto.delete({where:{id:before.id}});
      const current=await tx.inventarioActual.findFirst({where:{productoId:product.id}}),line=current?.subcategoria?await tx.lineaInventario.findFirst({where:{linea:{equals:current.subcategoria,mode:"insensitive"}}}):null,target=input.bodegaProductoId??line?.bodegaProductoId??null;
      await tx.inventarioActual.updateMany({where:{productoId:product.id},data:{bodegaProductoId:target}});
      const negatives=await tx.negativo.findMany({where:{productoId:product.id},select:{id:true,bodegaProductoId:true}});if(negatives.length){await tx.negativo.updateMany({where:{id:{in:negatives.map(x=>x.id)}},data:{bodegaProductoId:target,version:{increment:1}}});await tx.historialNegativo.createMany({data:negatives.map(x=>({negativoId:x.id,usuarioId:this.access.userId,accion:"EXCEPCION_BODEGA_PRODUCTO",motivo:input.bodegaProductoId?"Excepción individual de bodega":"Excepción retirada; se aplica la bodega de la línea",valorAnterior:{bodegaProductoId:x.bodegaProductoId},valorNuevo:{bodegaProductoId:target}}))});}
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"Producto",entidadId:product.id,accion:input.bodegaProductoId?"ASIGNAR_EXCEPCION_BODEGA":"QUITAR_EXCEPCION_BODEGA",motivo:"Asignación individual desde inventario",valorAnterior:{bodegaProductoId:before?.bodegaProductoId??null},valorNuevo:{bodegaProductoId:input.bodegaProductoId}}});return {productoId:product.id,bodegaProductoId:target};
    },{timeout:30_000});
  }
  async assign(raw:unknown){
    await this.access.permitted("inventario.administrar");const input=z.object({id:uuid,bodegaProductoId:uuid.nullable(),version:z.number().int().min(1)}).strict().parse(raw);
    return this.db.$transaction(async tx=>{
      const before=await tx.lineaInventario.findUnique({where:{id:input.id}});if(!before)throw new NegativosError(404,"LINEA","Línea inexistente.");
      if(before.version!==input.version)throw new NegativosError(409,"VERSION","La asignación cambió. Actualice la vista.");
      if(input.bodegaProductoId&&!await tx.bodegaProducto.findUnique({where:{id:input.bodegaProductoId}}))throw new NegativosError(422,"BODEGA","Bodega inexistente.");
      const changed=await tx.lineaInventario.updateMany({where:{id:input.id,version:input.version},data:{bodegaProductoId:input.bodegaProductoId,version:{increment:1}}});if(!changed.count)throw new NegativosError(409,"VERSION","La asignación cambió. Actualice la vista.");
      await tx.inventarioActual.updateMany({where:{subcategoria:{equals:before.linea,mode:"insensitive"}},data:{bodegaProductoId:input.bodegaProductoId}});
      const negatives=await tx.negativo.findMany({where:{producto:{linea:{equals:before.linea,mode:"insensitive"}}},select:{id:true,bodegaProductoId:true}});
      if(negatives.length){await tx.negativo.updateMany({where:{id:{in:negatives.map(item=>item.id)}},data:{bodegaProductoId:input.bodegaProductoId,version:{increment:1}}});await tx.historialNegativo.createMany({data:negatives.map(item=>({negativoId:item.id,usuarioId:this.access.userId,accion:"BODEGA_POR_LINEA",motivo:`Bodega asignada manualmente a la línea ${before.linea}`,valorAnterior:{bodegaProductoId:item.bodegaProductoId},valorNuevo:{bodegaProductoId:input.bodegaProductoId,linea:before.linea}}))});}
      const after=await tx.lineaInventario.findUniqueOrThrow({where:{id:input.id}});
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"LineaInventario",entidadId:before.id,accion:"ASIGNAR_BODEGA_LINEA",motivo:"Asignación manual de línea de inventario",valorAnterior:{linea:before.linea,bodegaProductoId:before.bodegaProductoId},valorNuevo:{linea:after.linea,bodegaProductoId:after.bodegaProductoId}}});return after;
    });
  }
  async preview(raw:unknown){await this.access.permitted("inventario.administrar");return validateInventory(raw).summary;}
  async createWarehouse(raw:unknown){
    await this.access.permitted("inventario.administrar");const {nombre}=z.object({nombre:z.string().trim().min(1).max(200)}).strict().parse(raw);
    return this.db.$transaction(async tx=>{const existing=await tx.bodegaProducto.findFirst({where:{nombre:{equals:nombre,mode:"insensitive"}}});if(existing)return existing;const created=await tx.bodegaProducto.create({data:{nombre}});await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"BodegaProducto",entidadId:created.id,accion:"CREAR_BODEGA_PRODUCTO",motivo:"Bodega creada desde la asignación de líneas de inventario",valorNuevo:{nombre}}});return created;});
  }
  async import(raw:unknown){
    await this.access.permitted("inventario.administrar");const validated=validateInventory(raw);
    if(validated.summary.rechazados)throw new NegativosError(422,"FILAS_INVALIDAS","Corrija las filas rechazadas antes de importar.",validated.summary);
    if(!validated.rows.length)throw new NegativosError(422,"INVENTARIO_VACIO","La carga debe contener al menos una fila válida.");
    const hash=createHash("sha256").update(validated.input.contenido,"utf8").digest("hex");
    return this.db.$transaction(async tx=>{
      const repeated=await tx.consultaInventario.findUnique({where:{hashArchivo:hash}});
      const productRows=await syncInventoryProductCatalog(tx,validated.rows);
      const latest=await tx.consultaInventario.findFirst({orderBy:[{fechaConsulta:"desc"},{fechaImportacion:"desc"}]});
      if(latest&&validated.fecha<latest.fechaConsulta)throw new NegativosError(409,"FECHA_ANTERIOR","La fecha de la carga no puede ser anterior al inventario vigente.");
      const cutWindow=negativeCutWindow(validated.fecha);
      const weekRange=negativeWeekRange(validated.fecha);
      const previousPhoto=await tx.fotoNegativos.findFirst({orderBy:[{fechaCorte:"desc"},{createdAt:"desc"}],include:{items:true}});
      if(validated.input.publicarNegativos&&await tx.fotoNegativos.count({where:{fechaCorte:weekRange}})>=2)throw new NegativosError(409,"LIMITE_CORTES","Ya se publicaron las dos fotografías permitidas esta semana.");
      if(!validated.input.publicarNegativos&&!previousPhoto)throw new NegativosError(422,"PRIMER_CORTE_REQUERIDO","La primera carga debe publicar una fotografía para iniciar el control de Negativos.");
      if(repeated&&latest?.id!==repeated.id)return {repetida:true,consulta:repeated,resumen:{...validated.summary,catalogoActualizado:productRows.length,corteNegativos:"SIN_CORTE"}};
      const previousInventory=previousPhoto?previousPhoto.items.map(row=>({productoId:row.productoId,_sum:{existencia:row.existencia}})):await tx.inventarioActual.groupBy({by:["productoId"],_sum:{existencia:true}});
      const previousTotals=new Map(previousInventory.map(row=>[row.productoId,row._sum.existencia??new Prisma.Decimal(0)]));
      const consulta=repeated??await tx.consultaInventario.create({data:{usuarioId:this.access.userId!,nombreArchivo:validated.input.nombreArchivo,fechaConsulta:validated.fecha,hashArchivo:hash,totalFilas:validated.rows.length}});
      await tx.inventarioActual.deleteMany();
      const products:{id:string;codigoBarra:string}[]=[];for(const batch of batches(productRows))products.push(...await tx.producto.findMany({where:{codigoBarra:{in:batch.map(row=>row.codigoBarra)}},select:{id:true,codigoBarra:true}}));
      const productIds=new Map(products.map(row=>[row.codigoBarra,row.id]));
      const lines=[...new Map(validated.rows.map(row=>[normalizeHeader(row.linea),row.linea])).values()];
      for(const batch of batches(lines))await tx.lineaInventario.createMany({data:batch.map(linea=>({linea})),skipDuplicates:true});
      const mappings=await tx.lineaInventario.findMany(),mappedWarehouses=new Map(mappings.map(row=>[normalizeHeader(row.linea),row.bodegaProductoId]));
      const exceptions=new Map((await tx.excepcionBodegaProducto.findMany()).map(row=>[row.productoId,row.bodegaProductoId]));
      for(const batch of batches(validated.rows))await tx.inventarioActual.createMany({data:batch.map(row=>{const productoId=productIds.get(row.codigoBarra)!;return {consultaId:consulta.id,productoId,bodegaProductoId:exceptions.get(productoId)??mappedWarehouses.get(normalizeHeader(row.linea))??null,existencia:row.existencia,activo:row.activo,categoria:row.categoria||null,subcategoria:row.linea||null}})});
      const general=await tx.bodega.upsert({where:{codigo:"PDMC_GENERAL"},update:{activa:true},create:{codigo:"PDMC_GENERAL",nombre:"Negativos",activa:true}});
      await tx.$queryRaw`SELECT id FROM "Bodega" WHERE id=${general.id}::uuid FOR UPDATE`;
      const totals=new Map<string,Prisma.Decimal>();
      const sourceRows=new Map<string,Row>();
      for(const row of validated.rows){totals.set(row.codigoBarra,(totals.get(row.codigoBarra)??new Prisma.Decimal(0)).add(row.existencia));if(!sourceRows.has(row.codigoBarra))sourceRows.set(row.codigoBarra,row);}
      const currentTotals=new Map([...totals].map(([code,amount])=>[productIds.get(code)!,amount]));
      const negativeRows=[...totals.entries()].filter(([,amount])=>amount.isNegative());
      const cutType=validated.input.publicarNegativos?cutWindow.tipo:null;
      if(cutType){
        const existingCut=await tx.fotoNegativos.findUnique({where:{fechaCorte:validated.fecha}});
        if(existingCut)await tx.fotoNegativos.delete({where:{id:existingCut.id}});
        const photo=await tx.fotoNegativos.create({data:{consultaId:consulta.id,fechaCorte:validated.fecha,tipoCorte:cutType,totalCodigos:negativeRows.length,totalUnidades:negativeRows.reduce((sum,[,amount])=>sum.add(amount.abs()),new Prisma.Decimal(0))}});
        for(const batch of batches(negativeRows))await tx.fotoNegativoItem.createMany({data:batch.map(([code,amount])=>({fotoId:photo.id,productoId:productIds.get(code)!,existencia:amount}))});
      }
      const existingCases=await tx.negativo.findMany({where:{bodegaId:general.id,fusionadoEnId:null}}),casesByProduct=new Map(existingCases.map(item=>[item.productoId,item]));
      const comparison=emptyComparison();
      for(const productId of new Set([...previousTotals.keys(),...currentTotals.keys()])){const before=previousTotals.get(productId),after=currentTotals.get(productId);if(!before?.isNegative()&&!after?.isNegative())continue;comparison[compare(before?.isNegative()?before.toFixed(4):null,after?.isNegative()?after.toFixed(4):null)]++;}
      if(cutType)for(const [code,amount] of negativeRows){
        const productoId=productIds.get(code)!,source=sourceRows.get(code)!;
        const physicalWarehouse=exceptions.get(productoId)??mappedWarehouses.get(normalizeHeader(source.linea))??null;
        const existing=casesByProduct.get(productoId),previousAmount=previousTotals.get(productoId);
        if(existing?.anuladoAt)continue;
        const reopened=existing&&["SOLUCIONADO","CERRADO_SIN_AJUSTE","PENDIENTE_VERIFICAR"].includes(existing.estado);
        const negativo=existing?await tx.negativo.update({where:{id:existing.id},data:{bodegaProductoId:physicalWarehouse,estado:reopened?"REABIERTO":existing.estado,ultimaDeteccion:validated.fecha,version:{increment:1}}}):await tx.negativo.create({data:{productoId,bodegaId:general.id,bodegaProductoId:physicalWarehouse,primeraDeteccion:validated.fecha,ultimaDeteccion:validated.fecha}});
        await tx.historialNegativo.create({data:{negativoId:negativo.id,usuarioId:this.access.userId,accion:"ACTUALIZAR_DESDE_INVENTARIO",motivo:compare(previousAmount?.isNegative()?previousAmount.toFixed(4):null,amount.toFixed(4)),valorAnterior:{consultaInventarioId:latest?.id??null,existencia:previousAmount?.toFixed(4)??null},valorNuevo:{consultaInventarioId:consulta.id,existencia:amount.toFixed(4)}}});
      }
      const currentNegativeProducts=new Set([...currentTotals].filter(([,amount])=>amount.isNegative()).map(([id])=>id));
      if(cutType)for(const existing of existingCases.filter(item=>!currentNegativeProducts.has(item.productoId)&&!item.anuladoAt&&!["SOLUCIONADO","CERRADO_SIN_AJUSTE","AJUSTE_REALIZADO","PENDIENTE_VERIFICAR"].includes(item.estado))){const after=await tx.negativo.update({where:{id:existing.id},data:{estado:"PENDIENTE_VERIFICAR",version:{increment:1}}});await tx.historialNegativo.create({data:{negativoId:existing.id,usuarioId:this.access.userId,accion:"DESAPARECER_DEL_INVENTARIO",motivo:"El producto dejó de presentar existencia negativa en el inventario vigente",valorAnterior:{consultaInventarioId:latest?.id??null,existencia:previousTotals.get(existing.productoId)?.toFixed(4)??null,estado:existing.estado},valorNuevo:{consultaInventarioId:consulta.id,existencia:null,estado:after.estado}}});}
      await tx.auditoria.create({data:{usuarioId:this.access.userId,entidad:"ConsultaInventario",entidadId:consulta.id,accion:"IMPORTAR_INVENTARIO",motivo:"Carga de inventario y actualización automática de expedientes negativos",valorNuevo:{fechaConsulta:validated.input.fechaConsulta,totalFilas:validated.rows.length,nombreArchivo:validated.input.nombreArchivo,negativos:negativeRows.length,comparacion:comparison,corteNegativos:cutType??"SIN_CORTE"}}});
      return {repetida:Boolean(repeated),consulta,resumen:{...validated.summary,importados:validated.rows.length,negativos:negativeRows.length,comparacion:comparison,corteNegativos:cutType??"SIN_CORTE"}};
    },{timeout:600_000,maxWait:30_000});
  }
}
