from pydantic import BaseModel


class QAMetricasResumen(BaseModel):

    ejecucion_id: int

    # ========================================================
    # RESULTADOS QA
    # ========================================================

    total_resultados: int

    codigos_barra_distintos: int

    total_iguales: int

    total_con_diferencia: int

    total_no_en_empresas: int

    total_no_en_creacion: int

    porcentaje_conformidad: float


    # ========================================================
    # DIFERENCIAS INDIVIDUALES
    # ========================================================

    total_diferencias_individuales: int

    total_pendientes: int

    total_corregidas: int

    porcentaje_correccion: float
    
class QAMetricaTipoDiferencia(BaseModel):

    codigo: str

    nombre: str

    total: int

    pendientes: int

    corregidas: int

    porcentaje_del_total: float

    porcentaje_correccion: float


class QAMetricasTiposDiferencia(BaseModel):

    ejecucion_id: int

    total_diferencias: int

    tipos: list[QAMetricaTipoDiferencia]
    
class QAMetricaEmpresa(BaseModel):

    empresa: str

    resultados_evaluados: int

    resultados_con_incidencias: int

    total_diferencias: int

    pendientes: int

    corregidas: int

    porcentaje_resultados_con_incidencias: float

    porcentaje_correccion: float


class QAMetricasEmpresas(BaseModel):

    ejecucion_id: int

    empresas: list[QAMetricaEmpresa]
    
class QAMetricaSucursal(BaseModel):

    empresa: str

    sucursal: str

    resultados_evaluados: int

    resultados_con_incidencias: int

    total_diferencias: int

    pendientes: int

    corregidas: int

    porcentaje_resultados_con_incidencias: float

    porcentaje_correccion: float


class QAMetricasSucursales(BaseModel):

    ejecucion_id: int

    sucursales: list[QAMetricaSucursal]