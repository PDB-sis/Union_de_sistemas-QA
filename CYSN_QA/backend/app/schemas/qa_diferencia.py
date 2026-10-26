from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


# ============================================================
# DIFERENCIA INDIVIDUAL
# ============================================================

class QADiferenciaResponse(
    BaseModel
):
    # ========================================================
    # IDENTIFICADORES
    # ========================================================

    diferencia_id: int

    resultado_id: int


    # ========================================================
    # PRODUCTO
    # ========================================================

    codigo_barra: str


    # ========================================================
    # UBICACIÓN
    # ========================================================

    empresa: str | None = None

    sucursal: str | None = None


    # ========================================================
    # TIPO DE DIFERENCIA
    # ========================================================

    tipo_diferencia: str

    nombre_diferencia: str


    # ========================================================
    # VALORES COMPARADOS
    # ========================================================

    valor_creacion: str | None = None

    valor_empresa: str | None = None

    diferencia_numerica: (
        Decimal | None
    ) = None


    # ========================================================
    # ESTADO DE CORRECCIÓN
    # ========================================================

    estado_correccion: str

    corregido_at: (
        datetime | None
    ) = None


# ============================================================
# RESPUESTA PAGINADA
# ============================================================

class QAPaginaDiferencias(
    BaseModel
):
    pagina: int

    tamano_pagina: int

    total_registros: int

    total_paginas: int

    diferencias: list[
        QADiferenciaResponse
    ]


# ============================================================
# TIPO DE DIFERENCIA DISPONIBLE
# ============================================================

class QATipoDiferenciaResponse(
    BaseModel
):
    codigo: str

    nombre: str


# ============================================================
# FILTROS DEL MÓDULO DIFERENCIAS
# ============================================================

class QAFiltrosDiferencias(
    BaseModel
):
    tipos: list[
        QATipoDiferenciaResponse
    ]

    estados_correccion: list[str]

    empresas: list[str]

    sucursales: list[str]
    
    # ============================================================
# CAMBIAR ESTADO DE UNA DIFERENCIA
# ============================================================

class QADiferenciaEstadoUpdate(
    BaseModel
):
    estado_correccion: str


# ============================================================
# RESPUESTA AL CAMBIAR EL ESTADO
# ============================================================

class QADiferenciaEstadoResponse(
    BaseModel
):
    diferencia_id: int

    estado_correccion: str

    corregido_at: (
        datetime | None
    ) = None