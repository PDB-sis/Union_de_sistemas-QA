import type {PrismaClient} from "../../generated/prisma/client";
import {Authorization} from "../auth/authorization";
import {currentMonth,monthLabel,monthRange} from "@pdmc/contratos/month";

const shift=(value:string,amount:number)=>{const [year,month]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1+amount,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`};
const key=(date:Date)=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
const percent=(part:number,total:number)=>total?Number((part/total*100).toFixed(1)):0;

export class MetricsService{
  constructor(private db:PrismaClient,private access:Authorization){}
  async dashboard(){
    await this.access.permitted("metricas.leer");
    const storeScope=await this.access.locationScope("metricas.leer","TIENDA");
    const warehouseWhere=await this.access.warehouseWhere("metricas.leer");
    const warehouses=await this.db.bodega.findMany({where:warehouseWhere,select:{id:true}});
    const storeIds=storeScope.rows.map(row=>row.id),warehouseIds=warehouses.map(row=>row.id);
    const storeFilter=storeScope.national?{}:{tiendaId:{in:storeIds}};
    const latest=currentMonth(),months=Array.from({length:6},(_,index)=>shift(latest,index-5)),range={gte:monthRange(months[0]).gte,lt:monthRange(latest).lt};
    const [transfers,reports,inconsistencies,negatives,inventoryImports,negativePhotos]=await Promise.all([
      this.db.transferenciaConsulta.findMany({where:{bajaEn:null,fecha:range,...storeFilter},select:{numero:true,fecha:true,estado:true,tiendaId:true,unidades:true}}),
      this.db.reporteTransferenciaTienda.findMany({where:{createdAt:range,...storeFilter},select:{transferencia:true,tiendaId:true,sinIncidencias:true,createdAt:true}}),
      this.db.inconsistencia.findMany({where:{fecha:range,...storeFilter},select:{fecha:true,resuelto:true,ajustado:true,cantidadErrada:true}}),
      this.db.negativo.findMany({where:{ultimaDeteccion:range,anuladoAt:null,fusionadoEnId:null,bodegaId:{in:warehouseIds}},select:{ultimaDeteccion:true,estado:true}}),
      this.db.consultaInventario.findMany({where:{fechaConsulta:range},select:{fechaConsulta:true,totalFilas:true},orderBy:{fechaConsulta:"asc"}}),
      storeScope.national?this.db.fotoNegativos.findMany({orderBy:[{fechaCorte:"desc"},{createdAt:"desc"}],take:24,select:{fechaCorte:true,tipoCorte:true,totalCodigos:true,totalUnidades:true}}):Promise.resolve([]),
    ]);
    const byTransfer=new Map(transfers.map(row=>[`${row.tiendaId}:${row.numero}`,row.fecha]));
    const series=months.map(month=>{
      const monthlyTransfers=transfers.filter(row=>key(row.fecha)===month),exported=monthlyTransfers.filter(row=>row.estado==="Exportada");
      const monthlyReports=reports.filter(row=>key(byTransfer.get(`${row.tiendaId}:${row.transferencia}`)??row.createdAt)===month);
      const monthlyIssues=inconsistencies.filter(row=>row.fecha&&key(row.fecha)===month),resolved=monthlyIssues.filter(row=>row.resuelto).length;
      const monthlyNegatives=negatives.filter(row=>key(row.ultimaDeteccion)===month),solved=monthlyNegatives.filter(row=>["SOLUCIONADO","CERRADO_SIN_AJUSTE"].includes(row.estado)).length;
      const inventory=inventoryImports.filter(row=>key(row.fechaConsulta)===month);
      return {month,label:monthLabel(month).replace(/ de /g," "),transferencias:monthlyTransfers.length,exportadas:exported.length,reportadas:monthlyReports.length,cumplimiento:percent(monthlyReports.length,exported.length),sinIncidencias:monthlyReports.filter(row=>row.sinIncidencias).length,inconsistencias:monthlyIssues.length,inconsistenciasResueltas:resolved,resolucionInconsistencias:percent(resolved,monthlyIssues.length),negativos:monthlyNegatives.length,negativosSolucionados:solved,resolucionNegativos:percent(solved,monthlyNegatives.length),productosInventario:inventory.at(-1)?.totalFilas??0};
    });
    const current=series.at(-1)!,previous=series.at(-2)!;
    const weeklyNegatives=negativePhotos.reverse().map((photo,index,rows)=>({fecha:photo.fechaCorte.toISOString().slice(0,10),label:`${photo.tipoCorte.toLocaleLowerCase("es-VE")} ${photo.fechaCorte.toLocaleDateString("es-VE",{day:"2-digit",month:"short",timeZone:"UTC"})}`,codigos:photo.totalCodigos,unidades:Number(photo.totalUnidades),cambio:index?photo.totalCodigos-rows[index-1].totalCodigos:0}));
    return {generatedAt:new Date(),current,previous,series,weeklyNegatives,distribution:[{name:"Sin inconsistencias",value:current.sinIncidencias},{name:"Con inconsistencias",value:Math.max(0,current.reportadas-current.sinIncidencias)}]};
  }
}
