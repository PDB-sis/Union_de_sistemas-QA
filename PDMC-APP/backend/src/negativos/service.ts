import "server-only";
import { Prisma, type PrismaClient } from "../../../generated/prisma/client";
import { countWorkflow } from "../../../shared/workflow/count-routing";
import { Authorization } from "../auth/authorization";
import { NegativosError } from "./validation";

export class NegativosService {
  constructor(private db: PrismaClient, private access = new Authorization(db)) {}

  async detalle(bodegaId: string, id: string, skip: number, take: number) {
    await this.access.warehouse("negativos.leer", bodegaId);
    return this.db.$transaction(async tx => {
      const negativo = await tx.negativo.findFirst({ where: { id, bodegaId, fusionadoEnId: null }, include: { producto: true, bodegaProducto: true } });
      if (!negativo) throw new NegativosError(404, "NO_ENCONTRADO", "Negativo inexistente en esta bodega.");
      const [historial,total,inventario,inconsistencias,canCount,canEdit] = await Promise.all([
        tx.historialNegativo.findMany({ where: { negativoId: id }, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
        tx.historialNegativo.count({ where: { negativoId: id } }),
        tx.inventarioActual.aggregate({ where: { productoId: negativo.productoId }, _sum: { existencia: true } }),
        tx.inconsistencia.findMany({where:{codigoBarra:negativo.producto.codigoBarra,resuelto:false},orderBy:[{fecha:"desc"},{updatedAt:"desc"}],take:10,select:{id:true,transferencia:true,sucursal:true,tipoError:true,cantidadErrada:true,fecha:true}}),
        this.access.canWarehouse("negativos.conteo",bodegaId),
        this.access.canWarehouse("negativos.editar",bodegaId),
      ]);
      const permissionWorkflow=countWorkflow(canCount,canEdit),workflow=negativo.conteoFisico===null?"conteo":permissionWorkflow;
      const current=inventario._sum.existencia;
      return {workflow,negativo,inconsistencias,existenciaActual:current?.isNegative()?current.toFixed(4):null,existenciaAnterior:null,observacionesConsulta:[] as Prisma.JsonValue[],historial:{items:historial,total,skip,take}};
    },{isolationLevel:"RepeatableRead"});
  }
}
