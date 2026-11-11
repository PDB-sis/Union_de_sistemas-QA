import { Authorization } from "../auth/authorization";
import { auditActor } from "../audit-context";
import { z } from "zod";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { estados, gruposEstado, type GrupoEstado } from "@pdmc/contratos/negativos/model";
import { uuid, NegativosError } from "./validation";
import {countWorkflow,type CountWorkflow} from "@pdmc/contratos/workflow/count-routing";
import {currentMonth,monthRange} from "@pdmc/contratos/month";
import {validarMotivoNegativo} from "@pdmc/contratos/negativos/reasons";
import {photoComparison} from "./photo-comparison";
import {sitiosDeBodegas} from "../inventario/sitios";
import {validarCambioNegativo,verificarAjusteNegativo,type VerificacionNegativo} from "@pdmc/contratos/negativos/flujo";

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
export async function verificacionesAjuste(tx: Prisma.TransactionClient, casos: {id:string;productoId:string;bodegaId:string}[]) {
  const result=new Map<string,VerificacionNegativo>();
  if(!casos.length)return result;
  // Cada caso se verifica contra el inventario vigente de SU bodega (fase 2b-2).
  const sitioDe=await sitiosDeBodegas(tx,[...new Set(casos.map(c=>c.bodegaId))]);
  const ajustes=await tx.historialNegativo.findMany({where:{negativoId:{in:casos.map(c=>c.id)},valorNuevo:{path:["estado"],equals:"AJUSTE_REALIZADO"},NOT:{valorAnterior:{path:["estado"],equals:"AJUSTE_REALIZADO"}}},orderBy:{createdAt:"desc"},select:{negativoId:true,createdAt:true}});
  const ajusteAt=new Map<string,Date>();for(const row of ajustes)if(!ajusteAt.has(row.negativoId))ajusteAt.set(row.negativoId,row.createdAt);
  for(const ubicacionId of new Set([...sitioDe.values()])){
    const delSitio=casos.filter(c=>sitioDe.get(c.bodegaId)===ubicacionId);
    const [vigente,sumas]=ubicacionId?await Promise.all([
      // La carga vigente se busca entre las cargas (pocas filas), no ordenando todo InventarioActual.
      tx.consultaInventario.findFirst({where:{ubicacionId,inventarioActual:{some:{}}},orderBy:{fechaImportacion:"desc"},select:{fechaConsulta:true}}),
      tx.inventarioActual.groupBy({by:["productoId"],where:{ubicacionId,productoId:{in:delSitio.map(c=>c.productoId)}},_sum:{existencia:true}}),
    ]):[null,[]];
    const existencia=new Map(sumas.map(row=>[row.productoId,row._sum.existencia?.toFixed(4)??null]));
    for(const caso of delSitio)result.set(caso.id,verificarAjusteNegativo({ajusteAt:ajusteAt.get(caso.id)??null,inventarioAt:vigente?.fechaConsulta??null,existencia:existencia.get(caso.productoId)??null}));
  }
  return result;
}
async function exigirVerificacion(tx: Prisma.TransactionClient, caso:{id:string;productoId:string;bodegaId:string}, etiqueta="") {
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
        // La existencia de sistema es la del inventario vigente de la bodega del caso.
        const ubicacionId=(await sitiosDeBodegas(tx,[before.bodegaId])).get(before.bodegaId);
        systemAtCount=ubicacionId?(await tx.inventarioActual.aggregate({where:{productoId:before.productoId,ubicacionId},_sum:{existencia:true}}))._sum.existencia:null;
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
      // La evidencia de los ajustes a cerrar se calcula una vez para todo el lote, no caso por caso.
      const verificaciones=input.estado==="SOLUCIONADO"?await verificacionesAjuste(tx,await tx.negativo.findMany({where:{id:{in:input.casos.map(c=>c.id)},bodegaId:input.bodegaId,estado:"AJUSTE_REALIZADO"},select:{id:true,productoId:true,bodegaId:true}})):new Map<string,VerificacionNegativo>();
      for (const item of input.casos) {
        const before = await tx.negativo.findFirst({ where: { id: item.id, bodegaId: input.bodegaId, anuladoAt: null, fusionadoEnId:null }, include:{producto:{select:{codigoBarra:true}}} });
        if (!before || before.version !== item.version) throw new NegativosError(409, "VERSION", "La selección cambió. Actualice; no se modificó ningún caso.");
        await this.access.caseFields(before.bodegaId,before,input);
        // Mismas reglas que el expediente individual; ningún caso se modifica si uno falla.
        const etiqueta=`Código ${before.producto.codigoBarra}: `;
        if(input.motivo!==undefined){const motivoInvalido=validarMotivoNegativo(input.motivo,before.documentoRelacionado??"",before.motivo??"");if(motivoInvalido)throw new NegativosError(422,"MOTIVO_INVALIDO",etiqueta+motivoInvalido+" Edítelo individualmente.");}
        const cambio=validarCambioNegativo({antes:{estado:before.estado,conteoFisico:before.conteoFisico?.toFixed(4)??null},despues:{estado:input.estado??before.estado,conteoFisico:before.conteoFisico?.toFixed(4)??null,motivo:input.motivo??before.motivo??"",numeroAjuste:input.numeroAjuste??before.numeroAjuste??"",observaciones:before.observaciones??""}});
        if(cambio)throw new NegativosError(422,"CAMBIO_NO_PERMITIDO",etiqueta+cambio);
        if(input.estado==="SOLUCIONADO"&&before.estado==="AJUSTE_REALIZADO"){const verificacion=verificaciones.get(before.id);if(!verificacion?.puedeCerrar)throw new NegativosError(422,"VERIFICACION_PENDIENTE",etiqueta+(verificacion?.mensaje??"Actualice la selección."));}
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
      // Fase 2b-2: cada caso se compara con la fotografía y el inventario vigente de SU bodega.
      const sitioDe=await sitiosDeBodegas(tx,scopes.map(b=>b.id));
      type Fuente={activePhoto:{fechaCorte:Date;tipoCorte:string}|null;previousPhoto:{fechaCorte:Date}|null;previous:Map<string,Prisma.Decimal>;current:Map<string,Prisma.Decimal>;latest:Prisma.ConsultaInventarioGetPayload<object>|null};
      const vacio:Fuente={activePhoto:null,previousPhoto:null,previous:new Map(),current:new Map(),latest:null},porBodega=new Map<string,Fuente>();
      for(const b of scopes){
        const ubicacionId=sitioDe.get(b.id);
        if(!ubicacionId){porBodega.set(b.id,vacio);continue;}
        const activePhoto=await tx.fotoNegativos.findFirst({where:{ubicacionId,fechaCorte:selectedPeriod},orderBy:[{fechaCorte:"desc"},{createdAt:"desc"}],include:{items:true,consulta:true}});
        const previousPhoto=activePhoto?await tx.fotoNegativos.findFirst({where:{ubicacionId,fechaCorte:{lt:activePhoto.fechaCorte}},orderBy:{fechaCorte:"desc"},include:{items:true}}):null;
        const inventory=activePhoto?activePhoto.items.map(row=>({productoId:row.productoId,_sum:{existencia:row.existencia}})):isCurrentPeriod?await tx.inventarioActual.groupBy({by:["productoId"],where:{ubicacionId},_sum:{existencia:true}}):[];
        const latest=activePhoto?.consulta??await tx.consultaInventario.findFirst({where:{ubicacionId,fechaConsulta:selectedPeriod},orderBy:[{fechaConsulta:"desc"},{fechaImportacion:"desc"}]});
        porBodega.set(b.id,{activePhoto,previousPhoto,latest,previous:new Map(previousPhoto?.items.map(row=>[row.productoId,row.existencia])??[]),current:new Map(inventory.filter(row=>row._sum.existencia?.isNegative()).map(row=>[row.productoId,row._sum.existencia!]))});
      }
      const deBodega=(bodegaId:string)=>porBodega.get(bodegaId)??vacio;
      const amountOf=(n:{bodegaId:string;productoId:string})=>deBodega(n.bodegaId).current.get(n.productoId);
      // Casos de cada bodega cuyos productos cumplen una condición (por ejemplo, negativos en su fotografía).
      const nada:Prisma.NegativoWhereInput={id:{in:[]}};
      const porProductos=(ids:(bodegaId:string)=>string[]):Prisma.NegativoWhereInput=>{const ramas=scopes.map(b=>({bodegaId:b.id,productoId:{in:ids(b.id)}})).filter(rama=>rama.productoId.in.length);return ramas.length?{OR:ramas}:nada;};
      const negativosActuales=porProductos(id=>[...deBodega(id).current.keys()]);
      const comparisonLabels={nuevos:"Nuevo",aumentaron:"Empeoró",disminuyeron:"Mejoró",iguales:"Sin cambio",desaparecieron:"Desapareció"};
      const comparacion=p.comparacion==="todos"?null:porProductos(id=>{const d=deBodega(id);return [...new Set([...d.current.keys(),...d.previous.keys()])].filter(producto=>photoComparison(d.previous.get(producto)?.toFixed(4)??null,d.current.get(producto)?.toFixed(4)??null,Boolean(d.previousPhoto),Boolean(d.activePhoto)).estado===comparisonLabels[p.comparacion as keyof typeof comparisonLabels]);});
      // Encabezado de la lista: la bodega con la fotografía más reciente.
      const {activePhoto,previousPhoto,latest}=[...porBodega.values()].sort((a,b)=>(b.activePhoto?.fechaCorte.getTime()??0)-(a.activePhoto?.fechaCorte.getTime()??0))[0]??vacio;
      const flow=p.flujo==="trabajo"?workflowWhere:{};
      const effectiveView=p.cola==="desaparecidos"?"pendientes_verificar":p.vista;
      const period=effectiveView==="actual"?{}:{ultimaDeteccion:monthRange(p.mes)};
      const base: Prisma.NegativoWhereInput = { AND:[{bodegaId:scopedId},flow,period,...(comparacion?[comparacion]:[]),
        ...(effectiveView==="actual" && p.filtro!=="anulados" && p.cola!=="listos" ? [negativosActuales] :
          effectiveView==="pendientes_verificar" ? [{NOT:negativosActuales},{estado:"PENDIENTE_VERIFICAR" as const}] : [])], anuladoAt: null, fusionadoEnId:null,
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
        all.sort((a,b)=>{const av=amountOf(a),bv=amountOf(b);if(!av&&!bv)return a.id.localeCompare(b.id);if(!av)return 1;if(!bv)return -1;const order=av.comparedTo(bv);return p.orden==="cantidad_desc"?order:-order;});
        items=all.slice(p.skip,p.skip+p.take);
      } else {
        const orderBy: Prisma.NegativoOrderByWithRelationInput = p.orden.startsWith("codigo_")
          ? { producto: { codigoBarra: p.orden === "codigo_asc" ? "asc" : "desc" } }
          : { ultimaDeteccion: p.orden === "fecha_asc" ? "asc" : "desc" };
        items = await tx.negativo.findMany({ where, take: p.take, skip: p.skip, orderBy: [orderBy, { id: "asc" }], include: { producto: true, bodegaProducto:true } });
      }
      const inconsistencyRows=await tx.inconsistencia.findMany({where:{resuelto:false,codigoBarra:{in:items.map(n=>n.producto.codigoBarra)}},select:{codigoBarra:true}});
      const inconsistencyCount=new Map<string,number>();for(const row of inconsistencyRows)inconsistencyCount.set(row.codigoBarra,(inconsistencyCount.get(row.codigoBarra)??0)+1);
      const globalSummaryBase: Prisma.NegativoWhereInput = {AND:[{bodegaId:scopedId},period,negativosActuales],anuladoAt:null,fusionadoEnId:null};
      const summaryBase: Prisma.NegativoWhereInput = {AND:[{bodegaId:scopedId},period,negativosActuales],anuladoAt:null,fusionadoEnId:null,...(p.bodegaProductoId?{bodegaProductoId:p.bodegaProductoId}:{})};
      const activos = await tx.negativo.count({ where: { ...summaryBase, estado: { notIn: [...closed] } } });
      const aprobados = await tx.negativo.count({ where: { ...summaryBase, estado: "AJUSTE_AUTORIZADO" } });
      const listosCerrar = await tx.negativo.count({ where: { AND:[{bodegaId:scopedId},period],anuladoAt:null,fusionadoEnId:null,...(p.bodegaProductoId?{bodegaProductoId:p.bodegaProductoId}:{}),estado:"AJUSTE_REALIZADO" } });
      const resueltos = await tx.negativo.count({ where: { ...summaryBase, estado: { in: [...closed] } } });
      const sinConteo = await tx.negativo.count({ where: { ...summaryBase,conteoFisico:null,estado:{notIn:[...approvedStates,...closed]} } });
      const productWarehouse = p.bodegaProductoId?{bodegaProductoId:p.bodegaProductoId}:{};
      const visibleCurrent=await tx.negativo.findMany({where:{AND:[where,{estado:{notIn:[...closed]}}]},select:{productoId:true,bodegaId:true}});
      const units=visibleCurrent.reduce((sum,item)=>sum.add(amountOf(item)??0),new Prisma.Decimal(0));
      const allActiveCases=await tx.negativo.findMany({where:{...globalSummaryBase,estado:{notIn:[...closed]}},select:{productoId:true,bodegaId:true}});
      const allActiveUnits=allActiveCases.reduce((sum,item)=>sum.add(amountOf(item)??0),new Prisma.Decimal(0));
      const listosEnFoto=await tx.negativo.count({where:{...summaryBase,estado:"AJUSTE_REALIZADO"}});
      const conConteo=Math.max(0,activos-sinConteo-aprobados-listosEnFoto),actuales=sinConteo+conConteo+aprobados+listosEnFoto;
      const pendientesVerificar = await tx.negativo.count({where:{AND:[{bodegaId:scopedId},period,{NOT:negativosActuales}],fusionadoEnId:null,anuladoAt:null,estado:"PENDIENTE_VERIFICAR",...productWarehouse}});
      const verificaciones=await verificacionesAjuste(tx,items.filter(n=>n.estado==="AJUSTE_REALIZADO"));
      const workflow=p.cola==="pendientes"?"conteo":p.cola==="gestion"?"gestion":p.cola==="aprobados"?"aprobados":p.cola==="listos"?"listos":p.cola==="desaparecidos"?"desaparecidos":countIds.length&&managementIds.length?"mixto":countIds.length?"conteo":"gestion";
      return { total, skip: p.skip, take: p.take, workflow, resumen: { actuales, pendientesVerificar, activos, resueltos, sinConteo, conConteo, aprobados, listosCerrar, totalCasosActivos:allActiveCases.length, totalUnidadesActivas:allActiveUnits.abs().toFixed(4), grupos: { EN_INVESTIGACION: activos - aprobados - listosEnFoto, AJUSTE_AUTORIZADO: aprobados + listosEnFoto, SOLUCIONADO: resueltos }, unidades: units.abs().toFixed(4) }, ultimaConsulta: latest, corteNegativos:activePhoto?{fechaCorte:activePhoto.fechaCorte,tipoCorte:activePhoto.tipoCorte}:null,fotografiaAnterior:previousPhoto?{fechaCorte:previousPhoto.fechaCorte}:null,
        items: items.map(n => ({ ...n, inconsistenciasActivas:inconsistencyCount.get(n.producto.codigoBarra)??0, verificacion:verificaciones.get(n.id)??null, workflow:p.cola==="pendientes"?"conteo":p.cola==="gestion"?"gestion":p.cola==="aprobados"?"aprobados":p.cola==="listos"?"listos":p.cola==="desaparecidos"?(n.conteoFisico===null?"conteo":"gestion"):workflows.get(n.bodegaId)??"gestion", existenciaActual: amountOf(n)?.toFixed(4)??null, existenciaAnterior:deBodega(n.bodegaId).previous.get(n.productoId)?.toFixed(4)??null,comparacionFoto:photoComparison(deBodega(n.bodegaId).previous.get(n.productoId)?.toFixed(4)??null,deBodega(n.bodegaId).activePhoto?amountOf(n)?.toFixed(4)??null:null,Boolean(deBodega(n.bodegaId).previousPhoto),Boolean(deBodega(n.bodegaId).activePhoto)) })),
      };
    }, { isolationLevel: "RepeatableRead" });
  }
}
