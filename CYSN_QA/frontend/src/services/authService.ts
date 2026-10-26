import {
  apiRequest,
  obtenerMensajeError,
} from "./apiClient";

import type {
  AuthUser,
  LoginResponse,
  SucursalAsignada,
  UsuarioOperacionResponse,
} from "../types/auth";

export async function iniciarSesion(
  username: string,
  password: string
): Promise<LoginResponse> {
  const response = await apiRequest(
    "/api/auth/login",
    {
      method: "POST",
      auth: false,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo iniciar sesión."
      )
    );
  }

  return response.json();
}


export async function iniciarSesionDesdePDMC(
  assertion: string
): Promise<LoginResponse> {
  const response = await apiRequest(
    "/api/auth/sso/pdmc",
    {
      method: "POST",
      auth: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo validar la sesión de PDMC."
      )
    );
  }

  return response.json();
}
export async function obtenerUsuarioActual(): Promise<AuthUser> {
  const response = await apiRequest(
    "/api/auth/me"
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo recuperar la sesión."
      )
    );
  }

  return response.json();
}

export async function obtenerSucursalesUsuarioActual(): Promise<SucursalAsignada[]> {
  const response = await apiRequest(
    "/api/auth/me/sucursales"
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudieron recuperar las sucursales asignadas."
      )
    );
  }

  return response.json();
}


export async function cambiarPasswordUsuarioActual(
  passwordActual: string,
  nuevaPassword: string
): Promise<UsuarioOperacionResponse> {
  const response = await apiRequest(
    "/api/auth/cambiar-password",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password_actual: passwordActual,
        nueva_password: nuevaPassword,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo cambiar la contraseña."
      )
    );
  }

  return response.json();
}
