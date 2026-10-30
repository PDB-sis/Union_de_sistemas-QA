// Contrato de GET /api/panel: datos iniciales de cada espacio de trabajo.
// El backend decide qué puede ver el usuario; el frontend solo navega según la respuesta.
import type { UsuarioSesion } from "./auth/model";
import type { Permission } from "./auth/permissions";
import type { DashboardData } from "./dashboard-contract";

/** Permisos del usuario: disponibles en algún lugar, nacionales y por bodega. */
export type Capacidades = { available: Permission[]; national: Permission[]; warehouses: Record<string, Permission[]> };

/** vista=inicio: el panel, o a qué espacio debe ir el usuario (administrador nacional o cuenta de tienda). */
export type PanelInicio =
  | { redirigir: "/administracion" | "/tienda" }
  | { data: DashboardData | null; user: UsuarioSesion; capabilities: Capacidades };

/** vista=tienda: el mismo resultado que GET /api/tienda?accion=inicio (su forma la describe el panel de tienda). */
export type PanelTienda<T = unknown> = { user: UsuarioSesion; initialData: T };

/** vista=administracion */
export type PanelAdministracion = { user: UsuarioSesion; canManage: boolean; canAudit: boolean };
