export interface UsuarioSucursalResumen {
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  identificador_inventario: string | null;
  sucursal_activa: boolean;
  empresa_activa: boolean;
}

export interface UsuarioAdmin {
  user_id: number;
  username: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  ultimo_login_at: string | null;
  rol_id: number;
  rol: string;
  total_sucursales: number;
  sucursales: UsuarioSucursalResumen[];
  created_at: string;
  updated_at: string;
}

export interface RolAdmin {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface SucursalAdminCatalogo {
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  identificador_inventario: string | null;
  sucursal_activa: boolean;
  empresa_activa: boolean;
}

export interface UsuarioAdminCreate {
  rol: string;
  username: string;
  nombre: string;
  email: string | null;
  password: string;
  activo: boolean;
  sucursal_ids: number[];
}

export interface UsuarioAdminUpdate {
  nombre?: string;
  email?: string | null;
  activo?: boolean;
}

export interface UsuarioOperacionResponse {
  actualizado: boolean;
  user_id: number;
  mensaje: string;
}
