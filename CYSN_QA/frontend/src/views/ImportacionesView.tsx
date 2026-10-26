import type { NexoQaController } from "../hooks/useNexoQaController";
import { estiloEncabezadoTabla } from "../styles/tableStyles";

interface ImportacionesViewProps {
  controller: NexoQaController;
}

export function ImportacionesView({ controller }: ImportacionesViewProps) {
  const {
    ejecuciones,
    cargando,
    archivoQA,
    validandoArchivo,
    resultadoValidacion,
    nombreEjecucion,
    setNombreEjecucion,
    fechaReferencia,
    setFechaReferencia,
    descripcion,
    setDescripcion,
    importando,
    resultadoImportacion,
    error,
    manejarSeleccionArchivo,
    manejarValidarArchivo,
    manejarImportarQA,
  } = controller;

  return (
    <>
      {/* ==================================================== */}
      {/* IMPORTAR QA                                          */}
      {/* ==================================================== */}

    <section>

        <h2>
            Importar QA existente
        </h2>


        <input
            type="file"
            accept=".csv,text/csv"
            onChange={
            manejarSeleccionArchivo
        }
            disabled={
            importando
            }
        />


        {archivoQA && (

        <div>

            <p>
                Archivo:{" "}

            <strong>
                {archivoQA.name}
            </strong>
            </p>


            <p>
                Tamaño:{" "}

            {(
                archivoQA.size
                / 1024
                / 1024
            ).toFixed(2)}{" "}

                MB
            </p>

        </div>

        )}


        <button
            type="button"
            onClick={
            manejarValidarArchivo
        }
            disabled={
            !archivoQA
            ||
            validandoArchivo
            ||
            importando
        }
    >

        {validandoArchivo
            ? "Validando..."
            : "Validar archivo"}

        </button>

    </section>


      {/* ==================================================== */}
      {/* ARCHIVO VALIDADO                                     */}
      {/* ==================================================== */}

    {resultadoValidacion && (

        <section>

        <h2>
            Archivo válido
        </h2>


        <p>
            Registros:{" "}

            <strong>

            {resultadoValidacion
                .total_registros
                .toLocaleString(
                "es-VE"
                )}

            </strong>

        </p>


        <p>
            Columnas:{" "}

            {
            resultadoValidacion
                .total_columnas
            }

        </p>


        <h3>
            Estados
        </h3>


        <ul>

            <li>

            Iguales:{" "}

            {(
                resultadoValidacion
                    .estados["IGUAL"]
                ?? 0
            ).toLocaleString(
                "es-VE"
            )}

            </li>


            <li>

                Diferencias:{" "}

            {(
                resultadoValidacion
                    .estados[
                    "DIFERENCIA"
                ]
                ?? 0
            ).toLocaleString(
                "es-VE"
            )}

            </li>


            <li>

                No en empresas:{" "}

            {(
                resultadoValidacion
                    .estados[
                    "NO SE ENCONTRO EN EMPRESAS"
                ]
                ?? 0
            ).toLocaleString(
                "es-VE"
            )}

            </li>


            <li>

                No en Creación:{" "}

                {(
                resultadoValidacion
                    .estados[
                    "NO SE ENCONTRO EN CREACION"
                    ]
                ?? 0
            ).toLocaleString(
                "es-VE"
            )}

            </li>

        </ul>


        <h3>
            Datos de la ejecución
        </h3>


        <div>

            <label htmlFor="nombreEjecucion">
                Nombre
            </label>

            <br />

            <input
                id="nombreEjecucion"
                type="text"
                value={
                nombreEjecucion
            }
            onChange={
                (event) =>
                    setNombreEjecucion(
                    event.target.value
                )
            }
                disabled={
                importando
            }
            />

        </div>


        <div>

            <label htmlFor="fechaReferencia">
                Fecha de referencia
            </label>

            <br />

            <input
                id="fechaReferencia"
                type="date"
                value={
                fechaReferencia
            }
                onChange={
                (event) =>
                    setFechaReferencia(
                    event.target.value
                )
            }
                disabled={
                    importando
                }
            />

        </div>


        <div>

            <label htmlFor="descripcion">
                Descripción
            </label>

            <br />

            <textarea
                id="descripcion"
                value={
                descripcion
            }
                onChange={
                (event) =>
                    setDescripcion(
                    event.target.value
                )
            }
            rows={4}
            disabled={
                importando
                }
            />

        </div>


        <button
            type="button"
            onClick={
                manejarImportarQA
            }
            disabled={
                importando
            }
        >

            {importando
                ? "Importando QA..."
                : "Importar QA"}

            </button>

        </section>

    )}


      {/* ==================================================== */}
      {/* RESULTADO IMPORTACIÓN                                */}
      {/* ==================================================== */}

    {resultadoImportacion && (

        <section>

        <h2>
            Importación completada
        </h2>


        <p>
            Ejecución:{" "}

            <strong>
                #
                {
                resultadoImportacion
                    .ejecucion_id
                }
            </strong>

        </p>


        <p>
            Resultados:{" "}

            {
                resultadoImportacion
                .total_resultados
                .toLocaleString(
                "es-VE"
                )
            }

        </p>


        <p>
            Errores individuales:{" "}

            {
                resultadoImportacion
                .total_diferencias
                .toLocaleString(
                "es-VE"
                )
            }

        </p>

        </section>

    )}


      {/* ==================================================== */}
      {/* ERROR GENERAL                                        */}
      {/* ==================================================== */}

    {error && (

        <section>

        <p>
            {error}
        </p>

        </section>

    )}

    <section id="seccion-ejecuciones">

        <h2>
            Ejecuciones QA
        </h2>


        {cargando ? (

        <p>
            Cargando ejecuciones...
        </p>

        ) : ejecuciones.length === 0 ? (

        <p>
            Todavía no existen ejecuciones.
        </p>

        ) : (

        <table>

<thead>

  <tr>

    <th style={estiloEncabezadoTabla}>
      ID
    </th>

    <th style={estiloEncabezadoTabla}>
      Nombre
    </th>

    <th style={estiloEncabezadoTabla}>
      Fecha de referencia
    </th>

    <th style={estiloEncabezadoTabla}>
      Estado
    </th>

    <th style={estiloEncabezadoTabla}>
      Descripción
    </th>

  </tr>

</thead>


            <tbody>

            {ejecuciones.map(
                (ejecucion) => (

                <tr
                    key={
                        ejecucion.id
                    }
                >

                    <td>
                        {ejecucion.id}
                    </td>


                    <td>
                    {ejecucion.nombre}
                    </td>


                    <td>
                    {
                        ejecucion
                        .fecha_referencia
                        ??
                        "Sin fecha"
                    }
                    </td>


                    <td>
                    {
                        ejecucion.estado
                    }
                    </td>


                    <td>
                    {
                        ejecucion.descripcion
                        ??
                        "Sin descripción"
                    }
                    </td>

                </tr>

                )
            )}

            </tbody>

        </table>

        )}

        </section>
    </>
  );
}
