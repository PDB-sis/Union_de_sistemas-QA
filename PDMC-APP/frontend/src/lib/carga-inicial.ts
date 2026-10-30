import { useCallback, useEffect, useState } from "react";
import type { ApiEnvelope } from "@pdmc/contratos/negativos/contracts";

// Carga los datos iniciales de una página desde la API. Antes los preparaba Next.js en el servidor;
// ahora la página los pide y decide a dónde llevar al usuario si la sesión no alcanza.
export type CargaInicial<T> =
  | { estado: "cargando" }
  | { estado: "listo"; datos: T; recargar: () => void }
  | { estado: "error"; mensaje: string; reintentar: () => void };

/** Destinos por error de sesión: sin sesión, al inicio de sesión; con contraseña temporal, a cambiarla. */
function destinoPorError(status: number, code: string | undefined) {
  if (status === 401) return "/login";
  if (status === 403 && code === "CAMBIO_PASSWORD") return "/cambiar-contrasena";
  return null;
}

export function useCargaInicial<T>(url: string): CargaInicial<T> {
  const [estado, setEstado] = useState<CargaInicial<T>>({ estado: "cargando" });
  const [intento, setIntento] = useState(0);
  const recargar = useCallback(() => setIntento(n => n + 1), []);
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
        if (!vigente) return;
        if (response.ok && body?.ok) { setEstado({ estado: "listo", datos: body.data, recargar }); return; }
        const code = body && !body.ok ? body.error.code : undefined;
        const destino = destinoPorError(response.status, code);
        if (destino) { window.location.replace(destino); return; }
        setEstado({ estado: "error", mensaje: body && !body.ok ? body.error.message : "No se pudo cargar la información.", reintentar: recargar });
      } catch {
        if (vigente) setEstado({ estado: "error", mensaje: "No se pudo conectar con el servidor de PDMC.", reintentar: recargar });
      }
    })();
    return () => { vigente = false; };
  }, [url, intento, recargar]);
  return estado;
}
