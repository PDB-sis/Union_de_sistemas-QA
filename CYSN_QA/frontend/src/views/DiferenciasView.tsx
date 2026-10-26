import type { NexoQaController } from "../hooks/useNexoQaController";
import { estiloEncabezadoTabla, estiloCeldaTabla } from "../styles/tableStyles";

interface DiferenciasViewProps {
  controller: NexoQaController;
}

export function DiferenciasView({ controller }: DiferenciasViewProps) {
  const {
    menuActivo,
    ejecuciones,
    ejecucionSeleccionadaId,
    filtrosDiferenciasDisponibles,
    estadoCorreccionSeleccionado,
    setEstadoCorreccionSeleccionado,
    codigoBarraDiferenciasFormulario,
    setCodigoBarraDiferenciasFormulario,
    empresaDiferencias,
    setEmpresaDiferencias,
    sucursalDiferencias,
    setSucursalDiferencias,
    setPaginaDiferencias,
    tamanoPaginaDiferencias,
    setTamanoPaginaDiferencias,
    paginaQADiferencias,
    cargandoDiferencias,
    errorDiferencias,
    diferenciaActualizandoId,
    manejarCambioEjecucion,
    formatearNumero,
    aplicarFiltrosDiferencias,
    limpiarFiltrosDiferencias,
    manejarCambioEstadoDiferencia,
    tituloDiferencias,
  } = controller;

  return (
    <>
        {/* ==================================================== */}
{/* MÓDULO DIFERENCIAS                                   */}
{/* ==================================================== */}

<div id="seccion-diferencias">

  {/* ================================================== */}
  {/* CABECERA COMPACTA DE LA VISTA                     */}
  {/* ================================================== */}

  <div className="nexo-diff-view-header">

    <div className="nexo-diff-view-title">

      <h2>
        {tituloDiferencias}
      </h2>

      <span>
        Revisa y gestiona las inconsistencias de la ejecución seleccionada
      </span>

    </div>


    <div className="nexo-diff-execution">

      <label htmlFor="ejecucionDiferencias">
        Ejecución QA
      </label>

      <select
        id="ejecucionDiferencias"
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
                key={
                  ejecucion.id
                }
                value={
                  ejecucion.id
                }
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
      Selecciona una ejecución QA para consultar sus diferencias.
    </p>

  ) : (

    <>

      {/* ================================================== */}
      {/* PANEL DE CONTROL DE DIFERENCIAS                    */}
      {/* ================================================== */}

      <div className="nexo-diff-panel">


        {/* ================================================= */}
        {/* CABECERA                                          */}
        {/* ================================================= */}

        <div className="nexo-diff-header nexo-diff-header-compact">

          <div>

            <h3>
              Filtros
            </h3>

          </div>


          <div className="nexo-diff-counter">

            {
              paginaQADiferencias
                ? `${paginaQADiferencias.total_registros.toLocaleString("es-VE")} diferencias`
                : "Cargando..."
            }

          </div>

        </div>


        {/* ================================================= */}
        {/* ESTADO DE CORRECCIÓN                              */}
        {/* ================================================= */}

        {menuActivo !== "corregidos" && (

          <>

        <div className="nexo-diff-group">

          <div className="nexo-diff-label">
            Estado
          </div>


          <div className="nexo-chip-container">

            <button
              type="button"
              className={
                estadoCorreccionSeleccionado === ""
                  ? "nexo-filter-chip is-active"
                  : "nexo-filter-chip"
              }
              onClick={
                () => {

                  setEstadoCorreccionSeleccionado(
                    ""
                  );

                  setPaginaDiferencias(
                    1
                  );

                }
              }
            >
              Todas
            </button>


            {filtrosDiferenciasDisponibles
              ?.estados_correccion
              .map(
                (estado) => (

                  <button
                    key={
                      estado
                    }
                    type="button"
                    className={
                      estadoCorreccionSeleccionado
                      === estado

                        ? (
                          estado === "CORREGIDO"
                            ? "nexo-filter-chip is-active is-success"
                            : "nexo-filter-chip is-active is-warning"
                        )

                        : "nexo-filter-chip"
                    }
                    onClick={
                      () => {

                        setEstadoCorreccionSeleccionado(
                          estado
                        );

                        setPaginaDiferencias(
                          1
                        );

                      }
                    }
                  >

                    {
                      estado === "PENDIENTE"
                        ? "Pendientes"
                        : estado === "CORREGIDO"
                          ? "Corregidos"
                          : estado
                    }

                  </button>

                )
              )}

          </div>

        </div>

          </>

        )}

        {/* ================================================= */}
        {/* FILTROS PRINCIPALES                               */}
        {/* ================================================= */}

        <div className="nexo-diff-filter-grid nexo-history-filter-grid">


          {/* =============================================== */}
          {/* CÓDIGO DE BARRA                                 */}
          {/* =============================================== */}

          <div className="nexo-filter-field">

            <label htmlFor="codigoBarraDiferencias">
              Código de Barra
            </label>

            <input
              id="codigoBarraDiferencias"
              type="text"
              value={
                codigoBarraDiferenciasFormulario
              }
              onChange={
                (event) =>
                  setCodigoBarraDiferenciasFormulario(
                    event.target.value
                  )
              }
              onKeyDown={
                (event) => {

                  if (
                    event.key === "Enter"
                  ) {

                    aplicarFiltrosDiferencias();

                  }

                }
              }
              placeholder="Ej: 33000055569882"
            />

          </div>


          {/* =============================================== */}
          {/* EMPRESA                                         */}
          {/* =============================================== */}

          <div className="nexo-filter-field">

            <label htmlFor="empresaDiferencias">
              Empresa
            </label>

            <select
              id="empresaDiferencias"
              value={
                empresaDiferencias
              }
              onChange={
                (event) => {

                  setEmpresaDiferencias(
                    event.target.value
                  );

                  setSucursalDiferencias(
                    ""
                  );

                  setPaginaDiferencias(
                    1
                  );

                }
              }
            >

              <option value="">
                Todas
              </option>


              {filtrosDiferenciasDisponibles
                ?.empresas
                .map(
                  (empresa) => (

                    <option
                      key={
                        empresa
                      }
                      value={
                        empresa
                      }
                    >
                      {empresa}
                    </option>

                  )
                )}

            </select>

          </div>


          {/* =============================================== */}
          {/* SUCURSAL                                        */}
          {/* =============================================== */}

          <div className="nexo-filter-field">

            <label htmlFor="sucursalDiferencias">
              Sucursal
            </label>

            <select
              id="sucursalDiferencias"
              value={
                sucursalDiferencias
              }
              disabled={
                !empresaDiferencias
              }
              onChange={
                (event) => {

                  setSucursalDiferencias(
                    event.target.value
                  );

                  setPaginaDiferencias(
                    1
                  );

                }
              }
            >

              <option value="">

                {
                  empresaDiferencias
                    ? "Todas"
                    : "Selecciona una empresa"
                }

              </option>


              {filtrosDiferenciasDisponibles
                ?.sucursales
                .map(
                  (sucursal) => (

                    <option
                      key={
                        sucursal
                      }
                      value={
                        sucursal
                      }
                    >
                      {sucursal}
                    </option>

                  )
                )}

            </select>

          </div>


          {/* =============================================== */}
          {/* FILAS                                           */}
          {/* =============================================== */}

          <div className="nexo-filter-field nexo-filter-field-small">

            <label htmlFor="tamanoPaginaDiferencias">
              Filas
            </label>

            <select
              id="tamanoPaginaDiferencias"
              value={
                tamanoPaginaDiferencias
              }
              onChange={
                (event) => {

                  setTamanoPaginaDiferencias(
                    Number(
                      event.target.value
                    )
                  );

                  setPaginaDiferencias(
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

          {/* =============================================== */}
          {/* ACCIONES EN LÍNEA                               */}
          {/* =============================================== */}

          <div className="nexo-diff-inline-actions">

            <button
              type="button"
              className="nexo-button-secondary"
              onClick={
                limpiarFiltrosDiferencias
              }
              disabled={
                cargandoDiferencias
              }
            >
              Limpiar
            </button>


            <button
              type="button"
              className="nexo-button-primary"
              onClick={
                aplicarFiltrosDiferencias
              }
              disabled={
                cargandoDiferencias
              }
            >

              {
                cargandoDiferencias
                  ? "Aplicando..."
                  : "Aplicar filtros"
              }

            </button>

          </div>

        </div>

      </div>


      {/* ================================================== */}
      {/* CARGANDO                                           */}
      {/* ================================================== */}

{cargandoDiferencias && (

  <div className="nexo-view-state">
    Cargando diferencias...
  </div>

)}


      {/* ================================================== */}
      {/* ERROR                                               */}
      {/* ================================================== */}

{errorDiferencias && (

  <div className="nexo-view-state is-error">
    {errorDiferencias}
  </div>

)}


      {/* ================================================== */}
      {/* RESULTADOS                                          */}
      {/* ================================================== */}


{
  paginaQADiferencias
  &&
  !cargandoDiferencias
  &&
  !errorDiferencias
  &&
  paginaQADiferencias.total_registros === 0
  &&
  (

    <div className="nexo-view-state is-empty">

      No se encontraron diferencias
      con los filtros seleccionados.

    </div>

  )
}


{
  paginaQADiferencias
  &&
  !cargandoDiferencias
  &&
  !errorDiferencias
  &&
  paginaQADiferencias.total_registros > 0
  &&
  (

          <>

            {/* ============================================== */}
            {/* BARRA DE RESULTADOS / PAGINACIÓN                    */}
            {/* ============================================== */}

            <div className="nexo-table-toolbar">

              <span className="nexo-table-count">
                {
                  paginaQADiferencias
                    .total_registros
                    .toLocaleString(
                      "es-VE"
                    )
                }
                {" "}
                diferencias
              </span>





              <div className="nexo-pagination">

                <button
                  type="button"
                  onClick={
                    () =>
                      setPaginaDiferencias(
                        (pagina) =>
                          Math.max(
                            1,
                            pagina - 1
                          )
                      )
                  }
                  disabled={
                    paginaQADiferencias
                      .pagina
                    <= 1
                  }
                >
                  Anterior
                </button>


                <strong>
                  Página{" "}
                  {paginaQADiferencias.pagina}
                  {" de "}
                  {paginaQADiferencias.total_paginas}
                </strong>


                <button
                  type="button"
                  onClick={
                    () =>
                      setPaginaDiferencias(
                        (pagina) =>
                          Math.min(
                            paginaQADiferencias
                              .total_paginas,
                            pagina + 1
                          )
                      )
                  }
                  disabled={
                    paginaQADiferencias
                      .pagina
                    >=
                    paginaQADiferencias
                      .total_paginas
                  }
                >
                  Siguiente
                </button>

              </div>

            </div>


            {/* ============================================== */}
            {/* TABLA                                          */}
            {/* ============================================== */}

            <div
              style={{
                width: "100%",
                maxHeight: "65vh",
                overflow: "auto",
                border:
                  "1px solid #d7dee8",
                borderRadius:
                  "8px",
              }}
            >

              <table
                style={{
                  width: "100%",
                  minWidth: "1500px",
                  borderCollapse:
                    "separate",
                  borderSpacing: 0,
                  fontSize: "13px",
                }}
              >

                <thead>

                  <tr>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Código Barra
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Empresa
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Sucursal
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Tipo
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Valor Creación
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Valor Empresa
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Diferencia
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Estado
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                      Fecha Corrección
                    </th>

                    <th
                      style={
                        estiloEncabezadoTabla
                      }
                    >
                        Acción
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {
                    paginaQADiferencias
                      .diferencias
                      .map(
                        (
                          diferencia,
                          indice
                        ) => (

                          <tr
                            key={
                              diferencia
                                .diferencia_id
                            }
                            style={{
                              background:
                                indice % 2 === 0
                                  ? "#ffffff"
                                  : "#f8fafc",
                            }}
                          >

                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >
                              {
                                diferencia
                                  .codigo_barra
                              }
                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >
                              {
                                diferencia
                                  .empresa
                                ?? "-"
                              }
                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >
                              {
                                diferencia
                                  .sucursal
                                ?? "-"
                              }
                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >
                              {
                                diferencia
                                  .nombre_diferencia
                              }
                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >
                              {
                                diferencia
                                  .valor_creacion
                                ?? "-"
                              }
                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >
                              {
                                diferencia
                                  .valor_empresa
                                ?? "-"
                              }
                            </td>


                            <td
                              style={{
                                ...estiloCeldaTabla,
                                textAlign:
                                  "right",
                              }}
                            >
                              {
                                diferencia
                                  .diferencia_numerica
                                === null
                                  ? "-"
                                  : formatearNumero(
                                      diferencia
                                        .diferencia_numerica,
                                      4
                                    )
                              }
                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >

                              <span
                                style={{
                                  display:
                                    "inline-block",

                                  padding:
                                    "4px 8px",

                                  borderRadius:
                                    "999px",

                                  fontSize:
                                    "11px",

                                  fontWeight:
                                    600,

                                  background:
                                    diferencia
                                      .estado_correccion
                                    === "CORREGIDO"
                                      ? "#dcfce7"
                                      : "#fef3c7",

                                  color:
                                    diferencia
                                      .estado_correccion
                                    === "CORREGIDO"
                                      ? "#166534"
                                      : "#92400e",
                                }}
                              >

                                {
                                  diferencia
                                    .estado_correccion
                                }

                              </span>

                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >

                              {
                                diferencia
                                  .corregido_at
                                  ? new Date(
                                      diferencia
                                        .corregido_at
                                    )
                                      .toLocaleString(
                                        "es-VE"
                                      )
                                  : "-"
                              }

                            </td>


                            <td
                              style={
                                estiloCeldaTabla
                              }
                            >

                              <button
                                type="button"
                                onClick={
                                  () =>
                                    manejarCambioEstadoDiferencia(
                                      diferencia.diferencia_id,
                                      diferencia.estado_correccion
                                    )
                                }
                                disabled={
                                  diferenciaActualizandoId
                                  === diferencia.diferencia_id
                                }
                              >

                                {
                                  diferenciaActualizandoId
                                  === diferencia.diferencia_id
                                    ? "Guardando..."
                                    : diferencia.estado_correccion
                                      === "CORREGIDO"
                                        ? "↶ Volver a pendiente"
                                        : "✓ Marcar corregido"
                                }

                              </button>

                            </td>

                          </tr>

                        )
                      )
                  }

                </tbody>

              </table>

            </div>


            <br />


            {/* ============================================== */}
            {/* PAGINACIÓN INFERIOR                            */}
            {/* ============================================== */}

            <div>

              <button
                type="button"
                onClick={
                  () =>
                    setPaginaDiferencias(
                      (pagina) =>
                        Math.max(
                          1,
                          pagina - 1
                        )
                    )
                }
                disabled={
                  paginaQADiferencias
                    .pagina
                  <= 1
                }
              >
                Anterior
              </button>


              {" "}


              <strong>

                Página{" "}
                {
                  paginaQADiferencias
                    .pagina
                }
                {" de "}
                {
                  paginaQADiferencias
                    .total_paginas
                }

              </strong>


              {" "}


              <button
                type="button"
                onClick={
                  () =>
                    setPaginaDiferencias(
                      (pagina) =>
                        Math.min(
                          paginaQADiferencias
                            .total_paginas,
                          pagina + 1
                        )
                    )
                }
                disabled={
                  paginaQADiferencias
                    .pagina
                  >=
                  paginaQADiferencias
                    .total_paginas
                }
              >
                Siguiente
              </button>

            </div>

          </>

        )
      }

    </>

  )}

</div>
    </>
  );
}
