import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { Authorization } from "../auth/authorization";
import { NegativosError, uuid } from "../negativos/validation";
import { BLOQUES, COLORES, ESTADOS_PROYECTO, PRIORIDADES, type Bloque } from "@pdmc/contratos/proyectos/modelo";

// Proyectos compartidos ("mini Notion"): cada proyecto lo ven su propietario y sus miembros.
// Propietario y editores cambian la página, las tareas y los miembros; los lectores solo ven y comentan.
// Quien no es miembro recibe "no encontrado", sin revelar que el proyecto existe.

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const texto = (max: number) => z.string().trim().max(max);
const bloque = z.object({ id: z.string().min(1).max(40), tipo: z.enum(BLOQUES), texto: z.string().max(4000).default(""), hecho: z.boolean().optional() }).strict();
const crear = z.object({ titulo: texto(160).min(1), resumen: texto(500).optional() }).strict();
const editar = z.object({
  version: z.number().int().min(1), titulo: texto(160).min(1).optional(), resumen: texto(500).nullable().optional(),
  color: z.enum(COLORES).optional(), estado: z.enum(ESTADOS_PROYECTO).optional(), prioridad: z.enum(PRIORIDADES).optional(),
  fechaInicio: fecha, fechaObjetivo: fecha, contenido: z.array(bloque).max(400).optional(),
}).strict();
const miembro = z.object({ usuarioId: uuid, permiso: z.enum(["EDITOR", "LECTOR"]).default("EDITOR") }).strict();
const tareaNueva = z.object({ titulo: texto(300).min(1), responsableId: uuid.nullable().optional(), fechaLimite: fecha }).strict();
const tareaCambio = z.object({ titulo: texto(300).min(1).optional(), estado: z.enum(["PENDIENTE", "EN_CURSO", "HECHA"]).optional(), responsableId: uuid.nullable().optional(), fechaLimite: fecha, orden: z.number().int().min(0).max(100_000).optional() }).strict();
const comentario = z.object({ texto: texto(4000).min(1) }).strict();
const importar = z.object({ proyectos: z.array(z.object({ name: texto(160).min(1), next: texto(500).optional().default(""), status: z.string().max(40).optional(), progress: z.number().min(0).max(100).optional() }).passthrough()).max(200) }).strict();

const diaUtc = (valor: string | null | undefined) => valor ? new Date(`${valor}T00:00:00.000Z`) : valor;
const persona = { select: { id: true, nombre: true, rol: true } } as const;
type Acceso = "PROPIETARIO" | "EDITOR" | "LECTOR";

export class ProjectService {
  constructor(private db: PrismaClient, private access: Authorization) {}

  private async usuario() {
    await this.access.permitted("proyectos.usar");
    return this.access.userId!;
  }

  /** El proyecto y el papel del usuario en él; 404 si no es miembro. */
  private async proyecto(id: string, necesita: "ver" | "editar" | "propietario" = "ver") {
    const usuarioId = await this.usuario();
    const proyecto = await this.db.proyecto.findUnique({ where: { id: uuid.parse(id) }, include: { miembros: { where: { usuarioId } } } });
    const acceso: Acceso | null = !proyecto ? null : proyecto.propietarioId === usuarioId ? "PROPIETARIO" : proyecto.miembros[0]?.permiso ?? null;
    if (!proyecto || !acceso) throw new NegativosError(404, "PROYECTO", "El proyecto no existe o no está compartido contigo.");
    if (necesita === "editar" && acceso === "LECTOR") throw new NegativosError(403, "SOLO_LECTURA", "Tienes acceso de solo lectura a este proyecto.");
    if (necesita === "propietario" && acceso !== "PROPIETARIO") throw new NegativosError(403, "PROPIETARIO", "Solo el propietario puede hacer esto.");
    return { proyecto, acceso, usuarioId };
  }

  private auditar(tx: Prisma.TransactionClient | PrismaClient, entidadId: string, accion: string, motivo: string, antes?: unknown, despues?: unknown) {
    return tx.auditoria.create({ data: { usuarioId: this.access.userId, entidad: "Proyecto", entidadId, accion, motivo: motivo.slice(0, 500), origen: "WEB proyectos", valorAnterior: antes as Prisma.InputJsonValue ?? undefined, valorNuevo: despues as Prisma.InputJsonValue ?? undefined } });
  }

  /** Proyectos propios y compartidos, con su avance. */
  async list() {
    const usuarioId = await this.usuario();
    const filas = await this.db.proyecto.findMany({
      where: { OR: [{ propietarioId: usuarioId }, { miembros: { some: { usuarioId } } }] },
      select: { id: true, titulo: true, resumen: true, color: true, estado: true, prioridad: true, fechaObjetivo: true, updatedAt: true, propietarioId: true, propietario: persona, miembros: { select: { permiso: true, usuario: persona } }, tareas: { select: { estado: true } } },
      orderBy: [{ updatedAt: "desc" }], take: 500,
    });
    return filas.map(({ tareas, miembros, ...fila }) => ({
      ...fila, fechaObjetivo: fila.fechaObjetivo?.toISOString().slice(0, 10) ?? null,
      acceso: (fila.propietarioId === usuarioId ? "PROPIETARIO" : miembros.find(m => m.usuario.id === usuarioId)?.permiso ?? "LECTOR") as Acceso,
      miembros: miembros.map(m => ({ ...m.usuario, permiso: m.permiso })),
      tareas: { total: tareas.length, hechas: tareas.filter(t => t.estado === "HECHA").length },
    }));
  }

  async get(id: string) {
    const { acceso, usuarioId } = await this.proyecto(id);
    const proyecto = await this.db.proyecto.findUniqueOrThrow({ where: { id }, include: {
      propietario: persona, miembros: { include: { usuario: persona }, orderBy: { createdAt: "asc" } },
      tareas: { include: { responsable: persona }, orderBy: [{ orden: "asc" }, { createdAt: "asc" }] },
      comentarios: { include: { autor: persona }, orderBy: { createdAt: "desc" }, take: 100 },
    } });
    const actividad = await this.db.auditoria.findMany({ where: { entidad: "Proyecto", entidadId: id }, include: { usuario: { select: { nombre: true } } }, orderBy: { createdAt: "desc" }, take: 40 });
    return {
      ...proyecto, acceso, usuarioId,
      fechaInicio: proyecto.fechaInicio?.toISOString().slice(0, 10) ?? null, fechaObjetivo: proyecto.fechaObjetivo?.toISOString().slice(0, 10) ?? null,
      contenido: proyecto.contenido as Bloque[],
      miembros: proyecto.miembros.map(m => ({ ...m.usuario, permiso: m.permiso })),
      tareas: proyecto.tareas.map(t => ({ ...t, fechaLimite: t.fechaLimite?.toISOString().slice(0, 10) ?? null })),
      actividad,
    };
  }

  async create(raw: unknown) {
    const usuarioId = await this.usuario(), input = crear.parse(raw);
    const contenido: Bloque[] = [{ id: "inicio", tipo: "parrafo", texto: "" }];
    return this.db.$transaction(async tx => {
      const proyecto = await tx.proyecto.create({ data: { titulo: input.titulo, resumen: input.resumen || null, propietarioId: usuarioId, contenido } });
      await this.auditar(tx, proyecto.id, "CREAR_PROYECTO", `Proyecto «${proyecto.titulo}» creado`, undefined, { titulo: proyecto.titulo });
      return { id: proyecto.id };
    });
  }

  /** Cambios con control de versión: si otra persona guardó antes, no se pisa su trabajo. */
  async update(id: string, raw: unknown) {
    const { proyecto } = await this.proyecto(id, "editar"), input = editar.parse(raw);
    const { version, contenido, fechaInicio, fechaObjetivo, ...campos } = input;
    const data: Prisma.ProyectoUpdateManyMutationInput = { ...campos, version: { increment: 1 },
      ...(contenido ? { contenido: contenido as Prisma.InputJsonValue } : {}),
      ...(fechaInicio !== undefined ? { fechaInicio: diaUtc(fechaInicio) } : {}), ...(fechaObjetivo !== undefined ? { fechaObjetivo: diaUtc(fechaObjetivo) } : {}) };
    if (contenido && JSON.stringify(contenido).length > 300_000) throw new NegativosError(413, "TAMANO", "La página es demasiado grande. Divídela en otro proyecto.");
    return this.db.$transaction(async tx => {
      const cambio = await tx.proyecto.updateMany({ where: { id, version }, data });
      if (!cambio.count) throw new NegativosError(409, "CONFLICTO", "Otra persona guardó cambios en este proyecto. Recarga para ver la última versión.");
      const antes: Record<string, unknown> = {}, despues: Record<string, unknown> = {};
      for (const [clave, valor] of Object.entries({ ...campos, ...(fechaInicio !== undefined ? { fechaInicio } : {}), ...(fechaObjetivo !== undefined ? { fechaObjetivo } : {}) })) {
        const previo = (proyecto as Record<string, unknown>)[clave], comparable = previo instanceof Date ? previo.toISOString().slice(0, 10) : previo;
        if (JSON.stringify(comparable ?? null) !== JSON.stringify(valor ?? null)) { antes[clave] = comparable ?? null; despues[clave] = valor ?? null; }
      }
      // La página se edita seguido: solo se registra una vez cada 10 minutos por persona.
      const reciente = contenido && !Object.keys(despues).length ? await tx.auditoria.findFirst({ where: { entidad: "Proyecto", entidadId: id, accion: "EDITAR_PAGINA_PROYECTO", usuarioId: this.access.userId, createdAt: { gte: new Date(Date.now() - 600_000) } }, select: { id: true } }) : null;
      if (Object.keys(despues).length) await this.auditar(tx, id, input.estado === "ARCHIVADO" ? "ARCHIVAR_PROYECTO" : "EDITAR_PROYECTO", "Datos del proyecto actualizados", antes, despues);
      else if (contenido && !reciente) await this.auditar(tx, id, "EDITAR_PAGINA_PROYECTO", `Página editada (${contenido.length} bloques)`);
      return { version: version + 1 };
    });
  }

  async addMember(id: string, raw: unknown) {
    const { proyecto } = await this.proyecto(id, "editar"), input = miembro.parse(raw);
    if (input.usuarioId === proyecto.propietarioId) throw new NegativosError(422, "PROPIETARIO", "Esa persona ya es la propietaria del proyecto.");
    const usuario = await this.db.usuario.findFirst({ where: { id: input.usuarioId, activo: true, estado: "ACTIVO", rol: { not: "SINCRONIZACION" } }, select: { nombre: true } });
    if (!usuario) throw new NegativosError(422, "USUARIO", "La persona no existe o su cuenta no está activa.");
    return this.db.$transaction(async tx => {
      await tx.proyectoMiembro.upsert({ where: { proyectoId_usuarioId: { proyectoId: id, usuarioId: input.usuarioId } }, create: { proyectoId: id, usuarioId: input.usuarioId, permiso: input.permiso }, update: { permiso: input.permiso } });
      await this.auditar(tx, id, "COMPARTIR_PROYECTO", `Compartido con ${usuario.nombre} (${input.permiso === "EDITOR" ? "puede editar" : "solo lectura"})`, undefined, { persona: usuario.nombre, permiso: input.permiso });
      return { ok: true };
    });
  }

  async removeMember(id: string, usuarioId: string) {
    const actual = await this.usuario();
    // Cualquiera puede salir de un proyecto compartido; quitar a otros exige poder editar.
    const { proyecto } = await this.proyecto(id, usuarioId === actual ? "ver" : "editar");
    const quitado = await this.db.usuario.findUnique({ where: { id: uuid.parse(usuarioId) }, select: { nombre: true } });
    if (usuarioId === proyecto.propietarioId) throw new NegativosError(422, "PROPIETARIO", "El propietario no se puede quitar del proyecto.");
    return this.db.$transaction(async tx => {
      await tx.proyectoMiembro.deleteMany({ where: { proyectoId: id, usuarioId } });
      await this.auditar(tx, id, "QUITAR_MIEMBRO_PROYECTO", `${quitado?.nombre ?? "Una persona"} ya no participa en el proyecto`);
      return { ok: true };
    });
  }

  async addTask(id: string, raw: unknown) {
    await this.proyecto(id, "editar");
    const input = tareaNueva.parse(raw);
    if (input.responsableId) await this.validarResponsable(id, input.responsableId);
    const orden = (await this.db.proyectoTarea.aggregate({ where: { proyectoId: id }, _max: { orden: true } }))._max.orden ?? -1;
    return this.db.$transaction(async tx => {
      const tarea = await tx.proyectoTarea.create({ data: { proyectoId: id, titulo: input.titulo, responsableId: input.responsableId ?? null, fechaLimite: diaUtc(input.fechaLimite) ?? null, orden: orden + 1 } });
      await tx.proyecto.update({ where: { id }, data: { updatedAt: new Date() } });
      await this.auditar(tx, id, "CREAR_TAREA_PROYECTO", `Tarea «${tarea.titulo}» agregada`);
      return { id: tarea.id };
    });
  }

  async updateTask(id: string, tareaId: string, raw: unknown) {
    await this.proyecto(id, "editar");
    const input = tareaCambio.parse(raw), tarea = await this.db.proyectoTarea.findFirst({ where: { id: uuid.parse(tareaId), proyectoId: id } });
    if (!tarea) throw new NegativosError(404, "TAREA", "La tarea no existe.");
    if (input.responsableId) await this.validarResponsable(id, input.responsableId);
    const { fechaLimite, ...resto } = input;
    return this.db.$transaction(async tx => {
      await tx.proyectoTarea.update({ where: { id: tarea.id }, data: { ...resto, ...(fechaLimite !== undefined ? { fechaLimite: diaUtc(fechaLimite) } : {}) } });
      await tx.proyecto.update({ where: { id }, data: { updatedAt: new Date() } });
      if (input.estado && input.estado !== tarea.estado) await this.auditar(tx, id, "ACTUALIZAR_TAREA_PROYECTO", `Tarea «${tarea.titulo}»`, { estado: tarea.estado }, { estado: input.estado });
      return { ok: true };
    });
  }

  async deleteTask(id: string, tareaId: string) {
    await this.proyecto(id, "editar");
    const tarea = await this.db.proyectoTarea.findFirst({ where: { id: uuid.parse(tareaId), proyectoId: id } });
    if (!tarea) throw new NegativosError(404, "TAREA", "La tarea no existe.");
    return this.db.$transaction(async tx => {
      await tx.proyectoTarea.delete({ where: { id: tarea.id } });
      await this.auditar(tx, id, "ELIMINAR_TAREA_PROYECTO", `Tarea «${tarea.titulo}» eliminada`);
      return { ok: true };
    });
  }

  /** Comentar: cualquier miembro, también los de solo lectura. */
  async comment(id: string, raw: unknown) {
    const { usuarioId } = await this.proyecto(id), input = comentario.parse(raw);
    return this.db.$transaction(async tx => {
      const nuevo = await tx.proyectoComentario.create({ data: { proyectoId: id, autorId: usuarioId, texto: input.texto } });
      await tx.proyecto.update({ where: { id }, data: { updatedAt: new Date() } });
      await this.auditar(tx, id, "COMENTAR_PROYECTO", input.texto.slice(0, 200));
      return { id: nuevo.id };
    });
  }

  private async validarResponsable(id: string, responsableId: string) {
    const proyecto = await this.db.proyecto.findUniqueOrThrow({ where: { id }, select: { propietarioId: true, miembros: { select: { usuarioId: true } } } });
    if (responsableId !== proyecto.propietarioId && !proyecto.miembros.some(m => m.usuarioId === responsableId)) throw new NegativosError(422, "RESPONSABLE", "El responsable debe ser alguien con acceso al proyecto. Compártelo primero.");
  }

  /** Personas con quienes se puede compartir: cuentas activas (no la de sincronización). */
  async people(raw: unknown) {
    const usuarioId = await this.usuario(), q = z.object({ q: texto(80).default("") }).parse(raw).q;
    return this.db.usuario.findMany({
      where: { id: { not: usuarioId }, activo: true, estado: "ACTIVO", rol: { not: "SINCRONIZACION" }, ...(q ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
      select: { id: true, nombre: true, rol: true, asignaciones: { select: { ubicacion: { select: { nombre: true } } }, take: 1 } }, orderBy: { nombre: "asc" }, take: 20,
    }).then(rows => rows.map(({ asignaciones, ...row }) => ({ ...row, ubicacion: asignaciones[0]?.ubicacion?.nombre ?? null })));
  }

  /** Trae los proyectos que el panel anterior guardaba solo en este navegador. */
  async importLocal(raw: unknown) {
    const usuarioId = await this.usuario(), input = importar.parse(raw);
    const estado = (valor?: string) => valor === "Completado" ? "COMPLETADO" as const : valor === "En curso" ? "EN_CURSO" as const : "IDEA" as const;
    return this.db.$transaction(async tx => {
      for (const item of input.proyectos) {
        const proyecto = await tx.proyecto.create({ data: { titulo: item.name, resumen: item.next || null, estado: estado(item.status), propietarioId: usuarioId, contenido: [{ id: "inicio", tipo: "parrafo", texto: item.next ? `Siguiente paso: ${item.next}` : "" }] } });
        await this.auditar(tx, proyecto.id, "CREAR_PROYECTO", `Proyecto «${proyecto.titulo}» traído del navegador`);
      }
      return { importados: input.proyectos.length };
    });
  }
}
