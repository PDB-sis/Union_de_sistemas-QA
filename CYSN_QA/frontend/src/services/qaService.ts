import type {
    QAEjecucion,
    QAEjecucionCreate,
    QAFiltrosDisponibles,
    QAPaginaResultados,
} from "../types/qa";


const API_URL = import.meta.env.VITE_API_URL;


// ============================================================
// LISTAR EJECUCIONES
// ============================================================

export async function obtenerEjecuciones():
Promise<QAEjecucion[]> {

const response = await fetch(
    `${API_URL}/api/qa/ejecuciones`
);


if (!response.ok) {
    throw new Error(
        "No se pudieron obtener las ejecuciones QA."
    );
}


return response.json();
}


// ============================================================
// CREAR EJECUCIÓN
// ============================================================

export async function crearEjecucion(
datos: QAEjecucionCreate
): Promise<QAEjecucion> {

const response = await fetch(
    `${API_URL}/api/qa/ejecuciones`,
    {
    method: "POST",

    headers: {
        "Content-Type": "application/json",
    },

    body: JSON.stringify(
        datos
    ),
    }
);


if (!response.ok) {
    throw new Error(
        "No se pudo crear la ejecución QA."
    );
}


return response.json();
}


// ============================================================
// FILTROS DISPONIBLES
// ============================================================

export async function obtenerFiltrosQA(
    ejecucionId: number,
    empresa?: string
): Promise<QAFiltrosDisponibles> {

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
        ? `${API_URL}/api/qa/ejecuciones/${ejecucionId}/filtros?${query}`
        : `${API_URL}/api/qa/ejecuciones/${ejecucionId}/filtros`;


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
        "No se pudieron obtener los filtros del QA."
    );

}


    return response.json();
}


// ============================================================
// CONSULTA GENERAL PAGINADA + FILTROS + ORDENAMIENTO
// ============================================================

export async function obtenerResultadosQA(
ejecucionId: number,
pagina: number,
tamanoPagina: number,
filtros?: {
    codigo_barra?: string;
    referencia?: string;
    estado?: string;
    empresa?: string;
    sucursal?: string;
    orden_por?: string;
    direccion?: string;
}
): Promise<QAPaginaResultados> {

const parametros =
    new URLSearchParams({
    pagina: String(
        pagina
    ),

        tamano_pagina: String(
        tamanoPagina
        ),
    });


  // ============================================================
  // FILTROS
  // ============================================================

    if (filtros?.codigo_barra) {

    parametros.append(
        "codigo_barra",
        filtros.codigo_barra
    );
    }


    if (filtros?.referencia) {

    parametros.append(
        "referencia",
        filtros.referencia
    );
}


    if (filtros?.estado) {

    parametros.append(
        "estado",
        filtros.estado
    );
}


    if (filtros?.empresa) {

    parametros.append(
        "empresa",
        filtros.empresa
    );
}


    if (filtros?.sucursal) {

    parametros.append(
        "sucursal",
        filtros.sucursal
    );
}


  // ============================================================
  // ORDENAMIENTO
  // ============================================================

    if (filtros?.orden_por) {

    parametros.append(
        "orden_por",
        filtros.orden_por
    );
}


    if (filtros?.direccion) {

    parametros.append(
        "direccion",
        filtros.direccion
    );
}


const response = await fetch(
    `${API_URL}/api/qa/ejecuciones/${ejecucionId}/resultados?${parametros.toString()}`
);


if (!response.ok) {

    const error = await response.json();


    throw new Error(
        error.detail
        ??
        "No se pudieron obtener los resultados QA."
    );
}


    return response.json();
}