from datetime import datetime

from pydantic import BaseModel


# ============================================================
# RESPUESTA DEL HISTORIAL DE CORRECCIONES
# ============================================================

class QACorreccionResponse(
    BaseModel
):
    id: int

    qa_diferencia_id: int

    estado_anterior: str

    estado_nuevo: str

    usuario: str | None = None

    observacion: str | None = None

    created_at: datetime
    

# ============================================================
# REGISTRO DEL HISTORIAL GENERAL DE CORRECCIONES
# ============================================================

class QAHistorialCorreccionResponse(
    BaseModel
):

    id: int

    qa_diferencia_id: int

    codigo_barra: str

    empresa: str | None = None

    sucursal: str | None = None

    tipo_diferencia: str

    nombre_diferencia: str

    estado_anterior: str

    estado_nuevo: str

    usuario: str | None = None

    observacion: str | None = None

    created_at: datetime


# ============================================================
# PÁGINA DEL HISTORIAL GENERAL
# ============================================================

class QAPaginaHistorialCorrecciones(
    BaseModel
):

    pagina: int

    tamano_pagina: int

    total_registros: int

    total_paginas: int

    historial: list[
        QAHistorialCorreccionResponse
    ]

# ============================================================
# TIPO DISPONIBLE EN FILTROS DEL HISTORIAL
# ============================================================

class QATipoHistorialCorreccion(
    BaseModel
):

    codigo: str

    nombre: str


# ============================================================
# FILTROS DISPONIBLES DEL HISTORIAL
# ============================================================

class QAFiltrosHistorialCorrecciones(
    BaseModel
):

    tipos: list[
        QATipoHistorialCorreccion
    ]

    empresas: list[str]

    sucursales: list[str]