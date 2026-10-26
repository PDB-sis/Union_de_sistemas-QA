import csv
import hashlib
import io

from collections import Counter
from datetime import (
    date,
    datetime,
    timezone,
)
from decimal import (
    Decimal,
    InvalidOperation,
)

from fastapi import UploadFile
from sqlalchemy import (
    insert,
    select,
)
from sqlalchemy.orm import Session

from app.models.qa_diferencia import (
    QADiferencia,
)
from app.models.qa_ejecucion import (
    QAEjecucion,
)
from app.models.qa_importacion import (
    QAImportacion,
)
from app.models.qa_resultado import (
    QAResultado,
)
from app.models.qa_tipo_diferencia import (
    QATipoDiferencia,
)

from app.services.qa_import_service import (
    analizar_archivo_qa,
)


# ============================================================
# CONFIGURACIÓN
# ============================================================

BATCH_SIZE = 2000


MAPA_ESTADOS = {
    "IGUAL": "IGUAL",

    "DIFERENCIA": "DIFERENCIA",

    "NO SE ENCONTRO EN EMPRESAS":
        "NO_EN_EMPRESAS",

    "NO SE ENCONTRO EN CREACION":
        "NO_EN_CREACION",
}


# ============================================================
# LIMPIEZA DE TEXTO
# ============================================================

def limpiar_texto(
    valor: str | None,
) -> str | None:

    if valor is None:
        return None

    valor_limpio = str(
        valor
    ).strip()

    if valor_limpio == "":
        return None

    return valor_limpio


# ============================================================
# LIMPIAR CÓDIGO DE BARRA
# ============================================================

def limpiar_codigo_barra(
    valor: str | None,
) -> str | None:

    valor_limpio = limpiar_texto(
        valor
    )

    if valor_limpio is None:
        return None

    valor_limpio = (
        valor_limpio
        .lstrip("'")
        .strip()
    )

    if valor_limpio == "":
        return None

    return valor_limpio


# ============================================================
# CONVERSIÓN NUMÉRICA
# ============================================================

def convertir_decimal(
    valor: str | None,
    nombre_campo: str,
    numero_fila: int,
) -> Decimal | None:

    valor_limpio = limpiar_texto(
        valor
    )

    if valor_limpio is None:
        return None

    # Ejemplo:
    # 5,50
    #     ↓
    # 5.50
    if (
        "," in valor_limpio
        and "." not in valor_limpio
    ):
        valor_limpio = (
            valor_limpio.replace(
                ",",
                ".",
            )
        )

    try:
        return Decimal(
            valor_limpio
        )

    except InvalidOperation:
        raise ValueError(
            f"Valor numérico inválido "
            f"en la fila {numero_fila}, "
            f"campo {nombre_campo}: "
            f"{valor}"
        )


# ============================================================
# INTERPRETAR SI / NO
# ============================================================

def es_si(
    valor: str | None,
) -> bool:

    if valor is None:
        return False

    valor_normalizado = (
        str(valor)
        .strip()
        .lower()
    )

    return valor_normalizado in {
        "si",
        "sí",
        "s",
        "1",
        "true",
    }


# ============================================================
# SHA-256
# ============================================================

def calcular_sha256(
    archivo: UploadFile,
) -> str:

    archivo.file.seek(0)

    hash_sha256 = hashlib.sha256()

    while True:
        bloque = archivo.file.read(
            1024 * 1024
        )

        if not bloque:
            break

        hash_sha256.update(
            bloque
        )

    archivo.file.seek(0)

    return hash_sha256.hexdigest()


# ============================================================
# TIPOS DE DIFERENCIA
# ============================================================

def obtener_tipos_diferencia(
    db: Session,
) -> dict[str, int]:

    consulta = select(
        QATipoDiferencia.codigo,
        QATipoDiferencia.id,
    )

    resultados = db.execute(
        consulta
    ).all()

    return {
        codigo: tipo_id
        for codigo, tipo_id
        in resultados
    }


# ============================================================
# CREAR DIFERENCIAS DE UNA FILA
# ============================================================

def crear_diferencias_fila(
    fila: dict,
    estado_csv: str,
    tipos: dict[str, int],
    numero_fila: int,
) -> list[dict]:

    diferencias = []


    # ========================================================
    # NO SE ENCONTRÓ EN EMPRESAS
    # ========================================================

    if estado_csv == (
        "NO SE ENCONTRO EN EMPRESAS"
    ):
        diferencias.append({
            "numero_fila_origen":
                numero_fila,

            "tipo_diferencia_id":
                tipos[
                    "PRESENCIA_EMPRESA"
                ],

            "valor_creacion":
                "PRESENTE",

            "valor_empresa":
                "NO ENCONTRADO",

            "diferencia_numerica":
                None,
        })

        return diferencias


    # ========================================================
    # NO SE ENCONTRÓ EN CREACIÓN
    # ========================================================

    if estado_csv == (
        "NO SE ENCONTRO EN CREACION"
    ):
        diferencias.append({
            "numero_fila_origen":
                numero_fila,

            "tipo_diferencia_id":
                tipos[
                    "PRESENCIA_CREACION"
                ],

            "valor_creacion":
                "NO ENCONTRADO",

            "valor_empresa":
                "PRESENTE",

            "diferencia_numerica":
                None,
        })

        return diferencias


    # ========================================================
    # IGUAL
    # ========================================================

    if estado_csv == "IGUAL":
        return diferencias


    # ========================================================
    # ESTADO NO RECONOCIDO
    # ========================================================

    if estado_csv != "DIFERENCIA":
        raise ValueError(
            f"Estado de comparación "
            f"desconocido en fila "
            f"{numero_fila}: "
            f"{estado_csv}"
        )


    # ========================================================
    # REFERENCIA
    # ========================================================

    if es_si(
        fila.get(
            "DiferenciaReferencia"
        )
    ):
        diferencias.append({
            "numero_fila_origen":
                numero_fila,

            "tipo_diferencia_id":
                tipos["REFERENCIA"],

            "valor_creacion":
                limpiar_texto(
                    fila.get(
                        "Referencia_CREACION"
                    )
                ),

            "valor_empresa":
                limpiar_texto(
                    fila.get(
                        "Referencia_EMPRESA"
                    )
                ),

            "diferencia_numerica":
                None,
        })


    # ========================================================
    # CÓDIGO MARCA
    # ========================================================

    if es_si(
        fila.get(
            "DiferenciaCodigoMarcaOrigen"
        )
    ):
        diferencias.append({
            "numero_fila_origen":
                numero_fila,

            "tipo_diferencia_id":
                tipos["CODIGO_MARCA"],

            "valor_creacion":
                limpiar_texto(
                    fila.get(
                        "CodigoMarcaOrigen_CREACION"
                    )
                ),

            "valor_empresa":
                limpiar_texto(
                    fila.get(
                        "CodigoMarcaOrigen_EMPRESA"
                    )
                ),

            "diferencia_numerica":
                None,
        })


    # ========================================================
    # PRECIO
    # ========================================================

    if es_si(
        fila.get(
            "DiferenciaPrecio"
        )
    ):
        precio_creacion = convertir_decimal(
            fila.get(
                "PrecioDetalUSDMasIVA_CREACION"
            ),
            "PrecioDetalUSDMasIVA_CREACION",
            numero_fila,
        )

        precio_empresa = convertir_decimal(
            fila.get(
                "PrecioDetalUSDMasIVA_EMPRESA"
            ),
            "PrecioDetalUSDMasIVA_EMPRESA",
            numero_fila,
        )

        diferencia_numerica = None

        if (
            precio_creacion is not None
            and precio_empresa is not None
        ):
            diferencia_numerica = (
                precio_empresa
                - precio_creacion
            )

        diferencias.append({
            "numero_fila_origen":
                numero_fila,

            "tipo_diferencia_id":
                tipos["PRECIO_DETAL"],

            "valor_creacion":
                limpiar_texto(
                    fila.get(
                        "PrecioDetalUSDMasIVA_CREACION"
                    )
                ),

            "valor_empresa":
                limpiar_texto(
                    fila.get(
                        "PrecioDetalUSDMasIVA_EMPRESA"
                    )
                ),

            "diferencia_numerica":
                diferencia_numerica,
        })


    # ========================================================
    # TASA DE CAMBIO
    # ========================================================

    if es_si(
        fila.get(
            "DiferenciaTasaCambio"
        )
    ):
        tasa_creacion = convertir_decimal(
            fila.get(
                "TasaCambio_CREACION"
            ),
            "TasaCambio_CREACION",
            numero_fila,
        )

        tasa_empresa = convertir_decimal(
            fila.get(
                "TasaCambio_EMPRESA"
            ),
            "TasaCambio_EMPRESA",
            numero_fila,
        )

        diferencia_numerica = None

        if (
            tasa_creacion is not None
            and tasa_empresa is not None
        ):
            diferencia_numerica = (
                tasa_empresa
                - tasa_creacion
            )

        diferencias.append({
            "numero_fila_origen":
                numero_fila,

            "tipo_diferencia_id":
                tipos["TASA_CAMBIO"],

            "valor_creacion":
                limpiar_texto(
                    fila.get(
                        "TasaCambio_CREACION"
                    )
                ),

            "valor_empresa":
                limpiar_texto(
                    fila.get(
                        "TasaCambio_EMPRESA"
                    )
                ),

            "diferencia_numerica":
                diferencia_numerica,
        })


    return diferencias


# ============================================================
# PROCESAR UN LOTE
# ============================================================

def procesar_lote(
    db: Session,
    resultados_lote: list[dict],
    diferencias_lote: list[dict],
):

    if not resultados_lote:
        return


    # ========================================================
    # INSERTAR RESULTADOS
    # ========================================================

    sentencia_resultados = (
        insert(QAResultado)
        .returning(
            QAResultado.id,
            QAResultado.numero_fila_origen,
        )
    )


    filas_insertadas = db.execute(
        sentencia_resultados,
        resultados_lote,
    ).all()


    # Relacionamos:
    #
    # numero_fila CSV
    #        ↓
    # qa_resultado.id
    #
    ids_por_fila = {
        numero_fila: resultado_id
        for resultado_id, numero_fila
        in filas_insertadas
    }


    # ========================================================
    # PREPARAR DIFERENCIAS
    # ========================================================

    diferencias_insertar = []


    for diferencia in diferencias_lote:

        numero_fila = diferencia[
            "numero_fila_origen"
        ]

        resultado_id = ids_por_fila[
            numero_fila
        ]


        diferencias_insertar.append({
            "qa_resultado_id":
                resultado_id,

            "tipo_diferencia_id":
                diferencia[
                    "tipo_diferencia_id"
                ],

            "valor_creacion":
                diferencia[
                    "valor_creacion"
                ],

            "valor_empresa":
                diferencia[
                    "valor_empresa"
                ],

            "diferencia_numerica":
                diferencia[
                    "diferencia_numerica"
                ],
        })


    # ========================================================
    # INSERTAR DIFERENCIAS
    # ========================================================

    if diferencias_insertar:

        db.execute(
            insert(QADiferencia),
            diferencias_insertar,
        )


# ============================================================
# IMPORTAR QA EXISTENTE
# ============================================================

def importar_qa_existente(
    db: Session,
    archivo: UploadFile,
    nombre_ejecucion: str,
    fecha_referencia: date | None,
    descripcion: str | None,
) -> dict:

    # ========================================================
    # 1. VALIDAR ARCHIVO
    # ========================================================

    validacion = analizar_archivo_qa(
        archivo
    )


    if validacion[
        "estados_desconocidos"
    ]:
        raise ValueError(
            "El archivo contiene estados "
            "de comparación desconocidos."
        )


    # ========================================================
    # 2. CALCULAR HASH
    # ========================================================

    sha256 = calcular_sha256(
        archivo
    )


    # ========================================================
    # 3. EVITAR IMPORTACIONES DUPLICADAS
    # ========================================================

    importacion_existente = db.scalar(
        select(QAImportacion)
        .where(
            QAImportacion.sha256
            == sha256,

            QAImportacion.estado
            == "COMPLETADA",
        )
    )


    if importacion_existente:
        raise ValueError(
            "Este archivo ya fue importado "
            "anteriormente en NEXO QA."
        )


    # ========================================================
    # 4. CREAR EJECUCIÓN
    # ========================================================

    ejecucion = QAEjecucion(
        nombre=nombre_ejecucion,
        fecha_referencia=fecha_referencia,
        descripcion=descripcion,
        estado="CARGANDO",
    )


    db.add(
        ejecucion
    )

    db.flush()


    # ========================================================
    # 5. CREAR IMPORTACIÓN
    # ========================================================

    importacion = QAImportacion(
        qa_ejecucion_id=
            ejecucion.id,

        nombre_archivo=(
            archivo.filename
            or "archivo.csv"
        ),

        sha256=sha256,

        tamano_bytes=getattr(
            archivo,
            "size",
            None,
        ),

        codificacion=validacion[
            "codificacion"
        ],

        delimitador=validacion[
            "delimitador"
        ],

        total_registros=validacion[
            "total_registros"
        ],

        estado="IMPORTANDO",
    )


    db.add(
        importacion
    )


    # Confirmamos únicamente la existencia
    # de ejecución e importación.
    db.commit()


    db.refresh(
        ejecucion
    )

    db.refresh(
        importacion
    )


    # ========================================================
    # A PARTIR DE AQUÍ:
    #
    # todo el contenido del QA se procesa dentro de una
    # transacción.
    #
    # Si algo falla:
    # ROLLBACK.
    # ========================================================

    try:

        # ====================================================
        # 6. OBTENER TIPOS DE DIFERENCIA
        # ====================================================

        tipos = obtener_tipos_diferencia(
            db
        )


        tipos_requeridos = {
            "PRESENCIA_EMPRESA",
            "PRESENCIA_CREACION",
            "REFERENCIA",
            "CODIGO_MARCA",
            "PRECIO_DETAL",
            "TASA_CAMBIO",
        }


        faltantes = (
            tipos_requeridos
            - set(
                tipos.keys()
            )
        )


        if faltantes:
            raise ValueError(
                "Faltan tipos de diferencia "
                "en PostgreSQL: "
                + ", ".join(
                    sorted(
                        faltantes
                    )
                )
            )


        # Tabla inversa:
        #
        # tipo_id → codigo
        #
        codigos_por_tipo_id = {
            tipo_id: codigo
            for codigo, tipo_id
            in tipos.items()
        }


        # ====================================================
        # 7. CONTADORES
        # ====================================================

        estados_contador = Counter()

        diferencias_contador = Counter()

        total_procesado = 0


        resultados_lote: list[dict] = []

        diferencias_lote: list[dict] = []


        # ====================================================
        # 8. ABRIR CSV
        # ====================================================

        archivo.file.seek(0)


        archivo_texto = io.TextIOWrapper(
            archivo.file,

            encoding=validacion[
                "codificacion"
            ],

            newline="",
        )


        try:

            lector = csv.DictReader(
                archivo_texto,

                delimiter=validacion[
                    "delimitador"
                ],
            )


            # Encabezados = fila 1
            # Datos empiezan en fila 2.

            for numero_fila, fila in enumerate(
                lector,
                start=2,
            ):

                # Ignorar filas totalmente vacías.
                if not any(
                    str(
                        valor or ""
                    ).strip()
                    for valor
                    in fila.values()
                ):
                    continue


                # ============================================
                # ESTADO COMPARACIÓN
                # ============================================

                estado_csv = (
                    fila.get(
                        "EstadoComparacion"
                    )
                    or ""
                ).strip().upper()


                estado_interno = (
                    MAPA_ESTADOS.get(
                        estado_csv
                    )
                )


                if estado_interno is None:
                    raise ValueError(
                        f"Estado inválido "
                        f"en fila "
                        f"{numero_fila}: "
                        f"{estado_csv}"
                    )


                # ============================================
                # CÓDIGO BARRA
                # ============================================

                codigo_barra = limpiar_codigo_barra(
                    fila.get(
                        "CodigoBarra"
                        )
                    )


                if codigo_barra is None:
                    raise ValueError(
                        f"CodigoBarra vacío "
                        f"en fila "
                        f"{numero_fila}."
                    )


                # ============================================
                # RESULTADO
                # ============================================

                resultado = {
                    "qa_ejecucion_id":
                        ejecucion.id,

                    "qa_importacion_id":
                        importacion.id,

                    "numero_fila_origen":
                        numero_fila,

                    "sucursal_origen":
                        limpiar_texto(
                            fila.get(
                                "SucursalOrigen"
                            )
                        ),

                    "estado_creacion":
                        limpiar_texto(
                            fila.get(
                                "EstadoCreacion"
                            )
                        ),

                    "tabla_empresa":
                        limpiar_texto(
                            fila.get(
                                "TablaEmpresa"
                            )
                        ),

                    "codigo_barra":
                        codigo_barra,

                    "referencia_creacion":
                        limpiar_texto(
                            fila.get(
                                "Referencia_CREACION"
                            )
                        ),

                    "codigo_marca_creacion":
                        limpiar_texto(
                            fila.get(
                                "CodigoMarcaOrigen_CREACION"
                            )
                        ),

                    "precio_detal_usd_creacion":
                        convertir_decimal(
                            fila.get(
                                "PrecioDetalUSDMasIVA_CREACION"
                            ),
                            "PrecioDetalUSDMasIVA_CREACION",
                            numero_fila,
                        ),

                    "tasa_cambio_creacion":
                        convertir_decimal(
                            fila.get(
                                "TasaCambio_CREACION"
                            ),
                            "TasaCambio_CREACION",
                            numero_fila,
                        ),

                    "status_creacion":
                        limpiar_texto(
                            fila.get(
                                "StatusOrigen_CREACION"
                            )
                        ),

                    "sucursal_empresa":
                        limpiar_texto(
                            fila.get(
                                "Sucursal_EMPRESA"
                            )
                        ),

                    "referencia_empresa":
                        limpiar_texto(
                            fila.get(
                                "Referencia_EMPRESA"
                            )
                        ),

                    "codigo_marca_empresa":
                        limpiar_texto(
                            fila.get(
                                "CodigoMarcaOrigen_EMPRESA"
                            )
                        ),

                    "precio_detal_empresa":
                        convertir_decimal(
                            fila.get(
                                "PrecioDetalMasIVA_EMPRESA"
                            ),
                            "PrecioDetalMasIVA_EMPRESA",
                            numero_fila,
                        ),

                    "precio_detal_usd_empresa":
                        convertir_decimal(
                            fila.get(
                                "PrecioDetalUSDMasIVA_EMPRESA"
                            ),
                            "PrecioDetalUSDMasIVA_EMPRESA",
                            numero_fila,
                        ),

                    "tasa_cambio_empresa":
                        convertir_decimal(
                            fila.get(
                                "TasaCambio_EMPRESA"
                            ),
                            "TasaCambio_EMPRESA",
                            numero_fila,
                        ),

                    "precio_detal_usd_calculado_empresa":
                        convertir_decimal(
                            fila.get(
                                "PrecioDetalUSDMasIVA_CALCULADO_EMPRESA"
                            ),
                            "PrecioDetalUSDMasIVA_CALCULADO_EMPRESA",
                            numero_fila,
                        ),

                    "status_empresa":
                        limpiar_texto(
                            fila.get(
                                "StatusOrigen_EMPRESA"
                            )
                        ),

                    "existencia_empresa":
                        convertir_decimal(
                            fila.get(
                                "Existencia_EMPRESA"
                            ),
                            "Existencia_EMPRESA",
                            numero_fila,
                        ),

                    # Todavía no existen en el CSV viejo.
                    "categoria_creacion":
                        None,

                    "categoria_empresa":
                        None,

                    "precio_promocion_creacion":
                        None,

                    "precio_promocion_empresa":
                        None,

                    "estado_comparacion":
                        estado_interno,
                }


                resultados_lote.append(
                    resultado
                )


                # ============================================
                # DIFERENCIAS DE ESTA FILA
                # ============================================

                diferencias_fila = (
                    crear_diferencias_fila(
                        fila=fila,
                        estado_csv=estado_csv,
                        tipos=tipos,
                        numero_fila=numero_fila,
                    )
                )


                diferencias_lote.extend(
                    diferencias_fila
                )


                # ============================================
                # CONTADORES
                # ============================================

                estados_contador[
                    estado_interno
                ] += 1


                for diferencia in diferencias_fila:

                    tipo_id = diferencia[
                        "tipo_diferencia_id"
                    ]

                    codigo_tipo = (
                        codigos_por_tipo_id[
                            tipo_id
                        ]
                    )

                    diferencias_contador[
                        codigo_tipo
                    ] += 1


                total_procesado += 1


                # ============================================
                # PROCESAR LOTE
                # ============================================

                if (
                    len(
                        resultados_lote
                    )
                    >= BATCH_SIZE
                ):

                    procesar_lote(
                        db=db,

                        resultados_lote=
                            resultados_lote,

                        diferencias_lote=
                            diferencias_lote,
                    )


                    resultados_lote = []

                    diferencias_lote = []


            # ================================================
            # ÚLTIMO LOTE
            # ================================================

            if resultados_lote:

                procesar_lote(
                    db=db,

                    resultados_lote=
                        resultados_lote,

                    diferencias_lote=
                        diferencias_lote,
                )


        finally:

            try:
                archivo_texto.detach()

            except Exception:
                pass


        # ====================================================
        # 9. COMPLETAR EJECUCIÓN
        # ====================================================

        ahora = datetime.now(
            timezone.utc
        )


        importacion.estado = (
            "COMPLETADA"
        )

        importacion.fecha_fin = (
            ahora
        )

        importacion.total_registros = (
            total_procesado
        )


        ejecucion.estado = (
            "COMPLETADA"
        )

        ejecucion.fecha_fin = (
            ahora
        )


        # Aquí confirmamos:
        #
        # todos los resultados
        # +
        # todas las diferencias
        # +
        # estado COMPLETADA
        #
        db.commit()


        # ====================================================
        # 10. RESPUESTA
        # ====================================================

        return {
            "ejecucion_id":
                ejecucion.id,

            "importacion_id":
                importacion.id,

            "estado":
                "COMPLETADA",

            "nombre_archivo":
                importacion.nombre_archivo,

            "total_resultados":
                total_procesado,

            "total_diferencias":
                sum(
                    diferencias_contador.values()
                ),

            "estados":
                dict(
                    estados_contador
                ),

            "diferencias_por_tipo":
                dict(
                    diferencias_contador
                ),
        }


    # ========================================================
    # ERROR
    # ========================================================

    except Exception as error:

        # Elimina todos los INSERT de resultados/diferencias
        # realizados desde el último commit.
        db.rollback()


        # Recuperamos las dos filas que sí fueron creadas
        # antes de iniciar el procesamiento.
        ejecucion_error = db.get(
            QAEjecucion,
            ejecucion.id,
        )


        importacion_error = db.get(
            QAImportacion,
            importacion.id,
        )


        ahora = datetime.now(
            timezone.utc
        )


        if ejecucion_error:

            ejecucion_error.estado = (
                "ERROR"
            )

            ejecucion_error.fecha_fin = (
                ahora
            )


        if importacion_error:

            importacion_error.estado = (
                "ERROR"
            )

            importacion_error.fecha_fin = (
                ahora
            )

            importacion_error.mensaje_error = (
                str(error)
            )


        db.commit()


        raise