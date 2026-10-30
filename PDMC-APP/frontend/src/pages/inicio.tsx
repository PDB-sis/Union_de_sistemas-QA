import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { PanelInicio } from "@pdmc/contratos/panel";
import DashboardClient from "@/components/dashboard";
import { useCargaInicial } from "@/lib/carga-inicial";
import { PanelRefreshContext } from "@/lib/panel-refresh";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";

// Panel principal. El backend indica si el usuario debe ir a otro espacio
// (administrador nacional o cuenta de tienda) o entrega sus datos y permisos.
export default function Inicio() {
  useTitulo();
  const carga = useCargaInicial<PanelInicio>("/api/panel?vista=inicio");
  const navigate = useNavigate();
  const destino = carga.estado === "listo" && "redirigir" in carga.datos ? carga.datos.redirigir : null;
  useEffect(() => { if (destino) navigate(destino, { replace: true }); }, [destino, navigate]);
  if (carga.estado === "error") return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar} />;
  if (carga.estado === "cargando" || "redirigir" in carga.datos) return <Cargando />;
  return <PanelRefreshContext.Provider value={carga.recargar}><DashboardClient {...carga.datos} /></PanelRefreshContext.Provider>;
}
