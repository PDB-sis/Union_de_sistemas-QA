import type { NexoQaController } from "../hooks/useNexoQaController";

import { estiloEncabezadoTabla, estiloEncabezadoOrdenable, estiloCeldaTabla } from "../styles/tableStyles";



interface ConsultaGeneralViewProps {

  controller: NexoQaController;

}



export function ConsultaGeneralView({ controller }: ConsultaGeneralViewProps) {

  const {

    ejecuciones,

    ejecucionSeleccionadaId,

    setPaginaResultados,

    tamanoPagina,

    paginaQA,

    cargandoResultados,

    errorConsulta,

    filtrosDisponibles,

    filtrosFormulario,

    setFiltrosFormulario,

    manejarCambioEjecucion,

    manejarCambioTamanoPagina,

    aplicarFiltros,

    limpiarFiltros,

    manejarOrdenColumna,

    indicadorOrden,

    formatearNumero,

    obtenerEstiloEstado,

  } = controller;



  return (

    <>

              {/* ================================================== */}

              {/* CABECERA + FILTROS COMPACTOS                       */}

              {/* ================================================== */}



              <div className="nexo-query-compact">



                <div className="nexo-query-topline">



                  <div className="nexo-query-title">

                    <h2>

                      Consulta General

                    </h2>

                  </div>





                  <div className="nexo-query-execution">



                    <label htmlFor="ejecucionConsulta">

                      Ejecución QA

                    </label>



                    <select

                      id="ejecucionConsulta"

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





                {ejecucionSeleccionadaId && (



                  <div className="nexo-query-filter-panel">



                    <div className="nexo-query-filter-grid">





                      {/* =============================================== */}

                      {/* CÓDIGO DE BARRA                                 */}

                      {/* =============================================== */}



                      <div className="nexo-filter-field">



                        <label htmlFor="filtroCodigoBarra">

                          Código de Barra

                        </label>



                        <input

                          id="filtroCodigoBarra"

                          type="text"

                          value={

                            filtrosFormulario.codigo_barra

                          }

                          onChange={

                            (event) =>

                              setFiltrosFormulario(

                                (anteriores) => ({

                                  ...anteriores,



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



                                aplicarFiltros();



                              }



                            }

                          }

                          placeholder="Ej: 33000055569882"

                        />



                      </div>





                      {/* =============================================== */}

                      {/* REFERENCIA                                      */}

                      {/* =============================================== */}



                      <div className="nexo-filter-field">



                        <label htmlFor="filtroReferencia">

                          Referencia

                        </label>



                        <input

                          id="filtroReferencia"

                          type="text"

                          value={

                            filtrosFormulario.referencia

                          }

                          onChange={

                            (event) =>

                              setFiltrosFormulario(

                                (anteriores) => ({

                                  ...anteriores,



                                  referencia:

                                    event.target.value,

                                })

                              )

                          }

                          onKeyDown={

                            (event) => {



                              if (

                                event.key === "Enter"

                              ) {



                                aplicarFiltros();



                              }



                            }

                          }

                          placeholder="Ej: ABC123"

                        />



                      </div>





                      {/* =============================================== */}

                      {/* ESTADO                                          */}

                      {/* =============================================== */}



                      <div className="nexo-filter-field">



                        <label htmlFor="filtroEstado">

                          Estado

                        </label>



                        <select

                          id="filtroEstado"

                          value={

                            filtrosFormulario.estado

                          }

                          onChange={

                            (event) =>

                              setFiltrosFormulario(

                                (anteriores) => ({

                                  ...anteriores,



                                  estado:

                                    event.target.value,

                                })

                              )

                          }

                        >



                          <option value="">

                            Todos

                          </option>





                          {filtrosDisponibles

                            ?.estados

                            .map(

                              (estado) => (



                                <option

                                  key={

                                    estado

                                  }

                                  value={

                                    estado

                                  }

                                >



                                  {estado}



                                </option>



                              )

                            )}



                        </select>



                      </div>





                      {/* =============================================== */}

                      {/* EMPRESA                                         */}

                      {/* =============================================== */}



                      <div className="nexo-filter-field">



                        <label htmlFor="filtroEmpresa">

                          Empresa

                        </label>



                        <select

                          id="filtroEmpresa"

                          value={

                            filtrosFormulario.empresa

                          }

                          onChange={

                            (event) => {



                              const nuevaEmpresa =

                                event.target.value;





                              setFiltrosFormulario(

                                (anteriores) => ({

                                  ...anteriores,



                                  empresa:

                                    nuevaEmpresa,



                                  sucursal:

                                    "",

                                })

                              );



                            }

                          }

                        >



                          <option value="">

                            Todas

                          </option>





                          {filtrosDisponibles

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



                        <label htmlFor="filtroSucursal">

                          Sucursal

                        </label>



                        <select

                          id="filtroSucursal"

                          value={

                            filtrosFormulario.sucursal

                          }

                          disabled={

                            !filtrosFormulario.empresa

                          }

                          onChange={

                            (event) =>

                              setFiltrosFormulario(

                                (anteriores) => ({

                                  ...anteriores,



                                  sucursal:

                                    event.target.value,

                                })

                              )

                          }

                        >



                          <option value="">



                            {

                              filtrosFormulario.empresa

                                ? "Todas"

                                : "Selecciona empresa"

                            }



                          </option>





                          {filtrosDisponibles

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



                        <label htmlFor="tamanoPagina">

                          Filas

                        </label>



                        <select

                          id="tamanoPagina"

                          value={

                            tamanoPagina

                          }

                          onChange={

                            manejarCambioTamanoPagina

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

                      {/* ACCIONES                                        */}

                      {/* =============================================== */}



                      <div className="nexo-query-inline-actions">



                        <button

                          type="button"

                          className="nexo-button-secondary"

                          onClick={

                            limpiarFiltros

                          }

                          disabled={

                            cargandoResultados

                          }

                        >

                          Limpiar

                        </button>





                        <button

                          type="button"

                          className="nexo-button-primary"

                          onClick={

                            aplicarFiltros

                          }

                          disabled={

                            cargandoResultados

                          }

                        >



                          {

                            cargandoResultados

                              ? "Aplicando..."

                              : "Aplicar filtros"

                          }



                        </button>



                      </div>



                    </div>



                  </div>



                )}



              </div>



{/* ================================================== */}

        {/* CARGANDO                                           */}

        {/* ================================================== */}



{cargandoResultados && (



  <div className="nexo-view-state">

    Cargando resultados...

  </div>



)}



        {/* ================================================== */}

        {/* ERROR CONSULTA                                     */}

        {/* ================================================== */}



        {errorConsulta && (



        <p>

            {errorConsulta}

        </p>



        )}





        {/* ================================================== */}

        {/* RESULTADOS                                         */}

        {/* ================================================== */}



{

  paginaQA

  &&

  !cargandoResultados

  &&

  !errorConsulta

  &&

  paginaQA.total_registros === 0

  &&

  (



    <div className="nexo-view-state is-empty">



      No se encontraron resultados

      con los filtros seleccionados.



    </div>



  )

}



        {

  paginaQA

  &&

  !cargandoResultados

  &&

  !errorConsulta

  &&

  paginaQA.total_registros > 0

  &&

  (



        <>



            {/* ============================================== */}

            {/* RESULTADOS + PAGINACIÓN SUPERIOR                  */}

            {/* ============================================== */}



            <div className="nexo-table-toolbar nexo-query-table-toolbar">



              <span className="nexo-table-count">

                {

                  paginaQA

                    .total_registros

                    .toLocaleString(

                      "es-VE"

                    )

                }

                {" "}

                registros

              </span>





              <div className="nexo-pagination">



                <button

                  type="button"

                  onClick={

                    () =>

                      setPaginaResultados(

                        (pagina) =>

                          Math.max(

                            1,

                            pagina - 1

                          )

                      )

                  }

                  disabled={

                    paginaQA.pagina <= 1

                    ||

                    cargandoResultados

                  }

                >

                  Anterior

                </button>





                <strong>

                  Página{" "}

                  {paginaQA.pagina}

                  {" de "}

                  {paginaQA.total_paginas}

                </strong>





                <button

                  type="button"

                  onClick={

                    () =>

                      setPaginaResultados(

                        (pagina) =>

                          Math.min(

                            paginaQA.total_paginas,

                            pagina + 1

                          )

                      )

                  }

                  disabled={

                    paginaQA.pagina >=

                    paginaQA.total_paginas

                    ||

                    cargandoResultados

                  }

                >

                  Siguiente

                </button>



              </div>



            </div>



            {/* ============================================== */}

            {/* TABLA                                         */}

            {/* ============================================== */}



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

      minWidth: "3200px",

      borderCollapse: "separate",

      borderSpacing: 0,

      fontSize: "13px",

    }}

  >



    <thead>



      <tr>



        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "codigo_barra"

              )

          }

          title="Ordenar por Código de Barra"

        >

          Código Barra

          {

            indicadorOrden(

              "codigo_barra"

            )

          }

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "empresa"

              )

          }

          title="Ordenar por Empresa"

        >

          Empresa

          {

            indicadorOrden(

              "empresa"

            )

          }

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "sucursal"

              )

          }

          title="Ordenar por Sucursal"

        >

          Sucursal

          {

            indicadorOrden(

              "sucursal"

            )

          }

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "referencia_creacion"

              )

          }

          title="Ordenar por Referencia Creación"

        >

          Referencia Creación

          {

            indicadorOrden(

              "referencia_creacion"

            )

          }

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "referencia_empresa"

              )

          }

          title="Ordenar por Referencia Empresa"

        >

          Referencia Empresa

          {

            indicadorOrden(

              "referencia_empresa"

            )

          }

        </th>





        <th style={estiloEncabezadoTabla}>

          Código Marca Creación

        </th>





        <th style={estiloEncabezadoTabla}>

          Código Marca Empresa

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "precio_creacion"

              )

          }

          title="Ordenar por Precio Creación"

        >

          Precio Creación

          {

            indicadorOrden(

              "precio_creacion"

            )

          }

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "precio_empresa"

              )

          }

          title="Ordenar por Precio Empresa"

        >

          Precio Empresa

          {

            indicadorOrden(

              "precio_empresa"

            )

          }

        </th>





        <th style={estiloEncabezadoTabla}>

          Tasa Creación

        </th>





        <th style={estiloEncabezadoTabla}>

          Tasa Empresa

        </th>





        <th style={estiloEncabezadoTabla}>

          Categoría Creación

        </th>





        <th style={estiloEncabezadoTabla}>

          Categoría Empresa

        </th>





        <th style={estiloEncabezadoTabla}>

          Precio Promoción Creación

        </th>





        <th style={estiloEncabezadoTabla}>

          Precio Promoción Empresa

        </th>





        <th style={estiloEncabezadoTabla}>

          Costo Inicial Creación

        </th>





        <th style={estiloEncabezadoTabla}>

          Costo Inicial Empresa

        </th>





        <th style={estiloEncabezadoTabla}>

          Costo Dólar Creación

        </th>





        <th style={estiloEncabezadoTabla}>

          Costo Dólar Empresa

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "existencia"

              )

          }

          title="Ordenar por Existencia"

        >

          Existencia

          {

            indicadorOrden(

              "existencia"

            )

          }

        </th>





        <th

          style={estiloEncabezadoOrdenable}

          onClick={

            () =>

              manejarOrdenColumna(

                "estado"

              )

          }

          title="Ordenar por Estado"

        >

          Estado

          {

            indicadorOrden(

              "estado"

            )

          }

        </th>



      </tr>



    </thead>





    <tbody>



      {paginaQA.resultados.map(

        (

          resultado,

          indice

        ) => (



          <tr

            key={

              resultado.id

            }

            style={{

              background:

                indice % 2 === 0

                  ? "#ffffff"

                  : "#f8fafc",

            }}

          >



<td style={estiloCeldaTabla}>

  {

    resultado.codigo_barra

    ?? "-"

  }

</td>





            <td

              style={estiloCeldaTabla}

            >

              {

                resultado

                  .tabla_empresa

                ?? "-"

              }

            </td>





            <td

              style={estiloCeldaTabla}

            >

              {

                resultado

                  .sucursal_empresa

                ??

                resultado

                  .sucursal_origen

                ??

                "-"

              }

            </td>





            <td

              style={estiloCeldaTabla}

            >

              {

                resultado

                  .referencia_creacion

                ?? "-"

              }

            </td>





            <td

              style={estiloCeldaTabla}

            >

              {

                resultado

                  .referencia_empresa

                ?? "-"

              }

            </td>





            <td

              style={estiloCeldaTabla}

            >

              {

                resultado

                  .codigo_marca_creacion

                ?? "-"

              }

            </td>





            <td

              style={estiloCeldaTabla}

            >

              {

                resultado

                  .codigo_marca_empresa

                ?? "-"

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .precio_detal_usd_creacion,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .precio_detal_usd_empresa,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .tasa_cambio_creacion,

                  4

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .tasa_cambio_empresa,

                  4

                )

              }

            </td>





            <td style={estiloCeldaTabla}>

              {

                resultado

                  .categoria_creacion

                ?? "-"

              }

            </td>





            <td style={estiloCeldaTabla}>

              {

                resultado

                  .categoria_empresa

                ?? "-"

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .precio_promocion_creacion,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .precio_promocion_empresa,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .costo_inicial_creacion,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .costo_inicial_empresa,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .costo_dolar_creacion,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .costo_dolar_empresa,

                  2

                )

              }

            </td>





            <td

              style={{

                ...estiloCeldaTabla,

                textAlign: "right",

              }}

            >

              {

                formatearNumero(

                  resultado

                    .existencia_empresa,

                  2

                )

              }

            </td>





            <td style={estiloCeldaTabla}>



              <span

                style={

                  obtenerEstiloEstado(

                    resultado.estado_comparacion

                  )

                }

              >

                {

                  resultado.estado_comparacion

                }

              </span>



            </td>



          </tr>



        )

      )}



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

                    setPaginaResultados(

                        (pagina) =>

                        Math.max(

                            1,

                            pagina - 1

                        )

                    )

                }

                disabled={

                    paginaQA.pagina <= 1

                    ||

                    cargandoResultados

                }

            >



                Anterior



            </button>





            {" "}





            <strong>



                Página{" "}

                {paginaQA.pagina}

                {" de "}

                {paginaQA.total_paginas}



            </strong>





            {" "}





            <button

                type="button"

                onClick={

                () =>

                    setPaginaResultados(

                    (pagina) =>

                        Math.min(

                            paginaQA.total_paginas,

                            pagina + 1

                        )

                    )

                }

                disabled={

                    paginaQA.pagina >=

                    paginaQA.total_paginas

                    ||

                    cargandoResultados

                }

            >



                Siguiente



            </button>



            </div>



        </>



        )}

    </>

  );

}
