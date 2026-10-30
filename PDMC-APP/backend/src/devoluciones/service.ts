import {createHash} from "node:crypto";
import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {Authorization,denied} from "../auth/authorization";
import {NegativosError,normalizeHeader,parseDelimitedTable} from "../negativos/validation";
import {normalizeStoreCode} from "../transferencias/consulta";
import {planCabeceras,sinCambiosEnPlan} from "@pdmc/contratos/consultas/cambios";

// Una fila por devolución (cabecera); la consulta ya no trae detalle por producto y caja.
export const COLUMNAS_DEVOLUCIONES=["Numero","fecha_formateada","CodNombre","usuario","codigoRecibe_Dletra","status","Observacion","TotalValor","DocumentoOrigen"] as const;
const headers=COLUMNAS_DEVOLUCIONES;
const SIN_USUARIO="usuario no encontrado";
const unwrap=(value:string)=>value.trim().replace(/^="(.*)"$/,"$1");
function dateValue(raw:string,row:number){const match=unwrap(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!match)throw new NegativosError(422,"FECHA",`Fila ${row}: fecha_formateada no es válida.`);const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]),date=new Date(Date.UTC(year,month-1,day)),now=new Date(),limit=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));if(year<2020||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date>limit)throw new NegativosError(422,"FECHA",`Fila ${row}: fecha inválida o futura.`);return date;}
// Texto normalizado del Decimal: así lo guardado y lo recibido se comparan igual (123.50 = 123.5).
function amount(raw:string,row:number){const value=unwrap(raw).replace(",",".");if(!value)return null;if(!/^-?\d{1,10}(\.\d{1,8})?$/.test(value))throw new NegativosError(422,"VALOR",`Fila ${row}: TotalValor no es un número válido.`);return new Prisma.Decimal(value).toString();}
const decimalText=(value:Prisma.Decimal|null)=>value===null?null:value.toString();
type Header={numero:string;fecha:Date;codigoResponsable:string;nombreResponsable:string|null;responsableId:string|null;codigoTiendaConsulta:string;tiendaId:string|null;estado:string;observacion:string;totalValor:string|null;documentoOrigen:string|null};
const SIN_DETALLE={crear:[],actualizar:[],eliminar:[]};

export class ReturnsService{
  constructor(private db:PrismaClient,private access?:Authorization){}
  // La consulta llega del agente de cada bodega (cysn_qa.agente_fila). reaplicar: vuelve a aplicar un
  // resultado ya importado antes (p. ej. una devolución creada y eliminada). sitio: bodega de origen;
  // la comparación y las bajas se limitan a ella, porque los números se repiten entre bodegas.
  async import(filename:string,content:string,options:{origen?:string;reaplicar?:boolean;sitio?:{ubicacionId:string}}={}){
    const origenId=options.sitio?.ubicacionId??null;
    if(this.access)await this.access.permitted("devoluciones.importar");
    const table=parseDelimitedTable(content),actual=table[0]?.cells.map(normalizeHeader)??[];if(actual.length!==headers.length||headers.some((name,index)=>actual[index]!==normalizeHeader(name)))throw new NegativosError(422,"ENCABEZADOS",`Encabezados requeridos: ${headers.join("; ")}.`);
    const [stores,profiles]=await Promise.all([this.db.ubicacion.findMany({where:{tipo:"TIENDA"},select:{id:true,codigo:true}}),this.db.perfilLaboral.findMany({where:{tipo:"FACTURACION",activo:true},select:{id:true,codigo:true}})]),byStore=new Map(stores.map(x=>[normalizeStoreCode(x.codigo),x.id])),byProfile=new Map(profiles.map(x=>[normalizeStoreCode(x.codigo),x.id])),grouped=new Map<string,Header>();
    for(const row of table.slice(1).filter(item=>item.cells.some(Boolean))){
      const c=row.cells;if(c.length!==headers.length)throw new NegativosError(422,"FILA",`Fila ${row.fila}: número de columnas incorrecto.`);
      const numero=unwrap(c[0]),fecha=dateValue(c[1],row.fila),codigoResponsable=normalizeStoreCode(c[2]),nombre=unwrap(c[3]).replace(/\s+/g," "),codigoTiendaConsulta=normalizeStoreCode(c[4]),rawStatus=unwrap(c[5]).toLowerCase(),estado=rawStatus==="abierta"?"Abierta":rawStatus==="aprobada"?"Aprobada":rawStatus==="exportada"?"Exportada":"",observacion=unwrap(c[6]),totalValor=amount(c[7],row.fila),documentoOrigen=unwrap(c[8])||null;
      if(!numero||numero.length>128||!codigoResponsable||!codigoTiendaConsulta)throw new NegativosError(422,"FILA",`Fila ${row.fila}: faltan datos obligatorios.`);
      if(nombre.length>200||(documentoOrigen?.length??0)>128)throw new NegativosError(422,"FILA",`Fila ${row.fila}: usuario o DocumentoOrigen demasiado largos.`);
      if(!estado)throw new NegativosError(422,"ESTADO",`Fila ${row.fila}: estado no permitido.`);
      if(grouped.has(numero))throw new NegativosError(422,"DUPLICADO",`Fila ${row.fila}: la devolución ${numero} aparece más de una vez.`);
      grouped.set(numero,{numero,fecha,codigoResponsable,nombreResponsable:nombre&&nombre.toLowerCase()!==SIN_USUARIO?nombre:null,responsableId:byProfile.get(codigoResponsable)??null,codigoTiendaConsulta,tiendaId:byStore.get(codigoTiendaConsulta)??null,estado,observacion,totalValor,documentoOrigen});
    }
    const rows=[...grouped.values()];if(!rows.length)throw new NegativosError(422,"ARCHIVO","La consulta no contiene devoluciones.");const hash=createHash("sha256").update(`${origenId??""}
`).update(content).digest("hex"),summary={total:rows.length,abiertas:rows.filter(x=>x.estado==="Abierta").length,aprobadas:rows.filter(x=>x.estado==="Aprobada").length,exportadas:rows.filter(x=>x.estado==="Exportada").length,sinTienda:rows.filter(x=>!x.tiendaId).length,sinResponsable:rows.filter(x=>!x.responsableId).length};
    return this.db.$transaction(async tx=>{
      const previous=await tx.devolucionConsultaImport.findUnique({where:{hashArchivo:hash}});if(previous&&!options.reaplicar)return {repetida:true,resumen:previous.resumen};
      const imported=previous??await tx.devolucionConsultaImport.create({data:{nombreArchivo:filename,hashArchivo:hash,totalFilas:rows.length,resumen:summary,importedById:this.access?.userId}});
      // Solo INSERT, UPDATE y baja lógica: nunca se borran devoluciones ni se recarga todo.
      const guardadas=(await tx.devolucionConsulta.findMany({where:{origenId},select:{id:true,numero:true,fecha:true,codigoResponsable:true,nombreResponsable:true,responsableId:true,codigoTiendaConsulta:true,tiendaId:true,estado:true,observacion:true,totalValor:true,documentoOrigen:true,bajaEn:true}})).map(item=>({...item,totalValor:decimalText(item.totalValor)}));
      const cabeceras=planCabeceras(guardadas,rows,["fecha","codigoResponsable","nombreResponsable","responsableId","codigoTiendaConsulta","tiendaId","estado","observacion","totalValor","documentoOrigen"]);
      for(let start=0;start<cabeceras.crear.length;start+=1_000)await tx.devolucionConsulta.createMany({data:cabeceras.crear.slice(start,start+1_000).map(item=>({...item,origenId,ultimaImportacionId:imported.id}))});
      for(const change of cabeceras.actualizar)await tx.devolucionConsulta.update({where:{id:change.id},data:{...change.datos,bajaEn:null,ultimaImportacionId:imported.id}});
      if(cabeceras.bajas.length)await tx.devolucionConsulta.updateMany({where:{id:{in:cabeceras.bajas}},data:{bajaEn:new Date(),ultimaImportacionId:imported.id}});
      const resumen={...summary,insertadas:cabeceras.crear.length,actualizadas:cabeceras.actualizar.length,bajas:cabeceras.bajas.length,sinCambios:cabeceras.sinCambios};
      if(previous&&sinCambiosEnPlan(cabeceras,SIN_DETALLE))return {repetida:true,resumen};
      await tx.auditoria.create({data:{usuarioId:this.access?.userId,entidad:"DevolucionConsultaImport",entidadId:imported.id,accion:"IMPORTAR_CONSULTA_DEVOLUCIONES",origen:options.origen??"CONSULTA_CABECERA",motivo:`Consulta ${filename} aplicada como fuente de devoluciones`,valorNuevo:resumen}});
      return {repetida:false,resumen};
    },{maxWait:30_000,timeout:180_000,isolationLevel:"Serializable"});
  }
  private row(item:{numero:string;fecha:Date;codigoResponsable:string;nombreResponsable:string|null;codigoTiendaConsulta:string;estado:string;observacion:string;totalValor:Prisma.Decimal|null;documentoOrigen:string|null;tienda:{nombre:string}|null;responsable:{nombre:string}|null}){
    return {numero:item.numero,fecha:item.fecha.toISOString().slice(0,10),responsable:item.responsable?.nombre??item.nombreResponsable??`Código ${item.codigoResponsable} sin vincular`,tienda:item.tienda?.nombre??`Código sin vincular: ${item.codigoTiendaConsulta}`,estado:item.estado,observacion:item.observacion,totalValor:item.totalValor===null?null:item.totalValor.toNumber(),documentoOrigen:item.documentoOrigen};
  }
  async list(){if(!this.access)throw new Error("Acceso requerido.");await this.access.permitted("devoluciones.leer");const scope=await this.access.locationScope("devoluciones.leer","TIENDA"),where=scope.national?{bajaEn:null}:{bajaEn:null,tiendaId:{in:scope.rows.map(x=>x.id)}};const [rows,lastImport]=await Promise.all([this.db.devolucionConsulta.findMany({where,include:{tienda:{select:{nombre:true}},responsable:{select:{nombre:true}}},orderBy:[{fecha:"desc"},{numero:"desc"}]}),this.db.devolucionConsultaImport.findFirst({orderBy:{importedAt:"desc"},select:{nombreArchivo:true,importedAt:true,resumen:true}})]);return {rows:rows.map(item=>this.row(item)),lastImport};}
  async detail(numero:string){if(!this.access)throw new Error("Acceso requerido.");await this.access.permitted("devoluciones.leer");const item=await this.db.devolucionConsulta.findFirst({where:{numero},orderBy:[{bajaEn:{sort:"asc",nulls:"first"}},{fecha:"desc"}],include:{tienda:{select:{nombre:true}},responsable:{select:{nombre:true}}}});if(!item)throw new NegativosError(404,"DEVOLUCION","Devolución no encontrada.");const scope=await this.access.locationScope("devoluciones.leer","TIENDA");if(!scope.national&&!scope.rows.some(store=>store.id===item.tiendaId))throw denied();return {...this.row(item),codigoResponsable:item.codigoResponsable,codigoTienda:item.codigoTiendaConsulta};}
}
