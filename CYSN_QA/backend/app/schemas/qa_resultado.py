from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
)


# ============================================================
# UNA FILA DE RESULTADO QA
# ============================================================

class QAResultadoResponse(BaseModel):
    id: int

    qa_ejecucion_id: int

    numero_fila_origen: int

    sucursal_origen: str | None

    estado_creacion: str | None

    tabla_empresa: str | None

    codigo_barra: str

    referencia_creacion: str | None

    codigo_marca_creacion: str | None

    precio_detal_usd_creacion: Decimal | None

    tasa_cambio_creacion: Decimal | None

    status_creacion: str | None

    sucursal_empresa: str | None

    referencia_empresa: str | None

    codigo_marca_empresa: str | None

    precio_detal_empresa: Decimal | None

    precio_detal_usd_empresa: Decimal | None

    tasa_cambio_empresa: Decimal | None

    precio_detal_usd_calculado_empresa: Decimal | None

    status_empresa: str | None

    existencia_empresa: Decimal | None

    categoria_creacion: str | None

    categoria_empresa: str | None

    precio_promocion_creacion: Decimal | None

    precio_promocion_empresa: Decimal | None

    precio_promocion_creacion: Decimal | None

    precio_promocion_empresa: Decimal | None

    costo_inicial_creacion: Decimal | None

    costo_inicial_empresa: Decimal | None

    costo_dolar_creacion: Decimal | None

    costo_dolar_empresa: Decimal | None

    estado_comparacion: str

    estado_comparacion: str

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# PÁGINA DE RESULTADOS
# ============================================================

class QAPaginaResultados(BaseModel):
    pagina: int

    tamano_pagina: int

    total_registros: int

    total_paginas: int

    resultados: list[QAResultadoResponse]


# ============================================================
# OPCIONES DISPONIBLES PARA FILTRAR
# ============================================================

class QAFiltrosDisponibles(BaseModel):
    empresas: list[str]

    sucursales: list[str]

    estados: list[str]