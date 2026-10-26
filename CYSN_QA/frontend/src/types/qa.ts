// ============================================================

// EJECUCIONES QA

// ============================================================



export interface QAEjecucion {

    id: number;

    nombre: string;

    fecha_referencia: string | null;

    estado: string;

    descripcion: string | null;

    fecha_inicio: string;

    fecha_fin: string | null;

    created_at: string;

}





export interface QAEjecucionCreate {

    nombre: string;

    fecha_referencia: string | null;

    descripcion: string | null;

}





// ============================================================

// VALIDACIÓN DE ARCHIVOS

// ============================================================



export interface QAEstadosComparacion {

    [estado: string]: number;

}





export interface QAValidacionArchivo {

    valido: boolean;

    nombre_archivo: string;

    codificacion: string;

    delimitador: string;

    total_registros: number;

    total_columnas: number;

    encabezados: string[];

    columnas_extra: string[];

    estados: QAEstadosComparacion;

    estados_desconocidos: QAEstadosComparacion;

}





// ============================================================

// IMPORTACIÓN

// ============================================================



export interface QAImportacionResultado {

    ejecucion_id: number;

    importacion_id: number;

    estado: string;

    nombre_archivo: string;

    total_resultados: number;

    total_diferencias: number;

    estados: QAEstadosComparacion;

    diferencias_por_tipo: QAEstadosComparacion;

}





// ============================================================

// CONSULTA GENERAL

// ============================================================



export type QAValorNumerico =

    | number

    | string

    | null;





export interface QAResultado {

    id: number;

    qa_ejecucion_id: number;

    numero_fila_origen: number;

    sucursal_origen: string | null;

    estado_creacion: string | null;

    tabla_empresa: string | null;

    codigo_barra: string;

    referencia_creacion: string | null;

    codigo_marca_creacion: string | null;

    precio_detal_usd_creacion: QAValorNumerico;

    tasa_cambio_creacion: QAValorNumerico;

    status_creacion: string | null;

    sucursal_empresa: string | null;

    referencia_empresa: string | null;

    codigo_marca_empresa: string | null;

    precio_detal_empresa: QAValorNumerico;

    precio_detal_usd_empresa: QAValorNumerico;

    tasa_cambio_empresa: QAValorNumerico;

    precio_detal_usd_calculado_empresa:

        QAValorNumerico;



    status_empresa: string | null;

    existencia_empresa: QAValorNumerico;

    categoria_creacion: string | null;

    categoria_empresa: string | null;

    precio_promocion_creacion: QAValorNumerico;

    precio_promocion_empresa: QAValorNumerico;

    costo_inicial_creacion: QAValorNumerico;

    costo_inicial_empresa: QAValorNumerico;

    costo_dolar_creacion: QAValorNumerico;

    costo_dolar_empresa: QAValorNumerico;

    estado_comparacion: string;

}





export interface QAPaginaResultados {

    pagina: number;

    tamano_pagina: number;

    total_registros: number;

    total_paginas: number;

    resultados: QAResultado[];

}



export interface QAFiltrosDisponibles {

    empresas: string[];

    sucursales: string[];

    estados: string[];

}



export interface QAFiltrosConsulta {

    codigo_barra: string;

    referencia: string;

    estado: string;

    empresa: string;

    sucursal: string;

    orden_por: string;

    direccion: string;

}



// ============================================================

// MÓDULO DIFERENCIAS

// ============================================================



export interface QADiferencia {

    diferencia_id: number;



    resultado_id: number;



    codigo_barra: string;



    empresa: string | null;



    sucursal: string | null;



    tipo_diferencia: string;



    nombre_diferencia: string;



    valor_creacion: string | null;



    valor_empresa: string | null;



    diferencia_numerica:

        QAValorNumerico;



    estado_correccion: string;



    corregido_at: string | null;

}





// ============================================================

// PÁGINA DE DIFERENCIAS

// ============================================================



export interface QAPaginaDiferencias {

    pagina: number;



    tamano_pagina: number;



    total_registros: number;



    total_paginas: number;



    diferencias: QADiferencia[];

}





// ============================================================

// TIPO DE DIFERENCIA

// ============================================================



export interface QATipoDiferencia {

    codigo: string;



    nombre: string;

}





// ============================================================

// FILTROS DISPONIBLES

// ============================================================



export interface QAFiltrosDiferencias {

    tipos: QATipoDiferencia[];



    estados_correccion: string[];



    empresas: string[];



    sucursales: string[];

}





// ============================================================

// FILTROS DE CONSULTA

// ============================================================



export interface QAFiltrosConsultaDiferencias {

    tipo_diferencia: string;



    estado_correccion: string;



    codigo_barra: string;



    empresa: string;



    sucursal: string;

}



// ============================================================

// CAMBIO DE ESTADO DE UNA DIFERENCIA

// ============================================================



export interface QADiferenciaEstadoUpdate {

    estado_correccion:

        "PENDIENTE"

        |

        "CORREGIDO";

}





// ============================================================

// RESPUESTA AL CAMBIAR ESTADO

// ============================================================



export interface QADiferenciaEstadoResponse {

    diferencia_id: number;



    estado_correccion:

        "PENDIENTE"

        |

        "CORREGIDO";



    corregido_at:

        string | null;

}



// ============================================================

// HISTORIAL DE CORRECCIONES

// ============================================================



export interface QACorreccion {



    id: number;



    qa_diferencia_id: number;



    estado_anterior:

        "PENDIENTE"

        |

        "CORREGIDO";



    estado_nuevo:

        "PENDIENTE"

        |

        "CORREGIDO";



    usuario:

        string | null;



    observacion:

        string | null;



    created_at: string;



}



// ============================================================

// HISTORIAL GENERAL DE CORRECCIONES

// ============================================================



export interface QAHistorialCorreccion {



    id: number;



    qa_diferencia_id: number;



    codigo_barra: string;



    empresa: string | null;



    sucursal: string | null;



    tipo_diferencia: string;



    nombre_diferencia: string;



    estado_anterior:

        "PENDIENTE"

        |

        "CORREGIDO";



    estado_nuevo:

        "PENDIENTE"

        |

        "CORREGIDO";



    usuario: string | null;



    observacion: string | null;



    created_at: string;



}





// ============================================================

// PÁGINA DEL HISTORIAL GENERAL

// ============================================================



export interface QAPaginaHistorialCorrecciones {



    pagina: number;



    tamano_pagina: number;



    total_registros: number;



    total_paginas: number;



    historial: QAHistorialCorreccion[];



}





// ============================================================

// TIPO DISPONIBLE EN FILTROS DEL HISTORIAL

// ============================================================



export interface QATipoHistorialCorreccion {



    codigo: string;



    nombre: string;



}





// ============================================================

// FILTROS DISPONIBLES DEL HISTORIAL

// ============================================================



export interface QAFiltrosHistorialCorrecciones {



    tipos: QATipoHistorialCorreccion[];



    empresas: string[];



    sucursales: string[];



}





// ============================================================

// FILTROS DE CONSULTA DEL HISTORIAL

// ============================================================



export interface QAFiltrosConsultaHistorial {



    codigo_barra: string;



    tipo_diferencia: string;



    empresa: string;



    sucursal: string;



}



// ============================================================

// MÉTRICAS QA

// ============================================================



export interface QAMetricasResumen {

    ejecucion_id: number;



    total_resultados: number;

    codigos_barra_distintos: number;



    total_iguales: number;

    total_con_diferencia: number;

    total_no_en_empresas: number;

    total_no_en_creacion: number;



    porcentaje_conformidad: number;



    total_diferencias_individuales: number;

    total_pendientes: number;

    total_corregidas: number;



    porcentaje_correccion: number;

}





// ============================================================

// MÉTRICAS POR TIPO

// ============================================================



export interface QAMetricaTipoDiferencia {

    codigo: string;

    nombre: string;



    total: number;

    pendientes: number;

    corregidas: number;



    porcentaje_del_total: number;

    porcentaje_correccion: number;

}





export interface QAMetricasTiposDiferencia {

    ejecucion_id: number;

    total_diferencias: number;



    tipos: QAMetricaTipoDiferencia[];

}





// ============================================================

// MÉTRICAS POR EMPRESA

// ============================================================



export interface QAMetricaEmpresa {

    empresa: string;



    resultados_evaluados: number;

    resultados_con_incidencias: number;



    total_diferencias: number;

    pendientes: number;

    corregidas: number;



    porcentaje_resultados_con_incidencias: number;

    porcentaje_correccion: number;

}





export interface QAMetricasEmpresas {

    ejecucion_id: number;



    empresas: QAMetricaEmpresa[];

}





// ============================================================

// MÉTRICAS POR SUCURSAL

// ============================================================



export interface QAMetricaSucursal {

    empresa: string;

    sucursal: string;



    resultados_evaluados: number;

    resultados_con_incidencias: number;



    total_diferencias: number;

    pendientes: number;

    corregidas: number;



    porcentaje_resultados_con_incidencias: number;

    porcentaje_correccion: number;

}





export interface QAMetricasSucursales {

    ejecucion_id: number;



    sucursales: QAMetricaSucursal[];

}



// ============================================================

// MÉTRICAS QA

// ============================================================



export interface QAMetricasResumen {

    ejecucion_id: number;



    total_resultados: number;

    codigos_barra_distintos: number;



    total_iguales: number;

    total_con_diferencia: number;

    total_no_en_empresas: number;

    total_no_en_creacion: number;



    porcentaje_conformidad: number;



    total_diferencias_individuales: number;

    total_pendientes: number;

    total_corregidas: number;



    porcentaje_correccion: number;

}





// ============================================================

// MÉTRICAS POR TIPO

// ============================================================



export interface QAMetricaTipoDiferencia {

    codigo: string;

    nombre: string;



    total: number;

    pendientes: number;

    corregidas: number;



    porcentaje_del_total: number;

    porcentaje_correccion: number;

}





export interface QAMetricasTiposDiferencia {

    ejecucion_id: number;

    total_diferencias: number;



    tipos: QAMetricaTipoDiferencia[];

}





// ============================================================

// MÉTRICAS POR EMPRESA

// ============================================================



export interface QAMetricaEmpresa {

    empresa: string;



    resultados_evaluados: number;

    resultados_con_incidencias: number;



    total_diferencias: number;

    pendientes: number;

    corregidas: number;



    porcentaje_resultados_con_incidencias: number;

    porcentaje_correccion: number;

}





export interface QAMetricasEmpresas {

    ejecucion_id: number;



    empresas: QAMetricaEmpresa[];

}





// ============================================================

// MÉTRICAS POR SUCURSAL

// ============================================================



export interface QAMetricaSucursal {

    empresa: string;

    sucursal: string;



    resultados_evaluados: number;

    resultados_con_incidencias: number;



    total_diferencias: number;

    pendientes: number;

    corregidas: number;



    porcentaje_resultados_con_incidencias: number;

    porcentaje_correccion: number;

}





export interface QAMetricasSucursales {

    ejecucion_id: number;



    sucursales: QAMetricaSucursal[];

}
