from collections import Counter

from datetime import date, datetime, timezone

from decimal import Decimal



from sqlalchemy import (

    and_,

    delete,

    func,

    select,

    text,

)

from sqlalchemy.orm import Session



from app.models.empresa import Empresa

from app.models.inventario_carga import InventarioCarga

from app.models.inventario_detalle import InventarioDetalle

from app.models.qa_ciclo import QACiclo

from app.models.qa_ciclo_sucursal import QACicloSucursal

from app.models.qa_diferencia import QADiferencia

from app.models.qa_ejecucion import QAEjecucion

from app.models.qa_resultado import QAResultado

from app.models.sucursal import Sucursal



from app.services.qa_import_engine import (

    obtener_tipos_diferencia,

)





# ============================================================

# CONFIGURACIÓN

# ============================================================



BATCH_SIZE = 1000

# Máximo de ejecuciones QA generadas por ciclos que se conservan.
# Las ejecuciones históricas importadas (qa_ciclo_id IS NULL)
# no participan en esta retención automática.
RETENCION_EJECUCIONES_CICLO = 3





# ============================================================

# TIPOS DE DIFERENCIA QUE UTILIZA EL MOTOR FASE 2

#

# PRESENCIA_EMPRESA no se utiliza porque este motor parte

# del inventario de cada sucursal y busca su contraparte

# en CREACION.

# ============================================================



TIPOS_REQUERIDOS = {

    "PRESENCIA_CREACION",

    "REFERENCIA",

    "PRECIO_DETAL",

    "TASA_CAMBIO",

    "CODIGO_MARCA",

    "CATEGORIA",

    "PRECIO_PROMOCION",

    "COSTO_INICIAL",

    "COSTO_DOLAR",

}





# ============================================================

# COMPARACIÓN INVENTARIO VS CREACION

#

# Debe mantenerse alineada con:

#

# GET /api/admin/inventarios/comparacion

#

# Reglas:

# - matching por CodigoBarra;

# - una sola fila de CREACION mediante LATERAL;

# - solo filas vigentes (vigente = TRUE, ver app/sync/creacion.py);

# - se toma el registro_id más reciente;

# - comparación NULL-safe con IS DISTINCT FROM;

# - 8 atributos funcionales.

# ============================================================



COMPARACION_SQL = """

SELECT

    I.id AS inventario_detalle_id,



    COALESCE(

        I.numero_fila_archivo,

        ROW_NUMBER() OVER (

            ORDER BY I.id

        )::INTEGER

    ) AS numero_fila_origen,



    I.codigo_barra,



    C.registro_id AS registro_id_creacion,

    C.codigo_barra AS codigo_barra_creacion,

    C.sucursal_origen AS sucursal_origen_creacion,



    I.referencia AS referencia_empresa,

    C.referencia AS referencia_creacion,



    I.precio_detal_mas_iva AS precio_detal_empresa,



    I.precio_detal_usd_mas_iva

        AS precio_detal_usd_empresa,



    C.precio_detal_usd_mas_iva

        AS precio_detal_usd_creacion,



    I.tasa_cambio AS tasa_cambio_empresa,

    C.tasa_cambio AS tasa_cambio_creacion,



    I.codigo_marca AS codigo_marca_empresa,

    C.codigo_marca_origen AS codigo_marca_creacion,



    I.codigo_categoria AS categoria_empresa,

    C.codigo_categoria AS categoria_creacion,



    I.precio_promocion AS precio_promocion_empresa,

    C.precio_promocion AS precio_promocion_creacion,



    I.costo_inicial AS costo_inicial_empresa,

    C.costo_inicial AS costo_inicial_creacion,



    I.costo_dolar AS costo_dolar_empresa,

    C.costo_dolar AS costo_dolar_creacion,



    I.status AS status_empresa,

    C.status_origen AS status_creacion,



    I.existencia AS existencia_empresa,



    (

        I.referencia

        IS DISTINCT FROM C.referencia

    ) AS diferencia_referencia,



    (

        I.precio_detal_usd_mas_iva

        IS DISTINCT FROM C.precio_detal_usd_mas_iva

    ) AS diferencia_precio_detal,



    (

        I.tasa_cambio

        IS DISTINCT FROM C.tasa_cambio

    ) AS diferencia_tasa_cambio,



    (

        I.codigo_marca

        IS DISTINCT FROM C.codigo_marca_origen

    ) AS diferencia_codigo_marca,



(

    :evaluar_categoria

    AND I.codigo_categoria

        IS DISTINCT FROM C.codigo_categoria

) AS diferencia_categoria,



(

    :evaluar_precio_promocion

    AND I.precio_promocion

        IS DISTINCT FROM C.precio_promocion

) AS diferencia_precio_promocion,



(

    :evaluar_costo_inicial

    AND I.costo_inicial

        IS DISTINCT FROM C.costo_inicial

) AS diferencia_costo_inicial,



(

    :evaluar_costo_dolar

    AND I.costo_dolar

        IS DISTINCT FROM C.costo_dolar

) AS diferencia_costo_dolar,



    CASE

        WHEN C.codigo_barra IS NULL

            THEN 'NO_EN_CREACION'



        WHEN

            I.referencia

                IS NOT DISTINCT FROM C.referencia



            AND I.precio_detal_usd_mas_iva

                IS NOT DISTINCT FROM C.precio_detal_usd_mas_iva



            AND I.tasa_cambio

                IS NOT DISTINCT FROM C.tasa_cambio



            AND I.codigo_marca

                IS NOT DISTINCT FROM C.codigo_marca_origen



AND (

    NOT :evaluar_categoria

    OR I.codigo_categoria

        IS NOT DISTINCT FROM C.codigo_categoria

)



AND (

    NOT :evaluar_precio_promocion

    OR I.precio_promocion

        IS NOT DISTINCT FROM C.precio_promocion

)



AND (

    NOT :evaluar_costo_inicial

    OR I.costo_inicial

        IS NOT DISTINCT FROM C.costo_inicial

)



AND (

    NOT :evaluar_costo_dolar

    OR I.costo_dolar

        IS NOT DISTINCT FROM C.costo_dolar

)



            THEN 'IGUAL'



        ELSE 'DIFERENCIA'

    END AS estado_comparacion



FROM inventario_detalle AS I



LEFT JOIN LATERAL

(

    SELECT

        C0.registro_id,

        C0.codigo_barra,

        C0.sucursal_origen,

        C0.referencia,

        C0.precio_detal_usd_mas_iva,

        C0.tasa_cambio,

        C0.codigo_marca_origen,

        C0.codigo_categoria,

        C0.precio_promocion,

        C0.costo_inicial,

        C0.costo_dolar,

        C0.status_origen



    FROM creacion AS C0



    WHERE C0.codigo_barra = I.codigo_barra

      AND C0.vigente = TRUE



    ORDER BY C0.registro_id DESC



    LIMIT 1

) AS C

    ON TRUE



WHERE I.inventario_carga_id = :carga_id



ORDER BY

    I.id ASC

"""





# ============================================================

# NORMALIZAR VALOR PARA qa_diferencia

# ============================================================



def _valor_texto(

    valor,

) -> str | None:



    if valor is None:

        return None



    return str(valor)





# ============================================================

# DIFERENCIA NUMÉRICA

#

# Convención conservada:

#

# valor empresa - valor CREACION

# ============================================================



def _calcular_diferencia_numerica(

    valor_empresa,

    valor_creacion,

) -> Decimal | None:



    if (

        valor_empresa is None

        or valor_creacion is None

    ):

        return None



    return (

        Decimal(str(valor_empresa))

        - Decimal(str(valor_creacion))

    )





# ============================================================

# PARTICIPANTES + CARGA ACTUAL

# ============================================================



def _obtener_participantes_ciclo(

    db: Session,

    ciclo_id: int,

):



    consulta = (

        select(

            QACicloSucursal,

            Sucursal,

            Empresa,

            InventarioCarga,

        )

        .join(

            Sucursal,

            Sucursal.id

            == QACicloSucursal.sucursal_id,

        )

        .join(

            Empresa,

            Empresa.id

            == Sucursal.empresa_id,

        )

        .outerjoin(

            InventarioCarga,

            and_(

                InventarioCarga.qa_ciclo_sucursal_id

                == QACicloSucursal.id,



                InventarioCarga.es_actual.is_(True),

            ),

        )

        .where(

            QACicloSucursal.qa_ciclo_id

            == ciclo_id

        )

        .order_by(

            Empresa.nombre.asc(),

            Sucursal.nombre.asc(),

        )

    )



    return db.execute(

        consulta

    ).all()





# ============================================================

# VALIDAR PARTICIPANTES

#

# Cada sucursal participante debe tener:

# - estado_recepcion VALIDADO;

# - una carga actual;

# - carga actual VALIDADO;

# - inventario_detalle consistente con registros_validos.

# ============================================================



def _validar_participantes(

    db: Session,

    participantes,

):

    if not participantes:

        raise ValueError(

            "El ciclo QA no tiene sucursales participantes."

        )



    participantes_procesables = []

    sucursales_omitidas = 0



    for (

        participacion,

        sucursal,

        empresa,

        carga,

    ) in participantes:



        # ====================================================

        # SUCURSALES QUE NO PARTICIPAN EN ESTA EJECUCIÓN

        #

        # Una sucursal se omite si:

        # - todavía no está VALIDADA;

        # - no tiene inventario cargado;

        # - su carga actual todavía no está VALIDADA.

        #

        # Esto permite ejecutar QA solamente con los

        # inventarios que realmente se desean analizar.

        # ====================================================



        if participacion.estado_recepcion != "VALIDADO":

            sucursales_omitidas += 1

            continue



        if carga is None:

            sucursales_omitidas += 1

            continue



        if carga.estado != "VALIDADO":

            sucursales_omitidas += 1

            continue



        # ====================================================

        # INTEGRIDAD DE UNA CARGA VALIDADA

        #

        # Si una carga sí va a participar, entonces sus datos

        # deben ser consistentes.

        # ====================================================



        total_detalles = int(

            db.scalar(

                select(

                    func.count(

                        InventarioDetalle.id

                    )

                )

                .where(

                    InventarioDetalle.inventario_carga_id

                    == carga.id

                )

            )

            or 0

        )



        if total_detalles != carga.registros_validos:

            raise ValueError(

                "La carga actual de la sucursal "

                f"{sucursal.nombre} "

                "presenta una inconsistencia: "

                f"registros_validos={carga.registros_validos}, "

                f"inventario_detalle={total_detalles}."

            )



        participantes_procesables.append(

            (

                participacion,

                sucursal,

                empresa,

                carga,

            )

        )



    if not participantes_procesables:

        raise ValueError(

            "El ciclo QA no tiene ninguna sucursal "

            "con inventario VALIDADO para procesar."

        )



    return (

        participantes_procesables,

        sucursales_omitidas,

    )



# ============================================================

# DISPONIBILIDAD DE ATRIBUTOS POR CARGA

#

# Compatibilidad con cargas históricas:

#

# Si TODOS los registros de una carga tienen NULL en uno de

# los atributos incorporados posteriormente, ese atributo

# se considera NO DISPONIBLE y no participa en el QA.

#

# Si existe al menos un valor no NULL, el atributo sí se

# considera disponible y se compara normalmente.

# ============================================================



def _obtener_disponibilidad_atributos_carga(

    db: Session,

    carga_id: int,

) -> dict[str, bool]:



    fila = db.execute(

        select(

            func.count(

                InventarioDetalle.id

            ).label(

                "total"

            ),



            func.count(

                InventarioDetalle.codigo_categoria

            ).label(

                "categoria"

            ),



            func.count(

                InventarioDetalle.precio_promocion

            ).label(

                "precio_promocion"

            ),



            func.count(

                InventarioDetalle.costo_inicial

            ).label(

                "costo_inicial"

            ),



            func.count(

                InventarioDetalle.costo_dolar

            ).label(

                "costo_dolar"

            ),

        )

        .where(

            InventarioDetalle.inventario_carga_id

            == carga_id

        )

    ).mappings().one()



    return {

        "CATEGORIA":

            int(fila["categoria"] or 0) > 0,



        "PRECIO_PROMOCION":

            int(fila["precio_promocion"] or 0) > 0,



        "COSTO_INICIAL":

            int(fila["costo_inicial"] or 0) > 0,



        "COSTO_DOLAR":

            int(fila["costo_dolar"] or 0) > 0,

    }





# ============================================================

# CONSTRUIR qa_resultado

# ============================================================



def _construir_resultado(

    ejecucion_id: int,

    fila,

    empresa: Empresa,

    sucursal: Sucursal,

) -> QAResultado:



    return QAResultado(

        qa_ejecucion_id=ejecucion_id,



        # Fase 2 no utiliza CSV QA intermedio.

        qa_importacion_id=None,



        numero_fila_origen=int(

            fila["numero_fila_origen"]

        ),



        # Corresponde al origen almacenado en creacion.

        sucursal_origen=(

            fila["sucursal_origen_creacion"]

        ),



        # No se reutiliza semántica histórica no definida.

        estado_creacion=None,



        # Para Fase 2 la empresa proviene del catálogo real.

        tabla_empresa=empresa.nombre,



        codigo_barra=fila["codigo_barra"],



        referencia_creacion=(

            fila["referencia_creacion"]

        ),



        codigo_marca_creacion=(

            fila["codigo_marca_creacion"]

        ),



        precio_detal_usd_creacion=(

            fila["precio_detal_usd_creacion"]

        ),



        tasa_cambio_creacion=(

            fila["tasa_cambio_creacion"]

        ),



        status_creacion=(

            fila["status_creacion"]

        ),



        sucursal_empresa=sucursal.nombre,



        referencia_empresa=(

            fila["referencia_empresa"]

        ),



        codigo_marca_empresa=(

            fila["codigo_marca_empresa"]

        ),



        precio_detal_empresa=(

            fila["precio_detal_empresa"]

        ),



        precio_detal_usd_empresa=(

            fila["precio_detal_usd_empresa"]

        ),



        tasa_cambio_empresa=(

            fila["tasa_cambio_empresa"]

        ),



        # No existe una definición aprobada para un precio

        # calculado diferente del precio almacenado.

        precio_detal_usd_calculado_empresa=None,



        status_empresa=(

            fila["status_empresa"]

        ),



        existencia_empresa=(

            fila["existencia_empresa"]

        ),



        categoria_creacion=(

            fila["categoria_creacion"]

        ),



        categoria_empresa=(

            fila["categoria_empresa"]

        ),



        precio_promocion_creacion=(

            fila["precio_promocion_creacion"]

        ),



        precio_promocion_empresa=(

            fila["precio_promocion_empresa"]

        ),



        costo_inicial_creacion=(

            fila["costo_inicial_creacion"]

        ),



        costo_inicial_empresa=(

            fila["costo_inicial_empresa"]

        ),



        costo_dolar_creacion=(

            fila["costo_dolar_creacion"]

        ),



        costo_dolar_empresa=(

            fila["costo_dolar_empresa"]

        ),



        estado_comparacion=(

            fila["estado_comparacion"]

        ),

    )





# ============================================================

# CREAR DIFERENCIAS DE UN RESULTADO

# ============================================================



def _crear_diferencias_resultado(

    resultado: QAResultado,

    fila,

    tipos: dict[str, int],

) -> list[tuple[QADiferencia, str]]:



    diferencias: list[

        tuple[

            QADiferencia,

            str,

        ]

    ] = []





    # ========================================================

    # NO EN CREACION

    #

    # No se generan además las 8 diferencias de atributos.

    # La ausencia se representa con una sola diferencia

    # de presencia.

    # ========================================================



    if fila["registro_id_creacion"] is None:



        diferencias.append(

            (

                QADiferencia(

                    qa_resultado_id=resultado.id,



                    tipo_diferencia_id=(

                        tipos["PRESENCIA_CREACION"]

                    ),



                    valor_creacion="NO ENCONTRADO",



                    valor_empresa="PRESENTE",



                    diferencia_numerica=None,

                ),

                "PRESENCIA_CREACION",

            )

        )



        return diferencias





    # ========================================================

    # IGUAL

    # ========================================================



    if fila["estado_comparacion"] == "IGUAL":

        return diferencias





    # ========================================================

    # MAPA DE LOS 8 ATRIBUTOS

    #

    # (

    #   codigo tipo,

    #   bandera diferencia,

    #   valor CREACION,

    #   valor empresa,

    #   es numérico

    # )

    # ========================================================



    atributos = (

        (

            "REFERENCIA",

            "diferencia_referencia",

            "referencia_creacion",

            "referencia_empresa",

            False,

        ),

        (

            "PRECIO_DETAL",

            "diferencia_precio_detal",

            "precio_detal_usd_creacion",

            "precio_detal_usd_empresa",

            True,

        ),

        (

            "TASA_CAMBIO",

            "diferencia_tasa_cambio",

            "tasa_cambio_creacion",

            "tasa_cambio_empresa",

            True,

        ),

        (

            "CODIGO_MARCA",

            "diferencia_codigo_marca",

            "codigo_marca_creacion",

            "codigo_marca_empresa",

            False,

        ),

        (

            "CATEGORIA",

            "diferencia_categoria",

            "categoria_creacion",

            "categoria_empresa",

            False,

        ),

        (

            "PRECIO_PROMOCION",

            "diferencia_precio_promocion",

            "precio_promocion_creacion",

            "precio_promocion_empresa",

            True,

        ),

        (

            "COSTO_INICIAL",

            "diferencia_costo_inicial",

            "costo_inicial_creacion",

            "costo_inicial_empresa",

            True,

        ),

        (

            "COSTO_DOLAR",

            "diferencia_costo_dolar",

            "costo_dolar_creacion",

            "costo_dolar_empresa",

            True,

        ),

    )





    for (

        codigo_tipo,

        campo_diferencia,

        campo_creacion,

        campo_empresa,

        es_numerico,

    ) in atributos:



        if not fila[campo_diferencia]:

            continue



        valor_creacion = fila[

            campo_creacion

        ]



        valor_empresa = fila[

            campo_empresa

        ]



        diferencia_numerica = (

            _calcular_diferencia_numerica(

                valor_empresa,

                valor_creacion,

            )

            if es_numerico

            else None

        )



        diferencias.append(

            (

                QADiferencia(

                    qa_resultado_id=resultado.id,



                    tipo_diferencia_id=(

                        tipos[codigo_tipo]

                    ),



                    valor_creacion=(

                        _valor_texto(

                            valor_creacion

                        )

                    ),



                    valor_empresa=(

                        _valor_texto(

                            valor_empresa

                        )

                    ),



                    diferencia_numerica=(

                        diferencia_numerica

                    ),

                ),

                codigo_tipo,

            )

        )





    return diferencias





# ============================================================

# PERSISTIR UN LOTE

#

# Se utilizan objetos ORM porque después del flush cada

# QAResultado ya posee su id real, evitando relacionar

# sucursales distintas únicamente mediante numero_fila_origen.

# ============================================================



def _persistir_lote(

    db: Session,

    lote,

    tipos: dict[str, int],

) -> tuple[

    int,

    int,

    Counter,

]:



    if not lote:

        return (

            0,

            0,

            Counter(),

        )





    resultados = [

        item[0]

        for item in lote

    ]





    db.add_all(

        resultados

    )



    # Aquí se obtienen los IDs reales de qa_resultado.

    db.flush()





    diferencias_objetos = []



    diferencias_contador = Counter()





    for (

        resultado,

        fila,

    ) in lote:



        diferencias_fila = (

            _crear_diferencias_resultado(

                resultado=resultado,

                fila=fila,

                tipos=tipos,

            )

        )



        for (

            diferencia,

            codigo_tipo,

        ) in diferencias_fila:



            diferencias_objetos.append(

                diferencia

            )



            diferencias_contador[

                codigo_tipo

            ] += 1





    if diferencias_objetos:



        db.add_all(

            diferencias_objetos

        )



        db.flush()





    return (

        len(resultados),

        len(diferencias_objetos),

        diferencias_contador,

    )





# ============================================================

# RETENCIÓN AUTOMÁTICA DE EJECUCIONES DE CICLO

#

# Conserva únicamente las N ejecuciones COMPLETADA/CERRADA más

# recientes que hayan sido generadas desde Fase 2

# (qa_ciclo_id IS NOT NULL).

#

# Las ejecuciones históricas importadas de Fase 1 se preservan.

# Al borrar qa_ejecucion, PostgreSQL elimina en cascada sus

# qa_resultado -> qa_diferencia -> qa_correccion relacionados.

# ============================================================



def _aplicar_retencion_ejecuciones_ciclo(

    db: Session,

    conservar: int = RETENCION_EJECUCIONES_CICLO,

) -> list[int]:


    if conservar <= 0:

        return []


    ids_ejecuciones = list(

        db.scalars(

            select(

                QAEjecucion.id

            )

            .where(

                QAEjecucion.qa_ciclo_id.is_not(None),

                QAEjecucion.estado.in_(

                    (

                        "COMPLETADA",

                        "CERRADA",

                    )

                ),

            )

            .order_by(

                QAEjecucion.id.desc()

            )

        ).all()

    )


    ids_eliminar = (

        ids_ejecuciones[conservar:]

    )


    if not ids_eliminar:

        return []


    db.execute(

        delete(

            QAEjecucion

        ).where(

            QAEjecucion.id.in_(

                ids_eliminar

            )

        )

    )


    return [

        int(ejecucion_id)

        for ejecucion_id in ids_eliminar

    ]




# ============================================================

# EJECUTAR QA DE UN CICLO

#

# IMPORTANTE:

#

# - No crea qa_importacion.

# - qa_resultado.qa_importacion_id queda NULL.

# - No realiza commits por sucursal ni por lote.

# - Resultados + diferencias + ejecución COMPLETADA se

#   confirman juntos.

# - Si ocurre un error se hace rollback completo.

# - Después del rollback se registra únicamente una

#   qa_ejecucion en ERROR para mantener trazabilidad.

# ============================================================



def ejecutar_qa_ciclo(

    db: Session,

    ciclo_id: int,

    nombre_ejecucion: str | None = None,

    fecha_referencia: date | None = None,

    descripcion: str | None = None,

) -> dict:



    # ========================================================

    # 1. OBTENER CICLO

    # ========================================================



    ciclo = db.get(

        QACiclo,

        ciclo_id,

    )



    if ciclo is None:

        raise ValueError(

            "El ciclo QA indicado no existe."

        )





    # ========================================================

    # 2. PARTICIPANTES + CARGAS ACTUALES

    # ========================================================



    participantes = (

        _obtener_participantes_ciclo(

            db=db,

            ciclo_id=ciclo.id,

        )

    )





    # ========================================================

    # 3. VALIDAR QUE TODO ESTÉ LISTO

    # ========================================================



    (

        participantes,

        sucursales_omitidas,

    ) = _validar_participantes(

        db=db,

        participantes=participantes,

    )





    # ========================================================

    # 4. CATÁLOGO DE TIPOS DE DIFERENCIA

    # ========================================================



    tipos = obtener_tipos_diferencia(

        db

    )



    faltantes = (

        TIPOS_REQUERIDOS

        - set(

            tipos.keys()

        )

    )



    if faltantes:

        raise ValueError(

            "Faltan tipos de diferencia "

            "requeridos en PostgreSQL: "

            + ", ".join(

                sorted(

                    faltantes

                )

            )

        )





    # ========================================================

    # 5. NOMBRE DE EJECUCIÓN

    # ========================================================



    nombre_final = (

        nombre_ejecucion.strip()

        if (

            nombre_ejecucion is not None

            and nombre_ejecucion.strip()

        )

        else f"{ciclo.nombre} - QA"

    )



    if len(nombre_final) > 180:

        raise ValueError(

            "El nombre de la ejecución QA "

            "no puede superar 180 caracteres."

        )





    # ========================================================

    # 6. CREAR EJECUCIÓN

    #

    # Todavía NO se hace commit.

    # ========================================================



    ejecucion = QAEjecucion(

        qa_ciclo_id=ciclo.id,

        nombre=nombre_final,

        fecha_referencia=fecha_referencia,

        descripcion=descripcion,

        estado="PROCESANDO",

    )





    estados_contador = Counter()



    diferencias_contador = Counter()



    total_resultados = 0



    total_diferencias = 0



    sucursales_procesadas = 0





    try:



        db.add(

            ejecucion

        )



        db.flush()





        # ====================================================

        # 7. PROCESAR CADA SUCURSAL

        # ====================================================



        for (

            _participacion,

            sucursal,

            empresa,

            carga,

        ) in participantes:



            disponibilidad = (

                _obtener_disponibilidad_atributos_carga(

                    db=db,

                    carga_id=carga.id,

                )

            )



            resultado_sql = db.execute(

                text(

                    COMPARACION_SQL

                ),

                {

                    "carga_id":

                        carga.id,

                    "evaluar_categoria":

                        disponibilidad[

                            "CATEGORIA"

                        ],

                    "evaluar_precio_promocion":

                        disponibilidad[

                            "PRECIO_PROMOCION"

                        ],

                    "evaluar_costo_inicial":

                        disponibilidad[

                            "COSTO_INICIAL"

                        ],

                    "evaluar_costo_dolar":

                        disponibilidad[

                            "COSTO_DOLAR"

                        ],

                    },

            ).mappings()





            lote = []





            for fila in resultado_sql:



                resultado = (

                    _construir_resultado(

                        ejecucion_id=ejecucion.id,

                        fila=fila,

                        empresa=empresa,

                        sucursal=sucursal,

                    )

                )





                lote.append(

                    (

                        resultado,

                        fila,

                    )

                )





                estados_contador[

                    fila["estado_comparacion"]

                ] += 1





                if len(lote) >= BATCH_SIZE:



                    (

                        resultados_insertados,

                        diferencias_insertadas,

                        diferencias_lote,

                    ) = _persistir_lote(

                        db=db,

                        lote=lote,

                        tipos=tipos,

                    )



                    total_resultados += (

                        resultados_insertados

                    )



                    total_diferencias += (

                        diferencias_insertadas

                    )



                    diferencias_contador.update(

                        diferencias_lote

                    )



                    lote = []





            # ================================================

            # ÚLTIMO LOTE DE LA SUCURSAL

            # ================================================



            if lote:



                (

                    resultados_insertados,

                    diferencias_insertadas,

                    diferencias_lote,

                ) = _persistir_lote(

                    db=db,

                    lote=lote,

                    tipos=tipos,

                )



                total_resultados += (

                    resultados_insertados

                )



                total_diferencias += (

                    diferencias_insertadas

                )



                diferencias_contador.update(

                    diferencias_lote

                )





            sucursales_procesadas += 1





        # ====================================================

        # 8. COMPLETAR EJECUCIÓN

        # ====================================================



        ahora = datetime.now(

            timezone.utc

        )



        ejecucion.estado = (

            "COMPLETADA"

        )



        ejecucion.fecha_fin = (

            ahora

        )





        # ====================================================

        # 9. RETENCIÓN AUTOMÁTICA

        #

        # Se conservan únicamente las 3 ejecuciones de ciclo

        # COMPLETADA/CERRADA más recientes. Las ejecuciones

        # históricas importadas se preservan.

        # ====================================================



        ejecuciones_eliminadas = (

            _aplicar_retencion_ejecuciones_ciclo(

                db=db,

            )

        )




        # ====================================================

        # 10. COMMIT ATÓMICO

        #

        # Se confirman juntos:

        #

        # qa_ejecucion

        # qa_resultado

        # qa_diferencia

        # retención de ejecuciones antiguas de ciclo

        # ====================================================



        db.commit()



        db.refresh(

            ejecucion

        )





        # ====================================================

        # 11. RESPUESTA

        # ====================================================



        return {

            "ejecucion_id":

                ejecucion.id,



            "qa_ciclo_id":

                ciclo.id,



            "estado":

                ejecucion.estado,



            "nombre":

                ejecucion.nombre,



            "sucursales_procesadas":

                sucursales_procesadas,



            "sucursales_omitidas":

                sucursales_omitidas,



            "ejecuciones_eliminadas":

                ejecuciones_eliminadas,



            "total_resultados":

                total_resultados,



            "total_diferencias":

                total_diferencias,



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



        # Elimina completamente:

        #

        # - ejecución PROCESANDO;

        # - resultados parciales;

        # - diferencias parciales.

        db.rollback()





        # ====================================================

        # REGISTRAR ÚNICAMENTE TRAZABILIDAD DEL ERROR

        # ====================================================



        descripcion_error = (

            (

                f"{descripcion}\n\n"

                f"ERROR: {error}"

            )

            if descripcion

            else f"ERROR: {error}"

        )





        ejecucion_error = QAEjecucion(

            qa_ciclo_id=ciclo.id,

            nombre=nombre_final,

            fecha_referencia=fecha_referencia,

            descripcion=descripcion_error,

            estado="ERROR",

            fecha_fin=datetime.now(

                timezone.utc

            ),

        )





        try:



            db.add(

                ejecucion_error

            )



            db.commit()



        except Exception:



            db.rollback()





        raise
