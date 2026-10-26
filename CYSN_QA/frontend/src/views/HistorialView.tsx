import type { NexoQaController } from "../hooks/useNexoQaController";
import { estiloEncabezadoTabla, estiloCeldaTabla } from "../styles/tableStyles";

interface HistorialViewProps {
  controller: NexoQaController;
}

export function HistorialView({ controller }: HistorialViewProps) {
  const {
    ejecuciones,
    ejecucionSeleccionadaId,
    filtrosHistorialDisponibles,
    filtrosHistorialFormulario,
    setFiltrosHistorialFormulario,
    setPaginaHistorial,
    tamanoPaginaHistorial,
    setTamanoPaginaHistorial,
    paginaQAHistorial,
    cargandoHistorial,
    errorHistorial,
    manejarCambioEjecucion,
    aplicarFiltrosHistorial,
    limpiarFiltrosHistorial,
  } = controller;

  return (
  <section id="seccion-historial">

    <div className="nexo-diff-view-header">

      <div className="nexo-diff-view-title">

        <h2>
          Historial de Correcciones
        </h2>

        <span>
          Trazabilidad de cambios realizados
          sobre las diferencias QA.
        </span>

      </div>


      <div className="nexo-diff-execution">

        <label htmlFor="ejecucionHistorial">
          Ejecución QA
        </label>

        <select
          id="ejecucionHistorial"
          value={
            ejecucionSeleccionadaId
            ?? ""
          }
          onChange={
            manejarCambioEjecucion
          }
        >

          <option value="">
            Selecciona una ejecución
          </option>

          {ejecuciones
            .filter(
              (ejecucion) =>
                ejecucion.estado === "COMPLETADA"
                ||
                ejecucion.estado === "CERRADA"
            )
            .map(
              (ejecucion) => (

                <option
                  key={ejecucion.id}
                  value={ejecucion.id}
                >
                  #
                  {ejecucion.id}
                  {" - "}
                  {ejecucion.nombre}
                </option>

              )
            )}

        </select>

      </div>

    </div>


    {ejecucionSeleccionadaId === null ? (

      <p>
        Selecciona una ejecución QA
        para consultar su historial.
      </p>

    ) : (

      <>

        {/* ============================================== */}
        {/* FILTROS                                        */}
        {/* ============================================== */}

        <div className="nexo-diff-panel">

          <div className="nexo-diff-filter-grid">

            <div className="nexo-filter-field">

              <label htmlFor="codigoBarraHistorial">
                Código de Barra
              </label>

              <input
                id="codigoBarraHistorial"
                type="text"
                value={
                  filtrosHistorialFormulario
                    .codigo_barra
                }
                onChange={
                  (event) =>
                    setFiltrosHistorialFormulario(
                      (actual) => ({
                        ...actual,
                        codigo_barra:
                          event.target.value,
                      })
                    )
                }
                onKeyDown={
                  (event) => {

                    if (
                      event.key === "Enter"
                    ) {

                      aplicarFiltrosHistorial();

                    }

                  }
                }
                placeholder="Ej: 33000055569882"
              />

            </div>


            <div className="nexo-filter-field">

              <label htmlFor="tipoHistorial">
                Tipo
              </label>

              <select
                id="tipoHistorial"
                value={
                  filtrosHistorialFormulario
                    .tipo_diferencia
                }
                onChange={
                  (event) =>
                    setFiltrosHistorialFormulario(
                      (actual) => ({
                        ...actual,
                        tipo_diferencia:
                          event.target.value,
                      })
                    )
                }
              >

                <option value="">
                  Todos
                </option>

                {filtrosHistorialDisponibles
                  ?.tipos
                  .map(
                    (tipo) => (

                      <option
                        key={tipo.codigo}
                        value={tipo.codigo}
                      >
                        {tipo.nombre}
                      </option>

                    )
                  )}

              </select>

            </div>


            <div className="nexo-filter-field">

              <label htmlFor="empresaHistorial">
                Empresa
              </label>

              <select
                id="empresaHistorial"
                value={
                  filtrosHistorialFormulario
                    .empresa
                }
                onChange={
                  (event) =>
                    setFiltrosHistorialFormulario(
                      (actual) => ({
                        ...actual,
                        empresa:
                          event.target.value,

                        sucursal:
                          "",
                      })
                    )
                }
              >

                <option value="">
                  Todas
                </option>

                {filtrosHistorialDisponibles
                  ?.empresas
                  .map(
                    (empresa) => (

                      <option
                        key={empresa}
                        value={empresa}
                      >
                        {empresa}
                      </option>

                    )
                  )}

              </select>

            </div>


            <div className="nexo-filter-field">

              <label htmlFor="sucursalHistorial">
                Sucursal
              </label>

              <select
                id="sucursalHistorial"
                value={
                  filtrosHistorialFormulario
                    .sucursal
                }
                disabled={
                  !filtrosHistorialFormulario
                    .empresa
                }
                onChange={
                  (event) =>
                    setFiltrosHistorialFormulario(
                      (actual) => ({
                        ...actual,
                        sucursal:
                          event.target.value,
                      })
                    )
                }
              >

                <option value="">

                  {
                    filtrosHistorialFormulario
                      .empresa
                      ? "Todas"
                      : "Selecciona una empresa"
                  }

                </option>

                {filtrosHistorialDisponibles
                  ?.sucursales
                  .map(
                    (sucursal) => (

                      <option
                        key={sucursal}
                        value={sucursal}
                      >
                        {sucursal}
                      </option>

                    )
                  )}

              </select>

            </div>


            <div className="nexo-filter-field nexo-filter-field-small">

              <label htmlFor="tamanoHistorial">
                Filas
              </label>

              <select
                id="tamanoHistorial"
                value={
                  tamanoPaginaHistorial
                }
                onChange={
                  (event) => {

                    setTamanoPaginaHistorial(
                      Number(
                        event.target.value
                      )
                    );

                    setPaginaHistorial(
                      1
                    );

                  }
                }
              >

                <option value={50}>
                  50
                </option>

                <option value={100}>
                  100
                </option>

                <option value={200}>
                  200
                </option>

              </select>

            </div>


            <div className="nexo-diff-inline-actions">

              <button
                type="button"
                className="nexo-button-secondary"
                onClick={
                  limpiarFiltrosHistorial
                }
                disabled={
                  cargandoHistorial
                }
              >
                Limpiar
              </button>


              <button
                type="button"
                className="nexo-button-primary"
                onClick={
                  aplicarFiltrosHistorial
                }
                disabled={
                  cargandoHistorial
                }
              >

                {
                  cargandoHistorial
                    ? "Aplicando..."
                    : "Aplicar filtros"
                }

              </button>

            </div>

          </div>

        </div>


        {/* ============================================== */}
        {/* CARGA / ERROR                                  */}
        {/* ============================================== */}

{cargandoHistorial && (

  <div className="nexo-view-state">
    Cargando historial...
  </div>

)}


{errorHistorial && (

  <div className="nexo-view-state is-error">
    {errorHistorial}
  </div>

)}


        {/* ============================================== */}
        {/* RESULTADOS                                    */}
        {/* ============================================== */}

{
  paginaQAHistorial
  &&
  !cargandoHistorial
  &&
  !errorHistorial
  &&
  paginaQAHistorial.total_registros === 0
  &&
  (

    <div className="nexo-view-state is-empty">

      No se encontraron movimientos
      en el historial con los filtros seleccionados.

    </div>

  )
}

{
  paginaQAHistorial
  &&
  !cargandoHistorial
  &&
  !errorHistorial
  &&
  paginaQAHistorial.total_registros > 0
  &&
  (
            <>

              <div className="nexo-table-toolbar">

                <span className="nexo-table-count">

                  {
                    paginaQAHistorial
                      .total_registros
                      .toLocaleString(
                        "es-VE"
                      )
                  }

                  {" "}
                  movimientos

                </span>


                <div className="nexo-pagination">

                  <button
                    type="button"
                    onClick={
                      () =>
                        setPaginaHistorial(
                          (pagina) =>
                            Math.max(
                              1,
                              pagina - 1
                            )
                        )
                    }
                    disabled={
                      paginaQAHistorial.pagina
                      <= 1
                    }
                  >
                    Anterior
                  </button>


                  <strong>
                    Página{" "}
                    {paginaQAHistorial.pagina}
                    {" de "}
                    {paginaQAHistorial.total_paginas}
                  </strong>


                  <button
                    type="button"
                    onClick={
                      () =>
                        setPaginaHistorial(
                          (pagina) =>
                            Math.min(
                              paginaQAHistorial
                                .total_paginas,
                              pagina + 1
                            )
                        )
                    }
                    disabled={
                      paginaQAHistorial
                        .total_paginas === 0
                      ||
                      paginaQAHistorial.pagina
                      >=
                      paginaQAHistorial
                        .total_paginas
                    }
                  >
                    Siguiente
                  </button>

                </div>

              </div>


<div
  style={{
    width: "100%",
    maxHeight: "65vh",
    overflow: "auto",
    border: "1px solid #d7dee8",
    borderRadius: "8px",
  }}
>

  <table
    style={{
      width: "100%",
      minWidth: "1350px",
      borderCollapse: "separate",
      borderSpacing: 0,
      fontSize: "13px",
    }}
  >

    <thead>

      <tr>

        <th style={estiloEncabezadoTabla}>
          Fecha
        </th>

        <th style={estiloEncabezadoTabla}>
          Código Barra
        </th>

        <th style={estiloEncabezadoTabla}>
          Empresa
        </th>

        <th style={estiloEncabezadoTabla}>
          Sucursal
        </th>

        <th style={estiloEncabezadoTabla}>
          Tipo
        </th>

        <th style={estiloEncabezadoTabla}>
          Estado Anterior
        </th>

        <th style={estiloEncabezadoTabla}>
          Estado Nuevo
        </th>

        <th style={estiloEncabezadoTabla}>
          Usuario
        </th>

        <th style={estiloEncabezadoTabla}>
          Observación
        </th>

      </tr>

    </thead>


    <tbody>

      {paginaQAHistorial.historial.map(
        (
          registro,
          indice
        ) => (

          <tr
            key={registro.id}
            style={{
background:
  indice % 2 === 0
    ? "#ffffff"
    : "#f8fafc",
            }}
          >

            <td style={estiloCeldaTabla}>

{
  new Date(
    registro.created_at
  ).toLocaleString(
    "es-VE"
  )
}

            </td>


            <td style={estiloCeldaTabla}>
{registro.codigo_barra}
            </td>


            <td style={estiloCeldaTabla}>

{
  registro.empresa
  ?? "-"
}

            </td>


            <td style={estiloCeldaTabla}>

{
  registro.sucursal
  ?? "-"
}

            </td>


            <td style={estiloCeldaTabla}>
{registro.nombre_diferencia}
            </td>


            <td style={estiloCeldaTabla}>
{registro.estado_anterior}
            </td>


            <td style={estiloCeldaTabla}>
{registro.estado_nuevo}
            </td>


            <td style={estiloCeldaTabla}>

{
  registro.usuario
  ?? "-"
}

            </td>


            <td
style={{
  ...estiloCeldaTabla,
  whiteSpace: "normal",
  minWidth: "220px",
  maxWidth: "320px",
}}
            >

{
  registro.observacion
  ?? "-"
}

            </td>

          </tr>

        )
      )}

    </tbody>

  </table>

</div>

            </>
          )
        }

      </>

    )}

  </section>
  );
}
