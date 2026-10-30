import type { Rol } from "./model";

export const permissions = ["panel.leer", "metricas.leer", "tienda.panel", "tienda.transferencias.leer", "inconsistencias.reportar", "inconsistencias.leer", "inconsistencias.conteo", "inconsistencias.editar", "negativos.leer", "negativos.conteo", "negativos.editar", "negativos.estado",
  "negativos.aprobar", "negativos.ajustar", "negativos.anular", "inventario.administrar",
  "transferencias.leer", "transferencias.importar", "devoluciones.leer", "devoluciones.importar", "facturacion.leer", "facturacion.observar", "productos.problemas.leer",
  "ubicaciones.administrar", "accesos.administrar", "usuarios.administrar", "auditoria.leer"] as const;
export type Permission = typeof permissions[number];
const read = ["negativos.leer"] as const;
const work = [...read, "negativos.editar", "negativos.estado", "inconsistencias.leer", "inconsistencias.editar"] as const;
export const permissionMatrix: Record<Rol, readonly Permission[]> = {
  ADMINISTRADOR: permissions,
  MEJORA_CONTINUA: [...work, "panel.leer", "metricas.leer", "negativos.aprobar", "negativos.ajustar", "negativos.anular", "inventario.administrar", "transferencias.leer", "transferencias.importar", "devoluciones.leer", "devoluciones.importar", "facturacion.leer", "facturacion.observar", "productos.problemas.leer"],
  TIENDA: [...work, "tienda.panel", "tienda.transferencias.leer", "inconsistencias.reportar"],
  JEFE_BODEGA: [...work, "panel.leer", "negativos.aprobar", "facturacion.leer", "productos.problemas.leer"],
  RECTIFICACION: [...read, "negativos.conteo", "inconsistencias.leer", "inconsistencias.conteo"],
  RECEPCION: [...read, "panel.leer", "inconsistencias.leer", "facturacion.leer"],
  AUDITORIA: [...read, "panel.leer", "metricas.leer", "inconsistencias.leer", "transferencias.leer", "facturacion.leer", "productos.problemas.leer", "auditoria.leer"],
  FACTURACION: ["panel.leer", "facturacion.leer"],
};
export type Grant = { rol: Rol; ubicacionId: string | null; ubicacion: { tipo: "REGION" | "BODEGA" | "TIENDA" } | null };
export type Resource = { id: string; regionId: string | null };
/**
 * Regla: no hay cuentas operativas de alcance nacional. Cada rol trabaja sobre su región,
 * bodega o tienda, porque cada una tiene su propia consulta, inventario y datos. Solo el
 * Administrador (gestión del sistema, no operación) va sin ubicación. Una asignación
 * operativa sin ubicación no es válida y no concede nada.
 */
export const asignacionValida = (g: Pick<Grant, "rol" | "ubicacionId">) => g.ubicacionId !== null || g.rol === "ADMINISTRADOR";
export function allows(grants: readonly Grant[], permission: Permission, resource?: Resource) {
  return grants.some(g => asignacionValida(g) && permissionMatrix[g.rol]?.includes(permission) &&
    (g.ubicacionId === null || Boolean(resource && (g.ubicacionId === resource.id ||
      (g.ubicacion?.tipo === "REGION" && g.ubicacionId === resource.regionId)))));
}
export function hasPermission(grants: readonly Grant[], permission: Permission) {
  return grants.some(g => asignacionValida(g) && permissionMatrix[g.rol]?.includes(permission));
}

export function allowsGeneralNegatives(grants: readonly Grant[], permission: Permission) {
  return permission.startsWith("negativos.") && grants.some(g =>
    g.rol === "MEJORA_CONTINUA" && asignacionValida(g) && permissionMatrix.MEJORA_CONTINUA.includes(permission)
  );
}
