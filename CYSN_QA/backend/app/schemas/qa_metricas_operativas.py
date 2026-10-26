from pydantic import BaseModel


class QAMetricasResumenOperativo(BaseModel):
    # Campos existentes del resumen. Se conservan para no romper
    # Dashboard ni otros consumidores actuales del endpoint.
    ejecucion_id: int
    total_resultados: int
    codigos_barra_distintos: int
    total_iguales: int
    total_con_diferencia: int
    total_no_en_empresas: int
    total_no_en_creacion: int
    porcentaje_conformidad: float
    total_diferencias_individuales: int
    total_pendientes: int
    total_corregidas: int
    porcentaje_correccion: float

    # Métricas operativas aprobadas para la cabecera de Métricas.
    filas_csv: int
    codigos_filtrados: int
    total_incidencias_atributos: int
    total_diferencias_atributos: int

    # Diferencias activas por atributo.
    diferencias_referencia: int
    diferencias_precio: int
    diferencias_tasa_cambio: int
    diferencias_codigo_marca: int
