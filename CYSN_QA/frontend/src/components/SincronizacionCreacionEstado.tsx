import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  obtenerEstadoSincronizacionCreacion,
  type EstadoSincronizacionCreacion,
} from "../services/sincronizacionService";

const INTERVALO_REFRESCO_MS = 60_000;

const COLORES: Record<string, { fondo: string; borde: string; texto: string }> = {
  EXITOSA: { fondo: "#f0fdf4", borde: "#bbf7d0", texto: "#166534" },
  EN_CURSO: { fondo: "#eff6ff", borde: "#bfdbfe", texto: "#1e40af" },
  FALLIDA: { fondo: "#fef2f2", borde: "#fecaca", texto: "#991b1b" },
  ABORTADA: { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e" },
};

const COLOR_NEUTRO = { fondo: "#f8fafc", borde: "#e2e8f0", texto: "#475569" };

function formatearFecha(valor?: string | null) {
  if (!valor) {
    return "—";
  }

  return new Date(valor).toLocaleString("es-VE");
}

function formatearEntero(valor?: number | null) {
  return (valor ?? 0).toLocaleString("es-VE");
}

export default function SincronizacionCreacionEstado() {
  const [estado, setEstado] =
    useState<EstadoSincronizacionCreacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      try {
        const datos = await obtenerEstadoSincronizacionCreacion();

        if (activo) {
          setEstado(datos);
          setError(null);
        }
      } catch (e) {
        if (activo) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar la sincronización."
          );
        }
      }
    };

    void cargar();
    const intervalo = window.setInterval(cargar, INTERVALO_REFRESCO_MS);

    return () => {
      activo = false;
      window.clearInterval(intervalo);
    };
  }, []);

  if (error) {
    return (
      <div style={contenedor(COLOR_NEUTRO)}>
        <strong>Sincronización CREACION:</strong> {error}
      </div>
    );
  }

  if (!estado || !estado.disponible) {
    return null;
  }

  const colores =
    COLORES[estado.ultimo_estado ?? ""] ?? COLOR_NEUTRO;

  return (
    <div style={contenedor(colores)}>
      <div>
        <strong>Sincronización CREACION:</strong>{" "}
        {estado.ultimo_estado ?? "Sin ejecuciones"}
        {estado.ultimo_modo === "DRY_RUN" && " (simulación)"}
        {" · "}
        Última ejecución: {formatearFecha(estado.ultima_ejecucion_en)}
        {" · "}
        Último éxito: {formatearFecha(estado.ultimo_exito_en)}
      </div>

      {estado.ejecucion_id != null && (
        <div style={estilos.detalle}>
          Origen {formatearEntero(estado.total_origen)}
          {" · "}válidos {formatearEntero(estado.total_validos)}
          {" · "}descartados {formatearEntero(estado.descartados)}
          {" · "}nuevos {formatearEntero(estado.insertados)}
          {" · "}actualizados {formatearEntero(estado.actualizados)}
          {" · "}bajas {formatearEntero(estado.inactivados)}
          {" · "}vigentes {formatearEntero(estado.codigos_vigentes)}
        </div>
      )}

      {estado.ultimo_error && estado.ultimo_estado !== "EXITOSA" && (
        <div style={estilos.detalle}>{estado.ultimo_error}</div>
      )}
    </div>
  );
}

function contenedor(colores: {
  fondo: string;
  borde: string;
  texto: string;
}): CSSProperties {
  return {
    background: colores.fondo,
    border: `1px solid ${colores.borde}`,
    color: colores.texto,
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "13px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };
}

const estilos = {
  detalle: {
    fontSize: "12px",
    opacity: 0.85,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
};
