import {
  type ChangeEvent,
  useEffect,
  useState,
} from "react";

import {
  obtenerEstadoSistema,
  type HealthResponse,
} from "../services/systemService";

import {
  obtenerEjecuciones,
  obtenerFiltrosQA,
  obtenerResultadosQA,
} from "../services/qaService";

import {
  importarArchivoQA,
  validarArchivoQA,
} from "../services/qaImportService";

import {
  cambiarEstadoDiferencia,
  obtenerDiferenciasQA,
  obtenerFiltrosDiferencias,
  obtenerHistorialCorrecciones,
  obtenerFiltrosHistorialCorrecciones,
} from "../services/diferenciaService";

import {
  obtenerMetricasResumen,
  obtenerMetricasTipos,
  obtenerMetricasEmpresas,
  obtenerMetricasSucursales,
} from "../services/metricaService";

import type {
  QAEjecucion,
  QAFiltrosConsulta,
  QAFiltrosDisponibles,
  QAFiltrosDiferencias,
  QAImportacionResultado,
  QAPaginaDiferencias,
  QAPaginaResultados,
  QAValidacionArchivo,
  QAFiltrosConsultaHistorial,
  QAFiltrosHistorialCorrecciones,
  QAPaginaHistorialCorrecciones,
  QAMetricasResumen,
  QAMetricasTiposDiferencia,
  QAMetricasEmpresas,
  QAMetricasSucursales,
} from "../types/qa";

// ============================================================
// VALORES INICIALES DE FILTROS
// ============================================================

const FILTROS_VACIOS: QAFiltrosConsulta = {
    codigo_barra: "",
    referencia: "",
    estado: "",
    empresa: "",
    sucursal: "",
    orden_por: "id",
    direccion: "asc",
};

const FILTROS_HISTORIAL_VACIOS:
  QAFiltrosConsultaHistorial = {

    codigo_barra: "",
    tipo_diferencia: "",
    empresa: "",
    sucursal: "",

};

export function useNexoQaController() {

  // ============================================================
  // SISTEMA
  // ============================================================

const [
  sidebarContraido,
  setSidebarContraido,
] = useState(false);



// ============================================================
// NAVEGACIÓN / VISTA ACTIVA
// ============================================================

const [
  menuActivo,
  setMenuActivo,
] = useState("consulta");

const [
    estadoSistema,
    setEstadoSistema,
] = useState<HealthResponse | null>(
    null
);


  // ============================================================
  // EJECUCIONES
  // ============================================================

const [
    ejecuciones,
    setEjecuciones,
] = useState<QAEjecucion[]>([]);


const [
    cargando,
    setCargando,
] = useState(true);


  // ============================================================
  // IMPORTACIÓN
  // ============================================================

const [
    archivoQA,
    setArchivoQA,
] = useState<File | null>(
    null
);


const [
    validandoArchivo,
    setValidandoArchivo,
] = useState(false);


const [
    resultadoValidacion,
    setResultadoValidacion,
] = useState<QAValidacionArchivo | null>(
    null
);


const [
    nombreEjecucion,
    setNombreEjecucion,
] = useState("");

const [
    fechaReferencia,
    setFechaReferencia,
] = useState("");

const [
    descripcion,
    setDescripcion,
] = useState("");

const [
    importando,
    setImportando,
] = useState(false);

const [
    resultadoImportacion,
    setResultadoImportacion,
] = useState<QAImportacionResultado | null>(
    null
);


  // ============================================================
  // CONSULTA GENERAL
  // ============================================================

const [
    ejecucionSeleccionadaId,
    setEjecucionSeleccionadaId,
] = useState<number | null>(
    null
);


const [
    paginaResultados,
    setPaginaResultados,
] = useState(1);


const [
    tamanoPagina,
    setTamanoPagina,
] = useState(100);


const [
    paginaQA,
    setPaginaQA,
] = useState<QAPaginaResultados | null>(
    null
);

const [
    cargandoResultados,
    setCargandoResultados,
] = useState(false);

const [
    errorConsulta,
    setErrorConsulta,
] = useState<string | null>(
    null
);


  // ============================================================
  // FILTROS
  // ============================================================

const [
    filtrosDisponibles,
    setFiltrosDisponibles,
] = useState<QAFiltrosDisponibles | null>(
    null
);

const [
    filtrosFormulario,
    setFiltrosFormulario,
] = useState<QAFiltrosConsulta>({
    ...FILTROS_VACIOS,
});

const [
    filtrosAplicados,
    setFiltrosAplicados,
] = useState<QAFiltrosConsulta>({
    ...FILTROS_VACIOS,
});

// ============================================================
// MÓDULO DIFERENCIAS
// ============================================================

const [
  filtrosDiferenciasDisponibles,
  setFiltrosDiferenciasDisponibles,
] = useState<QAFiltrosDiferencias | null>(
  null
);


const [
  tipoDiferenciaSeleccionado,
  setTipoDiferenciaSeleccionado,
] = useState("");


const [
  estadoCorreccionSeleccionado,
  setEstadoCorreccionSeleccionado,
] = useState(
  "PENDIENTE"
);

const [
  codigoBarraDiferenciasFormulario,
  setCodigoBarraDiferenciasFormulario,
] = useState("");


const [
  codigoBarraDiferenciasAplicado,
  setCodigoBarraDiferenciasAplicado,
] = useState("");


const [
  empresaDiferencias,
  setEmpresaDiferencias,
] = useState("");


const [
  sucursalDiferencias,
  setSucursalDiferencias,
] = useState("");


const [
  paginaDiferencias,
  setPaginaDiferencias,
] = useState(1);


const [
  tamanoPaginaDiferencias,
  setTamanoPaginaDiferencias,
] = useState(100);


const [
  paginaQADiferencias,
  setPaginaQADiferencias,
] = useState<QAPaginaDiferencias | null>(
  null
);


const [
  cargandoDiferencias,
  setCargandoDiferencias,
] = useState(false);


const [
  errorDiferencias,
  setErrorDiferencias,
] = useState<string | null>(
  null
);

const [
  diferenciaActualizandoId,
  setDiferenciaActualizandoId,
] = useState<number | null>(
  null
);


const [
  recargaDiferencias,
  setRecargaDiferencias,
] = useState(0);


// ============================================================
// MÓDULO HISTORIAL
// ============================================================

const [
  filtrosHistorialDisponibles,
  setFiltrosHistorialDisponibles,
] = useState<QAFiltrosHistorialCorrecciones | null>(
  null
);


const [
  filtrosHistorialFormulario,
  setFiltrosHistorialFormulario,
] = useState<QAFiltrosConsultaHistorial>({
  ...FILTROS_HISTORIAL_VACIOS,
});


const [
  filtrosHistorialAplicados,
  setFiltrosHistorialAplicados,
] = useState<QAFiltrosConsultaHistorial>({
  ...FILTROS_HISTORIAL_VACIOS,
});


const [
  paginaHistorial,
  setPaginaHistorial,
] = useState(1);


const [
  tamanoPaginaHistorial,
  setTamanoPaginaHistorial,
] = useState(100);


const [
  paginaQAHistorial,
  setPaginaQAHistorial,
] = useState<QAPaginaHistorialCorrecciones | null>(
  null
);


const [
  cargandoHistorial,
  setCargandoHistorial,
] = useState(false);


const [
  errorHistorial,
  setErrorHistorial,
] = useState<string | null>(
  null
);


// ============================================================
// MÓDULO MÉTRICAS
// ============================================================

const [
  metricasResumen,
  setMetricasResumen,
] = useState<QAMetricasResumen | null>(
  null
);


const [
  metricasTipos,
  setMetricasTipos,
] = useState<QAMetricasTiposDiferencia | null>(
  null
);


const [
  metricasEmpresas,
  setMetricasEmpresas,
] = useState<QAMetricasEmpresas | null>(
  null
);


const [
  metricasSucursales,
  setMetricasSucursales,
] = useState<QAMetricasSucursales | null>(
  null
);


const [
  cargandoMetricas,
  setCargandoMetricas,
] = useState(false);


const [
  errorMetricas,
  setErrorMetricas,
] = useState<string | null>(
  null
);


  // ============================================================
  // ERROR GENERAL
  // ============================================================

const [
    error,
    setError,
] = useState<string | null>(
    null
);


  // ============================================================
  // CARGA INICIAL
  // ============================================================

useEffect(() => {

async function cargarDatos() {

    try {

    setCargando(true);

    setError(null);


    const [
        estado,
        listaEjecuciones,
    ] = await Promise.all([
        obtenerEstadoSistema(),
        obtenerEjecuciones(),
    ]);


    setEstadoSistema(
        estado
    );


    setEjecuciones(
        listaEjecuciones
    );


    const ultimaCompletada =
        listaEjecuciones.find(
        (ejecucion) =>
            ejecucion.estado === "COMPLETADA"
            ||
            ejecucion.estado === "CERRADA"
        );


        if (ultimaCompletada) {

    setEjecucionSeleccionadaId(
        ultimaCompletada.id
    );

        }

    } catch {

    setError(
        "No se pudo cargar la información inicial de NEXO QA."
    );

    } finally {

        setCargando(false);

    }

    }


    cargarDatos();

}, []);


// ============================================================
// CARGAR FILTROS DISPONIBLES
// EMPRESA → SUCURSAL DEPENDIENTE
// ============================================================

useEffect(() => {

  if (
    ejecucionSeleccionadaId
    === null
  ) {

    setFiltrosDisponibles(
      null
    );

    return;

  }


  const ejecucionId: number =
    ejecucionSeleccionadaId;


  const empresaSeleccionada =
    filtrosFormulario
      .empresa;


  async function cargarFiltros() {

    try {

      setErrorConsulta(
        null
      );


      const filtros =
        await obtenerFiltrosQA(
          ejecucionId,
          empresaSeleccionada
        );


      setFiltrosDisponibles(
        filtros
      );

    } catch (error) {

      setFiltrosDisponibles(
        null
      );


      if (
        error instanceof Error
      ) {

        setErrorConsulta(
          error.message
        );

      } else {

        setErrorConsulta(
          "No se pudieron cargar los filtros."
        );

      }

    }

  }


  cargarFiltros();

}, [
  ejecucionSeleccionadaId,
  filtrosFormulario.empresa,
]);


  // ============================================================
  // CARGAR CONSULTA GENERAL
  // ============================================================

useEffect(() => {

    if (ejecucionSeleccionadaId === null) {

    setPaginaQA(
        null
    );

    return;
    }


    const ejecucionId: number =
        ejecucionSeleccionadaId;


    async function cargarResultados() {

    try {

    setCargandoResultados(
        true
    );

    setErrorConsulta(
        null
    );


    const resultado =
        await obtenerResultadosQA(
        ejecucionId,
        paginaResultados,
        tamanoPagina,
        filtrosAplicados
    );


    setPaginaQA(
        resultado
    );

    } catch (error) {

    setPaginaQA(
        null
    );


        if (error instanceof Error) {

    setErrorConsulta(
        error.message
    );

        } else {

    setErrorConsulta(
        "No se pudo cargar la Consulta General."
    );

    }

    } finally {

    setCargandoResultados(
        false
    );

    }

    }


    cargarResultados();

}, [
    ejecucionSeleccionadaId,
    paginaResultados,
    tamanoPagina,
    filtrosAplicados,
]);


// ============================================================
// CARGAR FILTROS DEL MÓDULO DIFERENCIAS
// ============================================================

useEffect(() => {

  if (
    ejecucionSeleccionadaId
    === null
  ) {

    setFiltrosDiferenciasDisponibles(
      null
    );

    setPaginaQADiferencias(
      null
    );

    return;
  }


  const ejecucionId: number =
    ejecucionSeleccionadaId;


  async function cargarFiltrosDiferencias() {

    try {

      setErrorDiferencias(
        null
      );


      const filtros =
        await obtenerFiltrosDiferencias(
          ejecucionId,
          empresaDiferencias
        );


      setFiltrosDiferenciasDisponibles(
        filtros
      );

    } catch (error) {

      setFiltrosDiferenciasDisponibles(
        null
      );


      if (
        error instanceof Error
      ) {

        setErrorDiferencias(
          error.message
        );

      } else {

        setErrorDiferencias(
          "No se pudieron cargar los filtros de Diferencias."
        );

      }

    }

  }


  cargarFiltrosDiferencias();

}, [
  ejecucionSeleccionadaId,
  empresaDiferencias,
]);


// ============================================================
// CARGAR DIFERENCIAS
// ============================================================

useEffect(() => {

  if (
    ejecucionSeleccionadaId
    === null
  ) {

    setPaginaQADiferencias(
      null
    );

    return;

  }


  const ejecucionId: number =
    ejecucionSeleccionadaId;


  async function cargarDiferencias() {

    try {

      setCargandoDiferencias(
        true
      );

      setErrorDiferencias(
        null
      );


      const resultado =
        await obtenerDiferenciasQA(
          ejecucionId,
          paginaDiferencias,
          tamanoPaginaDiferencias,
{
  tipo_diferencia:
    tipoDiferenciaSeleccionado,

  estado_correccion:
    estadoCorreccionSeleccionado,

  codigo_barra:
    codigoBarraDiferenciasAplicado,

  empresa:
    empresaDiferencias,

  sucursal:
    sucursalDiferencias,
}
        );


      setPaginaQADiferencias(
        resultado
      );

    } catch (error) {

      setPaginaQADiferencias(
        null
      );


      if (
        error instanceof Error
      ) {

        setErrorDiferencias(
          error.message
        );

      } else {

        setErrorDiferencias(
          "No se pudieron cargar las diferencias."
        );

      }

    } finally {

      setCargandoDiferencias(
        false
      );

    }

  }


  cargarDiferencias();

}, [
  ejecucionSeleccionadaId,
  paginaDiferencias,
  tamanoPaginaDiferencias,
  tipoDiferenciaSeleccionado,
  estadoCorreccionSeleccionado,
  codigoBarraDiferenciasAplicado,
  empresaDiferencias,
  sucursalDiferencias,
  recargaDiferencias,
]);


// ============================================================
// CARGAR FILTROS DEL HISTORIAL
// ============================================================

useEffect(() => {

  if (
    menuActivo !== "historial"
  ) {
    return;
  }


  if (
    ejecucionSeleccionadaId
    === null
  ) {

    setFiltrosHistorialDisponibles(
      null
    );

    setPaginaQAHistorial(
      null
    );

    return;
  }


  const ejecucionId: number =
    ejecucionSeleccionadaId;


  async function cargarFiltrosHistorial() {

    try {

      setErrorHistorial(
        null
      );


      const filtros =
        await obtenerFiltrosHistorialCorrecciones(
          ejecucionId,
          filtrosHistorialFormulario.empresa
        );


      setFiltrosHistorialDisponibles(
        filtros
      );


      // Si la empresa cambia y la sucursal
      // seleccionada ya no pertenece a ella,
      // limpiamos solamente la sucursal.

      if (
        filtrosHistorialFormulario.sucursal
        &&
        !filtros.sucursales.includes(
          filtrosHistorialFormulario.sucursal
        )
      ) {

        setFiltrosHistorialFormulario(
          (actual) => ({
            ...actual,
            sucursal: "",
          })
        );

      }

    } catch (error) {

      setFiltrosHistorialDisponibles(
        null
      );


      if (
        error instanceof Error
      ) {

        setErrorHistorial(
          error.message
        );

      } else {

        setErrorHistorial(
          "No se pudieron cargar los filtros del historial."
        );

      }

    }

  }


  cargarFiltrosHistorial();

}, [
  menuActivo,
  ejecucionSeleccionadaId,
  filtrosHistorialFormulario.empresa,
]);


// ============================================================
// CARGAR HISTORIAL GENERAL DE CORRECCIONES
// ============================================================

useEffect(() => {

  if (
    menuActivo !== "historial"
  ) {
    return;
  }


  if (
    ejecucionSeleccionadaId
    === null
  ) {

    setPaginaQAHistorial(
      null
    );

    return;
  }


  const ejecucionId: number =
    ejecucionSeleccionadaId;


  async function cargarHistorial() {

    try {

      setCargandoHistorial(
        true
      );

      setErrorHistorial(
        null
      );


      const resultado =
        await obtenerHistorialCorrecciones(
          ejecucionId,
          paginaHistorial,
          tamanoPaginaHistorial,
          filtrosHistorialAplicados
        );


      setPaginaQAHistorial(
        resultado
      );

    } catch (error) {

      setPaginaQAHistorial(
        null
      );


      if (
        error instanceof Error
      ) {

        setErrorHistorial(
          error.message
        );

      } else {

        setErrorHistorial(
          "No se pudo cargar el historial de correcciones."
        );

      }

    } finally {

      setCargandoHistorial(
        false
      );

    }

  }


  cargarHistorial();

}, [
  menuActivo,
  ejecucionSeleccionadaId,
  paginaHistorial,
  tamanoPaginaHistorial,
  filtrosHistorialAplicados,
]);


// ============================================================
// CARGAR MÉTRICAS
// ============================================================

useEffect(() => {

  if (
    menuActivo !== "metricas"
    &&
    menuActivo !== "dashboard"
  ) {
    return;
  }


  if (
    ejecucionSeleccionadaId
    === null
  ) {

    setMetricasResumen(
      null
    );

    setMetricasTipos(
      null
    );

    setMetricasEmpresas(
      null
    );

    setMetricasSucursales(
      null
    );

    return;

  }


  const ejecucionId: number =
    ejecucionSeleccionadaId;


  let cancelado = false;


async function cargarMetricas() {


    if (
      metricasResumen
      &&
      metricasTipos
      &&
      metricasEmpresas
      &&
      metricasSucursales
    ) {

      return;

    }


    try {

      setCargandoMetricas(
        true
      );

      setErrorMetricas(
        null
      );


      // Cargamos las métricas de forma secuencial.
      // Estas consultas son pesadas y ejecutarlas todas
      // al mismo tiempo puede saturar el backend local.

      const resumen =
        await obtenerMetricasResumen(
          ejecucionId
        );


      if (
        cancelado
      ) {
        return;
      }


      const tipos =
        await obtenerMetricasTipos(
          ejecucionId
        );


      if (
        cancelado
      ) {
        return;
      }


      const empresas =
        await obtenerMetricasEmpresas(
          ejecucionId
        );


      if (
        cancelado
      ) {
        return;
      }


      const sucursales =
        await obtenerMetricasSucursales(
          ejecucionId
        );


      if (
        cancelado
      ) {
        return;
      }


      setMetricasResumen(
        resumen
      );

      setMetricasTipos(
        tipos
      );

      setMetricasEmpresas(
        empresas
      );

      setMetricasSucursales(
        sucursales
      );

    } catch (error) {

      if (
        cancelado
      ) {
        return;
      }


      setMetricasResumen(
        null
      );

      setMetricasTipos(
        null
      );

      setMetricasEmpresas(
        null
      );

      setMetricasSucursales(
        null
      );


      if (
        error instanceof Error
      ) {

        setErrorMetricas(
          error.message
        );

      } else {

        setErrorMetricas(
          "No se pudieron cargar las métricas de la ejecución."
        );

      }

    } finally {

      if (
        !cancelado
      ) {

        setCargandoMetricas(
          false
        );

      }

    }

  }


  cargarMetricas();


  return () => {

    cancelado = true;

  };

}, [
  menuActivo,
  ejecucionSeleccionadaId,
  metricasResumen,
  metricasTipos,
  metricasEmpresas,
  metricasSucursales,
]);



  // ============================================================
  // SELECCIONAR ARCHIVO
  // ============================================================

function manejarSeleccionArchivo(
    event: ChangeEvent<HTMLInputElement>
) {

    const archivo =
        event.target.files?.[0]
        ?? null;


    setArchivoQA(
        archivo
    );


    setResultadoValidacion(
        null
    );


    setResultadoImportacion(
        null
    );


    setError(
        null
    );

}


  // ============================================================
  // VALIDAR ARCHIVO
  // ============================================================

async function manejarValidarArchivo() {

    if (!archivoQA) {

    setError(
        "Debes seleccionar un archivo CSV."
    );

    return;

    }


    try {

    setValidandoArchivo(
        true
    );

    setError(
        null
    );

    setResultadoValidacion(
        null
    );

    setResultadoImportacion(
        null
    );


    const resultado =
    await validarArchivoQA(
        archivoQA
        );


    setResultadoValidacion(
        resultado
    );


    if (!nombreEjecucion.trim()) {

    const nombreSinExtension =
        archivoQA.name.replace(
            /\.csv$/i,
            ""
        );


    setNombreEjecucion(
        nombreSinExtension
    );

    }

    } catch (error) {

    if (error instanceof Error) {

    setError(
        error.message
    );

    } else {

    setError(
        "Ocurrió un error al validar el archivo."
    );

}

    } finally {

    setValidandoArchivo(
        false
    );

    }

}


  // ============================================================
  // IMPORTAR QA
  // ============================================================

async function manejarImportarQA() {

    if (!archivoQA) {

    setError(
        "Debes seleccionar un archivo."
    );

    return;

}


    if (!resultadoValidacion) {

    setError(
        "Debes validar el archivo antes de importarlo."
    );

    return;

    }


    if (!nombreEjecucion.trim()) {

    setError(
        "Debes indicar un nombre para la ejecución QA."
    );

    return;

    }


    try {

    setImportando(
        true
    );

    setError(
        null
    );

    setResultadoImportacion(
        null
    );


    const resultado =
        await importarArchivoQA(
            archivoQA,
            {
            nombre_ejecucion:
                nombreEjecucion.trim(),

            fecha_referencia:
                fechaReferencia || null,

            descripcion:
                descripcion.trim()
                || null,
            }
        );


    setResultadoImportacion(
        resultado
    );


    const listaActualizada =
        await obtenerEjecuciones();


    setEjecuciones(
        listaActualizada
    );


    setFiltrosFormulario({
        ...FILTROS_VACIOS,
    });


    setFiltrosAplicados({
        ...FILTROS_VACIOS,
    });


    setPaginaResultados(
        1
    );


    setEjecucionSeleccionadaId(
        resultado.ejecucion_id
    );

    } catch (error) {

    if (error instanceof Error) {

        setError(
            error.message
        );

    } else {

        setError(
            "Ocurrió un error durante la importación."
        );

    }

    } finally {

    setImportando(
        false
    );

    }

}


// ============================================================
// CONFIGURACIÓN DE DIFERENCIAS SEGÚN LA VISTA ACTIVA
// ============================================================

function obtenerConfiguracionDiferenciasActual() {

  switch (
    menuActivo
  ) {

    case "referencia":

      return {
        tipo:
          "REFERENCIA",

        estado:
          "PENDIENTE",
      };


    case "codigo-marca":

      return {
        tipo:
          "CODIGO_MARCA",

        estado:
          "PENDIENTE",
      };


    case "precio-detal":

      return {
        tipo:
          "PRECIO_DETAL",

        estado:
          "PENDIENTE",
      };


    case "tasa-cambio":

      return {
        tipo:
          "TASA_CAMBIO",

        estado:
          "PENDIENTE",
      };


    case "categoria":

      return {
        tipo:
          "CATEGORIA",

        estado:
          "PENDIENTE",
      };


    case "precio-promocion":

      return {
        tipo:
          "PRECIO_PROMOCION",

        estado:
          "PENDIENTE",
      };


    case "corregidos":

      return {
        tipo:
          "",

        estado:
          "CORREGIDO",
      };


    default:

      return {
        tipo:
          "",

        estado:
          "PENDIENTE",
      };

  }

}


  // ============================================================
  // CAMBIAR EJECUCIÓN
  // ============================================================

function manejarCambioEjecucion(
    event: ChangeEvent<HTMLSelectElement>
) {

    const valor =
        event.target.value;


    setFiltrosFormulario({
        ...FILTROS_VACIOS,
    });


    setFiltrosAplicados({
        ...FILTROS_VACIOS,
    });


    setPaginaResultados(
        1
    );

const configuracionDiferencias =
  obtenerConfiguracionDiferenciasActual();


setTipoDiferenciaSeleccionado(
  configuracionDiferencias.tipo
);


setEstadoCorreccionSeleccionado(
  configuracionDiferencias.estado
);


setCodigoBarraDiferenciasFormulario(
  ""
);


setCodigoBarraDiferenciasAplicado(
  ""
);


setEmpresaDiferencias(
  ""
);


setSucursalDiferencias(
  ""
);


setPaginaDiferencias(
  1
);


// ============================================================
// REINICIAR HISTORIAL
// ============================================================

setFiltrosHistorialFormulario({
  ...FILTROS_HISTORIAL_VACIOS,
});


setFiltrosHistorialAplicados({
  ...FILTROS_HISTORIAL_VACIOS,
});


setPaginaHistorial(
  1
);


setPaginaQAHistorial(
  null
);


setFiltrosHistorialDisponibles(
  null
);


setErrorHistorial(
  null
);


// ============================================================
// REINICIAR MÉTRICAS
// ============================================================

setMetricasResumen(
  null
);


setMetricasTipos(
  null
);


setMetricasEmpresas(
  null
);


setMetricasSucursales(
  null
);


setErrorMetricas(
  null
);


    if (!valor) {

    setEjecucionSeleccionadaId(
        null
    );

    setPaginaQA(
        null
    );

    setFiltrosDisponibles(
        null
    );

    return;

    }


    setEjecucionSeleccionadaId(
        Number(valor)
    );

}


  // ============================================================
  // CAMBIAR TAMAÑO PÁGINA
  // ============================================================

function manejarCambioTamanoPagina(
    event: ChangeEvent<HTMLSelectElement>
) {

    setPaginaResultados(
        1
    );


    setTamanoPagina(
        Number(
        event.target.value
        )
    );

}


  // ============================================================
  // APLICAR FILTROS
  // ============================================================

function aplicarFiltros() {

    setPaginaResultados(
        1
    );


    setFiltrosAplicados({

    codigo_barra:
        filtrosFormulario
            .codigo_barra
            .trim(),

    referencia:
        filtrosFormulario
            .referencia
            .trim(),

    estado:
        filtrosFormulario
            .estado,

    empresa:
        filtrosFormulario
            .empresa,

    sucursal:
        filtrosFormulario
            .sucursal,

    orden_por:
        filtrosFormulario
            .orden_por,

    direccion:
        filtrosFormulario
            .direccion,

    });

}


  // ============================================================
  // LIMPIAR FILTROS
  // ============================================================

function limpiarFiltros() {

    setFiltrosFormulario({
        ...FILTROS_VACIOS,
    });


    setFiltrosAplicados({
        ...FILTROS_VACIOS,
    });


    setPaginaResultados(
        1
    );

}

// ============================================================
// ORDENAR DESDE ENCABEZADO DE TABLA
// ============================================================

function manejarOrdenColumna(
  columna: string
) {

  const mismaColumna =
    filtrosAplicados.orden_por
    === columna;


  const nuevaDireccion =
    mismaColumna
    &&
    filtrosAplicados.direccion
    === "asc"
      ? "desc"
      : "asc";


  const nuevosFiltros: QAFiltrosConsulta = {
    ...filtrosAplicados,

    orden_por:
      columna,

    direccion:
      nuevaDireccion,
  };


  setPaginaResultados(
    1
  );


  setFiltrosAplicados(
    nuevosFiltros
  );


  setFiltrosFormulario(
    (anteriores) => ({
      ...anteriores,

      orden_por:
        columna,

      direccion:
        nuevaDireccion,
    })
  );

}


// ============================================================
// INDICADOR VISUAL DE ORDEN
// ============================================================

function indicadorOrden(
  columna: string
) {

  if (
    filtrosAplicados.orden_por
    !== columna
  ) {
    return "";
  }


  return filtrosAplicados.direccion
    === "asc"
      ? " ▲"
      : " ▼";
}


// ============================================================
// FORMATEAR VALORES NUMÉRICOS DE LA TABLA
// ============================================================

function formatearNumero(
  valor: number | string | null | undefined,
  decimales: number = 2
) {

  if (
    valor === null
    ||
    valor === undefined
    ||
    valor === ""
  ) {
    return "-";
  }


  const numero = Number(
    valor
  );


  if (
    Number.isNaN(
      numero
    )
  ) {
    return String(
      valor
    );
  }


  return new Intl.NumberFormat(
    "es-VE",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits:
        decimales,
    }
  ).format(
    numero
  );
}


// ============================================================
// ESTILO VISUAL SEGÚN ESTADO QA
// ============================================================

function obtenerEstiloEstado(
  estado: string
) {

  const estiloBase = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  };


  switch (estado) {

    case "IGUAL":

      return {
        ...estiloBase,
        background: "#dcfce7",
        color: "#166534",
      };


    case "DIFERENCIA":

      return {
        ...estiloBase,
        background: "#fef3c7",
        color: "#92400e",
      };


    case "NO_EN_EMPRESAS":

      return {
        ...estiloBase,
        background: "#fee2e2",
        color: "#991b1b",
      };


    case "NO_EN_CREACION":

      return {
        ...estiloBase,
        background: "#dbeafe",
        color: "#1e40af",
      };


    default:

      return {
        ...estiloBase,
        background: "#e2e8f0",
        color: "#334155",
      };

  }
}


// ============================================================
// APLICAR FILTROS DE DIFERENCIAS
// ============================================================

function aplicarFiltrosDiferencias() {

  setCodigoBarraDiferenciasAplicado(
    codigoBarraDiferenciasFormulario
      .trim()
  );


  setPaginaDiferencias(
    1
  );

}


// ============================================================
// LIMPIAR FILTROS DE DIFERENCIAS
// ============================================================

function limpiarFiltrosDiferencias() {

  setCodigoBarraDiferenciasFormulario(
    ""
  );


  setCodigoBarraDiferenciasAplicado(
    ""
  );


  setEmpresaDiferencias(
    ""
  );


  setSucursalDiferencias(
    ""
  );


const configuracionDiferencias =
  obtenerConfiguracionDiferenciasActual();


setTipoDiferenciaSeleccionado(
  configuracionDiferencias.tipo
);


setEstadoCorreccionSeleccionado(
  configuracionDiferencias.estado
);


  setPaginaDiferencias(
    1
  );

}


// ============================================================
// CAMBIAR ESTADO DE UNA DIFERENCIA
// ============================================================

async function manejarCambioEstadoDiferencia(
  diferenciaId: number,
  estadoActual: string
) {

  if (
    ejecucionSeleccionadaId
    === null
  ) {
    return;
  }


  const nuevoEstado:
    "PENDIENTE"
    |
    "CORREGIDO"
    =
    estadoActual === "CORREGIDO"
      ? "PENDIENTE"
      : "CORREGIDO";


  try {

    setDiferenciaActualizandoId(
      diferenciaId
    );


    setErrorDiferencias(
      null
    );


    await cambiarEstadoDiferencia(
      ejecucionSeleccionadaId,
      diferenciaId,
      {
        estado_correccion:
          nuevoEstado,
      }
    );


    // ========================================================
    // RECARGAR DATOS DESDE POSTGRESQL
    // ========================================================

    setRecargaDiferencias(
      (valor) =>
        valor + 1
    );

  } catch (error) {

    if (
      error instanceof Error
    ) {

      setErrorDiferencias(
        error.message
      );

    } else {

      setErrorDiferencias(
        "No se pudo actualizar la diferencia."
      );

    }

  } finally {

    setDiferenciaActualizandoId(
      null
    );

  }
}



// ============================================================
// NAVEGACIÓN DEL SIDEBAR
// ============================================================

const esVistaDiferencias = [
  "diferencias",
  "referencia",
  "codigo-marca",
  "precio-detal",
  "tasa-cambio",
  "categoria",
  "precio-promocion",
  "corregidos",
].includes(
  menuActivo
);


const titulosDiferencias: Record<string, string> = {
  diferencias: "Diferencias",
  referencia: "Diferencia de Referencia",
  "codigo-marca": "Diferencia de Código Marca",
  "precio-detal": "Diferencia de Precio Detal",
  "tasa-cambio": "Diferencia de Tasa de Cambio",
  categoria: "Diferencia de Categoría",
  "precio-promocion": "Diferencia de Precio Promoción",
  corregidos: "Diferencias Corregidas",
};


const tituloDiferencias =
  titulosDiferencias[menuActivo]
  ?? "Diferencias";


function abrirConsultaGeneral() {

  setMenuActivo(
    "consulta"
  );

}


function abrirMetricas() {

  setMenuActivo(
    "metricas"
  );

}


function abrirDashboard() {

  setMenuActivo(
    "dashboard"
  );

}


function abrirImportaciones() {

  setMenuActivo(
    "importaciones"
  );

}


function abrirTipoDiferencia(
  tipo: string,
  menu: string
) {

  setMenuActivo(
    menu
  );


  setTipoDiferenciaSeleccionado(
    tipo
  );


  setEstadoCorreccionSeleccionado(
    "PENDIENTE"
  );


  setPaginaDiferencias(
    1
  );

}


function abrirCorregidos() {

  setMenuActivo(
    "corregidos"
  );

  setTipoDiferenciaSeleccionado(
    ""
  );

  setEstadoCorreccionSeleccionado(
    "CORREGIDO"
  );

  setPaginaDiferencias(
    1
  );

}


function abrirInventariosAdmin() {

  setMenuActivo(
    "inventarios-admin"
  );

}


function abrirUsuarios() {

  setMenuActivo(
    "usuarios"
  );

}


function abrirPerfil() {

  setMenuActivo(
    "perfil"
  );

}


function abrirHistorial() {

  setMenuActivo(
    "historial"
  );

  setPaginaHistorial(
    1
  );

}


function aplicarFiltrosHistorial() {

  setFiltrosHistorialAplicados({
    codigo_barra:
      filtrosHistorialFormulario
        .codigo_barra
        .trim(),

    tipo_diferencia:
      filtrosHistorialFormulario
        .tipo_diferencia,

    empresa:
      filtrosHistorialFormulario
        .empresa,

    sucursal:
      filtrosHistorialFormulario
        .sucursal,
  });

  setPaginaHistorial(
    1
  );

}


function limpiarFiltrosHistorial() {

  setFiltrosHistorialFormulario({
    ...FILTROS_HISTORIAL_VACIOS,
  });

  setFiltrosHistorialAplicados({
    ...FILTROS_HISTORIAL_VACIOS,
  });

  setPaginaHistorial(
    1
  );

}


  return {
    sidebarContraido,
    setSidebarContraido,
    menuActivo,
    setMenuActivo,
    estadoSistema,
    setEstadoSistema,
    ejecuciones,
    setEjecuciones,
    cargando,
    setCargando,
    archivoQA,
    setArchivoQA,
    validandoArchivo,
    setValidandoArchivo,
    resultadoValidacion,
    setResultadoValidacion,
    nombreEjecucion,
    setNombreEjecucion,
    fechaReferencia,
    setFechaReferencia,
    descripcion,
    setDescripcion,
    importando,
    setImportando,
    resultadoImportacion,
    setResultadoImportacion,
    ejecucionSeleccionadaId,
    setEjecucionSeleccionadaId,
    paginaResultados,
    setPaginaResultados,
    tamanoPagina,
    setTamanoPagina,
    paginaQA,
    setPaginaQA,
    cargandoResultados,
    setCargandoResultados,
    errorConsulta,
    setErrorConsulta,
    filtrosDisponibles,
    setFiltrosDisponibles,
    filtrosFormulario,
    setFiltrosFormulario,
    filtrosAplicados,
    setFiltrosAplicados,
    filtrosDiferenciasDisponibles,
    setFiltrosDiferenciasDisponibles,
    tipoDiferenciaSeleccionado,
    setTipoDiferenciaSeleccionado,
    estadoCorreccionSeleccionado,
    setEstadoCorreccionSeleccionado,
    codigoBarraDiferenciasFormulario,
    setCodigoBarraDiferenciasFormulario,
    codigoBarraDiferenciasAplicado,
    setCodigoBarraDiferenciasAplicado,
    empresaDiferencias,
    setEmpresaDiferencias,
    sucursalDiferencias,
    setSucursalDiferencias,
    paginaDiferencias,
    setPaginaDiferencias,
    tamanoPaginaDiferencias,
    setTamanoPaginaDiferencias,
    paginaQADiferencias,
    setPaginaQADiferencias,
    cargandoDiferencias,
    setCargandoDiferencias,
    errorDiferencias,
    setErrorDiferencias,
    diferenciaActualizandoId,
    setDiferenciaActualizandoId,
    recargaDiferencias,
    setRecargaDiferencias,
    filtrosHistorialDisponibles,
    setFiltrosHistorialDisponibles,
    filtrosHistorialFormulario,
    setFiltrosHistorialFormulario,
    filtrosHistorialAplicados,
    setFiltrosHistorialAplicados,
    paginaHistorial,
    setPaginaHistorial,
    tamanoPaginaHistorial,
    setTamanoPaginaHistorial,
    paginaQAHistorial,
    setPaginaQAHistorial,
    cargandoHistorial,
    setCargandoHistorial,
    errorHistorial,
    setErrorHistorial,
    metricasResumen,
    setMetricasResumen,
    metricasTipos,
    setMetricasTipos,
    metricasEmpresas,
    setMetricasEmpresas,
    metricasSucursales,
    setMetricasSucursales,
    cargandoMetricas,
    setCargandoMetricas,
    errorMetricas,
    setErrorMetricas,
    error,
    setError,
    manejarSeleccionArchivo,
    manejarValidarArchivo,
    manejarImportarQA,
    manejarCambioEjecucion,
    manejarCambioTamanoPagina,
    aplicarFiltros,
    limpiarFiltros,
    manejarOrdenColumna,
    indicadorOrden,
    formatearNumero,
    obtenerEstiloEstado,
    aplicarFiltrosDiferencias,
    limpiarFiltrosDiferencias,
    manejarCambioEstadoDiferencia,
    esVistaDiferencias,
    tituloDiferencias,
    abrirConsultaGeneral,
    abrirMetricas,
    abrirDashboard,
    abrirImportaciones,
    abrirTipoDiferencia,
    abrirCorregidos,
    abrirHistorial,
    abrirInventariosAdmin,
    abrirUsuarios,
    abrirPerfil,
    aplicarFiltrosHistorial,
    limpiarFiltrosHistorial,
  };
}

export type NexoQaController = ReturnType<typeof useNexoQaController>;
