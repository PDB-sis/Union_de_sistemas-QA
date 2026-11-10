// Un espacio de trabajo por rol: cada rol entra a su propia dirección, con su propio "Mi día" y
// solo las secciones de su cargo. Ningún espacio ofrece una sección para la que su rol no tenga
// permiso (lo verifica contratos/tests/espacios.test.mjs), así no aparecen secciones vacías o con error.
import type { Rol } from "./model";
import { permissionMatrix, type Permission } from "./permissions";

export type Seccion = "hoy" | "metricas" | "qa" | "transferencias" | "devoluciones" | "incidencias" | "negativos" | "facturacion" | "inventario" | "proyectos" | "auditoria" | "cuenta";
export type EspacioOperativo = "mejora-continua" | "jefe-bodega" | "recepcion" | "rectificacion" | "auditoria";
export type DefinicionEspacio = { rol: Rol; ruta: `/${EspacioOperativo}`; titulo: string; proposito: string; secciones: readonly Seccion[] };

/** Permiso que exige cada sección; "hoy" y "cuenta" son de todos. */
export const permisoDeSeccion: Partial<Record<Seccion, Permission>> = {
  metricas: "metricas.leer", qa: "qa.acceder", transferencias: "transferencias.leer", devoluciones: "devoluciones.leer",
  incidencias: "inconsistencias.leer", negativos: "negativos.leer", facturacion: "facturacion.leer",
  inventario: "inventario.administrar", proyectos: "metricas.leer", auditoria: "auditoria.leer",
};

export const espacios: Record<EspacioOperativo, DefinicionEspacio> = {
  "mejora-continua": { rol: "MEJORA_CONTINUA", ruta: "/mejora-continua", titulo: "Mejora Continua", proposito: "Seguimiento de tiendas, transferencias y calidad de la región.",
    secciones: ["hoy", "metricas", "qa", "transferencias", "devoluciones", "incidencias", "negativos", "facturacion", "inventario", "proyectos", "cuenta"] },
  "jefe-bodega": { rol: "JEFE_BODEGA", ruta: "/jefe-bodega", titulo: "Jefe de bodega", proposito: "Decisiones de negativos, correcciones de inconsistencias y facturación de tu bodega.",
    secciones: ["hoy", "negativos", "incidencias", "facturacion", "cuenta"] },
  recepcion: { rol: "RECEPCION", ruta: "/recepcion", titulo: "Recepción", proposito: "Inconsistencias recibidas, negativos y errores de facturación de tu bodega.",
    secciones: ["hoy", "incidencias", "negativos", "facturacion", "cuenta"] },
  rectificacion: { rol: "RECTIFICACION", ruta: "/rectificacion", titulo: "Rectificación", proposito: "Conteos físicos de negativos e inconsistencias.",
    secciones: ["hoy", "negativos", "incidencias", "cuenta"] },
  auditoria: { rol: "AUDITORIA", ruta: "/auditoria", titulo: "Auditoría", proposito: "Trazabilidad de los cambios y estado de los procesos.",
    secciones: ["hoy", "auditoria", "metricas", "transferencias", "incidencias", "negativos", "facturacion", "cuenta"] },
};

/** Dirección de cada rol; los que no son espacios operativos tienen su propia página. */
export const rutaDeRol: Record<Rol, string> = {
  ADMINISTRADOR: "/administracion", TIENDA: "/tienda", FACTURACION: "/facturador", SINCRONIZACION: "/login",
  MEJORA_CONTINUA: "/mejora-continua", JEFE_BODEGA: "/jefe-bodega", RECEPCION: "/recepcion", RECTIFICACION: "/rectificacion", AUDITORIA: "/auditoria",
};

/** Espacios operativos de una cuenta, en el orden de la definición (una cuenta puede tener varios roles). */
export function espaciosDe(roles: readonly Rol[]): EspacioOperativo[] {
  return (Object.keys(espacios) as EspacioOperativo[]).filter(id => roles.includes(espacios[id].rol));
}

/** Una sección solo aparece si el rol del espacio tiene su permiso. */
export const seccionPermitida = (espacio: EspacioOperativo, seccion: Seccion) => {
  const permiso = permisoDeSeccion[seccion];
  return !permiso || permissionMatrix[espacios[espacio].rol].includes(permiso);
};

export const esEspacioOperativo = (valor: string): valor is EspacioOperativo => valor in espacios;
