import type { PanelAdministracion } from "@pdmc/contratos/panel";
import AdministrationPanel from "@/components/admin/panel";
import { useCargaInicial } from "@/lib/carga-inicial";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";

export default function Administracion() {
  useTitulo("Administración");
  const carga = useCargaInicial<PanelAdministracion>("/api/panel?vista=administracion");
  if (carga.estado === "error") return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar} />;
  if (carga.estado === "cargando") return <Cargando />;
  const { user, canManage, canAudit } = carga.datos;
  if (!canManage && !canAudit) return <main className="p-8"><h1>Acceso restringido</h1><p>No tiene permiso para abrir este espacio.</p></main>;
  return <AdministrationPanel actorId={user.id} actorName={user.nombre} canManage={canManage} />;
}
