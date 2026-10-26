import type { CSSProperties } from "react";
import type { NexoQaController } from "../hooks/useNexoQaController";
import SincronizacionCreacionEstado from "../components/SincronizacionCreacionEstado";

interface DashboardViewProps {
  controller: NexoQaController;
}

const estilos = {
  contenedor: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  } satisfies CSSProperties,

  cabecera: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  } satisfies CSSProperties,

  titulo: {
    margin: 0,
    fontSize: "24px",
    color: "#1f2937",
  } satisfies CSSProperties,

  subtitulo: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: "13px",
  } satisfies CSSProperties,

  selector: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    minWidth: "280px",
  } satisfies CSSProperties,

  label: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#475569",
  } satisfies CSSProperties,

  select: {
    height: "38px",
    border: "1px solid #d7dee8",
    borderRadius: "8px",
    padding: "0 10px",
    background: "#ffffff",
    color: "#1e293b",
  } satisfies CSSProperties,

  kpis: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "12px",
  } satisfies CSSProperties,

  kpi: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px 16px",
    boxShadow:
      "0 1px 2px rgba(15, 23, 42, 0.05)",
  } satisfies CSSProperties,

  kpiLabel: {
    display: "block",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 700,
    marginBottom: "8px",
  } satisfies CSSProperties,

  kpiValue: {
    display: "block",
    color: "#111827",
    fontSize: "25px",
    lineHeight: 1.1,
    fontWeight: 800,
  } satisfies CSSProperties,

  kpiDetalle: {
    display: "block",
    marginTop: "7px",
    color: "#94a3b8",
    fontSize: "11px",
  } satisfies CSSProperties,

  gridDos: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(420px, 1fr))",
    gap: "16px",
  } satisfies CSSProperties,

  panel: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    overflow: "hidden",
    minWidth: 0,
  } satisfies CSSProperties,

  panelCabecera: {
    padding: "13px 16px",
    borderBottom: "1px solid #e2e8f0",
  } satisfies CSSProperties,

  panelTitulo: {
    margin: 0,
    color: "#1e293b",
    fontSize: "15px",
  } satisfies CSSProperties,

  panelSubtitulo: {
    display: "block",
    marginTop: "3px",
    color: "#94a3b8",
    fontSize: "11px",
  } satisfies CSSProperties,

  panelCuerpo: {
    padding: "14px 16px",
  } satisfies CSSProperties,

  filaBarra: {
    display: "grid",
    gridTemplateColumns:
      "minmax(130px, 1fr) minmax(160px, 3fr) 90px",
    gap: "12px",
    alignItems: "center",
    marginBottom: "12px",
  } satisfies CSSProperties,

  etiquetaBarra: {
    color: "#475569",
    fontSize: "12px",
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  pista: {
    height: "9px",
    borderRadius: "999px",
    background: "#eef2f7",
    overflow: "hidden",
  } satisfies CSSProperties,

  relleno: {
    height: "100%",
    borderRadius: "999px",
    background: "#8b0038",
    minWidth: "2px",
  } satisfies CSSProperties,

  valorBarra: {
    textAlign: "right",
    color: "#334155",
    fontSize: "12px",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  progresoGrande: {
    height: "14px",
    borderRadius: "999px",
    background: "#eef2f7",
    overflow: "hidden",
    marginTop: "12px",
  } satisfies CSSProperties,

  tablaWrap: {
    width: "100%",
    overflowX: "auto",
    maxHeight: "390px",
  } satisfies CSSProperties,

  tabla: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "760px",
  } satisfies CSSProperties,

  th: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "#f8fafc",
    color: "#475569",
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "left",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #eef2f7",
    color: "#334155",
    fontSize: "12px",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  numero: {
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
};

function formatearEntero(
  valor: number
) {
  return valor.toLocaleString(
    "es-VE"
  );
}

function formatearPorcentaje(
  valor: number
) {
  if (
    valor > 0
    &&
    valor < 0.01
  ) {
    return "< 0,01%";
  }

  return `${valor.toLocaleString(
    "es-VE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}%`;
}

function porcentaje(
  valor: number,
  total: number
) {
  if (
    total <= 0
  ) {
    return 0;
  }

  return (
    valor
    / total
  ) * 100;
}

function anchoBarra(
  valor: number,
  maximo: number
) {
  if (
    maximo <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      (
        valor
        / maximo
      ) * 100
    )
  );
}

export function DashboardView({
  controller,
}: DashboardViewProps) {

  const {
    ejecuciones,
    ejecucionSeleccionadaId,
    manejarCambioEjecucion,
    metricasResumen,
    metricasTipos,
    metricasEmpresas,
    metricasSucursales,
    cargandoMetricas,
    errorMetricas,
  } = controller;


  const distribucionResultados =
    metricasResumen
      ? [
          {
            nombre: "Iguales",
            valor:
              metricasResumen
                .total_iguales,
          },
          {
            nombre: "Con diferencia",
            valor:
              metricasResumen
                .total_con_diferencia,
          },
          {
            nombre: "No en empresas",
            valor:
              metricasResumen
                .total_no_en_empresas,
          },
          {
            nombre: "No en Creación",
            valor:
              metricasResumen
                .total_no_en_creacion,
          },
        ]
      : [];


  const maximoResultados = Math.max(
    0,
    ...distribucionResultados.map(
      (item) => item.valor
    )
  );


  const tiposAtributoActivos = new Set([
    "REFERENCIA",
    "PRECIO_DETAL",
    "TASA_CAMBIO",
    "CODIGO_MARCA",
  ]);


  const tiposPrincipales =
    metricasTipos
      ? metricasTipos.tipos
          .filter(
            (tipo) =>
              tiposAtributoActivos.has(
                tipo.codigo
              )
          )
          .slice(0, 6)
      : [];


  const maximoTipos = Math.max(
    0,
    ...tiposPrincipales.map(
      (item) => item.total
    )
  );


  const empresasPrincipales =
    metricasEmpresas
      ? [...metricasEmpresas.empresas]
          .filter(
            (empresa) =>
              empresa.empresa
                .trim()
                .toUpperCase()
                !== "SIN_EMPRESA"
          )
          .sort(
            (a, b) =>
              b.resultados_con_incidencias
              - a.resultados_con_incidencias
          )
          .slice(0, 6)
      : [];


  const maximoEmpresas = Math.max(
    0,
    ...empresasPrincipales.map(
      (item) =>
        item.resultados_con_incidencias
    )
  );


  const sucursalesPrincipales =
    metricasSucursales
      ? [...metricasSucursales.sucursales]
          .filter(
            (sucursal) =>
              sucursal.empresa
                .trim()
                .toUpperCase()
                !== "SIN_EMPRESA"
          )
          .sort(
            (a, b) =>
              b.total_diferencias
              - a.total_diferencias
          )
          .slice(0, 10)
      : [];


  const sucursalesPorEmpresa =
    metricasEmpresas
      && metricasSucursales
      ? metricasEmpresas.empresas
          .filter(
            (empresa) =>
              empresa.empresa
                .trim()
                .toUpperCase()
                !== "SIN_EMPRESA"
          )
          .map(
            (empresa) => ({
              empresa:
                empresa.empresa,

              sucursales:
                [...metricasSucursales
                  .sucursales]
                  .filter(
                    (sucursal) =>
                      sucursal.empresa
                        === empresa.empresa
                  )
                  .sort(
                    (a, b) =>
                      b.total_diferencias
                      - a.total_diferencias
                  ),
            })
          )
          .filter(
            (grupo) =>
              grupo.sucursales.length > 0
          )
      : [];


  return (
    <div style={estilos.contenedor}>

      {/* ==================================================== */}
      {/* CABECERA                                             */}
      {/* ==================================================== */}

      <div style={estilos.cabecera}>

        <div>

          <h2 style={estilos.titulo}>
            Dashboard
          </h2>

          <p style={estilos.subtitulo}>
            Vista ejecutiva del estado general del QA.
          </p>

        </div>


        <div style={estilos.selector}>

          <label
            htmlFor="ejecucionDashboard"
            style={estilos.label}
          >
            Ejecución QA
          </label>

          <select
            id="ejecucionDashboard"
            value={
              ejecucionSeleccionadaId
              ?? ""
            }
            onChange={
              manejarCambioEjecucion
            }
            style={estilos.select}
          >

            <option value="">
              Selecciona una ejecución
            </option>

            {ejecuciones
              .filter(
                (ejecucion) =>
                  ejecucion.estado
                    === "COMPLETADA"
                  ||
                  ejecucion.estado
                    === "CERRADA"
              )
              .map(
                (ejecucion) => (

                  <option
                    key={ejecucion.id}
                    value={ejecucion.id}
                  >
                    #{ejecucion.id}
                    {" - "}
                    {ejecucion.nombre}
                  </option>

                )
              )}

          </select>

        </div>

      </div>


      <SincronizacionCreacionEstado />


      {/* ==================================================== */}
      {/* ESTADOS                                              */}
      {/* ==================================================== */}

      {!ejecucionSeleccionadaId && (

        <div className="nexo-view-state is-empty">
          Selecciona una ejecución QA para consultar el dashboard.
        </div>

      )}


      {ejecucionSeleccionadaId
        && cargandoMetricas && (

        <div className="nexo-view-state">
          Cargando dashboard...
        </div>

      )}


      {ejecucionSeleccionadaId
        && !cargandoMetricas
        && errorMetricas && (

        <div className="nexo-view-state is-error">
          {errorMetricas}
        </div>

      )}


      {/* ==================================================== */}
      {/* DASHBOARD                                            */}
      {/* ==================================================== */}

      {ejecucionSeleccionadaId
        && !cargandoMetricas
        && !errorMetricas
        && metricasResumen
        && metricasTipos
        && metricasEmpresas
        && metricasSucursales && (

        <>

          {/* ================================================= */}
          {/* KPI EJECUTIVOS                                    */}
          {/* ================================================= */}

          <div style={estilos.kpis}>

            <div style={estilos.kpi}>
              <span style={estilos.kpiLabel}>
                Conformidad
              </span>

              <strong style={estilos.kpiValue}>
                {formatearPorcentaje(
                  metricasResumen
                    .porcentaje_conformidad
                )}
              </strong>

              <span style={estilos.kpiDetalle}>
                Filas comparables sin diferencias
              </span>
            </div>


            <div style={estilos.kpi}>
              <span style={estilos.kpiLabel}>
                Diferencias individuales
              </span>

              <strong style={estilos.kpiValue}>
                {formatearEntero(
                  metricasResumen
                    .total_diferencias_individuales
                )}
              </strong>

              <span style={estilos.kpiDetalle}>
                Diferencias de atributos detectadas
              </span>
            </div>


            <div style={estilos.kpi}>
              <span style={estilos.kpiLabel}>
                Pendientes
              </span>

              <strong style={estilos.kpiValue}>
                {formatearEntero(
                  metricasResumen
                    .total_pendientes
                )}
              </strong>

              <span style={estilos.kpiDetalle}>
                Diferencias de atributos por corregir
              </span>
            </div>


            <div style={estilos.kpi}>
              <span style={estilos.kpiLabel}>
                Corregidas
              </span>

              <strong style={estilos.kpiValue}>
                {formatearEntero(
                  metricasResumen
                    .total_corregidas
                )}
              </strong>

              <span style={estilos.kpiDetalle}>
                Diferencias de atributos resueltas
              </span>
            </div>


            <div style={estilos.kpi}>
              <span style={estilos.kpiLabel}>
                Avance de corrección
              </span>

              <strong style={estilos.kpiValue}>
                {formatearPorcentaje(
                  metricasResumen
                    .porcentaje_correccion
                )}
              </strong>

              <span style={estilos.kpiDetalle}>
                Corregidas / diferencias de atributos
              </span>
            </div>

          </div>


          {/* ================================================= */}
          {/* FILA DE GRÁFICOS                                  */}
          {/* ================================================= */}

          <div style={estilos.gridDos}>

            {/* ================================================= */}
            {/* DISTRIBUCIÓN QA                                   */}
            {/* ================================================= */}

            <section style={estilos.panel}>

              <div style={estilos.panelCabecera}>

                <h3 style={estilos.panelTitulo}>
                  Distribución de resultados QA
                </h3>

                <span style={estilos.panelSubtitulo}>
                  Estado de los registros evaluados
                </span>

              </div>


              <div style={estilos.panelCuerpo}>

                {distribucionResultados.map(
                  (item) => (

                    <div
                      key={item.nombre}
                      style={estilos.filaBarra}
                    >

                      <span
                        style={
                          estilos.etiquetaBarra
                        }
                        title={item.nombre}
                      >
                        {item.nombre}
                      </span>


                      <div style={estilos.pista}>

                        <div
                          style={{
                            ...estilos.relleno,
                            width:
                              `${anchoBarra(
                                item.valor,
                                maximoResultados
                              )}%`,
                          }}
                        />

                      </div>


                      <span
                        style={
                          estilos.valorBarra
                        }
                      >
                        {formatearPorcentaje(
                          porcentaje(
                            item.valor,
                            metricasResumen
                              .total_resultados
                          )
                        )}
                      </span>

                    </div>

                  )
                )}

              </div>

            </section>


            {/* ================================================= */}
            {/* TIPOS                                            */}
            {/* ================================================= */}

            <section style={estilos.panel}>

              <div style={estilos.panelCabecera}>

                <h3 style={estilos.panelTitulo}>
                  Principales tipos de diferencia
                </h3>

                <span style={estilos.panelSubtitulo}>
                  Solo diferencias de atributos activas
                </span>

              </div>


              <div style={estilos.panelCuerpo}>

                {tiposPrincipales.map(
                  (tipo) => (

                    <div
                      key={tipo.codigo}
                      style={estilos.filaBarra}
                    >

                      <span
                        style={
                          estilos.etiquetaBarra
                        }
                        title={tipo.nombre}
                      >
                        {tipo.nombre}
                      </span>


                      <div style={estilos.pista}>

                        <div
                          style={{
                            ...estilos.relleno,
                            width:
                              `${anchoBarra(
                                tipo.total,
                                maximoTipos
                              )}%`,
                          }}
                        />

                      </div>


                      <span
                        style={
                          estilos.valorBarra
                        }
                      >
                        {formatearEntero(
                          tipo.total
                        )}
                      </span>

                    </div>

                  )
                )}

              </div>

            </section>

          </div>


          {/* ================================================= */}
          {/* PROGRESO + EMPRESAS                               */}
          {/* ================================================= */}

          <div style={estilos.gridDos}>

            <section style={estilos.panel}>

              <div style={estilos.panelCabecera}>

                <h3 style={estilos.panelTitulo}>
                  Estado de corrección
                </h3>

                <span style={estilos.panelSubtitulo}>
                  Progreso general de resolución
                </span>

              </div>


              <div style={estilos.panelCuerpo}>

                <strong
                  style={{
                    ...estilos.kpiValue,
                    fontSize: "30px",
                  }}
                >
                  {formatearPorcentaje(
                    metricasResumen
                      .porcentaje_correccion
                  )}
                </strong>


                <div
                  style={
                    estilos.progresoGrande
                  }
                >

                  <div
                    style={{
                      ...estilos.relleno,
                      width:
                        `${Math.min(
                          100,
                          metricasResumen
                            .porcentaje_correccion
                        )}%`,
                    }}
                  />

                </div>


                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: "12px",
                    marginTop: "12px",
                    color: "#64748b",
                    fontSize: "12px",
                  }}
                >

                  <span>
                    Pendientes:{" "}
                    <strong>
                      {formatearEntero(
                        metricasResumen
                          .total_pendientes
                      )}
                    </strong>
                  </span>

                  <span>
                    Corregidas:{" "}
                    <strong>
                      {formatearEntero(
                        metricasResumen
                          .total_corregidas
                      )}
                    </strong>
                  </span>

                </div>

              </div>

            </section>


            <section style={estilos.panel}>

              <div style={estilos.panelCabecera}>

                <h3 style={estilos.panelTitulo}>
                  Empresas con más incidencias
                </h3>

                <span style={estilos.panelSubtitulo}>
                  Filas con al menos una diferencia de atributo
                </span>

              </div>


              <div style={estilos.panelCuerpo}>

                {empresasPrincipales.map(
                  (empresa) => (

                    <div
                      key={empresa.empresa}
                      style={estilos.filaBarra}
                    >

                      <span
                        style={
                          estilos.etiquetaBarra
                        }
                        title={empresa.empresa}
                      >
                        {empresa.empresa}
                      </span>


                      <div style={estilos.pista}>

                        <div
                          style={{
                            ...estilos.relleno,
                            width:
                              `${anchoBarra(
                                empresa
                                  .resultados_con_incidencias,
                                maximoEmpresas
                              )}%`,
                          }}
                        />

                      </div>


                      <span
                        style={
                          estilos.valorBarra
                        }
                      >
                        {formatearEntero(
                          empresa
                            .resultados_con_incidencias
                        )}
                      </span>

                    </div>

                  )
                )}

              </div>

            </section>

          </div>


          {/* ================================================= */}
          {/* TOP SUCURSALES                                    */}
          {/* ================================================= */}

          <section style={estilos.panel}>

            <div style={estilos.panelCabecera}>

              <h3 style={estilos.panelTitulo}>
                Top sucursales por diferencias
              </h3>

              <span style={estilos.panelSubtitulo}>
                Primeras 10 sucursales según diferencias de atributos
              </span>

            </div>


            <div style={estilos.tablaWrap}>

              <table style={estilos.tabla}>

                <thead>
                  <tr>

                    <th style={estilos.th}>
                      Empresa
                    </th>

                    <th style={estilos.th}>
                      Sucursal
                    </th>

                    <th
                      style={{
                        ...estilos.th,
                        ...estilos.numero,
                      }}
                    >
                      Diferencias
                    </th>

                    <th
                      style={{
                        ...estilos.th,
                        ...estilos.numero,
                      }}
                    >
                      Pendientes
                    </th>

                    <th
                      style={{
                        ...estilos.th,
                        ...estilos.numero,
                      }}
                    >
                      Corregidas
                    </th>

                    <th
                      style={{
                        ...estilos.th,
                        ...estilos.numero,
                      }}
                    >
                      % incidencia
                    </th>

                    <th
                      style={{
                        ...estilos.th,
                        ...estilos.numero,
                      }}
                    >
                      % corrección
                    </th>

                  </tr>
                </thead>


                <tbody>

                  {sucursalesPrincipales.map(
                    (
                      sucursal,
                      indice
                    ) => (

                      <tr
                        key={
                          `${sucursal.empresa}-${sucursal.sucursal}-${indice}`
                        }
                      >

                        <td style={estilos.td}>
                          {sucursal.empresa}
                        </td>

                        <td style={estilos.td}>
                          {sucursal.sucursal}
                        </td>

                        <td
                          style={{
                            ...estilos.td,
                            ...estilos.numero,
                          }}
                        >
                          {formatearEntero(
                            sucursal
                              .total_diferencias
                          )}
                        </td>

                        <td
                          style={{
                            ...estilos.td,
                            ...estilos.numero,
                          }}
                        >
                          {formatearEntero(
                            sucursal
                              .pendientes
                          )}
                        </td>

                        <td
                          style={{
                            ...estilos.td,
                            ...estilos.numero,
                          }}
                        >
                          {formatearEntero(
                            sucursal
                              .corregidas
                          )}
                        </td>

                        <td
                          style={{
                            ...estilos.td,
                            ...estilos.numero,
                          }}
                        >
                          {formatearPorcentaje(
                            sucursal
                              .porcentaje_resultados_con_incidencias
                          )}
                        </td>

                        <td
                          style={{
                            ...estilos.td,
                            ...estilos.numero,
                          }}
                        >
                          {formatearPorcentaje(
                            sucursal
                              .porcentaje_correccion
                          )}
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          </section>


          {/* ================================================= */}
          {/* SUCURSALES POR EMPRESA                            */}
          {/* ================================================= */}

          <div>

            <div
              style={{
                marginBottom: "10px",
              }}
            >

              <h3
                style={{
                  ...estilos.panelTitulo,
                  fontSize: "16px",
                }}
              >
                Sucursales por empresa
              </h3>

              <span style={estilos.panelSubtitulo}>
                Ranking completo de sucursales por cantidad de diferencias de atributos
              </span>

            </div>


            <div style={estilos.gridDos}>

              {sucursalesPorEmpresa.map(
                (grupo) => (

                  <section
                    key={grupo.empresa}
                    style={estilos.panel}
                  >

                    <div style={estilos.panelCabecera}>

                      <h3 style={estilos.panelTitulo}>
                        {grupo.empresa}
                      </h3>

                      <span style={estilos.panelSubtitulo}>
                        {formatearEntero(
                          grupo.sucursales.length
                        )}
                        {" "}
                        sucursales
                      </span>

                    </div>


                    <div style={estilos.tablaWrap}>

                      <table
                        style={{
                          ...estilos.tabla,
                          minWidth: "560px",
                        }}
                      >

                        <thead>
                          <tr>

                            <th
                              style={{
                                ...estilos.th,
                                ...estilos.numero,
                                width: "70px",
                              }}
                            >
                              Pos.
                            </th>

                            <th style={estilos.th}>
                              Sucursal
                            </th>

                            <th
                              style={{
                                ...estilos.th,
                                ...estilos.numero,
                              }}
                            >
                              Diferencias
                            </th>

                            <th
                              style={{
                                ...estilos.th,
                                ...estilos.numero,
                              }}
                            >
                              Incidencias
                            </th>

                          </tr>
                        </thead>


                        <tbody>

                          {grupo.sucursales.map(
                            (
                              sucursal,
                              indice
                            ) => (

                              <tr
                                key={
                                  `${grupo.empresa}-${sucursal.sucursal}-${indice}`
                                }
                              >

                                <td
                                  style={{
                                    ...estilos.td,
                                    ...estilos.numero,
                                    fontWeight: 800,
                                  }}
                                >
                                  {indice + 1}
                                </td>

                                <td style={estilos.td}>
                                  {sucursal.sucursal}
                                </td>

                                <td
                                  style={{
                                    ...estilos.td,
                                    ...estilos.numero,
                                  }}
                                >
                                  {formatearEntero(
                                    sucursal
                                      .total_diferencias
                                  )}
                                </td>

                                <td
                                  style={{
                                    ...estilos.td,
                                    ...estilos.numero,
                                  }}
                                >
                                  {formatearEntero(
                                    sucursal
                                      .resultados_con_incidencias
                                  )}
                                </td>

                              </tr>

                            )
                          )}

                        </tbody>

                      </table>

                    </div>

                  </section>

                )
              )}

            </div>

          </div>

        </>

      )}

    </div>
  );
}
