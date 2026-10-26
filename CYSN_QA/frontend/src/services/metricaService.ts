import type {
    QAMetricasResumen,
    QAMetricasTiposDiferencia,
    QAMetricasEmpresas,
    QAMetricasSucursales,
} from "../types/qa";


const API_BASE_URL =
    "http://127.0.0.1:8000/api";


// ============================================================
// PROCESAR RESPUESTA
// ============================================================

async function procesarRespuesta<T>(
    response: Response,
    mensajeError: string
): Promise<T> {

if (!response.ok) {

    let detalle = mensajeError;

    try {

    const data = await response.json();

    if (
        typeof data?.detail === "string"
    ) {
        detalle = data.detail;
    }

    } catch {

      // Conservamos el mensaje general.

    }

    throw new Error(
        detalle
        );
    }


    return response.json() as Promise<T>;
}


// ============================================================
// RESUMEN GENERAL
// ============================================================

export async function obtenerMetricasResumen(
    ejecucionId: number
): Promise<QAMetricasResumen> {

    const response = await fetch(
        `${API_BASE_URL}/qa/ejecuciones/${ejecucionId}/metricas/resumen`
    );


    return procesarRespuesta<QAMetricasResumen>(
        response,
        "No se pudo cargar el resumen de métricas."
    );
}


// ============================================================
// MÉTRICAS POR TIPO
// ============================================================

export async function obtenerMetricasTipos(
    ejecucionId: number
): Promise<QAMetricasTiposDiferencia> {

    const response = await fetch(
        `${API_BASE_URL}/qa/ejecuciones/${ejecucionId}/metricas/tipos`
    );


    return procesarRespuesta<QAMetricasTiposDiferencia>(
        response,
        "No se pudieron cargar las métricas por tipo."
    );
}


// ============================================================
// MÉTRICAS POR EMPRESA
// ============================================================

export async function obtenerMetricasEmpresas(
    ejecucionId: number
): Promise<QAMetricasEmpresas> {

    const response = await fetch(
        `${API_BASE_URL}/qa/ejecuciones/${ejecucionId}/metricas/empresas`
    );


    return procesarRespuesta<QAMetricasEmpresas>(
        response,
        "No se pudieron cargar las métricas por empresa."
    );
}


// ============================================================
// MÉTRICAS POR SUCURSAL
// ============================================================

export async function obtenerMetricasSucursales(
    ejecucionId: number
): Promise<QAMetricasSucursales> {

    const response = await fetch(
        `${API_BASE_URL}/qa/ejecuciones/${ejecucionId}/metricas/sucursales`
    );


    return procesarRespuesta<QAMetricasSucursales>(
        response,
        "No se pudieron cargar las métricas por sucursal."
    );
}