import type {

    QAFiltrosDiferencias,
    QAFiltrosConsultaDiferencias,
    QAPaginaDiferencias,
    QADiferenciaEstadoResponse,
    QADiferenciaEstadoUpdate,
    QACorreccion,
    QAFiltrosHistorialCorrecciones,
    QAFiltrosConsultaHistorial,
    QAPaginaHistorialCorrecciones,

} from "../types/qa";

const API_URL =
    import.meta.env.VITE_API_URL;


// ============================================================
// OBTENER FILTROS DEL MÓDULO DIFERENCIAS
// ============================================================

export async function obtenerFiltrosDiferencias(
    ejecucionId: number,
    empresa?: string
): Promise<QAFiltrosDiferencias> {

    const parametros =
    new URLSearchParams();


if (
    empresa
    &&
    empresa.trim()
) {

    parametros.append(
        "empresa",
        empresa.trim()
    );

}


const query =
    parametros.toString();


const url =
    query
        ? `${API_URL}/api/qa/ejecuciones/${ejecucionId}/diferencias/filtros?${query}`
        : `${API_URL}/api/qa/ejecuciones/${ejecucionId}/diferencias/filtros`;


const response =
    await fetch(
        url
    );


    if (!response.ok) {

    const error =
        await response.json();


    throw new Error(
        error.detail
        ??
        "No se pudieron obtener los filtros de diferencias."
    );

}


    return response.json();
}


// ============================================================
// OBTENER DIFERENCIAS PAGINADAS
// ============================================================

export async function obtenerDiferenciasQA(
    ejecucionId: number,
    pagina: number,
    tamanoPagina: number,
    filtros?: QAFiltrosConsultaDiferencias
): Promise<QAPaginaDiferencias> {

const parametros =
    new URLSearchParams({
    pagina: String(
        pagina
    ),

    tamano_pagina: String(
        tamanoPagina
    ),
    });


  // ==========================================================
  // TIPO DE DIFERENCIA
  // ==========================================================

    if (
        filtros?.tipo_diferencia
    ) {

    parametros.append(
        "tipo_diferencia",
        filtros.tipo_diferencia
    );

    }


  // ==========================================================
  // ESTADO DE CORRECCIÓN
  // ==========================================================

    if (
        filtros?.estado_correccion
    ) {

    parametros.append(
        "estado_correccion",
        filtros.estado_correccion
    );

    }


    // ==========================================================
// CÓDIGO DE BARRA
// ==========================================================

if (
    filtros?.codigo_barra
) {

parametros.append(
    "codigo_barra",
    filtros.codigo_barra
);

}


// ==========================================================
// EMPRESA
// ==========================================================

if (
    filtros?.empresa
) {

parametros.append(
    "empresa",
    filtros.empresa
);

}


// ==========================================================
// SUCURSAL
// ==========================================================

if (
    filtros?.sucursal
) {

parametros.append(
    "sucursal",
    filtros.sucursal
);

}


const response =
    await fetch(
        `${API_URL}/api/qa/ejecuciones/${ejecucionId}/diferencias?${parametros.toString()}`
    );


    if (!response.ok) {

    const error =
        await response.json();


    throw new Error(
        error.detail
        ??
        "No se pudieron obtener las diferencias."
    );

    }


    return response.json();
}

// ============================================================
// CAMBIAR ESTADO DE UNA DIFERENCIA
// ============================================================

export async function cambiarEstadoDiferencia(
    ejecucionId: number,
    diferenciaId: number,
    datos: QADiferenciaEstadoUpdate
): Promise<QADiferenciaEstadoResponse> {

const response =
    await fetch(
        `${API_URL}/api/qa/ejecuciones/${ejecucionId}/diferencias/${diferenciaId}/estado`,
        {
            method: "PATCH",

        headers: {
            "Content-Type":
                "application/json",
        },

        body: JSON.stringify(
            datos
        ),
    }
);


if (!response.ok) {

    const error =
        await response.json();


    throw new Error(
        error.detail
        ??
        "No se pudo cambiar el estado de la diferencia."
    );

}


    return response.json();
}

// ============================================================
// OBTENER HISTORIAL DE UNA DIFERENCIA
// ============================================================

export async function obtenerHistorialDiferencia(

    ejecucionId: number,

    diferenciaId: number

): Promise<QACorreccion[]> {

    const response =
        await fetch(

            `${API_URL}/api/qa/ejecuciones/${ejecucionId}/diferencias/${diferenciaId}/historial`

        );


    if (!response.ok) {

        const error =
            await response.json();


        throw new Error(

            error.detail
            ??
            "No se pudo obtener el historial de la diferencia."

        );

    }


    return response.json();

}

// ============================================================
// OBTENER HISTORIAL GENERAL DE CORRECCIONES
// ============================================================

export async function obtenerHistorialCorrecciones(

    ejecucionId: number,

    pagina: number,

    tamanoPagina: number,

    filtros?: QAFiltrosConsultaHistorial

): Promise<QAPaginaHistorialCorrecciones> {

    const parametros =
        new URLSearchParams({

            pagina:
                String(pagina),

            tamano_pagina:
                String(tamanoPagina),

        });


    // ========================================================
    // CÓDIGO DE BARRA
    // ========================================================

    if (
        filtros?.codigo_barra
    ) {

        parametros.append(
            "codigo_barra",
            filtros.codigo_barra
        );

    }


    // ========================================================
    // TIPO DE DIFERENCIA
    // ========================================================

    if (
        filtros?.tipo_diferencia
    ) {

        parametros.append(
            "tipo_diferencia",
            filtros.tipo_diferencia
        );

    }


    // ========================================================
    // EMPRESA
    // ========================================================

    if (
        filtros?.empresa
    ) {

        parametros.append(
            "empresa",
            filtros.empresa
        );

    }


    // ========================================================
    // SUCURSAL
    // ========================================================

    if (
        filtros?.sucursal
    ) {

        parametros.append(
            "sucursal",
            filtros.sucursal
        );

    }


    const response =
        await fetch(

            `${API_URL}/api/qa/ejecuciones/${ejecucionId}/historial-correcciones?${parametros.toString()}`

        );


    if (!response.ok) {

        const error =
            await response.json();


        throw new Error(

            error.detail
            ??
            "No se pudo obtener el historial de correcciones."

        );

    }


    return response.json();

}

// ============================================================
// OBTENER FILTROS DEL HISTORIAL DE CORRECCIONES
// ============================================================

export async function obtenerFiltrosHistorialCorrecciones(

    ejecucionId: number,

    empresa?: string

): Promise<QAFiltrosHistorialCorrecciones> {

    const parametros =
        new URLSearchParams();


    if (
        empresa
        &&
        empresa.trim()
    ) {

        parametros.append(
            "empresa",
            empresa.trim()
        );

    }


    const query =
        parametros.toString();


    const url =
        query

            ? `${API_URL}/api/qa/ejecuciones/${ejecucionId}/historial-correcciones/filtros?${query}`

            : `${API_URL}/api/qa/ejecuciones/${ejecucionId}/historial-correcciones/filtros`;


    const response =
        await fetch(
            url
        );


    if (!response.ok) {

        const error =
            await response.json();


        throw new Error(

            error.detail
            ??
            "No se pudieron obtener los filtros del historial."

        );

    }


    return response.json();

}