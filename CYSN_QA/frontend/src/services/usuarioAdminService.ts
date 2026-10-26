import {
  apiRequest,
  obtenerMensajeError,
} from "./apiClient";

import type {
  RolAdmin,
  SucursalAdminCatalogo,
  UsuarioAdmin,
  UsuarioAdminCreate,
  UsuarioAdminUpdate,
  UsuarioOperacionResponse,
} from "../types/usuarioAdmin";

export async function obtenerRolesAdmin(): Promise<RolAdmin[]> {
  const response = await apiRequest(
    "/api/admin/roles"
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible cargar los roles."
      )
    );
  }

  return response.json() as Promise<RolAdmin[]>;
}

export async function obtenerSucursalesAdmin(): Promise<SucursalAdminCatalogo[]> {
  const response = await apiRequest(
    "/api/admin/sucursales"
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible cargar las sucursales."
      )
    );
  }

  return response.json() as Promise<SucursalAdminCatalogo[]>;
}

interface UsuariosAdminFiltros {
  buscar?: string;
  rol?: string;
  activo?: boolean | null;
}

export async function obtenerUsuariosAdmin(
  filtros: UsuariosAdminFiltros = {}
): Promise<UsuarioAdmin[]> {
  const params = new URLSearchParams();

  if (filtros.buscar?.trim()) {
    params.set("buscar", filtros.buscar.trim());
  }

  if (filtros.rol?.trim()) {
    params.set("rol", filtros.rol.trim());
  }

  if (filtros.activo !== undefined && filtros.activo !== null) {
    params.set("activo", String(filtros.activo));
  }

  const query = params.toString();
  const response = await apiRequest(
    `/api/admin/usuarios${query ? `?${query}` : ""}`
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible cargar los usuarios."
      )
    );
  }

  return response.json() as Promise<UsuarioAdmin[]>;
}

export async function obtenerUsuarioAdmin(
  usuarioId: number
): Promise<UsuarioAdmin> {
  const response = await apiRequest(
    `/api/admin/usuarios/${usuarioId}`
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible cargar el usuario."
      )
    );
  }

  return response.json() as Promise<UsuarioAdmin>;
}

export async function crearUsuarioAdmin(
  datos: UsuarioAdminCreate
): Promise<UsuarioAdmin> {
  const response = await apiRequest(
    "/api/admin/usuarios",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(datos),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible crear el usuario."
      )
    );
  }

  return response.json() as Promise<UsuarioAdmin>;
}

export async function actualizarUsuarioAdmin(
  usuarioId: number,
  datos: UsuarioAdminUpdate
): Promise<UsuarioAdmin> {
  const response = await apiRequest(
    `/api/admin/usuarios/${usuarioId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(datos),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible actualizar el usuario."
      )
    );
  }

  return response.json() as Promise<UsuarioAdmin>;
}

export async function actualizarSucursalesUsuarioAdmin(
  usuarioId: number,
  sucursalIds: number[]
): Promise<UsuarioAdmin> {
  const response = await apiRequest(
    `/api/admin/usuarios/${usuarioId}/sucursales`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sucursal_ids: sucursalIds,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible actualizar las sucursales asignadas."
      )
    );
  }

  return response.json() as Promise<UsuarioAdmin>;
}

export async function resetearPasswordUsuarioAdmin(
  usuarioId: number,
  nuevaPassword: string
): Promise<UsuarioOperacionResponse> {
  const response = await apiRequest(
    `/api/admin/usuarios/${usuarioId}/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nueva_password: nuevaPassword,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No fue posible restablecer la contraseña."
      )
    );
  }

  return response.json() as Promise<UsuarioOperacionResponse>;
}
