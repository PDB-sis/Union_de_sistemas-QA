import type { ComponentProps } from "react";
import type { PanelTienda } from "@pdmc/contratos/panel";
import { StorePanel } from "@/components/tienda/panel";
import { useCargaInicial } from "@/lib/carga-inicial";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";

type DatosTienda = ComponentProps<typeof StorePanel>["initialData"];

export default function Tienda() {
  useTitulo("Tienda");
  const carga = useCargaInicial<PanelTienda<DatosTienda>>("/api/panel?vista=tienda");
  if (carga.estado === "error") return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar} />;
  if (carga.estado === "cargando") return <Cargando />;
  return <StorePanel {...carga.datos} />;
}
