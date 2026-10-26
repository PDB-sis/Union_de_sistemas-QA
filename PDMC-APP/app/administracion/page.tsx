import {loadAdministration} from "@backend/panel/bootstrap";
import AdministrationPanel from "@frontend/components/admin/panel";
export const dynamic="force-dynamic";
export default async function Page() {
  const {user,canManage,canAudit}=await loadAdministration();
  if(!canManage&&!canAudit)return <main className="p-8"><h1>Acceso restringido</h1><p>No tiene permiso para abrir este espacio.</p></main>;
  return <AdministrationPanel actorId={user.id} actorName={user.nombre} canManage={canManage}/>;
}
