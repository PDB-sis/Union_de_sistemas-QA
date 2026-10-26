export interface LoginResponse {
  authenticated: boolean;
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  nombre: string;
  email: string | null;
  rol_id: number;
  rol: string;
}

export interface AuthUser {
  user_id: number;
  username: string;
  nombre: string;
  email: string | null;
  rol_id: number;
  rol: string;
  activo: boolean;
}

export interface SucursalAsignada {
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  identificador_inventario: string | null;
}
export interface UsuarioOperacionResponse {
  actualizado: boolean;
  user_id: number;
  mensaje: string;
}

