import {createHash} from "node:crypto";
import {Prisma,type PrismaClient} from "../../generated/prisma/client";
import {Authorization,denied} from "../auth/authorization";
import {NegativosError,normalizeHeader,parseDelimitedTable} from "../negativos/validation";
import {normalizeStoreCode} from "../transferencias/consulta";
import {planCabeceras,planDetalles,sinCambiosEnPlan,type DetalleFuente,type PlanDetalles} from "@pdmc/contratos/consultas/cambios";

// La consulta de devoluciones trae la cabecera (usuario, valor y documento de origen) y, como las
// transferencias, una fila por producto y caja (MOVDEVTRANSFERENCIAS). LineasDevolucion es el total de
// líneas de la devolución en SQL Server: si llegan menos (un agente que todavía agrupa por número), el
// detalle se marca incompleto y no se toca lo ya guardado.
export const COLUMNAS_DEVOLUCIONES=["Numero","fecha_formateada","CodNombre","usuario","codigoRecibe_Dletra","status","Observacion","TotalValor","DocumentoOrigen","CodigoBarra","Cantidad","NumeroCaja","LineasDevolucion"] as const;
// Formato anterior, solo cabecera: se sigue aceptando (sin detalle).
const COLUMNAS_CABECERA=COLUMNAS_DEVOLUCIONES.slice(0,9);
const SIN_USUARIO="usuario no encontrado";
const unwrap=(value:string)=>value.trim().replace(/^="(.*)"$/,"$1");
function dateValue(raw:string,row:number){const match=unwrap(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!match)throw new NegativosError(422,"FECHA",`Fila ${row}: fecha_formateada no es válida.`);const month=Number(match[1]),day=Number(match[2]),year=Number(match[3]),date=new Date(Date.UTC(year,month-1,day)),now=new Date(),limit=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));if(year<2020||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date>limit)throw new NegativosError(422,"FECHA",`Fila ${row}: fecha inválida o futura.`);return date;}
// Texto normalizado del Decimal: así lo guardado y lo recibido se comparan igual (123.50 = 123.5).
function amount(raw:string,row:number){const value=unwrap(raw).replace(",",".");if(!value)return null;if(!/^-?\d{1,10}(\.\d{1,8})?$/.test(value))throw new NegativosError(422,"VALOR",`Fila ${row}: TotalValor no es un número válido.`);return new Prisma.Decimal(value).toString();}
// SQL Server puede entregar Cantidad como decimal (12.0000): se acepta si es un entero positivo.
function quantity(raw:string,row:number){const value=Number(unwrap(raw).replace(",","."));if(!Number.isSafeInteger(value)||value<=0)throw new NegativosError(422,"CANTIDAD",`Fila ${row}: Cantidad debe ser un entero mayor que cero.`);return value;}
function lineCount(raw:string,row:number){const value=unwrap(raw);if(!value)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new NegativosError(422,"LINEAS",`Fila ${row}: LineasDevolucion no es válido.`);return n;}
const decimalText=(value:Prisma.Decimal|null)=>value===null?null:value.toString();
type Header={numero:string;fecha:Date;codigoResponsable:string;nombreResponsable:string|null;responsableId:string|null;codigoTiendaConsulta:string;tiendaId:string|null;estado:string;observacion:string;totalValor:string|null;documentoOrigen:string|null;unidades:number;cantidadCodigos:number;lineasDetalle:number|null};
const SIN_DETALLE:PlanDetalles={crear:[],actualizar:[],eliminar:[]};

export class ReturnsService{
  constructor(private db:PrismaClient,private access?:Authorization){}
  // La consulta llega del agente de cada bodega (cysn_qa.agente_fila). reaplicar: vuelve a aplicar un
  // resultado ya importado antes (p. ej. una devolución creada y eliminada). sitio: bodega de origen;
  // la comparación y las bajas se limitan a ella, porque los números se repiten entre bodegas.
  // desde: día del último restablecimiento; solo se cargan las devoluciones de ese día en adelante.
  async import(filename:string,content:string,options:{origen?:string;reaplicar?:boolean;sitio?:{ubicacionId:string};desde?:Date|null}={}){
    const origenId=options.sitio?.ubicacionId??null;
    if(this.access)await this.access.permitted("devoluciones.importar");
    const table=parseDelimitedTable(content),actual=table[0]?.cells.map(normalizeHeader)??[];
    const coincide=(lista:readonly string[])=>actual.length===lista.length&&lista.every((name,index)=>actual[index]===normalizeHeader(name));
    const conDetalle=coincide(COLUMNAS_DEVOLUCIONES);
    if(!conDetalle&&!coincide(COLUMNAS_CABECERA))throw new NegativosError(422,"ENCABEZADOS",`Encabezados requeridos: ${COLUMNAS_DEVOLUCIONES.join("; ")}.`);
    const [stores,profiles,products]=await Promise.all([this.db.ubicacion.findMany({where:{tipo:"TIENDA"},select:{id:true,codigo:true}}),this.db.perfilLaboral.findMany({where:{tipo:"FACTURACION",activo:true},select:{id:true,codigo:true}}),conDetalle?this.db.producto.findMany({select:{id:true,codigoBarra:true}}):Promise.resolve([])]);
    const byStore=new Map(stores.map(x=>[normalizeStoreCode(x.codigo),x.id])),byProfile=new Map(profiles.map(x=>[normalizeStoreCode(x.codigo),x.id])),byBarcode=new Map(products.map(x=>[x.codigoBarra,x.id]));
    const grouped=new Map<string,Header>(),lineas=new Map<string,DetalleFuente[]>(),seen=new Set<string>();
    for(const row of table.slice(1).filter(item=>item.cells.some(Boolean))){
      const c=row.cells;if(c.length!==actual.length)throw new NegativosError(422,"FILA",`Fila ${row.fila}: número de columnas incorrecto.`);
      const numero=unwrap(c[0]),fecha=dateValue(c[1],row.fila),codigoResponsable=normalizeStoreCode(c[2]),nombre=unwrap(c[3]).replace(/\s+/g," "),codigoTiendaConsulta=normalizeStoreCode(c[4]),rawStatus=unwrap(c[5]).toLowerCase(),estado=rawStatus==="abierta"?"Abierta":rawStatus==="aprobada"?"Aprobada":rawStatus==="exportada"?"Exportada":"",observacion=unwrap(c[6]),totalValor=amount(c[7],row.fila),documentoOrigen=unwrap(c[8])||null;
      if(!numero||numero.length>128||!codigoResponsable||!codigoTiendaConsulta)throw new NegativosError(422,"FILA",`Fila ${row.fila}: faltan datos obligatorios.`);
      if(nombre.length>200||(documentoOrigen?.length??0)>128)throw new NegativosError(422,"FILA",`Fila ${row.fila}: usuario o DocumentoOrigen demasiado largos.`);
      if(!estado)throw new NegativosError(422,"ESTADO",`Fila ${row.fila}: estado no permitido.`);
      const existente=grouped.get(numero);
      if(!conDetalle&&existente)throw new NegativosError(422,"DUPLICADO",`Fila ${row.fila}: la devolución ${numero} aparece más de una vez.`);
      // Todas las filas de una devolución repiten su cabecera: se toma la primera.
      if(!existente)grouped.set(numero,{numero,fecha,codigoResponsable,nombreResponsable:nombre&&nombre.toLowerCase()!==SIN_USUARIO?nombre:null,responsableId:byProfile.get(codigoResponsable)??null,codigoTiendaConsulta,tiendaId:byStore.get(codigoTiendaConsulta)??null,estado,observacion,totalValor,documentoOrigen,unidades:0,cantidadCodigos:0,lineasDetalle:conDetalle?lineCount(c[12],row.fila):null});
      // Mientras el agente cambia de clave pueden convivir filas sin LineasDevolucion: se toma la que lo trae.
      else if(conDetalle&&existente.lineasDetalle===null)existente.lineasDetalle=lineCount(c[12],row.fila);
      const codigoBarra=conDetalle?unwrap(c[9]):"";
      if(!codigoBarra)continue; // Devolución sin productos, o bodega con la consulta anterior.
      const numeroCaja=unwrap(c[11]),cantidad=quantity(c[10],row.fila);
      if(codigoBarra.length>128||!numeroCaja||numeroCaja.length>80)throw new NegativosError(422,"FILA",`Fila ${row.fila}: código de barra o caja no válidos.`);
      const key=`${numero}\u0000${codigoBarra}\u0000${numeroCaja}`;if(seen.has(key))throw new NegativosError(422,"DUPLICADO",`Fila ${row.fila}: el código ${codigoBarra} ya existe en la caja ${numeroCaja} de la devolución ${numero}.`);seen.add(key);
      lineas.set(numero,[...(lineas.get(numero)??[]),{numero,codigoBarra,cantidad,numeroCaja,productoId:byBarcode.get(codigoBarra)??null}]);
    }
    if(!grouped.size)throw new NegativosError(422,"ARCHIVO","La consulta no contiene devoluciones.");
    let anteriores=0;
    if(options.desde)for(const [numero,row] of grouped)if(row.fecha<options.desde){grouped.delete(numero);lineas.delete(numero);anteriores++;}
    // Solo el detalle completo reemplaza lo guardado; uno parcial dejaría la devolución con productos de menos.
    const completas=new Set([...grouped.values()].filter(row=>row.lineasDetalle!==null&&(lineas.get(row.numero)?.length??0)===row.lineasDetalle).map(row=>row.numero));
    for(const row of grouped.values())if(completas.has(row.numero)){const filas=lineas.get(row.numero)??[];row.unidades=filas.reduce((sum,item)=>sum+item.cantidad,0);row.cantidadCodigos=new Set(filas.map(item=>item.codigoBarra)).size;}
    const details=[...completas].flatMap(numero=>lineas.get(numero)??[]);
    const rows=[...grouped.values()];const hash=createHash("sha256").update(`${origenId??""}
${options.desde?`desde ${options.desde.toISOString()}\n`:""}`).update(content).digest("hex"),summary={...(options.desde?{desde:options.desde.toISOString().slice(0,10),anterioresAlRestablecimiento:anteriores}:{}),total:rows.length,abiertas:rows.filter(x=>x.estado==="Abierta").length,aprobadas:rows.filter(x=>x.estado==="Aprobada").length,exportadas:rows.filter(x=>x.estado==="Exportada").length,sinTienda:rows.filter(x=>!x.tiendaId).length,sinResponsable:rows.filter(x=>!x.responsableId).length,...(conDetalle?{filasDetalle:details.length,detalleIncompleto:rows.filter(x=>x.lineasDetalle!==null&&!completas.has(x.numero)).length,sinDetalle:rows.filter(x=>x.lineasDetalle===null).length}:{})};
    return this.db.$transaction(async tx=>{
      const previous=await tx.devolucionConsultaImport.findUnique({where:{hashArchivo:hash}});if(previous&&!options.reaplicar)return {repetida:true,resumen:previous.resumen};
      const imported=previous??await tx.devolucionConsultaImport.create({data:{nombreArchivo:filename,hashArchivo:hash,totalFilas:Math.max(rows.length,details.length),resumen:summary,importedById:this.access?.userId}});
      // Solo INSERT, UPDATE y baja lógica: nunca se borran devoluciones ni se recarga todo.
      const guardadas=(await tx.devolucionConsulta.findMany({where:{origenId},select:{id:true,numero:true,fecha:true,codigoResponsable:true,nombreResponsable:true,responsableId:true,codigoTiendaConsulta:true,tiendaId:true,estado:true,observacion:true,totalValor:true,documentoOrigen:true,unidades:true,cantidadCodigos:true,lineasDetalle:true,bajaEn:true}})).map(item=>({...item,totalValor:decimalText(item.totalValor)}));
      // Sin detalle completo se conservan las unidades y referencias ya guardadas (y, en el formato anterior, las líneas esperadas).
      const porNumero=new Map(guardadas.map(item=>[item.numero,item]));
      for(const row of rows)if(!completas.has(row.numero)){const antes=porNumero.get(row.numero);row.unidades=antes?.unidades??0;row.cantidadCodigos=antes?.cantidadCodigos??0;if(!conDetalle)row.lineasDetalle=antes?.lineasDetalle??null;}
      const cabeceras=planCabeceras(guardadas,rows,["fecha","codigoResponsable","nombreResponsable","responsableId","codigoTiendaConsulta","tiendaId","estado","observacion","totalValor","documentoOrigen","unidades","cantidadCodigos","lineasDetalle"]);
      for(let start=0;start<cabeceras.crear.length;start+=1_000)await tx.devolucionConsulta.createMany({data:cabeceras.crear.slice(start,start+1_000).map(item=>({...item,origenId,ultimaImportacionId:imported.id}))});
      for(const change of cabeceras.actualizar)await tx.devolucionConsulta.update({where:{id:change.id},data:{...change.datos,bajaEn:null,ultimaImportacionId:imported.id}});
      if(cabeceras.bajas.length)await tx.devolucionConsulta.updateMany({where:{id:{in:cabeceras.bajas}},data:{bajaEn:new Date(),ultimaImportacionId:imported.id}});
      let detalle=SIN_DETALLE;
      if(completas.size){
        const ids=new Map((await tx.devolucionConsulta.findMany({where:{origenId,numero:{in:[...completas]}},select:{id:true,numero:true}})).map(item=>[item.numero,item.id])),numeros=new Map([...ids].map(([numero,id])=>[id,numero]));
        const actuales=(await tx.devolucionConsultaDetalle.findMany({where:{devolucionId:{in:[...ids.values()]}},select:{id:true,devolucionId:true,codigoBarra:true,numeroCaja:true,cantidad:true,productoId:true}})).map(({devolucionId,...item})=>({...item,numero:numeros.get(devolucionId)!}));
        // Una devolución completa que ya no tiene productos (LineasDevolucion = 0) también limpia su detalle.
        const plan=planDetalles(actuales,details),vacias=actuales.filter(item=>!(lineas.get(item.numero)?.length)&&!plan.eliminar.includes(item.id)).map(item=>item.id);
        detalle={...plan,eliminar:[...plan.eliminar,...vacias]};
        for(let start=0;start<plan.crear.length;start+=2_000)await tx.devolucionConsultaDetalle.createMany({data:plan.crear.slice(start,start+2_000).map(item=>({devolucionId:ids.get(item.numero)!,productoId:item.productoId,codigoBarra:item.codigoBarra,cantidad:item.cantidad,numeroCaja:item.numeroCaja}))});
        for(const change of plan.actualizar)await tx.devolucionConsultaDetalle.update({where:{id:change.id},data:{cantidad:change.cantidad,productoId:change.productoId}});
        if(detalle.eliminar.length)await tx.devolucionConsultaDetalle.deleteMany({where:{id:{in:detalle.eliminar}}});
      }
      const resumen={...summary,insertadas:cabeceras.crear.length,actualizadas:cabeceras.actualizar.length,bajas:cabeceras.bajas.length,sinCambios:cabeceras.sinCambios,...(conDetalle?{detalle:{insertadas:detalle.crear.length,actualizadas:detalle.actualizar.length,retiradas:detalle.eliminar.length}}:{})};
      if(previous&&sinCambiosEnPlan(cabeceras,detalle))return {repetida:true,resumen};
      await tx.auditoria.create({data:{usuarioId:this.access?.userId,entidad:"DevolucionConsultaImport",entidadId:imported.id,accion:"IMPORTAR_CONSULTA_DEVOLUCIONES",origen:options.origen??(conDetalle?"CONSULTA_DETALLE":"CONSULTA_CABECERA"),motivo:`Consulta ${filename} aplicada como fuente de devoluciones`,valorNuevo:resumen}});
      return {repetida:false,resumen};
    },{maxWait:30_000,timeout:300_000,isolationLevel:"Serializable"});
  }
  private row(item:{numero:string;fecha:Date;codigoResponsable:string;nombreResponsable:string|null;codigoTiendaConsulta:string;estado:string;observacion:string;totalValor:Prisma.Decimal|null;documentoOrigen:string|null;unidades:number;cantidadCodigos:number;tienda:{nombre:string}|null;responsable:{nombre:string}|null}){
    return {numero:item.numero,fecha:item.fecha.toISOString().slice(0,10),responsable:item.responsable?.nombre??item.nombreResponsable??`Código ${item.codigoResponsable} sin vincular`,tienda:item.tienda?.nombre??`Código sin vincular: ${item.codigoTiendaConsulta}`,estado:item.estado,observacion:item.observacion,totalValor:item.totalValor===null?null:item.totalValor.toNumber(),documentoOrigen:item.documentoOrigen,unidades:item.unidades,referencias:item.cantidadCodigos};
  }
  async list(){if(!this.access)throw new Error("Acceso requerido.");await this.access.permitted("devoluciones.leer");const scope=await this.access.locationScope("devoluciones.leer","TIENDA"),where=scope.national?{bajaEn:null}:{bajaEn:null,tiendaId:{in:scope.rows.map(x=>x.id)}};const [rows,lastImport]=await Promise.all([this.db.devolucionConsulta.findMany({where,include:{tienda:{select:{nombre:true}},responsable:{select:{nombre:true}}},orderBy:[{fecha:"desc"},{numero:"desc"}]}),this.db.devolucionConsultaImport.findFirst({orderBy:{importedAt:"desc"},select:{nombreArchivo:true,importedAt:true,resumen:true}})]);return {rows:rows.map(item=>this.row(item)),lastImport};}
  async detail(numero:string){
    if(!this.access)throw new Error("Acceso requerido.");await this.access.permitted("devoluciones.leer");
    // Los números se repiten entre bodegas: se busca dentro de las tiendas que la persona puede ver.
    const scope=await this.access.locationScope("devoluciones.leer","TIENDA");
    const item=await this.db.devolucionConsulta.findFirst({where:{numero,...(scope.national?{}:{tiendaId:{in:scope.rows.map(store=>store.id)}})},orderBy:[{bajaEn:{sort:"asc",nulls:"first"}},{fecha:"desc"}],include:{tienda:{select:{nombre:true}},responsable:{select:{nombre:true}},detalles:{include:{producto:{select:{referencia:true,descripcion:true,marca:true,talla:true}}},orderBy:[{numeroCaja:"asc"},{codigoBarra:"asc"}]}}});
    if(!item){if(await this.db.devolucionConsulta.count({where:{numero}}))throw denied();throw new NegativosError(404,"DEVOLUCION","Devolución no encontrada.");}
    // Estado del detalle: completo, incompleto (llegaron menos líneas) o sin detalle (la bodega aún usa la consulta anterior).
    const detalle=item.lineasDetalle===null?"SIN_DETALLE":item.detalles.length<item.lineasDetalle?"INCOMPLETO":"COMPLETO";
    return {...this.row(item),codigoResponsable:item.codigoResponsable,codigoTienda:item.codigoTiendaConsulta,detalle,lineasEsperadas:item.lineasDetalle,cajas:new Set(item.detalles.map(x=>x.numeroCaja)).size,
      items:item.detalles.map(x=>({codigoBarra:x.codigoBarra,cantidad:x.cantidad,numeroCaja:x.numeroCaja,referencia:x.producto?.referencia??null,descripcion:x.producto?.descripcion??null,marca:x.producto?.marca??null,talla:x.producto?.talla??null}))};
  }
}
