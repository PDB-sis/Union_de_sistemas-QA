import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../auth/AuthContext";
import {
  obtenerRecepcionesSucursalActual,
  procesarInventarioSucursal,
  registrarInventarioSucursal,
  validarInventarioSucursal,
} from "../services/sucursalPortalService";
import { PerfilView } from "./PerfilView";
import type {
  InventarioCargaRegistroResponse,
  InventarioCSVValidacionResponse,
  InventarioProcesamientoResponse,
  SucursalRecepcionPortal,
} from "../types/sucursalPortal";

type VistaSucursal =
  | "sucursal"
  | "inventarios"
  | "recepcion"
  | "perfil";

type OperacionInventario =
  | "validando"
  | "registrando"
  | "procesando"
  | null;

function formatearFecha(
  valor: string | null
): string {
  if (!valor) {
    return "—";
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }

  return new Intl.DateTimeFormat(
    "es-VE",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(fecha);
}

function formatearBytes(
  bytes: number
): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function claseEstado(
  estado: string
): string {
  return estado
    .toLowerCase()
    .replaceAll("_", "-");
}

export function SucursalWorkspace() {
  const {
    usuario,
    sucursales,
    cerrar,
  } = useAuth();

  const [vistaActiva, setVistaActiva] = useState<VistaSucursal>(
    "sucursal"
  );
  const [recepciones, setRecepciones] = useState<
    SucursalRecepcionPortal[]
  >([]);
  const [cargandoRecepciones, setCargandoRecepciones] = useState(false);
  const [errorRecepciones, setErrorRecepciones] = useState<string | null>(
    null
  );

  const [recepcionSeleccionadaId, setRecepcionSeleccionadaId] = useState<
    number | null
  >(null);
  const [archivoInventario, setArchivoInventario] = useState<File | null>(
    null
  );
  const [operacionInventario, setOperacionInventario] = useState<
    OperacionInventario
  >(null);
  const [errorInventario, setErrorInventario] = useState<string | null>(null);
  const [validacionInventario, setValidacionInventario] = useState<
    InventarioCSVValidacionResponse | null
  >(null);
  const [registroInventario, setRegistroInventario] = useState<
    InventarioCargaRegistroResponse | null
  >(null);
  const [procesamientoInventario, setProcesamientoInventario] = useState<
    InventarioProcesamientoResponse | null
  >(null);

  const cargarRecepciones = useCallback(async () => {
    setCargandoRecepciones(true);
    setErrorRecepciones(null);

    try {
      const data = await obtenerRecepcionesSucursalActual();
      setRecepciones(data);
    } catch (error) {
      setErrorRecepciones(
        error instanceof Error
          ? error.message
          : "No se pudo consultar el estado de recepción."
      );
    } finally {
      setCargandoRecepciones(false);
    }
  }, []);

  useEffect(() => {
    if (
      vistaActiva === "recepcion"
      || vistaActiva === "inventarios"
    ) {
      void cargarRecepciones();
    }
  }, [vistaActiva, cargarRecepciones]);

  const recepcionesDisponibles = useMemo(
    () => recepciones.filter(
      (recepcion) => recepcion.puede_cargar_inventario
    ),
    [recepciones]
  );

  const recepcionSeleccionada = useMemo(
    () => recepcionesDisponibles.find(
      (recepcion) =>
        recepcion.qa_ciclo_sucursal_id === recepcionSeleccionadaId
    ) ?? null,
    [recepcionesDisponibles, recepcionSeleccionadaId]
  );

  useEffect(() => {
    if (vistaActiva !== "inventarios") {
      return;
    }

    if (recepcionesDisponibles.length === 0) {
      setRecepcionSeleccionadaId(null);
      return;
    }

    const seleccionSigueDisponible = recepcionesDisponibles.some(
      (recepcion) =>
        recepcion.qa_ciclo_sucursal_id === recepcionSeleccionadaId
    );

    if (!seleccionSigueDisponible) {
      setRecepcionSeleccionadaId(
        recepcionesDisponibles[0].qa_ciclo_sucursal_id
      );
    }
  }, [
    vistaActiva,
    recepcionesDisponibles,
    recepcionSeleccionadaId,
  ]);

  const limpiarResultadoInventario = useCallback(() => {
    setErrorInventario(null);
    setValidacionInventario(null);
    setRegistroInventario(null);
    setProcesamientoInventario(null);
  }, []);

  const manejarCambioRecepcion = (
    qaCicloSucursalId: number
  ) => {
    setRecepcionSeleccionadaId(qaCicloSucursalId);
    setArchivoInventario(null);
    limpiarResultadoInventario();
  };

  const manejarCambioArchivo = (
    archivo: File | null
  ) => {
    setArchivoInventario(archivo);
    limpiarResultadoInventario();
  };

  const manejarValidarInventario = async () => {
    if (!recepcionSeleccionada || !archivoInventario) {
      return;
    }

    setOperacionInventario("validando");
    setErrorInventario(null);
    setValidacionInventario(null);
    setRegistroInventario(null);
    setProcesamientoInventario(null);

    try {
      const resultado = await validarInventarioSucursal(
        recepcionSeleccionada.qa_ciclo_id,
        recepcionSeleccionada.sucursal_id,
        archivoInventario
      );

      setValidacionInventario(resultado);
    } catch (error) {
      setErrorInventario(
        error instanceof Error
          ? error.message
          : "No se pudo validar el inventario."
      );
    } finally {
      setOperacionInventario(null);
    }
  };

  const manejarRegistrarInventario = async () => {
    if (
      !recepcionSeleccionada
      || !archivoInventario
      || !validacionInventario?.validado
    ) {
      return;
    }

    setOperacionInventario("registrando");
    setErrorInventario(null);
    setRegistroInventario(null);
    setProcesamientoInventario(null);

    try {
      const resultado = await registrarInventarioSucursal(
        recepcionSeleccionada.qa_ciclo_id,
        recepcionSeleccionada.sucursal_id,
        archivoInventario
      );

      setRegistroInventario(resultado);
      await cargarRecepciones();
    } catch (error) {
      setErrorInventario(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la carga del inventario."
      );
    } finally {
      setOperacionInventario(null);
    }
  };

  const manejarProcesarInventario = async () => {
    if (
      !recepcionSeleccionada
      || !archivoInventario
      || !registroInventario
    ) {
      return;
    }

    setOperacionInventario("procesando");
    setErrorInventario(null);
    setProcesamientoInventario(null);

    try {
      const resultado = await procesarInventarioSucursal(
        recepcionSeleccionada.qa_ciclo_id,
        recepcionSeleccionada.sucursal_id,
        registroInventario.carga_id,
        archivoInventario
      );

      setProcesamientoInventario(resultado);
      await cargarRecepciones();
    } catch (error) {
      setErrorInventario(
        error instanceof Error
          ? error.message
          : "No se pudo procesar el inventario."
      );
    } finally {
      setOperacionInventario(null);
    }
  };

  if (!usuario) {
    return null;
  }

  const renderMiSucursal = () => (
    <>
      <section className="nexo-sucursal-heading">
        <div>
          <span className="nexo-sucursal-eyebrow">
            MI ACCESO
          </span>

          <h2>Mi sucursal</h2>

          <p>
            Solo puedes trabajar con las sucursales asignadas a tu usuario.
          </p>
        </div>

        <div className="nexo-sucursal-role-chip">
          SUCURSAL
        </div>
      </section>

      {sucursales.length === 0 ? (
        <section className="nexo-sucursal-empty">
          <strong>No tienes sucursales asignadas.</strong>
          <p>
            Un administrador debe asignar al menos una sucursal antes de
            habilitar operaciones de inventario.
          </p>
        </section>
      ) : (
        <section className="nexo-sucursal-grid">
          {sucursales.map((sucursal) => (
            <article
              key={sucursal.sucursal_id}
              className="nexo-sucursal-card"
            >
              <div className="nexo-sucursal-card-header">
                <div className="nexo-sucursal-card-mark">
                  {sucursal.sucursal_id}
                </div>

                <span className="nexo-sucursal-status-chip">
                  ASIGNADA
                </span>
              </div>

              <div className="nexo-sucursal-card-body">
                <span>EMPRESA</span>
                <strong>{sucursal.empresa}</strong>

                <span>SUCURSAL</span>
                <h3>{sucursal.sucursal}</h3>
              </div>

              {sucursal.identificador_inventario && (
                <div className="nexo-sucursal-identifier">
                  <span>IDENTIFICADOR DE INVENTARIO</span>
                  <code>{sucursal.identificador_inventario}</code>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <section className="nexo-sucursal-permissions">
        <div>
          <span className="nexo-sucursal-eyebrow">
            PERMISOS
          </span>
          <h2>Acceso restringido por rol</h2>
        </div>

        <div className="nexo-sucursal-permissions-grid">
          <div className="nexo-sucursal-permission is-allowed">
            <strong>Disponible</strong>
            <span>Ver las sucursales asignadas</span>
          </div>

          <div className="nexo-sucursal-permission is-allowed">
            <strong>Disponible</strong>
            <span>Consultar inventario sincronizado de la sucursal</span>
          </div>

          <div className="nexo-sucursal-permission is-allowed">
            <strong>Disponible</strong>
            <span>Consultar estado de recepción</span>
          </div>

          <div className="nexo-sucursal-permission is-blocked">
            <strong>Sin acceso</strong>
            <span>Administración y visor QA global</span>
          </div>
        </div>
      </section>
    </>
  );

  const renderInventarios = () => {
    const bloqueado = operacionInventario !== null;

    return (
      <>
        <section className="nexo-sucursal-heading">
          <div>
            <span className="nexo-sucursal-eyebrow">
              INVENTARIO
            </span>

            <h2>Cargar inventario</h2>

            <p>
              Selecciona un ciclo en recepción y completa las tres etapas:
              validar, registrar y procesar.
            </p>
          </div>

          <button
            type="button"
            className="nexo-sucursal-refresh"
            onClick={() => void cargarRecepciones()}
            disabled={cargandoRecepciones || bloqueado}
          >
            {cargandoRecepciones ? "Actualizando..." : "Actualizar ciclos"}
          </button>
        </section>

        {errorRecepciones && (
          <section className="nexo-sucursal-message is-error">
            <strong>No se pudieron consultar los ciclos.</strong>
            <span>{errorRecepciones}</span>
          </section>
        )}

        {!errorRecepciones
          && cargandoRecepciones
          && recepciones.length === 0 && (
            <section className="nexo-sucursal-message">
              <strong>Consultando ciclos...</strong>
              <span>
                Estamos buscando recepciones habilitadas para tus sucursales.
              </span>
            </section>
          )}

        {!errorRecepciones
          && !cargandoRecepciones
          && recepcionesDisponibles.length === 0 && (
            <section className="nexo-sucursal-empty">
              <strong>No tienes ciclos abiertos para carga de inventario.</strong>
              <p>
                El administrador debe mantener el ciclo en estado RECEPCION
                para permitir nuevas cargas o reemplazos.
              </p>
            </section>
          )}

        {recepcionesDisponibles.length > 0 && (
          <section className="nexo-inventario-panel">
            <div className="nexo-inventario-target">
              <label htmlFor="nexo-inventario-recepcion">
                CICLO Y SUCURSAL
              </label>

              <select
                id="nexo-inventario-recepcion"
                value={recepcionSeleccionadaId ?? ""}
                onChange={(event) =>
                  manejarCambioRecepcion(Number(event.target.value))
                }
                disabled={bloqueado}
              >
                {recepcionesDisponibles.map((recepcion) => (
                  <option
                    key={recepcion.qa_ciclo_sucursal_id}
                    value={recepcion.qa_ciclo_sucursal_id}
                  >
                    {recepcion.ciclo} · {recepcion.empresa} · {recepcion.sucursal}
                  </option>
                ))}
              </select>
            </div>

            {recepcionSeleccionada && (
              <div className="nexo-inventario-target-info">
                <div>
                  <span>CICLO</span>
                  <strong>{recepcionSeleccionada.ciclo}</strong>
                </div>

                <div>
                  <span>EMPRESA</span>
                  <strong>{recepcionSeleccionada.empresa}</strong>
                </div>

                <div>
                  <span>SUCURSAL</span>
                  <strong>{recepcionSeleccionada.sucursal}</strong>
                </div>

                <div>
                  <span>ESTADO ACTUAL</span>
                  <strong>{recepcionSeleccionada.estado_recepcion}</strong>
                </div>
              </div>
            )}

            <div className="nexo-inventario-file-area">
              <div>
                <span className="nexo-sucursal-eyebrow">
                  ARCHIVO CSV
                </span>
                <strong>
                  {archivoInventario
                    ? archivoInventario.name
                    : "Selecciona el inventario de la sucursal"}
                </strong>

                {archivoInventario && (
                  <small>{formatearBytes(archivoInventario.size)}</small>
                )}
              </div>

              <label className="nexo-inventario-file-button">
                Seleccionar CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    manejarCambioArchivo(event.target.files?.[0] ?? null)
                  }
                  disabled={bloqueado}
                />
              </label>
            </div>

            {recepcionSeleccionada?.carga_id !== null
              && recepcionSeleccionada?.carga_id !== undefined && (
                <div className="nexo-inventario-warning">
                  <strong>Ya existe una carga actual.</strong>
                  <span>
                    Si registras un archivo diferente durante RECEPCION, el
                    backend aplicará el versionado y conservará el historial.
                  </span>
                </div>
              )}

            {errorInventario && (
              <div className="nexo-sucursal-message is-error">
                <strong>La operación no pudo completarse.</strong>
                <span>{errorInventario}</span>
              </div>
            )}

            <div className="nexo-inventario-steps">
              <article
                className={`nexo-inventario-step ${
                  validacionInventario?.validado ? "is-complete" : ""
                }`}
              >
                <div className="nexo-inventario-step-number">1</div>
                <div className="nexo-inventario-step-copy">
                  <strong>Validar archivo</strong>
                  <span>
                    Revisa estructura, sucursal, códigos y huella SHA-256.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void manejarValidarInventario()}
                  disabled={
                    bloqueado
                    || !recepcionSeleccionada
                    || !archivoInventario
                  }
                >
                  {operacionInventario === "validando"
                    ? "Validando..."
                    : validacionInventario?.validado
                      ? "Validado"
                      : "Validar"}
                </button>
              </article>

              <article
                className={`nexo-inventario-step ${
                  registroInventario?.registrado ? "is-complete" : ""
                }`}
              >
                <div className="nexo-inventario-step-number">2</div>
                <div className="nexo-inventario-step-copy">
                  <strong>Registrar carga</strong>
                  <span>
                    Crea la versión formal de la carga dentro del ciclo QA.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void manejarRegistrarInventario()}
                  disabled={
                    bloqueado
                    || !validacionInventario?.validado
                    || registroInventario !== null
                  }
                >
                  {operacionInventario === "registrando"
                    ? "Registrando..."
                    : registroInventario?.registrado
                      ? "Registrado"
                      : "Registrar"}
                </button>
              </article>

              <article
                className={`nexo-inventario-step ${
                  procesamientoInventario?.procesado ? "is-complete" : ""
                }`}
              >
                <div className="nexo-inventario-step-number">3</div>
                <div className="nexo-inventario-step-copy">
                  <strong>Procesar inventario</strong>
                  <span>
                    Inserta el detalle y deja la recepción en VALIDADO.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void manejarProcesarInventario()}
                  disabled={
                    bloqueado
                    || !registroInventario
                    || procesamientoInventario !== null
                  }
                >
                  {operacionInventario === "procesando"
                    ? "Procesando..."
                    : procesamientoInventario?.procesado
                      ? "Procesado"
                      : "Procesar"}
                </button>
              </article>
            </div>

            {validacionInventario && (
              <section className="nexo-inventario-result is-validacion">
                <div className="nexo-inventario-result-heading">
                  <div>
                    <span className="nexo-sucursal-eyebrow">
                      ETAPA 1 COMPLETADA
                    </span>
                    <h3>Archivo validado</h3>
                  </div>

                  <span className="nexo-inventario-result-chip">
                    {validacionInventario.total_registros} registros
                  </span>
                </div>

                <div className="nexo-inventario-result-grid">
                  <div>
                    <span>SUCURSAL ARCHIVO</span>
                    <strong>{validacionInventario.sucursal_archivo}</strong>
                  </div>

                  <div>
                    <span>ENCODING</span>
                    <strong>{validacionInventario.encoding}</strong>
                  </div>

                  <div>
                    <span>DELIMITADOR</span>
                    <strong>{validacionInventario.delimitador}</strong>
                  </div>

                  <div>
                    <span>TAMAÑO</span>
                    <strong>
                      {formatearBytes(validacionInventario.archivo_tamano_bytes)}
                    </strong>
                  </div>
                </div>

                <div className="nexo-inventario-hash">
                  <span>SHA-256</span>
                  <code>{validacionInventario.archivo_sha256}</code>
                </div>
              </section>
            )}

            {registroInventario && (
              <section className="nexo-inventario-result is-registro">
                <div className="nexo-inventario-result-heading">
                  <div>
                    <span className="nexo-sucursal-eyebrow">
                      ETAPA 2 COMPLETADA
                    </span>
                    <h3>Carga registrada</h3>
                  </div>

                  <span className="nexo-inventario-result-chip">
                    ID {registroInventario.carga_id} · v{registroInventario.version}
                  </span>
                </div>

                <div className="nexo-inventario-result-grid">
                  <div>
                    <span>ESTADO</span>
                    <strong>{registroInventario.estado}</strong>
                  </div>

                  <div>
                    <span>RECEPCIÓN</span>
                    <strong>{registroInventario.estado_recepcion}</strong>
                  </div>

                  <div>
                    <span>REGISTROS</span>
                    <strong>{registroInventario.total_registros}</strong>
                  </div>

                  <div>
                    <span>RECIBIDO</span>
                    <strong>{formatearFecha(registroInventario.recibido_at)}</strong>
                  </div>
                </div>
              </section>
            )}

            {procesamientoInventario && (
              <section className="nexo-inventario-result is-procesamiento">
                <div className="nexo-inventario-result-heading">
                  <div>
                    <span className="nexo-sucursal-eyebrow">
                      ETAPA 3 COMPLETADA
                    </span>
                    <h3>Inventario validado</h3>
                  </div>

                  <span className="nexo-inventario-result-chip is-success">
                    {procesamientoInventario.estado_recepcion}
                  </span>
                </div>

                <div className="nexo-inventario-result-grid">
                  <div>
                    <span>DETALLES INSERTADOS</span>
                    <strong>{procesamientoInventario.detalles_insertados}</strong>
                  </div>

                  <div>
                    <span>VÁLIDOS</span>
                    <strong>{procesamientoInventario.registros_validos}</strong>
                  </div>

                  <div>
                    <span>INVÁLIDOS</span>
                    <strong>{procesamientoInventario.registros_invalidos}</strong>
                  </div>

                  <div>
                    <span>PROCESADO</span>
                    <strong>
                      {formatearFecha(procesamientoInventario.procesado_at)}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="nexo-inventario-go-recepcion"
                  onClick={() => setVistaActiva("recepcion")}
                >
                  Ver estado de recepción
                </button>
              </section>
            )}
          </section>
        )}
      </>
    );
  };

  const renderEstadoRecepcion = () => (
    <>
      <section className="nexo-sucursal-heading">
        <div>
          <span className="nexo-sucursal-eyebrow">
            RECEPCIÓN QA
          </span>

          <h2>Estado de recepción</h2>

          <p>
            Consulta el estado de tus sucursales dentro de cada ciclo QA.
          </p>
        </div>

        <button
          type="button"
          className="nexo-sucursal-refresh"
          onClick={() => void cargarRecepciones()}
          disabled={cargandoRecepciones}
        >
          {cargandoRecepciones ? "Actualizando..." : "Actualizar"}
        </button>
      </section>

      {errorRecepciones && (
        <section className="nexo-sucursal-message is-error">
          <strong>No se pudo cargar la recepción.</strong>
          <span>{errorRecepciones}</span>
        </section>
      )}

      {!errorRecepciones && cargandoRecepciones && recepciones.length === 0 && (
        <section className="nexo-sucursal-message">
          <strong>Consultando recepción...</strong>
          <span>Estamos recuperando los ciclos asociados a tu usuario.</span>
        </section>
      )}

      {!errorRecepciones && !cargandoRecepciones && recepciones.length === 0 && (
        <section className="nexo-sucursal-empty">
          <strong>No hay ciclos QA asociados a tus sucursales.</strong>
          <p>
            Cuando el administrador agregue una de tus sucursales a un ciclo,
            aparecerá aquí automáticamente.
          </p>
        </section>
      )}

      {recepciones.length > 0 && (
        <section className="nexo-recepcion-grid">
          {recepciones.map((recepcion) => (
            <article
              key={recepcion.qa_ciclo_sucursal_id}
              className="nexo-recepcion-card"
            >
              <div className="nexo-recepcion-card-header">
                <div>
                  <span className="nexo-sucursal-eyebrow">
                    CICLO QA #{recepcion.qa_ciclo_id}
                  </span>
                  <h3>{recepcion.ciclo}</h3>
                </div>

                <span
                  className={`nexo-recepcion-state is-${claseEstado(
                    recepcion.estado_recepcion
                  )}`}
                >
                  {recepcion.estado_recepcion}
                </span>
              </div>

              <div className="nexo-recepcion-meta">
                <div>
                  <span>EMPRESA</span>
                  <strong>{recepcion.empresa}</strong>
                </div>

                <div>
                  <span>SUCURSAL</span>
                  <strong>{recepcion.sucursal}</strong>
                </div>

                <div>
                  <span>ESTADO DEL CICLO</span>
                  <strong>{recepcion.estado_ciclo}</strong>
                </div>

                <div>
                  <span>PUEDE CARGAR</span>
                  <strong>
                    {recepcion.puede_cargar_inventario ? "Sí" : "No"}
                  </strong>
                </div>
              </div>

              <div className="nexo-recepcion-timeline">
                <div>
                  <span>Recibido</span>
                  <strong>{formatearFecha(recepcion.recibido_at)}</strong>
                </div>

                <div>
                  <span>Validado</span>
                  <strong>{formatearFecha(recepcion.validado_at)}</strong>
                </div>
              </div>

              <div className="nexo-recepcion-load">
                <div className="nexo-recepcion-load-title">
                  <strong>Carga actual</strong>

                  {recepcion.carga_id !== null && (
                    <span>
                      ID {recepcion.carga_id} · v{recepcion.carga_version}
                    </span>
                  )}
                </div>

                {recepcion.carga_id === null ? (
                  <p>Todavía no existe una carga registrada.</p>
                ) : (
                  <div className="nexo-recepcion-load-grid">
                    <div>
                      <span>ARCHIVO</span>
                      <strong>{recepcion.archivo_nombre ?? "—"}</strong>
                    </div>

                    <div>
                      <span>ESTADO</span>
                      <strong>{recepcion.estado_carga ?? "—"}</strong>
                    </div>

                    <div>
                      <span>REGISTROS</span>
                      <strong>{recepcion.total_registros ?? 0}</strong>
                    </div>

                    <div>
                      <span>VÁLIDOS</span>
                      <strong>{recepcion.registros_validos ?? 0}</strong>
                    </div>

                    <div>
                      <span>INVÁLIDOS</span>
                      <strong>{recepcion.registros_invalidos ?? 0}</strong>
                    </div>

                    <div>
                      <span>PROCESADO</span>
                      <strong>
                        {formatearFecha(recepcion.carga_procesado_at)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {recepcion.observacion && (
                <div className="nexo-recepcion-observation">
                  <span>OBSERVACIÓN</span>
                  <p>{recepcion.observacion}</p>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );

  return (
    <div className="nexo-sucursal-app">
      <aside className="nexo-sucursal-sidebar">
        <div className="nexo-sucursal-brand">
          <div className="nexo-sucursal-brand-mark">NQ</div>

          <div>
            <strong>NEXO QA</strong>
            <span>Portal de Sucursal</span>
          </div>
        </div>

        <nav className="nexo-sucursal-nav">
          <div className="nexo-sucursal-nav-group">
            SUCURSAL
          </div>

          <button
            type="button"
            className={
              vistaActiva === "sucursal"
                ? "nexo-sucursal-nav-item is-active"
                : "nexo-sucursal-nav-item"
            }
            onClick={() => setVistaActiva("sucursal")}
          >
            <span className="nexo-sucursal-nav-icon">⌂</span>
            <span>Mi sucursal</span>
          </button>


          <button
            type="button"
            className={
              vistaActiva === "recepcion"
                ? "nexo-sucursal-nav-item is-active"
                : "nexo-sucursal-nav-item"
            }
            onClick={() => setVistaActiva("recepcion")}
          >
            <span className="nexo-sucursal-nav-icon">✓</span>
            <span>Estado de recepción</span>
          </button>

          <div className="nexo-sucursal-nav-group">
            MI CUENTA
          </div>

          <button
            type="button"
            className={
              vistaActiva === "perfil"
                ? "nexo-sucursal-nav-item is-active"
                : "nexo-sucursal-nav-item"
            }
            onClick={() => setVistaActiva("perfil")}
          >
            <span className="nexo-sucursal-nav-icon">◉</span>
            <span>Mi perfil</span>
          </button>
        </nav>

        <div className="nexo-sucursal-sidebar-footer">
          <span>ROL</span>
          <strong>{usuario.rol}</strong>
        </div>
      </aside>

      <div className="nexo-sucursal-workspace">
        <header className="nexo-sucursal-topbar">
          <div>
            <h1>NEXO QA</h1>
            <p>Acceso de sucursal</p>
          </div>

          <div className="nexo-sucursal-user-area">
            <div className="nexo-sucursal-user">
              <strong>{usuario.nombre}</strong>
              <span>{usuario.username}</span>
            </div>

            <button
              type="button"
              className="nexo-logout-button"
              onClick={cerrar}
            >
              Salir
            </button>
          </div>
        </header>

        <main className="nexo-sucursal-content">
          {vistaActiva === "sucursal" && renderMiSucursal()}
          {vistaActiva === "inventarios" && renderInventarios()}
          {vistaActiva === "recepcion" && renderEstadoRecepcion()}
          {vistaActiva === "perfil" && <PerfilView />}
        </main>
      </div>
    </div>
  );
}
