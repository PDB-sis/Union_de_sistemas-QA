import { Authorization } from "../auth/authorization";
import { auditActor } from "../audit-context";
import "server-only";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client";
import { estados, gruposEstado, type GrupoEstado } from "../../../shared/negativos/model";
import { uuid, NegativosError } from "./validation";
import {countWorkflow,type CountWorkflow} from "../../../shared/workflow/count-routing";
import {currentMonth,monthRange} from "../../../shared/month";
import {validarMotivoNegativo} from "../../../shared/negativos/reasons";
import {photoComparison} from "./photo-comparison";
import {validarCambioNegativo,verificarAjusteNegativo,type VerificacionNegativo} from "../../../shared/negativos/flujo";

export const stateSchema = z.enum(Object.keys(estados) as [keyof typeof estados, ...(keyof typeof estados)[]]);
const note = z.string().trim().max(10000);
export const editSchema = z.object({
  bodegaId: uuid, version: z.number().int().positive(), estado: stateSchema,
  bodegaProductoId: uuid.nullable().optional(),
  conteoFisico: z.string().trim().regex(/^(?:\d{1,14}(?:[.,]\d{1,4})?)?$/),
  motivo: note, documentoRelacionado: z.string().trim().max(255), veredicto: note,
  numeroAjuste: z.string().trim().max(128), observaciones: note,
}).strict();
export const bulkSchema = z.object({ bodegaId: uuid.optional(), estado: stateSchema.optional(),
  motivo: note.min(1).optional(), numeroAjuste: z.string().trim().min(1).max(128).optional(),
  casos: z.array(z.object({ id: uuid, version: z.number().int().positive() }).strict()).min(1).max(100),
}).strict().refine(v => new Set(v.casos.map(c => c.id)).size === v.casos.length, "Selección duplicada")
  .refine(v => v.estado !== undefined || v.motivo !== undefined || v.numeroAjuste !== undefined, "Indique al menos un campo para aplicar.");
export const cancelCaseSchema = z.object({ bodegaId: uuid, version: z.number().int().positive(), motivo: z.string().trim().min(1).max(2000) }).strict();
export const listingSchema = z.object({ bodegaId: uuid.optional(), skip: z.coerce.number().int().min(0).max(100000).default(0),
  mes:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).default(currentMonth()),
  bodegaProductoId: uuid.or(z.literal("")).default(""),
  vista: z.enum(["actual", "pendientes_verificar", "historial"]).default("actual"),
  orden: z.enum(["cantidad_desc", "cantidad_asc", "codigo_asc", "codigo_desc", "fecha_desc", "fecha_asc"]).default("cantidad_desc"),
  take: z.coerce.number().int().min(1).max(100).default(25), q: z.string().trim().max(200).default(""),
  flujo:z.enum(["todos","trabajo"]).default("todos"),
  cola:z.enum(["automatica","pendientes","gestion","aprobados","listos","desaparecidos"]).default("automatica"),
  comparacion:z.enum(["todos","nuevos","aumentaron","disminuyeron","iguales","desaparecieron"]).default("todos"),
  filtro: z.union([stateSchema, z.enum(["pending", "resolved", "all", "anulados", "con_conteo"])]).default("pending"),
}).strict();
export async function lockWarehouse(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Bodega" WHERE id=${id}::uuid AND activa=true FOR UPDATE`;
  if (!rows.length) throw new NegativosError(404, "BODEGA_NO_DISPONIBLE", "Bodega inexistente o inactiva.");
}
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
// Evidencia para cerrar un ajuste: inventario vigente posterior al ajuste y sin existencia negativa.
export async function verificacionesAjuste(tx: Prisma.TransactionClient, casos: {id:string;productoId:string}[]) {
  const result=new Map<string,VerificacionNegativo>();
  if(!casos.length)return result;
  const [vigente,sumas,ajustes]=await Promise.all([
    tx.inventarioActual.findFirst({orderBy:{consulta:{fechaImportacion:"desc"}},select:{consulta:{select:{fechaConsulta:true}}}}),
    tx.inventarioActual.groupBy({by:["productoId"],where:{productoId:{in:casos.map(c=>c.productoId)}},_sum:{existencia:true}}),
    tx.historialNegativo.findMany({where:{negativoId:{in:casos.map(c=>c.id)},valorNuevo:{path:["estado"],equals:"AJUSTE_REALIZADO"},NOT:{valorAnterior:{path:["estado"],equals:"AJUSTE_REALIZADO"}}},orderBy:{createdAt:"desc"},select:{negativoId:true,createdAt:true}}),
  ]);
  const existencia=new Map(sumas.map(row=>[row.productoId,row._sum.existencia?.toFixed(4)??null]));
  const ajusteAt=new Map<string,Date>();for(const row of ajustes)if(!ajusteAt.has(row.negativoId))ajusteAt.set(row.negativoId,row.createdAt);
  for(const caso of casos)result.set(caso.id,verificarAjusteNegativo({ajusteAt:ajusteAt.get(caso.id)??null,inventarioAt:vigente?.consulta.fechaConsulta??null,existencia:existencia.get(caso.productoId)??null}));
  return result;
}
async function exigirVerificacion(tx: Prisma.TransactionClient, caso:{id:string;productoId:string}, etiqueta="") {
  const verificacion=(await verificacionesAjuste(tx,[caso])).get(caso.id)!;
  if(!verificacion.puedeCerrar)throw new NegativosError(422,"VERIFICACION_PENDIENTE",etiqueta+verificacion.mensaje);
}
export async function operationalHistory(tx: Prisma.TransactionClient, before: {id:string}, after: {id:string}, accion: string, motivo: string, usuarioId?:string, origen?:string) {
  const values = { accion, motivo, valorAnterior: json(before), valorNuevo: json(after) };
  const actor=auditActor(usuarioId,origen);
  await tx.historialNegativo.create({ data: { negativoId: after.id, usuarioId:actor.usuarioId, ...values } });
  await tx.auditoria.create({ data: { entidad: "Negativo", entidadId: after.id, ...actor, ...values } });
}
export class NegativeOperations {
  constructor(private db: PrismaClient, private access = new Authorization(db)) {}
  async bodegas() { return this.db.bodega.findMany({ where: { AND: [await this.access.warehouseWhere("negativos.leer"), {activa:true}] }, orderBy: { nombre: "asc" }, take: 500, select: { id: true, codigo: true, nombre: true } }); }
  async bodegasProducto() {
    await this.access.warehouseWhere("negativos.leer");
    return this.db.bodegaProducto.findMany({orderBy:{nombre:"asc"}});
  }
  async crearBodega(input: unknown) {
    await this.access.national("ubicaciones.administrar");
    const data = z.object({ codigo: z.string().trim().min(1).max(80), nombre: z.string().trim().min(1).max(200) }).strict().parse(input);
    return this.db.$transaction(async tx => {
      const b = await tx.bodega.create({ data });
      await tx.auditoria.create({ data: { ...auditActor(this.access.userId), entidad: "Bodega", entidadId: b.id, accion: "ALTA_MANUAL", motivo: "Registro explícito para operar negativos", valorNuevo: data } });
      return b;
    });
  }
  async editar(id: string, raw: unknown) {
    uuid.parse(id);
    const input = editSchema.parse(raw);
    return this.db.$transaction(async tx => {
      await lockWarehouse(tx, input.bodegaId);
      const before = await tx.negativo.findFirst({ where: { id, bodegaId: input.bodegaId, anuladoAt: null, fusionadoEnId:null } });
      if (!before) throw new NegativosError(404, "NO_ENCONTRADO", "Expediente inexistente o anulado.");
      if (before.version !== input.version) throw new NegativosError(409, "VERSION", "Otra pestaña modificó el caso. Actualice antes de guardar.");
      await this.access.caseFields(before.bodegaId,before,input);
      const motivoInvalido=validarMotivoNegativo(input.motivo,input.documentoRelacionado,before.motivo??"");
      if(motivoInvalido)throw new NegativosError(422,"MOTIVO_INVALIDO",motivoInvalido);
      if(["AJUSTE_AUTORIZADO","AJUSTE_REALIZADO"].includes(input.estado)&&!input.conteoFisico)throw new NegativosError(422,"CONTEO_REQUERIDO","Registre el conteo físico antes de aprobar o ejecutar un ajuste.");
      if(["SOLUCIONADO","CERRADO_SIN_AJUSTE"].includes(input.estado)&&!input.motivo&&!input.veredicto&&!input.observaciones)throw new NegativosError(422,"CIERRE_INCOMPLETO","Documente la solución antes de cerrar el expediente.");
      if(input.estado==="AJUSTE_REALIZADO"&&!input.numeroAjuste)throw new NegativosError(422,"AJUSTE_REQUERIDO","Indique el número de ajuste antes de marcar el caso como ajustado.");
      const cambio=validarCambioNegativo({antes:{estado:before.estado,conteoFisico:before.conteoFisico?.toFixed(4)??null},despues:{estado:input.estado,conteoFisico:input.conteoFisico||null,motivo:input.motivo,numeroAjuste:input.numeroAjuste,observaciones:input.observaciones}});
      if(cambio)throw new NegativosError(422,"CAMBIO_NO_PERMITIDO",cambio);
      if(input.estado==="SOLUCIONADO"&&before.estado==="AJUSTE_REALIZADO")await exigirVerificacion(tx,before);
      if (input.bodegaProductoId && !await tx.bodegaProducto.findUnique({where:{id:input.bodegaProductoId}})) throw new NegativosError(422,"BODEGA_PRODUCTO","Bodega no registrada.");
      const fields = editSchema.omit({ bodegaId: true, version: true }).parse(Object.fromEntries(Object.entries(input).filter(([key]) => !["bodegaId", "version"].includes(key))));
      const count=fields.conteoFisico?fields.conteoFisico.replace(",", "."):null;
      const countChanged=(count===null?null:new Prisma.Decimal(count).toFixed(4))!==(before.conteoFisico?.toFixed(4)??null)||Boolean(count&&before.existenciaSistemaConteo===null);
      let systemAtCount=before.existenciaSistemaConteo;
      if(countChanged&&count){
        systemAtCount=(await tx.inventarioActual.findFirst({where:{productoId:before.productoId},select:{existencia:true}}))?.existencia??null;
        if(systemAtCount===null)throw new NegativosError(422,"INVENTARIO_NO_DISPONIBLE","No se puede registrar el conteo porque no hay una cantidad de sistema vigente para el producto.");
      }
      const after = await tx.negativo.update({ where: { id }, data: { ...fields, conteoFisico:count,...(countChanged?{existenciaSistemaConteo:count?systemAtCount:null,conteoRegistradoAt:count?new Date():null}:{}),version: { increment: 1 } } });
      await operationalHistory(tx, before, after, "EDITAR_SEGUIMIENTO", "Edición confirmada desde la interfaz",this.access.userId);
      return after;
    });
  }
  async masivo(raw: unknown) {
    const input = bulkSchema.parse(raw);
    return this.db.$transaction(async tx => {
      const selected = await tx.negativo.findMany({ where: { id: { in: input.casos.map(c => c.id) }, bodegaId: input.bodegaId }, select: { bodegaId: true } });
      for (const id of [...new Set(selected.map(n => n.bodegaId))].sort()) {
        await this.access.warehouse("negativos.editar",id);
        await lockWarehouse(tx, id);
      }
      for (const item of input.casos) {
        const before = await tx.negativo.findFirst({ where: { id: item.id, bodegaId: input.bodegaId, anuladoAt: null, fusionadoEnId:null }, include:{producto:{select:{codigoBarra:true}}} });
        if (!before || before.version !== item.version) throw new NegativosError(409, "VERSION", "La selección cambió. Actualice; no se modificó ningún caso.");
        await this.access.caseFields(before.bodegaId,before,input);
        // Mismas reglas que el expediente individual; ningún caso se modifica si uno falla.
        const etiqueta=`Código ${before.producto.codigoBarra}: `;
        if(input.motivo!==undefined){const motivoInvalido=validarMotivoNegativo(input.motivo,before.documentoRelacionado??"",before.motivo??"");if(motivoInvalido)throw new NegativosError(422,"MOTIVO_INVALIDO",etiqueta+motivoInvalido+" Edítelo individualmente.");}
        const cambio=validarCambioNegativo({antes:{estado:before.estado,conteoFisico:before.conteoFisico?.toFixed(4)??null},despues:{estado:input.estado??before.estado,conteoFisico:before.conteoFisico?.toFixed(4)??null,motivo:input.motivo??before.motivo??"",numeroAjuste:input.numeroAjuste??before.numeroAjuste??"",observaciones:before.observaciones??""}});
        if(cambio)throw new NegativosError(422,"CAMBIO_NO_PERMITIDO",etiqueta+cambio);
        if(input.estado==="SOLUCIONADO"&&before.estado==="AJUSTE_REALIZADO")await exigirVerificacion(tx,before,etiqueta);
        if(input.estado&&["AJUSTE_AUTORIZADO","AJUSTE_REALIZADO"].includes(input.estado)&&before.conteoFisico===null)throw new NegativosError(422,"CONTEO_REQUERIDO","Todos los casos seleccionados deben tener conteo antes de aprobar el ajuste.");
        if(input.estado&&["SOLUCIONADO","CERRADO_SIN_AJUSTE"].includes(input.estado)&&!input.motivo&&!before.motivo&&!before.veredicto&&!before.observaciones)throw new NegativosError(422,"CIERRE_INCOMPLETO","Documente la solución de todos los casos antes de cerrar el lote.");
        if(input.estado==="AJUSTE_REALIZADO"&&!input.numeroAjuste&&!before.numeroAjuste)throw new NegativosError(422,"AJUSTE_REQUERIDO","Todos los casos ajustados deben tener un número de ajuste.");
        const after = await tx.negativo.update({ where: { id: item.id }, data: { estado: input.estado, motivo: input.motivo, numeroAjuste: input.numeroAjuste, version: { increment: 1 } } });
        const beforeCase:{id:string}={...before};delete (beforeCase as Partial<typeof before>).producto;
        await operationalHistory(tx, beforeCase, after, "ESTADO_MASIVO", "Edición masiva confirmada: " + [input.estado !== undefined && "estado", input.motivo !== undefined && "motivo", input.numeroAjuste !== undefined && "número de ajuste"].filter(Boolean).join(", "),this.access.userId);
      }
      return { modificados: input.casos.length };
    }, { timeout: 30000 });
  }
  async anularCaso(id: string, raw: unknown) {
    uuid.parse(id);
    const input = cancelCaseSchema.parse(raw);
    await this.access.warehouse("negativos.anular",input.bodegaId);
    return this.db.$transaction(async tx => {
      await lockWarehouse(tx, input.bodegaId);
      const before = await tx.negativo.findFirst({ where: { id, bodegaId: input.bodegaId, fusionadoEnId:null } });
      if (!before) throw new NegativosError(404, "NO_ENCONTRADO", "Caso inexistente.");
      if (before.version !== input.version || before.anuladoAt) throw new NegativosError(409, "VERSION", "El caso cambió o ya fue anulado. Actualice la lista.");
      const after = await tx.negativo.update({ where: { id }, data: { anuladoAt: new Date(), motivoAnulacion: input.motivo, version: { increment: 1 } } });
      await operationalHistory(tx, before, after, "ANULAR_CASO", input.motivo,this.access.userId);
      return after;
    });
  }
  async listar(raw: unknown) {
    const p = listingSchema.parse(raw);
    const scopedId = await this.access.filter("negativos.leer",p.bodegaId);
    const closed = ["SOLUCIONADO", "CERRADO_SIN_AJUSTE"] as const;
    return this.db.$transaction(async tx => {
      const scopes = await tx.bodega.findMany({ where: { id: scopedId }, select: { id: true } });
      const workflows=new Map<string,CountWorkflow>();
      const editable=new Map<string,boolean>();
      const countable=new Map<string,boolean>();
      await Promise.all(scopes.map(async b=>{const [canCount,canEdit]=await Promise.all([this.access.canWarehouse("negativos.conteo",b.id),this.access.canWarehouse("negativos.editar",b.id)]);countable.set(b.id,canCount);editable.set(b.id,canEdit);workflows.set(b.id,countWorkflow(canCount,canEdit));}));
      const countIds=scopes.filter(b=>workflows.get(b.id)==="conteo").map(b=>b.id),managementIds=scopes.filter(b=>workflows.get(b.id)==="gestion").map(b=>b.id);
      const pendingIds=scopes.filter(b=>countable.get(b.id)||editable.get(b.id)).map(b=>b.id);
      const approvedStates=["AJUSTE_AUTORIZADO","AJUSTE_REALIZADO"] as const;
      const workExcluded=[...approvedStates,...closed];
      const workflowWhere:Prisma.NegativoWhereInput=p.cola==="pendientes"
        ? {bodegaId:{in:pendingIds},conteoFisico:null,estado:{notIn:workExcluded}}
        : p.cola==="aprobados"
          ? {bodegaId:scopedId,estado:"AJUSTE_AUTORIZADO"}
        : p.cola==="listos"
          ? {bodegaId:scopedId,estado:"AJUSTE_REALIZADO"}
        : p.cola==="desaparecidos"
          ? {bodegaId:scopedId,estado:"PENDIENTE_VERIFICAR"}
        : p.cola==="gestion"
          ? {bodegaId:{in:managementIds},conteoFisico:{not:null},estado:{notIn:workExcluded}}
          : {OR:[...(countIds.length?[{bodegaId:{in:countIds},conteoFisico:null,estado:{notIn:workExcluded}}]:[]),...(managementIds.length?[{bodegaId:{in:managementIds},conteoFisico:{not:null},estado:{notIn:workExcluded}}]:[])]};
      const selectedPeriod=monthRange(p.mes),isCurrentPeriod=p.mes===currentMonth();
      const activePhoto=await tx.fotoNegativos.findFirst({where:{fechaCorte:selectedPeriod},orderBy:[{fechaCorte:"desc"},{createdAt:"desc"}],include:{items:true,consulta:true}});
      const previousPhoto=activePhoto?await tx.fotoNegativos.findFirst({where:{fechaCorte:{lt:activePhoto.fechaCorte}},orderBy:{fechaCorte:"desc"},include:{items:true}}):null;
      const previousAmounts=new Map(previousPhoto?.items.map(row=>[row.productoId,row.existencia])??[]);
      const inventory=activePhoto?activePhoto.items.map(row=>({productoId:row.productoId,_sum:{existencia:row.existencia}})):isCurrentPeriod?await tx.inventarioActual.groupBy({by:["productoId"],_sum:{existencia:true}}):[];
      const currentAmounts=new Map(inventory.filter(row=>row._sum.existencia?.isNegative()).map(row=>[row.productoId,row._sum.existencia!]));
      const currentProductIds=[...currentAmounts.keys()];
      const comparisonLabels={nuevos:"Nuevo",aumentaron:"Empeoró",disminuyeron:"Mejoró",iguales:"Sin cambio",desaparecieron:"Desapareció"};
      const comparisonIds=p.comparacion==="todos"?[]:[...new Set([...currentProductIds,...previousAmounts.keys()])].filter(id=>photoComparison(previousAmounts.get(id)?.toFixed(4)??null,currentAmounts.get(id)?.toFixed(4)??null,Boolean(previousPhoto),Boolean(activePhoto)).estado===comparisonLabels[p.comparacion as keyof typeof comparisonLabels]);
      const latest=activePhoto?.consulta??await tx.consultaInventario.findFirst({where:{fechaConsulta:selectedPeriod},orderBy:[{fechaConsulta:"desc"},{fechaImportacion:"desc"}]});
      const flow=p.flujo==="trabajo"?workflowWhere:{};
      const effectiveView=p.cola==="desaparecidos"?"pendientes_verificar":p.vista;
      const period=effectiveView==="actual"?{}:{ultimaDeteccion:monthRange(p.mes)};
      const base: Prisma.NegativoWhereInput = { AND:[{bodegaId:scopedId},flow,period,...(p.comparacion!=="todos"?[{productoId:{in:comparisonIds}}]:[])], anuladoAt: null, fusionadoEnId:null,
        ...(effectiveView==="actual" && p.filtro!=="anulados" && p.cola!=="listos" ? {productoId:{in:currentProductIds}} :
          effectiveView==="pendientes_verificar" ? {productoId:{notIn:currentProductIds},estado:"PENDIENTE_VERIFICAR"} : {}),
      };
      const where: Prisma.NegativoWhereInput = { ...base,
        ...(p.bodegaProductoId ? { bodegaProductoId: p.bodegaProductoId } : {}),
        ...(p.filtro === "anulados" ? { anuladoAt: { not: null } } : {}),
        ...(p.filtro === "con_conteo" ? { conteoFisico: { not: null } } : {}),
        ...(p.filtro === "pending" ? { estado: { notIn: [...closed] } } : p.filtro === "resolved" ? { estado: { in: [...closed] } } : p.filtro in gruposEstado ? { estado: { in: [...gruposEstado[p.filtro as GrupoEstado].estados] } } : p.filtro in estados ? { estado: p.filtro as keyof typeof estados } : {}),
        ...(p.q ? { OR: [{ producto: { codigoBarra: { contains: p.q, mode: "insensitive" } } }, { producto: { descripcion: { contains: p.q, mode: "insensitive" } } }, { producto: { referencia: { contains: p.q, mode: "insensitive" } } }, { producto: { marca: { contains: p.q, mode: "insensitive" } } }, { motivo: { contains: p.q, mode: "insensitive" } }, { documentoRelacionado: { contains: p.q, mode: "insensitive" } }] } : {}),
      };
      const total = await tx.negativo.count({ where });
      let items: Prisma.NegativoGetPayload<{ include: { producto: true, bodegaProducto:true } }>[];
      if (p.orden.startsWith("cantidad_")) {
        const all=await tx.negativo.findMany({where,include:{producto:true,bodegaProducto:true}});
        all.sort((a,b)=>{const av=currentAmounts.get(a.productoId),bv=currentAmounts.get(b.productoId);if(!av&&!bv)return a.id.localeCompare(b.id);if(!av)return 1;if(!bv)return -1;const order=av.comparedTo(bv);return p.orden==="cantidad_desc"?order:-order;});
        items=all.slice(p.skip,p.skip+p.take);
      } else {
        const orderBy: Prisma.NegativoOrderByWithRelationInput = p.orden.startsWith("codigo_")
          ? { producto: { codigoBarra: p.orden === "codigo_asc" ? "asc" : "desc" } }
          : { ultimaDeteccion: p.orden === "fecha_asc" ? "asc" : "desc" };
        items = await tx.negativo.findMany({ where, take: p.take, skip: p.skip, orderBy: [orderBy, { id: "asc" }], include: { producto: true, bodegaProducto:true } });
      }
      const inconsistencyRows=await tx.inconsistencia.findMany({where:{resuelto:false,codigoBarra:{in:items.map(n=>n.producto.codigoBarra)}},select:{codigoBarra:true}});
      const inconsistencyCount=new Map<string,number>();for(const row of inconsistencyRows)inconsistencyCount.set(row.codigoBarra,(inconsistencyCount.get(row.codigoBarra)??0)+1);
      const globalSummaryBase: Prisma.NegativoWhereInput = {AND:[{bodegaId:scopedId},period],anuladoAt:null,fusionadoEnId:null,productoId:{in:currentProductIds}};
      const summaryBase: Prisma.NegativoWhereInput = {AND:[{bodegaId:scopedId},period],anuladoAt:null,fusionadoEnId:null,productoId:{in:currentProductIds},...(p.bodegaProductoId?{bodegaProductoId:p.bodegaProductoId}:{})};
      const activos = await tx.negativo.count({ where: { ...summaryBase, estado: { notIn: [...closed] } } });
      const aprobados = await tx.negativo.count({ where: { ...summaryBase, estado: "AJUSTE_AUTORIZADO" } });
      const listosCerrar = await tx.negativo.count({ where: { AND:[{bodegaId:scopedId},period],anuladoAt:null,fusionadoEnId:null,...(p.bodegaProductoId?{bodegaProductoId:p.bodegaProductoId}:{}),estado:"AJUSTE_REALIZADO" } });
      const resueltos = await tx.negativo.count({ where: { ...summaryBase, estado: { in: [...closed] } } });
      const sinConteo = await tx.negativo.count({ where: { ...summaryBase,conteoFisico:null,estado:{notIn:[...approvedStates,...closed]} } });
      const productWarehouse = p.bodegaProductoId?{bodegaProductoId:p.bodegaProductoId}:{};
      const visibleCurrent=await tx.negativo.findMany({where:{AND:[where,{estado:{notIn:[...closed]}}]},select:{productoId:true}});
      const units=visibleCurrent.reduce((sum,item)=>sum.add(currentAmounts.get(item.productoId)??0),new Prisma.Decimal(0));
      const allActiveCases=await tx.negativo.findMany({where:{...globalSummaryBase,estado:{notIn:[...closed]}},select:{productoId:true}});
      const allActiveUnits=allActiveCases.reduce((sum,item)=>sum.add(currentAmounts.get(item.productoId)??0),new Prisma.Decimal(0));
      const listosEnFoto=await tx.negativo.count({where:{...summaryBase,estado:"AJUSTE_REALIZADO"}});
      const conConteo=Math.max(0,activos-sinConteo-aprobados-listosEnFoto),actuales=sinConteo+conConteo+aprobados+listosEnFoto;
      const pendientesVerificar = await tx.negativo.count({where:{AND:[{bodegaId:scopedId},period],fusionadoEnId:null,anuladoAt:null,estado:"PENDIENTE_VERIFICAR",...productWarehouse,productoId:{notIn:currentProductIds}}});
      const verificaciones=await verificacionesAjuste(tx,items.filter(n=>n.estado==="AJUSTE_REALIZADO"));
      const workflow=p.cola==="pendientes"?"conteo":p.cola==="gestion"?"gestion":p.cola==="aprobados"?"aprobados":p.cola==="listos"?"listos":p.cola==="desaparecidos"?"desaparecidos":countIds.length&&managementIds.length?"mixto":countIds.length?"conteo":"gestion";
      return { total, skip: p.skip, take: p.take, workflow, resumen: { actuales, pendientesVerificar, activos, resueltos, sinConteo, conConteo, aprobados, listosCerrar, totalCasosActivos:allActiveCases.length, totalUnidadesActivas:allActiveUnits.abs().toFixed(4), grupos: { EN_INVESTIGACION: activos - aprobados - listosEnFoto, AJUSTE_AUTORIZADO: aprobados + listosEnFoto, SOLUCIONADO: resueltos }, unidades: units.abs().toFixed(4) }, ultimaConsulta: latest, corteNegativos:activePhoto?{fechaCorte:activePhoto.fechaCorte,tipoCorte:activePhoto.tipoCorte}:null,fotografiaAnterior:previousPhoto?{fechaCorte:previousPhoto.fechaCorte}:null,
        items: items.map(n => ({ ...n, inconsistenciasActivas:inconsistencyCount.get(n.producto.codigoBarra)??0, verificacion:verificaciones.get(n.id)??null, workflow:p.cola==="pendientes"?"conteo":p.cola==="gestion"?"gestion":p.cola==="aprobados"?"aprobados":p.cola==="listos"?"listos":p.cola==="desaparecidos"?(n.conteoFisico===null?"conteo":"gestion"):workflows.get(n.bodegaId)??"gestion", existenciaActual: currentAmounts.get(n.productoId)?.toFixed(4)??null, existenciaAnterior:previousAmounts.get(n.productoId)?.toFixed(4)??null,comparacionFoto:photoComparison(previousAmounts.get(n.productoId)?.toFixed(4)??null,activePhoto?currentAmounts.get(n.productoId)?.toFixed(4)??null:null,Boolean(previousPhoto),Boolean(activePhoto)) })),
      };
    }, { isolationLevel: "RepeatableRead" });
  }
}
