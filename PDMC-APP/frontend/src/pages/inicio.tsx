import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { PanelInicio } from "@pdmc/contratos/panel";
import { espacios } from "@pdmc/contratos/auth/espacios";
import { useCargaInicial } from "@/lib/carga-inicial";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";

// Entrada del sistema: el backend indica el espacio de cada cuenta. Administrador, tienda y
// facturador tienen su página; cada rol operativo entra a su propio espacio (/jefe-bodega, …).
export default function Inicio() {
  useTitulo();
  const carga = useCargaInicial<PanelInicio>("/api/panel?vista=inicio");
  const navigate = useNavigate();
  const destino = carga.estado !== "listo" ? null : "redirigir" in carga.datos ? carga.datos.redirigir : carga.datos.espacios[0] ? espacios[carga.datos.espacios[0]].ruta : null;
  useEffect(() => { if (destino) navigate(destino, { replace: true }); }, [destino, navigate]);
  if (carga.estado === "error") return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar} />;
  if (carga.estado === "cargando" || destino) return <Cargando />;
  return <SinEspacio />;
}

export function SinEspacio() {
  return <main className="grid min-h-dvh place-items-center p-6 text-center"><div className="grid max-w-md gap-3">
    <p className="text-lg font-bold">Tu cuenta no tiene un espacio de trabajo asignado</p>
    <p className="text-sm text-muted-foreground">Pide al administrador que te asigne un rol con su región, bodega o tienda.</p>
  </div></main>;
}
