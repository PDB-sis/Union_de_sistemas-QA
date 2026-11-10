import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { PanelInicio } from "@pdmc/contratos/panel";
import { espacios, type EspacioOperativo } from "@pdmc/contratos/auth/espacios";
import DashboardClient from "@/components/dashboard";
import { useCargaInicial } from "@/lib/carga-inicial";
import { PanelRefreshContext } from "@/lib/panel-refresh";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";
import { SinEspacio } from "./inicio";

// Espacio de trabajo de un rol operativo. Si la cuenta no tiene ese rol, va a su propio espacio.
export default function Espacio({ espacio }: { espacio: EspacioOperativo }) {
  useTitulo(espacios[espacio].titulo);
  const carga = useCargaInicial<PanelInicio>("/api/panel?vista=inicio");
  const navigate = useNavigate();
  const datos = carga.estado === "listo" ? carga.datos : null;
  const destino = !datos ? null : "redirigir" in datos ? datos.redirigir : datos.espacios.includes(espacio) ? null : datos.espacios[0] ? espacios[datos.espacios[0]].ruta : null;
  useEffect(() => { if (destino) navigate(destino, { replace: true }); }, [destino, navigate]);
  if (carga.estado === "error") return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar} />;
  if (carga.estado !== "listo" || !datos || destino) return <Cargando />;
  if ("redirigir" in datos || !datos.espacios.includes(espacio)) return <SinEspacio />;
  return <PanelRefreshContext.Provider value={carga.recargar}><DashboardClient {...datos} espacio={espacio} /></PanelRefreshContext.Provider>;
}
