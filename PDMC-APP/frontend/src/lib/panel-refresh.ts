import { createContext, useContext } from "react";

// Vuelve a pedir los datos iniciales del panel (GET /api/panel). Lo provee la página de inicio;
// reemplaza a router.refresh() de Next.js, que recargaba los datos generados en el servidor.
export const PanelRefreshContext = createContext<() => void>(() => window.location.reload());
export const usePanelRefresh = () => useContext(PanelRefreshContext);
