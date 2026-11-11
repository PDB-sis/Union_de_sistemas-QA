"use client";

// "Mi día" de cada rol: sus prioridades de hoy, con un número, qué significa y a dónde ir.
// Solo usa datos que el rol puede ver; Mejora Continua conserva su propio resumen (Today, en dashboard.tsx).
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { DashboardData } from "@pdmc/contratos/dashboard-contract";
import { espacios, type EspacioOperativo, type Seccion } from "@pdmc/contratos/auth/espacios";
import { Button } from "@/components/ui/button";
import { useNegativeSummary } from "@/components/negativos/summary";
import { useInconsistencySummary } from "@/components/inconsistencias/summary";
import { LineaAuditoria, type RegistroAuditoria } from "@/components/auditoria/registro";
import { MisTareas } from "@/components/proyectos/modulo";

type Tono = "danger" | "warning" | "info" | "success";
type Tarea = { id: string; valor: number | null; titulo: string; detalle: string; accion: string; seccion: Seccion; tono: Tono };
const tonos: Record<Tono, string> = {
  danger: "border-danger-200 bg-danger-50/70 dark:border-danger-900 dark:bg-danger-950/25",
  warning: "border-warning-200 bg-warning-50/70 dark:border-warning-900 dark:bg-warning-950/25",
  info: "border-info-200 bg-info-50/60 dark:border-info-900 dark:bg-info-950/25",
  success: "border-success-200 bg-success-50/60 dark:border-success-900 dark:bg-success-950/25",
};
const nf = new Intl.NumberFormat("es-VE");
const saludo = () => { const hora = new Date().getHours(); return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches"; };
const hoy = () => new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
const inicioDelDia = () => { const fecha = new Date(); fecha.setHours(0, 0, 0, 0); return fecha.toISOString(); };

function Hoja({ nombre, espacio, tareas, go, children }: { nombre: string; espacio: EspacioOperativo; tareas: Tarea[]; go: (seccion: Seccion) => void; children?: ReactNode }) {
  const pendientes = tareas.filter(tarea => (tarea.valor ?? 0) > 0 && tarea.tono !== "info");
  return <div className="space-y-6">
    <section className="module-hero"><div className="relative z-10 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/60">{espacios[espacio].titulo} · {hoy().charAt(0).toUpperCase() + hoy().slice(1)}</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight">{saludo()}, {nombre.split(/\s+/)[0]}.</h2>
      <p className="mt-2 text-sm leading-6 text-white/75">{pendientes.length ? `Tienes ${pendientes.length === 1 ? "una prioridad" : `${pendientes.length} prioridades`} para hoy.` : "No tienes pendientes urgentes."}</p>
    </div></section>
    <section aria-labelledby="titulo-prioridades" className="space-y-3">
      <h3 id="titulo-prioridades" className="text-lg font-bold">Tus prioridades de hoy</h3>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">{tareas.map(tarea => <article key={tarea.id} className={`flex min-w-0 flex-col rounded-2xl border p-3 sm:p-4 ${tonos[(tarea.valor ?? 0) > 0 ? tarea.tono : "success"]}`}>
        <p className="text-2xl font-bold tabular-nums sm:text-3xl">{tarea.valor === null ? "…" : nf.format(tarea.valor)}</p>
        <p className="mt-1 text-sm font-semibold leading-5 sm:text-base">{tarea.titulo}</p>
        <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground sm:text-sm">{(tarea.valor ?? 0) > 0 ? tarea.detalle : "Nada pendiente aquí."}</p>
        <Button variant="outline" size="sm" className="mt-3 h-auto min-h-8 w-full whitespace-normal py-1.5 text-left sm:w-fit" onClick={() => go(tarea.seccion)}>{tarea.accion}<ArrowRight /></Button>
      </article>)}</div>
      {!pendientes.length && tareas.every(tarea => tarea.valor !== null) && <p className="flex items-center gap-2 rounded-2xl border border-success-200 bg-success-50/60 p-4 text-sm font-semibold text-success-800 dark:border-success-900 dark:bg-success-950/25 dark:text-success-200"><CheckCircle2 className="size-5" />Todo al día. Revisa de nuevo más tarde o cuando la sincronización traiga datos nuevos.</p>}
    </section>
    <section aria-labelledby="titulo-mis-tareas" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 id="titulo-mis-tareas" className="text-lg font-bold">Tareas de tus proyectos</h3><Button variant="ghost" size="sm" onClick={() => go("proyectos")}>Ver proyectos<ArrowRight /></Button></div>
      <MisTareas limite={5} abrir={() => go("proyectos")} />
    </section>
    {children}
  </div>;
}

const erroresSinCorregir = (data: DashboardData | null) => data ? data.errorCases.filter(item => !item.resolved) : [];

export function MiDia({ espacio, nombre, data, go }: { espacio: Exclude<EspacioOperativo, "mejora-continua">; nombre: string; data: DashboardData | null; go: (seccion: Seccion) => void }) {
  const negativos = useNegativeSummary().data?.resumen, inconsistencias = useInconsistencySummary().data;
  const errores = erroresSinCorregir(data), unidades = errores.reduce((sum, item) => sum + item.quantity, 0);
  const n = (valor: number | undefined) => valor ?? null;
  const tareas: Record<typeof espacio, Tarea[]> = {
    "jefe-bodega": [
      { id: "neg-decision", valor: n(negativos?.conConteo), titulo: "Negativos esperando tu decisión", detalle: "Ya tienen conteo físico: decide si se ajustan o se cierran.", accion: "Revisar negativos", seccion: "negativos", tono: "danger" },
      { id: "inc-decision", valor: n(inconsistencias?.conConteo), titulo: "Inconsistencias por decidir", detalle: "Con conteo registrado: confirma la causa y la corrección.", accion: "Revisar inconsistencias", seccion: "incidencias", tono: "warning" },
      { id: "fact", valor: data ? errores.length : null, titulo: "Errores de facturación sin corregir", detalle: `${nf.format(unidades)} unidades afectadas en las tiendas que surte tu bodega.`, accion: "Ver facturación", seccion: "facturacion", tono: "warning" },
      { id: "neg-ajuste", valor: n(negativos?.aprobados), titulo: "Negativos aprobados para ajuste", detalle: "Esperan que Mejora Continua registre el ajuste.", accion: "Ver negativos", seccion: "negativos", tono: "info" },
    ],
    recepcion: [
      { id: "inc-pend", valor: n(inconsistencias?.pendientes), titulo: "Inconsistencias abiertas", detalle: "Diferencias reportadas por las tiendas que siguen en proceso.", accion: "Ver inconsistencias", seccion: "incidencias", tono: "warning" },
      { id: "inc-conteo", valor: n(inconsistencias?.sinConteo), titulo: "Esperando conteo físico", detalle: "Inconsistencias que aún no tienen conteo de Rectificación.", accion: "Ver inconsistencias", seccion: "incidencias", tono: "info" },
      { id: "fact", valor: data ? errores.length : null, titulo: "Errores de facturación sin corregir", detalle: `${nf.format(unidades)} unidades afectadas.`, accion: "Ver facturación", seccion: "facturacion", tono: "warning" },
      { id: "neg", valor: n(negativos?.actuales), titulo: "Códigos negativos actuales", detalle: "De la última fotografía de inventario.", accion: "Ver negativos", seccion: "negativos", tono: "info" },
    ],
    rectificacion: [
      { id: "neg-contar", valor: n(negativos?.sinConteo), titulo: "Negativos por contar", detalle: "Registra la existencia física de cada código.", accion: "Registrar conteos", seccion: "negativos", tono: "danger" },
      { id: "inc-contar", valor: n(inconsistencias?.sinConteo), titulo: "Inconsistencias por contar", detalle: "Cuenta lo recibido para confirmar la diferencia reportada.", accion: "Registrar conteos", seccion: "incidencias", tono: "warning" },
      { id: "neg-verif", valor: n(negativos?.pendientesVerificar), titulo: "Negativos por verificar", detalle: "Ajustes hechos que necesitan comprobación en físico.", accion: "Ver negativos", seccion: "negativos", tono: "info" },
    ],
    auditoria: [],
  };
  if (espacio === "auditoria") return <MiDiaAuditoria nombre={nombre} data={data} go={go} />;
  return <Hoja nombre={nombre} espacio={espacio} tareas={tareas[espacio]} go={go} />;
}

function MiDiaAuditoria({ nombre, data, go }: { nombre: string; data: DashboardData | null; go: (seccion: Seccion) => void }) {
  const inconsistencias = useInconsistencySummary().data;
  const [registros, setRegistros] = useState<{ total: number; rows: RegistroAuditoria[] } | null>(null), [fallidos, setFallidos] = useState<number | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let activo = true;
    const desde = inicioDelDia(), leer = (query: string) => fetch(`/api/admin/auditoria?${query}`, { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "No se pudo leer la auditoría."); return body.data as { total: number; rows: RegistroAuditoria[] }; });
    Promise.all([leer(new URLSearchParams({ desde, take: "6" }).toString()), leer(new URLSearchParams({ desde, accion: "LOGIN_FALLIDO", take: "1" }).toString())])
      .then(([dia, fallas]) => { if (activo) { setRegistros(dia); setFallidos(fallas.total); } })
      .catch(reason => { if (activo) setError(reason instanceof Error ? reason.message : "No se pudo leer la auditoría."); });
    return () => { activo = false; };
  }, []);
  const tareas: Tarea[] = [
    { id: "aud-hoy", valor: registros?.total ?? null, titulo: "Movimientos registrados hoy", detalle: "Cambios, cargas y accesos del día en tu territorio.", accion: "Abrir auditoría", seccion: "auditoria", tono: "info" },
    { id: "aud-fallidos", valor: fallidos, titulo: "Inicios de sesión fallidos hoy", detalle: "Revisa si hay intentos repetidos sobre una misma cuenta.", accion: "Revisar accesos", seccion: "auditoria", tono: "danger" },
    { id: "inc", valor: inconsistencias?.pendientes ?? null, titulo: "Inconsistencias abiertas", detalle: "Casos en proceso que puedes auditar.", accion: "Ver inconsistencias", seccion: "incidencias", tono: "warning" },
    { id: "transf", valor: data ? data.pendingReports.length : null, titulo: "Transferencias por reportar", detalle: "Exportadas que las tiendas aún no reportan.", accion: "Ver transferencias", seccion: "transferencias", tono: "warning" },
  ];
  return <Hoja nombre={nombre} espacio="auditoria" tareas={tareas} go={go}>
    <section aria-labelledby="titulo-ultimos" className="pdmc-surface rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3"><h3 id="titulo-ultimos" className="font-semibold">Últimos movimientos de hoy</h3><Button variant="ghost" size="sm" onClick={() => go("auditoria")}>Ver todo<ArrowRight /></Button></div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger-700 dark:text-danger-200">{error}</p> : !registros ? <p role="status" className="mt-3 text-sm text-muted-foreground">Cargando…</p> : registros.rows.length ? <ol className="mt-2 divide-y">{registros.rows.map(registro => <LineaAuditoria key={registro.id} registro={registro} />)}</ol> : <p className="mt-3 text-sm text-muted-foreground">Todavía no hay movimientos hoy.</p>}
    </section>
  </Hoja>;
}
