"use client";

import { useState } from "react";
import type { PanelFacturador } from "@pdmc/contratos/panel";
import { AccountSettings } from "@/components/auth/account-settings";
import { SessionWatch } from "@/components/auth/session-watch";
import { IconoCuenta, IconoFacturacion, IconoInconsistencias, IconoMetricas, IconoTransferencias } from "@/components/brand/module-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceHeader, WorkspaceNavigation } from "@/components/workspace-navigation";
import { BillingPanel, type BillingTab } from "./panel";

type View = BillingTab | "cuenta";

const sections: Record<View, { label: string; title: string; description: string; icon: typeof IconoCuenta }> = {
  resumen: { label: "Mi desempeño", title: "Mi desempeño", description: "Tu índice de error, unidades y transferencias del mes.", icon: IconoMetricas },
  transferencias: { label: "Transferencias", title: "Mis transferencias", description: "Todo lo que facturaste, con el resultado de cada recepción.", icon: IconoTransferencias },
  errores: { label: "Errores", title: "Mis errores confirmados", description: "Errores atribuidos a facturación y confirmados por Control y Seguimiento.", icon: IconoInconsistencias },
  observaciones: { label: "Observaciones", title: "Observaciones de mejora", description: "Recomendaciones de Mejora Continua para tu trabajo.", icon: IconoFacturacion },
  cuenta: { label: "Mi cuenta", title: "Ajustes de cuenta", description: "Perfil, seguridad, modo y paleta de colores.", icon: IconoCuenta },
};

/** Espacio personal de una cuenta de Facturación: solo sus datos, en PC y en celular. */
export function BillerWorkspace({ user, perfiles, transfers, errorCases, actualizado }: PanelFacturador) {
  const [view, setView] = useState<View>("resumen");
  const items = (Object.keys(sections) as View[]).map(id => ({ id, label: sections[id].label, icon: sections[id].icon, description: sections[id].description }));
  return <div className="workspace min-h-screen">
    <SessionWatch />
    <a className="workspace-skip" href="#workspace-content">Ir al contenido</a>
    <header className="workspace-chrome">
      <WorkspaceHeader subtitle="Facturación"><span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">{user.nombre}</span><ThemeToggle compact /></WorkspaceHeader>
      <WorkspaceNavigation items={items} value={view} onChange={setView} label="Secciones de mi espacio" />
    </header>
    <main id="workspace-content" tabIndex={-1} className="workspace-content">
      <div className="workspace-page-heading"><div>
        <p className="workspace-eyebrow">{perfiles.length ? `Facturador · ${perfiles.map(perfil => perfil.codigo).join(" · ")}` : "Mi espacio de facturación"}</p>
        <h1>{sections[view].title}</h1>
        <p className="workspace-page-description">{sections[view].description}{actualizado && view !== "cuenta" ? ` Actualizado: ${new Date(actualizado).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
      </div></div>
      <div className="module-canvas mx-auto max-w-[1400px] space-y-6 p-3 sm:p-6 lg:p-8">
        {view === "cuenta"
          ? <AccountSettings user={user} />
          : <BillingPanel transfers={transfers} errorCases={errorCases} allowedBillers={perfiles.map(perfil => perfil.nombre)} restricted tab={view} onTabChange={setView} />}
      </div>
    </main>
    <Toaster richColors position="top-right" />
  </div>;
}
