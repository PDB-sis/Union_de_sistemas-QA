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
  id: string; version: number; titulo: string; resumen: string | null; color: ColorProyecto; estado: EstadoProyecto; prioridad: Prioridad;
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

/** Plantillas para empezar un proyecto con una estructura útil (página y tareas sugeridas). */
export const PLANTILLAS = ["blanco", "mejora", "tienda", "reunion"] as const;
export type Plantilla = typeof PLANTILLAS[number];
type DefinicionPlantilla = { nombre: string; descripcion: string; titulo: string; color: ColorProyecto; bloques: Omit<Bloque, "id">[]; tareas: string[] };
export const plantillas: Record<Plantilla, DefinicionPlantilla> = {
  blanco: { nombre: "En blanco", descripcion: "Una página vacía para empezar a escribir.", titulo: "Proyecto sin título", color: "azul", bloques: [{ tipo: "parrafo", texto: "" }], tareas: [] },
  mejora: {
    nombre: "Plan de mejora", descripcion: "Objetivo, situación actual, causas, acciones e indicadores.", titulo: "Plan de mejora", color: "verde",
    bloques: [
      { tipo: "titulo", texto: "Objetivo" }, { tipo: "parrafo", texto: "¿Qué queremos lograr y para cuándo?" },
      { tipo: "titulo", texto: "Situación actual" }, { tipo: "parrafo", texto: "Datos de hoy: negativos, inconsistencias o errores de facturación." },
      { tipo: "titulo", texto: "Causas" }, { tipo: "lista", texto: "" },
      { tipo: "titulo", texto: "Acciones" }, { tipo: "casilla", texto: "", hecho: false },
      { tipo: "titulo", texto: "Indicadores" }, { tipo: "aviso", texto: "¿Cómo sabremos que funcionó?" },
    ],
    tareas: ["Medir la situación actual", "Identificar las causas principales", "Ejecutar las acciones", "Verificar el resultado"],
  },
  tienda: {
    nombre: "Seguimiento de tienda", descripcion: "Visita o seguimiento de una tienda con hallazgos y compromisos.", titulo: "Seguimiento de tienda", color: "cielo",
    bloques: [
      { tipo: "titulo", texto: "Tienda" }, { tipo: "parrafo", texto: "Nombre, código y responsable." },
      { tipo: "subtitulo", texto: "Hallazgos" }, { tipo: "lista", texto: "" },
      { tipo: "subtitulo", texto: "Compromisos" }, { tipo: "casilla", texto: "", hecho: false },
      { tipo: "cita", texto: "Comentarios de la tienda" },
    ],
    tareas: ["Revisar transferencias pendientes de reporte", "Confirmar compromisos con la tienda"],
  },
  reunion: {
    nombre: "Reunión", descripcion: "Asistentes, temas, acuerdos y próximos pasos.", titulo: "Reunión de seguimiento", color: "ambar",
    bloques: [
      { tipo: "subtitulo", texto: "Asistentes" }, { tipo: "lista", texto: "" },
      { tipo: "subtitulo", texto: "Temas" }, { tipo: "numerada", texto: "" },
      { tipo: "subtitulo", texto: "Acuerdos" }, { tipo: "casilla", texto: "", hecho: false },
      { tipo: "separador", texto: "" }, { tipo: "parrafo", texto: "Próxima reunión:" },
    ],
    tareas: [],
  },
};

/** Una tarea asignada a la persona, con su proyecto (vista «Mis tareas»). */
export type MiTarea = { id: string; titulo: string; estado: EstadoTarea; fechaLimite: string | null; proyecto: { id: string; titulo: string; color: ColorProyecto } };
