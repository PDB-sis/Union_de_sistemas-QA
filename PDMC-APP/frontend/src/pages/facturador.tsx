import type { PanelFacturador } from "@pdmc/contratos/panel";
import { BillerWorkspace } from "@/components/facturacion/personal";
import { useCargaInicial } from "@/lib/carga-inicial";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";

export default function Facturador() {
  useTitulo("Facturación");
  const carga = useCargaInicial<PanelFacturador>("/api/panel?vista=facturador");
  if (carga.estado === "error") return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar} />;
  if (carga.estado === "cargando") return <Cargando />;
  return <BillerWorkspace {...carga.datos} />;
}
