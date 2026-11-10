// Contrato de GET /api/panel: datos iniciales de cada espacio de trabajo.
// El backend decide qué puede ver el usuario; el frontend solo navega según la respuesta.
import type { UsuarioSesion } from "./auth/model";
import type { Permission } from "./auth/permissions";
import type { EspacioOperativo } from "./auth/espacios";
import type { DashboardData, ErrorCase, Transfer } from "./dashboard-contract";

/** Permisos del usuario: disponibles en algún lugar, nacionales y por bodega. */
export type Capacidades = { available: Permission[]; national: Permission[]; warehouses: Record<string, Permission[]> };

/** vista=inicio: el panel, o a qué espacio debe ir el usuario (administrador nacional o cuenta de tienda). */
export type PanelInicio =
  | { redirigir: "/administracion" | "/tienda" | "/facturador" }
  | { data: DashboardData | null; user: UsuarioSesion; capabilities: Capacidades; espacios: EspacioOperativo[] };

/** vista=tienda: el mismo resultado que GET /api/tienda?accion=inicio (su forma la describe el panel de tienda). */
export type PanelTienda<T = unknown> = { user: UsuarioSesion; initialData: T };

/** vista=administracion */
export type PanelAdministracion = { user: UsuarioSesion; canManage: boolean; canAudit: boolean };

/** vista=facturador: el espacio personal de una cuenta de Facturación (solo sus datos). */
export type PanelFacturador = {
  user: UsuarioSesion;
  perfiles: { id: string; codigo: string; nombre: string }[];
  transfers: Transfer[];
  errorCases: ErrorCase[];
  actualizado: string | null;
};
