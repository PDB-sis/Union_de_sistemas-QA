import { StorePanel } from "@frontend/components/tienda/panel";
import { loadStore } from "@backend/panel/bootstrap";
export const dynamic = "force-dynamic";
export default async function StorePage() {
  return <StorePanel {...await loadStore()}/>;
}