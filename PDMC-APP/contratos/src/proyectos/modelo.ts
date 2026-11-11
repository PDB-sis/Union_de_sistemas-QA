// Proyectos compartidos: catálogos y forma de las respuestas de /api/proyectos.

export const BLOQUES = ["titulo", "subtitulo", "parrafo", "lista", "numerada", "casilla", "cita", "aviso", "separador"] as const;
export type TipoBloque = typeof BLOQUES[number];
export type Bloque = { id: string; tipo: TipoBloque; texto: string; hecho?: boolean };
export const bloqueEtiqueta: Record<TipoBloque, string> = {
  titulo: "Título", subtitulo: "Subtítulo", parrafo: "Texto", lista: "Lista con viñetas", numerada: "Lista numerada",
  casilla: "Casilla de tarea", cita: "Cita", aviso: "Aviso destacado", separador: "Separador",
};

export const ESTADOS_PROYECTO = ["IDEA", "EN_CURSO", "EN_PAUSA", "COMPLETADO", "ARCHIVADO"] as const;
export type EstadoProyecto = typeof ESTADOS_PROYECTO[number];
export const estadoProyectoEtiqueta: Record<EstadoProyecto, string> = { IDEA: "Idea", EN_CURSO: "En curso", EN_PAUSA: "En pausa", COMPLETADO: "Completado", ARCHIVADO: "Archivado" };

export const PRIORIDADES = ["BAJA", "MEDIA", "ALTA"] as const;
export type Prioridad = typeof PRIORIDADES[number];
export const prioridadEtiqueta: Record<Prioridad, string> = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta" };

/** Colores de portada: tokens de la paleta de la empresa (no hexadecimales sueltos). */
export const COLORES = ["azul", "cielo", "carmin", "verde", "ambar", "gris"] as const;
export type ColorProyecto = typeof COLORES[number];

export type EstadoTarea = "PENDIENTE" | "EN_CURSO" | "HECHA";
export const estadoTareaEtiqueta: Record<EstadoTarea, string> = { PENDIENTE: "Pendiente", EN_CURSO: "En curso", HECHA: "Hecha" };

export type AccesoProyecto = "PROPIETARIO" | "EDITOR" | "LECTOR";
export type PersonaProyecto = { id: string; nombre: string; rol: string };
export type ProyectoResumen = {
  id: string; titulo: string; resumen: string | null; color: ColorProyecto; estado: EstadoProyecto; prioridad: Prioridad;
  fechaObjetivo: string | null; updatedAt: string; propietarioId: string; propietario: PersonaProyecto; acceso: AccesoProyecto;
  miembros: (PersonaProyecto & { permiso: "EDITOR" | "LECTOR" })[]; tareas: { total: number; hechas: number };
};
export type TareaProyecto = { id: string; titulo: string; estado: EstadoTarea; responsableId: string | null; responsable: PersonaProyecto | null; fechaLimite: string | null; orden: number };
export type ComentarioProyecto = { id: string; texto: string; createdAt: string; autor: PersonaProyecto };
export type ProyectoDetalle = Omit<ProyectoResumen, "tareas" | "fechaObjetivo"> & {
  usuarioId: string; version: number; fechaInicio: string | null; fechaObjetivo: string | null; contenido: Bloque[]; createdAt: string;
  tareas: TareaProyecto[]; comentarios: ComentarioProyecto[];
  actividad: { id: string; createdAt: string; accion: string; motivo: string; usuario: { nombre: string } | null; valorAnterior: unknown; valorNuevo: unknown }[];
};
export type PersonaDirectorio = PersonaProyecto & { ubicacion: string | null };
