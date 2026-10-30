import {createHash} from "node:crypto";
import type {PrismaClient} from "../../generated/prisma/client";
import {parseDelimitedTable,normalizeHeader,NegativosError} from "../negativos/validation";
import {Authorization,denied} from "../auth/authorization";
import {transferType} from "@pdmc/contratos/transferencias/classification";
import {planCabeceras,planDetalles,sinCambiosEnPlan} from "@pdmc/contratos/consultas/cambios";

export const COLUMNAS_TRANSFERENCIAS=["Numero","fecha_formateada","CodNombre","CodigoBarra","Cantidad","NumeroCaja","codigoRecibe_Dletra","status","observacion"] as const;
const expected=COLUMNAS_TRANSFERENCIAS;
const clean=(value:string)=>value.trim(),unwrap=(value:string)=>clean(value).replace(/^="(.*)"$/,"$1");
export const normalizeStoreCode=(value:string)=>unwrap(value).toUpperCase();
function dateValue(raw:string,row:number){const value=unwrap(raw),match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!match)throw new NegativosError(422,"FECHA",`Fila ${row}: fecha_formateada no es válida.`);const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]),date=new Date(Date.UTC(year,month-1,day)),today=new Date(),limit=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));if(year<2020||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date>limit)throw new NegativosError(422,"FECHA",`Fila ${row}: fecha inválida, futura o fuera del período permitido.`);return date;}
function quantity(raw:string,row:number){const value=Number(clean(raw).replace(",","."));if(!Number.isSafeInteger(value)||value<=0)throw new NegativosError(422,"CANTIDAD",`Fila ${row}: Cantidad debe ser un entero mayor que cero.`);return value;}
function transferStatus(raw:string,row:number){const allowed=new Map([["abierta","Abierta"],["aprobada","Aprobada"],["exportada","Exportada"]]),value=allowed.get(clean(raw).toLowerCase());if(!value)throw new NegativosError(422,"ESTADO",`Fila ${row}: estado no permitido.`);return value;}
type HeaderRow={numero:string;fecha:Date;codigoFacturador:string;facturadorId:string|null;codigoTiendaConsulta:string;tiendaId:string|null;estado:string;observacion:string|null;unidades:number;cantidadCodigos:number};
type DetailRow={numero:string;codigoBarra:string;cantidad:number;numeroCaja:string;productoId:string|null};

export class TransferQueryService{
  constructor(private db:PrismaClient,private access?:Authorization){}
  // La consulta llega del agente de cada bodega (cysn_qa.agente_fila). reaplicar: vuelve a aplicar un
  // resultado ya importado antes (p. ej. una transferencia creada y eliminada). sitio: bodega de origen;
  // la comparación y las bajas se limitan a ella, porque los números se repiten entre bodegas.
  async import(filename:string,content:string,options:{origen?:string;reaplicar?:boolean;sitio?:{ubicacionId:string}}={}){
    const origenId=options.sitio?.ubicacionId??null;
    if(this.access)await this.access.permitted("transferencias.importar");
    const table=parseDelimitedTable(content);if(!table.length)throw new NegativosError(422,"ARCHIVO","El archivo está vacío.");
    const headers=table[0].cells.map(normalizeHeader);if(headers.length!==expected.length||expected.some((name,index)=>headers[index]!==normalizeHeader(name)))throw new NegativosError(422,"ENCABEZADOS",`Encabezados requeridos: ${expected.join("; ")}.`);
    const records=table.slice(1).filter(row=>row.cells.some(Boolean));if(!records.length)throw new NegativosError(422,"ARCHIVO","La consulta no contiene filas de detalle.");
    const [stores,profiles,products]=await Promise.all([this.db.ubicacion.findMany({where:{tipo:"TIENDA"},select:{id:true,codigo:true}}),this.db.perfilLaboral.findMany({where:{tipo:"FACTURACION",activo:true},select:{id:true,codigo:true}}),this.db.producto.findMany({where:{activo:true},select:{id:true,codigoBarra:true}})]);
    const byStore=new Map(stores.map(x=>[normalizeStoreCode(x.codigo),x.id])),byBiller=new Map(profiles.map(x=>[normalizeStoreCode(x.codigo),x.id])),byBarcode=new Map(products.map(x=>[x.codigoBarra,x.id]));
    const grouped=new Map<string,HeaderRow>(),details:DetailRow[]=[],seen=new Set<string>();
    for(const row of records){
      const c=row.cells;if(c.length!==expected.length)throw new NegativosError(422,"FILA",`Fila ${row.fila}: número de columnas distinto al encabezado.`);
      const numero=unwrap(c[0]),fecha=dateValue(c[1],row.fila),codigoFacturador=normalizeStoreCode(c[2]),codigoBarra=unwrap(c[3]),cantidad=quantity(c[4],row.fila),numeroCaja=unwrap(c[5]),codigoTiendaConsulta=normalizeStoreCode(c[6]),estado=transferStatus(c[7],row.fila),observacion=clean(c[8])||null;
      if(!numero||numero.length>128||!codigoFacturador||!codigoTiendaConsulta||!codigoBarra||codigoBarra.length>128||!numeroCaja||numeroCaja.length>80)throw new NegativosError(422,"FILA",`Fila ${row.fila}: transferencia, facturador, código de barra, caja y tienda son obligatorios.`);
      const key=`${numero}\u0000${codigoBarra}\u0000${numeroCaja}`;if(seen.has(key))throw new NegativosError(422,"DUPLICADO",`Fila ${row.fila}: el código ${codigoBarra} ya existe en la caja ${numeroCaja} de la transferencia ${numero}.`);seen.add(key);
      const current=grouped.get(numero);
      if(current){if(current.fecha.getTime()!==fecha.getTime()||current.codigoFacturador!==codigoFacturador||current.codigoTiendaConsulta!==codigoTiendaConsulta||current.estado!==estado||current.observacion!==observacion)throw new NegativosError(422,"TRANSFERENCIA_INCONSISTENTE",`Fila ${row.fila}: los datos generales de la transferencia ${numero} no coinciden con sus filas anteriores.`);current.unidades+=cantidad;current.cantidadCodigos++;}
      else grouped.set(numero,{numero,fecha,codigoFacturador,facturadorId:byBiller.get(codigoFacturador)??null,codigoTiendaConsulta,tiendaId:byStore.get(codigoTiendaConsulta)??null,estado,observacion,unidades:cantidad,cantidadCodigos:1});
      details.push({numero,codigoBarra,cantidad,numeroCaja,productoId:byBarcode.get(codigoBarra)??null});
    }
    const rows=[...grouped.values()],hash=createHash("sha256").update(`${origenId??""}
`).update(content).digest("hex"),summary={total:rows.length,filasDetalle:details.length,abiertas:rows.filter(x=>x.estado==="Abierta").length,aprobadas:rows.filter(x=>x.estado==="Aprobada").length,exportadas:rows.filter(x=>x.estado==="Exportada").length,sinTienda:rows.filter(x=>!x.tiendaId).length,sinFacturador:rows.filter(x=>!x.facturadorId).length,sinProducto:details.filter(x=>!x.productoId).length};
    return this.db.$transaction(async tx=>{
      const previous=await tx.transferenciaConsultaImport.findUnique({where:{hashArchivo:hash}});if(previous&&!options.reaplicar)return {repetida:true,importacion:previous,resumen:previous.resumen};
      const imported=previous??await tx.transferenciaConsultaImport.create({data:{nombreArchivo:filename,hashArchivo:hash,totalFilas:details.length,resumen:summary,importedById:this.access?.userId}});
      // Solo INSERT, UPDATE y baja lógica: nunca se borran transferencias ni se recarga todo.
      const guardadas=await tx.transferenciaConsulta.findMany({where:{origenId},select:{id:true,numero:true,fecha:true,codigoFacturador:true,facturadorId:true,codigoTiendaConsulta:true,tiendaId:true,estado:true,observacion:true,unidades:true,cantidadCodigos:true,bajaEn:true}});
      const cabeceras=planCabeceras(guardadas,rows,["fecha","codigoFacturador","facturadorId","codigoTiendaConsulta","tiendaId","estado","observacion","unidades","cantidadCodigos"]);
      for(let start=0;start<cabeceras.crear.length;start+=1_000)await tx.transferenciaConsulta.createMany({data:cabeceras.crear.slice(start,start+1_000).map(item=>({...item,origenId,ultimaImportacionId:imported.id}))});
      for(const change of cabeceras.actualizar)await tx.transferenciaConsulta.update({where:{id:change.id},data:{...change.datos,bajaEn:null,ultimaImportacionId:imported.id}});
      if(cabeceras.bajas.length)await tx.transferenciaConsulta.updateMany({where:{id:{in:cabeceras.bajas}},data:{bajaEn:new Date(),ultimaImportacionId:imported.id}});
      const ids=new Map((await tx.transferenciaConsulta.findMany({where:{origenId,numero:{in:rows.map(item=>item.numero)}},select:{id:true,numero:true}})).map(item=>[item.numero,item.id])),numeros=new Map([...ids].map(([numero,id])=>[id,numero]));
      const actuales=(await tx.transferenciaConsultaDetalle.findMany({where:{transferenciaId:{in:[...ids.values()]}},select:{id:true,transferenciaId:true,codigoBarra:true,numeroCaja:true,cantidad:true,productoId:true}})).map(({transferenciaId,...item})=>({...item,numero:numeros.get(transferenciaId)!}));
      const lineas=planDetalles(actuales,details);
      for(let start=0;start<lineas.crear.length;start+=2_000)await tx.transferenciaConsultaDetalle.createMany({data:lineas.crear.slice(start,start+2_000).map(item=>({transferenciaId:ids.get(item.numero)!,productoId:item.productoId,codigoBarra:item.codigoBarra,cantidad:item.cantidad,numeroCaja:item.numeroCaja}))});
      for(const change of lineas.actualizar)await tx.transferenciaConsultaDetalle.update({where:{id:change.id},data:{cantidad:change.cantidad,productoId:change.productoId}});
      if(lineas.eliminar.length)await tx.transferenciaConsultaDetalle.deleteMany({where:{id:{in:lineas.eliminar}}});
      const cambios={insertadas:cabeceras.crear.length,actualizadas:cabeceras.actualizar.length,bajas:cabeceras.bajas.length,sinCambios:cabeceras.sinCambios,detalle:{insertadas:lineas.crear.length,actualizadas:lineas.actualizar.length,retiradas:lineas.eliminar.length}},resumen={...summary,...cambios};
      if(previous&&sinCambiosEnPlan(cabeceras,lineas))return {repetida:true,importacion:previous,resumen};
      await tx.auditoria.create({data:{usuarioId:this.access?.userId,entidad:"TransferenciaConsultaImport",entidadId:imported.id,accion:"IMPORTAR_CONSULTA_TRANSFERENCIAS",origen:options.origen??"CONSULTA_DETALLE",motivo:`Consulta detallada ${filename} aplicada como fuente de transferencias`,valorNuevo:resumen}});
      return {repetida:false,importacion:imported,resumen};
    },{maxWait:30_000,timeout:300_000,isolationLevel:"Serializable"});
  }
  async status(){if(this.access)await this.access.permitted("transferencias.leer");return {total:await this.db.transferenciaConsulta.count({where:{bajaEn:null}}),ultima:await this.db.transferenciaConsultaImport.findFirst({orderBy:{importedAt:"desc"},select:{nombreArchivo:true,totalFilas:true,resumen:true,importedAt:true}})};}
  async detail(numero:string){
    if(this.access)await this.access.permitted("transferencias.leer");
    // El número puede repetirse entre bodegas: se prefiere la vigente.
    const transfer=await this.db.transferenciaConsulta.findFirst({where:{numero},orderBy:[{bajaEn:{sort:"asc",nulls:"first"}},{fecha:"desc"}],include:{tienda:{select:{nombre:true}},facturador:{select:{nombre:true}},detalles:{include:{producto:{select:{referencia:true,descripcion:true,marca:true,talla:true}}},orderBy:[{numeroCaja:"asc"},{codigoBarra:"asc"}]}}});if(!transfer)throw new NegativosError(404,"TRANSFERENCIA","Transferencia no encontrada.");
    if(this.access){const scope=await this.access.locationScope("transferencias.leer","TIENDA");if(!scope.national&&!scope.rows.some(item=>item.id===transfer.tiendaId))throw denied();const grants=await this.access.grants();if(grants.some(item=>item.rol==="FACTURACION")){const linked=await this.db.vinculoOperativo.findMany({where:{usuarioId:this.access.userId,perfilId:{not:null}},select:{perfilId:true}});if(!linked.some(item=>item.perfilId===transfer.facturadorId))throw denied();}}
    return {numero:transfer.numero,fecha:transfer.fecha.toISOString().slice(0,10),estado:transfer.estado,tienda:transfer.tienda?.nombre??`Código sin vincular: ${transfer.codigoTiendaConsulta}`,facturador:transfer.facturador?.nombre??`Código ${transfer.codigoFacturador} sin vincular`,unidades:transfer.unidades,cantidadCodigos:transfer.cantidadCodigos,cajas:new Set(transfer.detalles.map(item=>item.numeroCaja)).size,items:transfer.detalles.map(item=>({codigoBarra:item.codigoBarra,cantidad:item.cantidad,numeroCaja:item.numeroCaja,referencia:item.producto?.referencia??null,descripcion:item.producto?.descripcion??null,marca:item.producto?.marca??null,talla:item.producto?.talla??null}))};
  }
}

export async function transferDashboardData(db:PrismaClient,errorCases:readonly {transfer:string;quantity:number;resolved?:boolean}[]=[],storeIds?:readonly string[],billerIds?:readonly string[]){
  const where={bajaEn:null,...(storeIds?{tiendaId:{in:[...storeIds]}}:{}),...(billerIds?{facturadorId:{in:[...billerIds]}}:{})};
  const [rows,reports,lastImport]=await Promise.all([db.transferenciaConsulta.findMany({where,include:{tienda:{select:{nombre:true}},facturador:{select:{nombre:true}}},orderBy:[{fecha:"desc"},{numero:"desc"}]}),db.reporteTransferenciaTienda.findMany({where:storeIds?{tiendaId:{in:[...storeIds]}}:{},select:{tiendaId:true,transferencia:true,sinIncidencias:true}}),db.transferenciaConsultaImport.findFirst({orderBy:{importedAt:"desc"}})]),reportByTransfer=new Map(reports.map(x=>[`${x.tiendaId}:${x.transferencia}`,x]));
  const transfers=rows.map(x=>{const report=reportByTransfer.get(`${x.tiendaId}:${x.numero}`),comment=x.observacion??"";return {id:x.numero,date:x.fecha.toISOString().slice(0,10),biller:x.facturador?.nombre??`Código ${x.codigoFacturador} sin vincular`,store:x.tienda?.nombre??`Código sin vincular: ${x.codigoTiendaConsulta}`,status:x.estado,comment,type:transferType(comment),units:x.unidades,reported:Boolean(report),reportKind:report?(report.sinIncidencias?"SIN_INCONSISTENCIAS" as const:"CON_INCONSISTENCIAS" as const):null};});
  const pendingReports=transfers.filter(x=>x.status==="Exportada"&&!x.reported).map(x=>({...x,exportDate:"",deadline:"",daysOverdue:null}));
  // Solo lo Exportado se puede reportar; lo Abierto o Aprobado se cuenta aparte como "por exportar".
  const storeMap=new Map<string,{name:string;total:number;exported:number;reported:number;pending:number;porExportar:number;units:number}>();for(const x of transfers){const s=storeMap.get(x.store)??{name:x.store,total:0,exported:0,reported:0,pending:0,porExportar:0,units:0};s.total++;s.units+=x.units;if(x.status==="Exportada"){s.exported++;if(x.reported)s.reported++;else s.pending++;}else if(!x.reported)s.porExportar++;storeMap.set(x.store,s)}
  const stores=[...storeMap.values()].map(x=>({...x,compliance:x.exported?Number((x.reported/x.exported*100).toFixed(2)):0})).sort((a,b)=>b.pending-a.pending);
  const byId=new Map(transfers.map(x=>[x.id,x])),billerMap=new Map<string,{name:string;transfers:number;units:number;errors:number;errorUnits:number;affectedTransfers:Set<string>;resolved:number}>();for(const x of transfers){const b=billerMap.get(x.biller)??{name:x.biller,transfers:0,units:0,errors:0,errorUnits:0,affectedTransfers:new Set(),resolved:0};b.transfers++;b.units+=x.units;billerMap.set(x.biller,b)}for(const e of errorCases){const name=byId.get(e.transfer)?.biller??"Sin identificar",b=billerMap.get(name)??{name,transfers:0,units:0,errors:0,errorUnits:0,affectedTransfers:new Set(),resolved:0};b.errors++;b.errorUnits+=e.quantity;b.affectedTransfers.add(e.transfer);if(e.resolved)b.resolved++;billerMap.set(name,b)}
  const billers=[...billerMap.values()].map(x=>({name:x.name,transfers:x.transfers,units:x.units,errors:x.errors,errorUnits:x.errorUnits,affectedTransfers:x.affectedTransfers.size,resolved:x.resolved,errorPct:x.units?Number((x.errorUnits/x.units*100).toFixed(3)):0})).sort((a,b)=>b.errors-a.errors);
  return {transfers,pendingReports,stores,billers,lastImport,aggregates:{totalTransfers:transfers.length,exported:transfers.filter(x=>x.status==="Exportada").length,approved:transfers.filter(x=>x.status==="Aprobada").length,open:transfers.filter(x=>x.status==="Abierta").length,reported:transfers.filter(x=>x.reported).length}};
}
