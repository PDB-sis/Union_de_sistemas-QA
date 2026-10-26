from datetime import datetime

from pydantic import BaseModel


class InventarioCSVValidacionResponse(BaseModel):
    validado: bool
    qa_ciclo_id: int
    ciclo: str
    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str
    estado_recepcion: str

    archivo_nombre: str
    archivo_tamano_bytes: int
    archivo_sha256: str
    encoding: str
    delimitador: str

    total_registros: int
    columnas_detectadas: list[str]

    sucursal_archivo: str
    sucursal_normalizada: str
    identificador_esperado: str
    identificador_esperado_normalizado: str



class InventarioCargaRegistroResponse(BaseModel):
    registrado: bool
    carga_id: int

    qa_ciclo_id: int
    ciclo: str
    qa_ciclo_sucursal_id: int

    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str

    cargado_por_user_id: int
    cargado_por_username: str

    version: int
    es_actual: bool
    reemplaza_carga_id: int | None

    estado: str
    estado_recepcion: str

    archivo_nombre: str
    archivo_tamano_bytes: int
    archivo_sha256: str

    total_registros: int
    registros_validos: int
    registros_invalidos: int

    recibido_at: datetime



class InventarioProcesamientoResponse(BaseModel):
    procesado: bool
    carga_id: int

    qa_ciclo_id: int
    ciclo: str
    qa_ciclo_sucursal_id: int

    sucursal_id: int
    sucursal: str
    empresa_id: int
    empresa: str

    version: int
    es_actual: bool
    estado: str
    estado_recepcion: str

    total_registros: int
    registros_validos: int
    registros_invalidos: int
    detalles_insertados: int

    archivo_nombre: str
    archivo_sha256: str
    procesado_at: datetime
