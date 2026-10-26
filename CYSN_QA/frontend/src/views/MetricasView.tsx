import type { CSSProperties } from "react";

import type { NexoQaController } from "../hooks/useNexoQaController";

interface MetricasViewProps {

  controller: NexoQaController;

}

interface MetricasResumenOperativo {

  filas_csv: number;

  codigos_filtrados: number;

  total_incidencias_atributos: number;

  total_diferencias_atributos: number;

  diferencias_referencia: number;

  diferencias_precio: number;

  diferencias_tasa_cambio: number;

  diferencias_codigo_marca: number;

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

  grupoMetricas: {

    display: "flex",

    flexDirection: "column",

    gap: "10px",

  } satisfies CSSProperties,

  grupoCabecera: {

    display: "flex",

    flexDirection: "column",

    gap: "3px",

  } satisfies CSSProperties,

  grupoTitulo: {

    margin: 0,

    color: "#334155",

    fontSize: "13px",

    fontWeight: 800,

    textTransform: "uppercase",

    letterSpacing: "0.04em",

  } satisfies CSSProperties,

  grupoDescripcion: {

    margin: 0,

    color: "#64748b",

    fontSize: "12px",

  } satisfies CSSProperties,

  avisoConceptual: {

    background: "#f8fafc",

    border: "1px solid #e2e8f0",

    borderRadius: "10px",

    padding: "11px 14px",

    color: "#475569",

    fontSize: "12px",

    lineHeight: 1.55,

  } satisfies CSSProperties,

  tarjetas: {

    display: "grid",

    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",

    gap: "12px",

  } satisfies CSSProperties,

  tarjeta: {

    background: "#ffffff",

    border: "1px solid #e2e8f0",

    borderRadius: "12px",

    padding: "14px 16px",

    minHeight: "96px",

    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",

  } satisfies CSSProperties,

  tarjetaProximamente: {

    background: "#f8fafc",

    border: "1px dashed #cbd5e1",

    borderRadius: "12px",

    padding: "14px 16px",

    minHeight: "96px",

  } satisfies CSSProperties,

  valorProximamente: {

    display: "block",

    color: "#64748b",

    fontSize: "14px",

    fontWeight: 800,

    lineHeight: 1.2,

  } satisfies CSSProperties,

  etiqueta: {

    display: "block",

    color: "#64748b",

    fontSize: "12px",

    fontWeight: 700,

    marginBottom: "9px",

  } satisfies CSSProperties,

  valor: {

    display: "block",

    color: "#111827",

    fontSize: "24px",

    fontWeight: 800,

    lineHeight: 1.1,

  } satisfies CSSProperties,

  detalle: {

    display: "block",

    marginTop: "7px",

    color: "#94a3b8",

    fontSize: "11px",

  } satisfies CSSProperties,

  panel: {

    background: "#ffffff",

    border: "1px solid #e2e8f0",

    borderRadius: "12px",

    overflow: "hidden",

  } satisfies CSSProperties,

  panelCabecera: {

    display: "flex",

    justifyContent: "space-between",

    alignItems: "center",

    gap: "12px",

    padding: "13px 16px",

    borderBottom: "1px solid #e2e8f0",

  } satisfies CSSProperties,

  panelTitulo: {

    margin: 0,

    color: "#1e293b",

    fontSize: "15px",

  } satisfies CSSProperties,

  panelMeta: {

    color: "#64748b",

    fontSize: "12px",

  } satisfies CSSProperties,

  tablaWrap: {

    width: "100%",

    overflowX: "auto",

    maxHeight: "440px",

  } satisfies CSSProperties,

  tabla: {

    width: "100%",

    borderCollapse: "collapse",

    minWidth: "900px",

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

    letterSpacing: "0.02em",

    padding: "10px 12px",

    borderBottom: "1px solid #e2e8f0",

    textAlign: "left",

    whiteSpace: "nowrap",

  } satisfies CSSProperties,

  td: {

    padding: "10px 12px",

    borderBottom: "1px solid #eef2f7",

    fontSize: "12px",

    color: "#334155",

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

  return `${valor.toLocaleString(

    "es-VE",

    {

      minimumFractionDigits: 2,

      maximumFractionDigits: 2,

    }

  )}%`;

}

export function MetricasView({

  controller,

}: MetricasViewProps) {

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

  const metricasOperativas =

    metricasResumen as MetricasResumenOperativo | null;

  function obtenerTotalTipo(codigo: string): number {

    return metricasTipos?.tipos.find(

      (tipo) => tipo.codigo === codigo

    )?.total ?? 0;

  }

  return (

    <div style={estilos.contenedor}>

      {/* ==================================================== */}

      {/* CABECERA                                             */}

      {/* ==================================================== */}

      <div style={estilos.cabecera}>

        <div>

          <h2 style={estilos.titulo}>

            Métricas

          </h2>

          <p style={estilos.subtitulo}>

            Resumen analítico de la ejecución QA seleccionada.

          </p>

        </div>

        <div style={estilos.selector}>

          <label

            htmlFor="ejecucionMetricas"

            style={estilos.label}

          >

            Ejecución QA

          </label>

          <select

            id="ejecucionMetricas"

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

                    #{ejecucion.id}

                    {" - "}

                    {ejecucion.nombre}

                  </option>

                )

              )}

          </select>

        </div>

      </div>

      {/* ==================================================== */}

      {/* ESTADOS DE LA VISTA                                  */}

      {/* ==================================================== */}

      {!ejecucionSeleccionadaId && (

        <div className="nexo-view-state is-empty">

          Selecciona una ejecución QA para consultar sus métricas.

        </div>

      )}

      {ejecucionSeleccionadaId

        && cargandoMetricas && (

        <div className="nexo-view-state">

          Cargando métricas...

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

      {/* CONTENIDO                                            */}

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

          {/* RESUMEN OPERATIVO                                  */}

          {/* ================================================= */}

          <section style={estilos.grupoMetricas}>

            <div style={estilos.grupoCabecera}>

              <h3 style={estilos.grupoTitulo}>

                Resumen

              </h3>

              <p style={estilos.grupoDescripcion}>

                Base del archivo QA y volumen real de incidencias y diferencias.

              </p>

            </div>

            <div style={estilos.tarjetas}>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Filas del CSV

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.filas_csv

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Filas originales del archivo antes del filtro

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Códigos únicos

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasResumen.codigos_barra_distintos

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Códigos de barra válidos sin repetir

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Diferencias

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.total_diferencias_atributos

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Suma de diferencias de los atributos QA activos

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Incidencias

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.total_incidencias_atributos

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Filas con al menos una diferencia de atributo

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Códigos filtrados

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.codigos_filtrados

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Filas ignoradas por CódigoBarra inválido

                </span>

              </div>

            </div>

          </section>

          {/* ================================================= */}

          {/* DIFERENCIAS POR ATRIBUTO                           */}

          {/* ================================================= */}

          <section style={estilos.grupoMetricas}>

            <div style={estilos.grupoCabecera}>

              <h3 style={estilos.grupoTitulo}>

                Diferencias por atributo

              </h3>

              <p style={estilos.grupoDescripcion}>

                Cada diferencia corresponde a un atributo concreto dentro de una incidencia.

              </p>

            </div>

            <div style={estilos.tarjetas}>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Referencia

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.diferencias_referencia

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de referencia

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Precio

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.diferencias_precio

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de precio detal

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Tasa Cambio

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.diferencias_tasa_cambio

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de tasa de cambio

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Código Marca

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    metricasOperativas?.diferencias_codigo_marca

                    ?? 0

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de código de marca

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Categoría

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    obtenerTotalTipo("CATEGORIA")

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de categoría

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Precio Promoción

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    obtenerTotalTipo("PRECIO_PROMOCION")

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de precio promoción

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Costo Inicial

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    obtenerTotalTipo("COSTO_INICIAL")

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de costo inicial

                </span>

              </div>

              <div style={estilos.tarjeta}>

                <span style={estilos.etiqueta}>

                  Costo Dólar

                </span>

                <strong style={estilos.valor}>

                  {formatearEntero(

                    obtenerTotalTipo("COSTO_DOLAR")

                  )}

                </strong>

                <span style={estilos.detalle}>

                  Diferencias de costo dólar

                </span>

              </div>

            </div>

          </section>

          {/* ================================================= */}

          {/* POR TIPO                                          */}

          {/* ================================================= */}

          <section style={estilos.panel}>

            <div style={estilos.panelCabecera}>

              <h3 style={estilos.panelTitulo}>

                Diferencias por tipo

              </h3>

              <span style={estilos.panelMeta}>

                {formatearEntero(

                  metricasTipos.total_diferencias

                )}

                {" "}

                incidencias

              </span>

            </div>

            <div style={estilos.tablaWrap}>

              <table style={estilos.tabla}>

                <thead>

                  <tr>

                    <th style={estilos.th}>

                      Tipo

                    </th>

                    <th

                      style={{

                        ...estilos.th,

                        ...estilos.numero,

                      }}

                    >

                      Total

                    </th>

                    <th

                      style={{

                        ...estilos.th,

                        ...estilos.numero,

                      }}

                    >

                      % del total

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

                      % corrección

                    </th>

                  </tr>

                </thead>

                <tbody>

                  {metricasTipos.tipos.map(

                    (tipo) => (

                      <tr key={tipo.codigo}>

                        <td style={estilos.td}>

                          {tipo.nombre}

                        </td>

                        <td

                          style={{

                            ...estilos.td,

                            ...estilos.numero,

                          }}

                        >

                          {formatearEntero(

                            tipo.total

                          )}

                        </td>

                        <td

                          style={{

                            ...estilos.td,

                            ...estilos.numero,

                          }}

                        >

                          {formatearPorcentaje(

                            tipo.porcentaje_del_total

                          )}

                        </td>

                        <td

                          style={{

                            ...estilos.td,

                            ...estilos.numero,

                          }}

                        >

                          {formatearEntero(

                            tipo.pendientes

                          )}

                        </td>

                        <td

                          style={{

                            ...estilos.td,

                            ...estilos.numero,

                          }}

                        >

                          {formatearEntero(

                            tipo.corregidas

                          )}

                        </td>

                        <td

                          style={{

                            ...estilos.td,

                            ...estilos.numero,

                          }}

                        >

                          {formatearPorcentaje(

                            tipo.porcentaje_correccion

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

          {/* POR EMPRESA                                       */}

          {/* ================================================= */}

          <section style={estilos.panel}>

            <div style={estilos.panelCabecera}>

              <h3 style={estilos.panelTitulo}>

                Métricas por empresa

              </h3>

              <span style={estilos.panelMeta}>

                {formatearEntero(

                  metricasEmpresas.empresas.length

                )}

                {" "}

                empresas

              </span>

            </div>

            <div style={estilos.tablaWrap}>

              <table style={estilos.tabla}>

                <thead>

                  <tr>

                    <th style={estilos.th}>

                      Empresa

                    </th>

                    <th

                      style={{

                        ...estilos.th,

                        ...estilos.numero,

                      }}

                    >

                      Evaluados

                    </th>

                    <th

                      style={{

                        ...estilos.th,

                        ...estilos.numero,

                      }}

                    >

                      Con incidencias

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

                      % corrección

                    </th>

                  </tr>

                </thead>

                <tbody>

                  {metricasEmpresas.empresas.map(

                    (empresa) => (

                      <tr key={empresa.empresa}>

                        <td style={estilos.td}>

                          {empresa.empresa}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            empresa.resultados_evaluados

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            empresa.resultados_con_incidencias

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearPorcentaje(

                            empresa.porcentaje_resultados_con_incidencias

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            empresa.total_diferencias

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            empresa.pendientes

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            empresa.corregidas

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearPorcentaje(

                            empresa.porcentaje_correccion

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

          {/* POR SUCURSAL                                      */}

          {/* ================================================= */}

          <section style={estilos.panel}>

            <div style={estilos.panelCabecera}>

              <h3 style={estilos.panelTitulo}>

                Métricas por sucursal

              </h3>

              <span style={estilos.panelMeta}>

                {formatearEntero(

                  metricasSucursales.sucursales.length

                )}

                {" "}

                sucursales

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

                      Evaluados

                    </th>

                    <th

                      style={{

                        ...estilos.th,

                        ...estilos.numero,

                      }}

                    >

                      Con incidencias

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

                      % corrección

                    </th>

                  </tr>

                </thead>

                <tbody>

                  {metricasSucursales.sucursales.map(

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

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            sucursal.resultados_evaluados

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            sucursal.resultados_con_incidencias

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearPorcentaje(

                            sucursal.porcentaje_resultados_con_incidencias

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            sucursal.total_diferencias

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            sucursal.pendientes

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearEntero(

                            sucursal.corregidas

                          )}

                        </td>

                        <td style={{...estilos.td, ...estilos.numero}}>

                          {formatearPorcentaje(

                            sucursal.porcentaje_correccion

                          )}

                        </td>

                      </tr>

                    )

                  )}

                </tbody>

              </table>

            </div>

          </section>

        </>

      )}

    </div>

  );

}
