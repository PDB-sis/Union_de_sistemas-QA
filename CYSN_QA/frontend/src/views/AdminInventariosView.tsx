import { useEffect, useMemo, useState } from "react";
import {
  listarCiclosAdmin,
  listarSucursalesAdmin,
  obtenerComparacionInventarioAdmin,
  ejecutarQaCicloAdmin,
  type AdminCicloQa,
  type AdminSucursalCatalogo,
  type ComparacionInventarioFila,
  type ComparacionInventarioRespuesta,
  type EstadoComparacionInventario,
  type ValorComparacion,
  type EjecucionQaCicloResultado,
} from "../services/adminInventarioService";

function obtenerCicloOperativo(ciclos: AdminCicloQa[]): AdminCicloQa | null {
  const recepcion = ciclos.find((ciclo) => ciclo.estado === "RECEPCION");
  if (recepcion) {
    return recepcion;
  }

  return ciclos.find((ciclo) => ciclo.estado === "PREPARANDO") ?? null;
}


function mostrarValor(valor: ValorComparacion): string {
  if (valor === null || valor === undefined || valor === "") {
    return "—";
  }

  return String(valor);
}

function celdaComparacion(
  inventario: ValorComparacion,
  creacion: ValorComparacion,
  diferente: boolean,
) {
  return (
    <div
      style={{
        minWidth: 150,
        padding: "6px 8px",
        borderRadius: 8,
        background: diferente
          ? "rgba(180, 35, 35, 0.06)"
          : "transparent",
      }}
    >
      <div style={{ marginBottom: 4 }}>
        <small style={{ fontWeight: 700 }}>INV</small>{" "}
        {mostrarValor(inventario)}
      </div>

      <div>
        <small style={{ fontWeight: 700 }}>CRE</small>{" "}
        {mostrarValor(creacion)}
      </div>
    </div>
  );
}

export function AdminInventariosView() {
  const [ciclos, setCiclos] = useState<AdminCicloQa[]>([]);
  const [sucursales, setSucursales] = useState<AdminSucursalCatalogo[]>([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState("");
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [ejecutandoQa, setEjecutandoQa] =
    useState(false);
  const [segundosQa, setSegundosQa] = useState(0);

  const [ejecucionQa, setEjecucionQa] =
    useState<EjecucionQaCicloResultado | null>(null);

  const [comparacion, setComparacion] =
    useState<ComparacionInventarioRespuesta | null>(null);

  const [cargandoComparacion, setCargandoComparacion] =
    useState(false);

  const [buscarComparacion, setBuscarComparacion] =
    useState("");

  const [estadoComparacion, setEstadoComparacion] =
    useState<EstadoComparacionInventario | "">("");

  const cicloOperativo = useMemo(
    () => obtenerCicloOperativo(ciclos),
    [ciclos],
  );

  const empresas = useMemo(() => {
    return Array.from(
      new Set<string>(sucursales.map((item) => item.empresa)),
    ).sort((a, b) => a.localeCompare(b));
  }, [sucursales]);

  const sucursalesEmpresa = useMemo(() => {
    if (!empresaSeleccionada) {
      return [];
    }

    return sucursales.filter(
      (item) => item.empresa === empresaSeleccionada,
    );
  }, [empresaSeleccionada, sucursales]);

  const sucursalSeleccionada = useMemo(() => {
    if (sucursalId === null) {
      return null;
    }

    return (
      sucursales.find(
        (item) => item.sucursal_id === sucursalId,
      ) ?? null
    );
  }, [sucursalId, sucursales]);

  async function recargarDatos() {
    const [ciclosData, sucursalesData] = await Promise.all([
      listarCiclosAdmin(),
      listarSucursalesAdmin(),
    ]);

    setCiclos(ciclosData);
    setSucursales(sucursalesData);

    setEmpresaSeleccionada((actual) => {
      if (actual && sucursalesData.some((item) => item.empresa === actual)) {
        return actual;
      }

      return sucursalesData[0]?.empresa ?? "";
    });
  }

  useEffect(() => {
    async function cargar() {
      try {
        setCargandoInicial(true);
        setError("");
        await recargarDatos();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No fue posible cargar la administración de inventarios.",
        );
      } finally {
        setCargandoInicial(false);
      }
    }

    void cargar();
  }, []);

  useEffect(() => {
    if (sucursalesEmpresa.length === 0) {
      setSucursalId(null);
      return;
    }

    setSucursalId((actual) => {
      if (
        actual !== null &&
        sucursalesEmpresa.some((item) => item.sucursal_id === actual)
      ) {
        return actual;
      }

      return sucursalesEmpresa[0].sucursal_id;
    });
  }, [sucursalesEmpresa]);

  useEffect(() => {
    setComparacion(null);
  }, [
    cicloOperativo?.id,
    sucursalId,
  ]);

    useEffect(() => {
    if (!ejecutandoQa) {
      return;
    }

    const inicio = Date.now();
    setSegundosQa(0);
    const temporizador = window.setInterval(() => {
      setSegundosQa(Math.floor((Date.now() - inicio) / 1000));
    }, 1000);

    return () => window.clearInterval(temporizador);
  }, [ejecutandoQa]);
async function ejecutarQa() {
  if (!cicloOperativo) {
    setError(
      "No existe un ciclo operativo disponible para ejecutar QA.",
    );
    return;
  }

  try {
    setEjecutandoQa(true);
    setError("");
    setMensaje("");
    setEjecucionQa(null);

    const data = await ejecutarQaCicloAdmin(
      cicloOperativo.id,
    );

    setEjecucionQa(data);

    setMensaje(
      `QA completado correctamente. Ejecución #${data.ejecucion_id} creada.`,
    );
  } catch (err) {
    setEjecucionQa(null);

    setError(
      err instanceof Error
        ? err.message
        : "No fue posible ejecutar el QA del ciclo.",
    );
  } finally {
    setEjecutandoQa(false);
  }
}


  async function cargarComparacion(
    paginaSolicitada = 1,
  ) {
    if (!cicloOperativo) {
      setError(
        "No existe un ciclo operativo en PREPARANDO o RECEPCION.",
      );
      return;
    }

    if (!sucursalId) {
      setError("Selecciona una sucursal.");
      return;
    }

    try {
      setCargandoComparacion(true);
      setError("");

      const data =
        await obtenerComparacionInventarioAdmin(
          cicloOperativo.id,
          sucursalId,
          {
            pagina: paginaSolicitada,
            tamanoPagina: 50,
            buscar: buscarComparacion,
            estado: estadoComparacion,
          },
        );

      setComparacion(data);
    } catch (err) {
      setComparacion(null);
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible visualizar el inventario contra CREACION.",
      );
    } finally {
      setCargandoComparacion(false);
    }
  }

  if (cargandoInicial) {
    return (
      <section className="admin-inventarios-page">
        <div className="admin-inventarios-card">Cargando inventarios...</div>
      </section>
    );
  }

  return (
    <section className="admin-inventarios-page">
      <header className="admin-inventarios-header">
        <div>
          <span className="admin-inventarios-eyebrow">ADMINISTRACIÓN</span>
          <h1>Inventarios</h1>
          <p>
            Consulta el inventario sincronizado directamente desde la base de datos y ejecuta el control de calidad.
          </p>
        </div>
      </header>

      {error && <div className="admin-inventarios-alert is-error">{error}</div>}
      {mensaje && (
        <div className="admin-inventarios-alert is-success">{mensaje}</div>
      )}

      <div className="admin-inventarios-card">
        <div className="admin-inventarios-section-title">
          <div>
            <span className="admin-inventarios-label">ORIGEN DE DATOS</span>
            <h2>Inventario sincronizado</h2>
          </div>

          <span className="admin-inventarios-admin-chip">BASE DE DATOS</span>
        </div>

        <p className="admin-inventarios-help">
          El inventario se consulta directamente desde la base de datos. No se requieren archivos CSV ni cargas manuales.
        </p>

        <div className="admin-inventarios-form-grid">
          <label>
            <span>Empresa</span>
            <select
              value={empresaSeleccionada}
              onChange={(event) => setEmpresaSeleccionada(event.target.value)}
            >
              {empresas.map((empresa) => (
                <option key={empresa} value={empresa}>
                  {empresa}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Sucursal</span>
            <select
              value={sucursalId ?? ""}
              onChange={(event) => setSucursalId(Number(event.target.value))}
              disabled={sucursalesEmpresa.length === 0}
            >
              {sucursalesEmpresa.map((item) => (
                <option key={item.sucursal_id} value={item.sucursal_id}>
                  {item.sucursal}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="admin-inventarios-card">
  <div className="admin-inventarios-section-title">
    <div>
      <span className="admin-inventarios-label">
        EJECUCIÓN QA
      </span>

      <h2>Generar ejecución QA</h2>
    </div>

    <span className="admin-inventarios-admin-chip">
      ADMIN
    </span>
  </div>

  <p className="admin-inventarios-help">
    Procesa los inventarios validados de todas las sucursales
    participantes del ciclo contra CREACION y genera una ejecución
    persistente disponible en toda la plataforma.
  </p>

  {cicloOperativo && (
    <p className="admin-inventarios-help">
      Ciclo actual:{" "}
      <strong>{cicloOperativo.nombre}</strong>
      {" · "}
      ID {cicloOperativo.id}
    </p>
  )}

  <div className="admin-inventarios-actions">
    <button
      type="button"
      className="admin-inventarios-primary"
      onClick={() => void ejecutarQa()}
      disabled={
        ejecutandoQa ||
        !cicloOperativo
      }
    >
      {ejecutandoQa
        ? "Ejecutando QA..."
        : "Ejecutar QA"}
    </button>
  </div>

  {ejecutandoQa && (
    <p className="admin-inventarios-help" role="status">
      QA en proceso: {Math.floor(segundosQa / 60)} min {segundosQa % 60} s.
      Esta comparación procesa todos los inventarios del ciclo y puede tardar varios minutos. No cierres esta página.
    </p>
  )}
  {ejecucionQa && (
    <div className="admin-inventarios-result">
      <strong>
        Ejecución #{ejecucionQa.ejecucion_id} creada correctamente
      </strong>

      <div>
        <span>
          Estado: {ejecucionQa.estado}
        </span>

        <span>
          Sucursales: {ejecucionQa.sucursales_procesadas}
        </span>

        <span>
          Resultados: {ejecucionQa.total_resultados}
        </span>

        <span>
          Diferencias: {ejecucionQa.total_diferencias}
        </span>
      </div>
    </div>
  )}
</div>


      <div className="admin-inventarios-card">
        <div className="admin-inventarios-section-title">
          <div>
            <span className="admin-inventarios-label">
              VISUALIZACIÓN
            </span>
            <h2>Inventario vs CREACION</h2>
          </div>

          <span className="admin-inventarios-admin-chip">
            SOLO LECTURA
          </span>
        </div>

        <p className="admin-inventarios-help">
          Visualiza el inventario sincronizado de la sucursal seleccionada y compáralo
          directamente contra public.creacion por CodigoBarra. Esta consulta
          no crea resultados QA ni modifica diferencias.
        </p>

        <div className="admin-inventarios-form-grid">
          <label>
            <span>Estado</span>
            <select
              value={estadoComparacion}
              onChange={(event) =>
                setEstadoComparacion(
                  event.target.value as EstadoComparacionInventario | "",
                )
              }
              disabled={cargandoComparacion}
            >
              <option value="">Todos</option>
              <option value="IGUAL">Igual</option>
              <option value="DIFERENCIA">Diferencia</option>
              <option value="NO_EN_CREACION">No en CREACION</option>
            </select>
          </label>

          <label>
            <span>Buscar código o referencia</span>
            <input
              type="text"
              value={buscarComparacion}
              onChange={(event) =>
                setBuscarComparacion(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void cargarComparacion(1);
                }
              }}
              placeholder="CodigoBarra o referencia"
              disabled={cargandoComparacion}
            />
          </label>
        </div>

        <div className="admin-inventarios-actions">
          <button
            type="button"
            className="admin-inventarios-primary"
            onClick={() => void cargarComparacion(1)}
            disabled={
              cargandoComparacion ||
              !cicloOperativo ||
              !sucursalId
            }
          >
            {cargandoComparacion
              ? "Consultando..."
              : "Visualizar inventario vs CREACION"}
          </button>
        </div>

        {sucursalSeleccionada && (
          <p className="admin-inventarios-help">
            Selección actual:{" "}
            <strong>{sucursalSeleccionada.empresa}</strong>
            {" · "}
            <strong>{sucursalSeleccionada.sucursal}</strong>
          </p>
        )}

        {comparacion && (
          <>
            <div className="admin-inventarios-result">
              <strong>
                Carga actual · Versión {comparacion.carga.version}
              </strong>

              <div>
                <span>
                  Inventario: {comparacion.resumen.total_inventario}
                </span>

                <span>
                  Encontrados en CREACION:{" "}
                  {comparacion.resumen.encontrados_creacion}
                </span>

                <span>
                  Iguales: {comparacion.resumen.iguales}
                </span>

                <span>
                  Con diferencias:{" "}
                  {comparacion.resumen.diferencias}
                </span>

                <span>
                  No en CREACION:{" "}
                  {comparacion.resumen.no_en_creacion}
                </span>
              </div>
            </div>

            <div
              style={{
                overflowX: "auto",
                marginTop: 18,
                border: "1px solid var(--color-border, #d7dee8)",
                borderRadius: 12,
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 1650,
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "CodigoBarra",
                      "Estado",
                      "Referencia",
                      "Precio Detal",
                      "Tasa Cambio",
                      "Código Marca",
                      "Categoría",
                      "Precio Promoción",
                      "Costo Inicial",
                      "Costo Dólar",
                    ].map((titulo) => (
                      <th
                        key={titulo}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderBottom:
                            "1px solid var(--color-border, #d7dee8)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {comparacion.resultados.map(
                    (fila: ComparacionInventarioFila) => (
                      <tr key={fila.inventario_detalle_id}>
                        <td
                          style={{
                            padding: "10px 12px",
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                          }}
                        >
                          {fila.codigo_barra}
                        </td>

                        <td
                          style={{
                            padding: "10px 12px",
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                          }}
                        >
                          {fila.estado_comparacion}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.referencia_inventario,
                            fila.referencia_creacion,
                            fila.diferencia_referencia,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.precio_detal_inventario,
                            fila.precio_detal_creacion,
                            fila.diferencia_precio_detal,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.tasa_cambio_inventario,
                            fila.tasa_cambio_creacion,
                            fila.diferencia_tasa_cambio,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.codigo_marca_inventario,
                            fila.codigo_marca_creacion,
                            fila.diferencia_codigo_marca,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.codigo_categoria_inventario,
                            fila.codigo_categoria_creacion,
                            fila.diferencia_codigo_categoria,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.precio_promocion_inventario,
                            fila.precio_promocion_creacion,
                            fila.diferencia_precio_promocion,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.costo_inicial_inventario,
                            fila.costo_inicial_creacion,
                            fila.diferencia_costo_inicial,
                          )}
                        </td>

                        <td
                          style={{
                            borderBottom:
                              "1px solid var(--color-border, #d7dee8)",
                          }}
                        >
                          {celdaComparacion(
                            fila.costo_dolar_inventario,
                            fila.costo_dolar_creacion,
                            fila.diferencia_costo_dolar,
                          )}
                        </td>
                      </tr>
                    ),
                  )}

                  {comparacion.resultados.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          padding: 24,
                          textAlign: "center",
                        }}
                      >
                        No hay registros para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div
              className="admin-inventarios-actions"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  void cargarComparacion(
                    Math.max(
                      1,
                      comparacion.pagina - 1,
                    ),
                  )
                }
                disabled={
                  cargandoComparacion ||
                  comparacion.pagina <= 1
                }
              >
                Anterior
              </button>

              <span>
                Página {comparacion.pagina} de{" "}
                {Math.max(1, comparacion.total_paginas)}
                {" · "}
                {comparacion.total_registros} registro(s)
              </span>

              <button
                type="button"
                onClick={() =>
                  void cargarComparacion(
                    comparacion.pagina + 1,
                  )
                }
                disabled={
                  cargandoComparacion ||
                  comparacion.pagina >=
                    comparacion.total_paginas
                }
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
