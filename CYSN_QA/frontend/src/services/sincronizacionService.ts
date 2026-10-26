import { apiRequest, obtenerMensajeError } from "./apiClient";

export interface EstadoSincronizacionCreacion {
  disponible: boolean;
  ultimo_estado?: string | null;
  ultimo_modo?: string | null;
  ultima_ejecucion_en?: string | null;
  ultimo_exito_en?: string | null;
  ultimo_error?: string | null;
  ejecucion_id?: number | null;
  finalizado_en?: string | null;
  duracion_ms?: number | null;
  total_origen?: number | null;
  total_validos?: number | null;
  descartados?: number | null;
  insertados?: number | null;
  actualizados?: number | null;
  sin_cambios?: number | null;
  inactivados?: number | null;
  codigos_vigentes?: number | null;
}

export async function obtenerEstadoSincronizacionCreacion(): Promise<EstadoSincronizacionCreacion> {
  const response = await apiRequest(
    "/api/sincronizacion/creacion/estado"
  );

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        "No se pudo consultar la sincronización de CREACION."
      )
    );
  }

  return response.json();
}
