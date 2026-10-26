import {
  apiRequest,
  obtenerMensajeError,
} from "./apiClient";

import type {
  InventarioCargaRegistroResponse,
  InventarioCSVValidacionResponse,
  InventarioProcesamientoResponse,
  SucursalRecepcionPortal,
} from "../types/sucursalPortal";

export async function obtenerRecepcionesSucursalActual(): Promise<
  SucursalRecepcionPortal[]
> {
  const response = await apiRequest(
    "/api/auth/me/recepciones"
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo consultar el estado de recepción."
      )
    );
  }

  return response.json();
}

function crearFormularioArchivo(
  archivo: File
): FormData {
  const formData = new FormData();
  formData.append("archivo", archivo);
  return formData;
}

export async function validarInventarioSucursal(
  cicloId: number,
  sucursalId: number,
  archivo: File
): Promise<InventarioCSVValidacionResponse> {
  const response = await apiRequest(
    `/api/ciclos/${cicloId}/sucursales/${sucursalId}/inventarios/validar`,
    {
      method: "POST",
      body: crearFormularioArchivo(archivo),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo validar el inventario."
      )
    );
  }

  return response.json();
}

export async function registrarInventarioSucursal(
  cicloId: number,
  sucursalId: number,
  archivo: File
): Promise<InventarioCargaRegistroResponse> {
  const response = await apiRequest(
    `/api/ciclos/${cicloId}/sucursales/${sucursalId}/inventarios/registrar`,
    {
      method: "POST",
      body: crearFormularioArchivo(archivo),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo registrar la carga del inventario."
      )
    );
  }

  return response.json();
}

export async function procesarInventarioSucursal(
  cicloId: number,
  sucursalId: number,
  cargaId: number,
  archivo: File
): Promise<InventarioProcesamientoResponse> {
  const response = await apiRequest(
    `/api/ciclos/${cicloId}/sucursales/${sucursalId}/inventarios/${cargaId}/procesar`,
    {
      method: "POST",
      body: crearFormularioArchivo(archivo),
    }
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo procesar el inventario."
      )
    );
  }

  return response.json();
}
