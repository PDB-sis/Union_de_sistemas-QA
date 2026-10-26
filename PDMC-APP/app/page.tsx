import DashboardClient from "@frontend/components/dashboard";
import { loadDashboard } from "@backend/panel/bootstrap";

export const dynamic = "force-dynamic";
export default async function Page() {
  return <DashboardClient {...await loadDashboard()}/>;
}