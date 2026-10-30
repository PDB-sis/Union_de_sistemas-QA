"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Link } from "react-router";
import { useStoredInitialState } from "@/hooks/use-stored-initial-state";
import { formatoFecha } from "@/lib/fechas";
import {
  AlertCircle, Boxes, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, ClipboardCopy, Download, FileSpreadsheet, FileWarning,
  PackageCheck, Plus, Search, Trash2, TriangleAlert, Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceHeader, WorkspaceNavigation } from "@/components/workspace-navigation";
import { ConnectionStatus } from "@/components/connection-status";
import { NegativePanel } from "@/components/negativos/panel";
import { InventoryPanel } from "@/components/inventario/panel";
import { InconsistencyPanel } from "@/components/inconsistencias/panel";
import { InconsistencySummaryProvider, useInconsistencySummary } from "@/components/inconsistencias/summary";
import { AccountSettings } from "@/components/auth/account-settings";
import { NegativeSummaryProvider, useNegativeSummary } from "@/components/negativos/summary";
import { SessionWatch } from "@/components/auth/session-watch";
import { TransferenciasFuente } from "@/components/transferencias/fuente";
import { IconoAuditoria, IconoCuenta, IconoDevoluciones, IconoFacturacion, IconoInconsistencias, IconoInventario, IconoMetricas, IconoMiDia, IconoNegativos, IconoProyectos, IconoQA, IconoTransferencias } from "@/components/brand/module-icons";
import { PermissionContext, type Capabilities, usePermission } from "@/components/auth/permissions";
import type { UsuarioSesion } from "@pdmc/contratos/auth/model";
import { transferTypeLabel, type TransferType } from "@pdmc/contratos/transferencias/classification";
import { currentMonth } from "@pdmc/contratos/month";
import { MonthSelector } from "@/components/month-selector";
import { MetricsPanel } from "@/components/metrics/panel";
import { BillingPanel } from "@/components/facturacion/panel";
import { TransferActions } from "@/components/transferencias/transfer-actions";
import { ReturnsPanel } from "@/components/devoluciones/panel";

const UserContext = createContext<UsuarioSesion | null>(null);
function useCurrentUser() { const user=useContext(UserContext); if(!user)throw new Error("Missing session");return user; }
type Section = "cuenta" | "hoy" | "metricas" | "qa" | "transferencias" | "devoluciones" | "incidencias" | "negativos" | "facturacion" | "inventario" | "proyectos" | "auditoria";
type Project = { id: string; name: string; next: string; status: "Pendiente" | "En curso" | "Completado"; progress: number };
import type {DashboardData} from "@pdmc/contratos/dashboard-contract";
export type {DashboardData} from "@pdmc/contratos/dashboard-contract";
const DataContext = createContext<DashboardData | null>(null);
function useDashboardData() {
  const data = useContext(DataContext);
  if (!data) throw new Error("Missing authenticated data");
  return useMemo(() => {
    const operationalStores = new Set<string>(data.operationalStoreNames);
    return { data, updateDate: stableDateTime(data.snapshot.generatedAt), operationalStores,
      operationalPending: data.pendingReports.filter(x => operationalStores.has(x.store)),
      operationalStoreRows: data.stores.filter(x => operationalStores.has(x.name)) };
  }, [data]);
}
function stableDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Sin fecha";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} · ${get("hour")}:${get("minute")}`;
}
const nf = new Intl.NumberFormat("es-VE");
const pct = (n: number) => Number.isFinite(n) ? `${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%` : "—";
const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nav = [
  ["hoy", "Mi día", IconoMiDia], ["metricas", "Métricas", IconoMetricas], ["qa", "QA", IconoQA], ["transferencias", "Transferencias", IconoTransferencias], ["devoluciones", "Devoluciones", IconoDevoluciones],
  ["incidencias", "Inconsistencias", IconoInconsistencias], ["negativos", "Negativos", IconoNegativos],
  ["facturacion", "Facturación", IconoFacturacion], ["inventario", "Carga de inventario", IconoInventario], ["proyectos", "Proyectos", IconoProyectos],
  ["auditoria", "Auditoría", IconoAuditoria],
] as const;
const titles: Record<Section, string> = {
  cuenta: "Ajustes de cuenta", metricas: "Métricas", qa:"QA", hoy: "Mi día", transferencias: "Control de transferencias", devoluciones:"Control de devoluciones", incidencias: "Inconsistencias", negativos: "Control de negativos",
  facturacion: "Errores de facturación", inventario:"Carga de inventario", proyectos: "Proyectos de mejora",
  auditoria:"Auditoría operativa",
};
const sectionPermission:Partial<Record<Section,Parameters<ReturnType<typeof usePermission>>[0]>>={
  metricas:"metricas.leer",transferencias:"transferencias.leer",devoluciones:"devoluciones.leer",incidencias:"inconsistencias.leer",negativos:"negativos.leer",facturacion:"facturacion.leer",inventario:"inventario.administrar",proyectos:"metricas.leer",auditoria:"auditoria.leer",
};
const visibleSection=(section:Section,can:ReturnType<typeof usePermission>)=>!sectionPermission[section]||can(sectionPermission[section]!);
const sectionDetails: Record<Section, { eyebrow: string; description: string }> = {
  cuenta: { eyebrow: "Perfil y seguridad", description: "Administra tu cuenta y el acceso al sistema." },
  hoy: { eyebrow: "Centro operativo", description: "Prioridades, alertas y avance general de la operación." },
  metricas: { eyebrow: "Análisis operativo", description: "Indicadores y evolución mensual de cada proceso." },
  qa: { eyebrow: "Control de calidad", description: "Abre Nexo QA con la sesión actual de PDMC." },
  transferencias: { eyebrow: "Operación de tiendas", description: "Seguimiento de transferencias y reportes recibidos." },
  devoluciones: { eyebrow: "Operación de tiendas", description: "Consulta y seguimiento de devoluciones por tienda." },
  incidencias: { eyebrow: "Control y seguimiento", description: "Revisa, cuenta y resuelve inconsistencias reportadas." },
  negativos: { eyebrow: "Inventario", description: "Gestiona existencias negativas y su proceso de corrección." },
  facturacion: { eyebrow: "Calidad de facturación", description: "Consulta errores confirmados y su impacto operativo." },
  inventario: { eyebrow: "Datos maestros", description: "Carga y valida la consulta vigente del inventario." },
  proyectos: { eyebrow: "Mejora continua", description: "Organiza iniciativas, responsables y próximos pasos." },
  auditoria: { eyebrow: "Trazabilidad", description: "Consulta cambios realizados en los procesos operativos." },
};

// Las fechas de transferencia son de calendario: se muestran como el día que son, no un día antes.
const formatDate = (v: string) => formatoFecha(v);
function monthKey(v: string, generatedAt: string) {
  const value = String(v ?? "").trim();
  if (!value) return "";
  let year = 0; let month = 0; let day = 0;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  const numeric = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\D|$)/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (numeric) {
    const first = Number(numeric[1]); const second = Number(numeric[2]);
    year = Number(numeric[3]);
    // Para fechas externas M/D/YYYY, si el primer valor supera
    // 12, se interpreta de forma segura como D/M/YYYY.
    if (first > 12) { day = first; month = second; } else { month = first; day = second; }
  } else {
    return "";
  }
  const current = new Date(generatedAt);
  const currentYear = current.getUTCFullYear();
  const currentMonth = current.getUTCMonth() + 1;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const validCalendarDate = candidate.getUTCFullYear() === year && candidate.getUTCMonth() + 1 === month && candidate.getUTCDate() === day;
  const validBusinessPeriod = year >= 2020 && (year < currentYear || (year === currentYear && month <= currentMonth));
  return validCalendarDate && validBusinessPeriod ? `${year}-${String(month).padStart(2, "0")}` : "";
}
function monthLabel(key: string) {
  if (key === "all") return "Acumulado completo";
  const [year, month] = key.split("-").map(Number);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${months[month - 1] ?? "Mes"} ${year}`;
}
function downloadText(name: string, content: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function Metric({ label, value, helper, icon: Icon, tone = "teal" }: {
  label: string; value: string | number; helper: string; icon: typeof AlertCircle; tone?: "teal" | "red" | "amber" | "blue";
}) {
  const tones = { teal: "bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300", red: "bg-danger-50 text-danger-700 dark:bg-danger-950/50 dark:text-danger-300", amber: "bg-warning-50 text-warning-700 dark:bg-warning-950/50 dark:text-warning-300", blue: "bg-info-50 text-info-700 dark:bg-info-950/50 dark:text-info-300" };
  return <div className="pdmc-surface group rounded-2xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><p className="text-[.7rem] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="metric-number mt-2 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{helper}</p></div><span className={`rounded-2xl p-3 transition-transform group-hover:scale-105 ${tones[tone]}`}><Icon className="h-5 w-5" /></span></div></div>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p></div>;
}
function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  return <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">Página {page} de {Math.max(1, pages)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft />Anterior</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente<ChevronRight /></Button></div></div>;
}
function ReportDialog({ open, close, initialStore }: { open: boolean; close: (v: boolean) => void; initialStore: string }) {
  const { operationalPending, operationalStoreRows } = useDashboardData();
  const [store, setStore] = useState(initialStore);
  const [contacts, setContacts] = useStoredInitialState<Record<string, string>>("mc-contactos-tiendas", {});

  const rows = useMemo(() => operationalPending.filter((x) => store === "all" || x.store === store), [store, operationalPending]);
  const grouped = useMemo(() => { const map = new Map<string, typeof rows>(); rows.forEach((x) => map.set(x.store, [...(map.get(x.store) ?? []), x])); return [...map.entries()].sort((a, b) => b[1].length - a[1].length); }, [rows]);
  const report = useMemo(() => {
    return grouped.map(([name, items]) => {
      const lines = [
        `Buen día, equipo de ${name}.`,
        "",
        `Estas transferencias continúan pendientes por informar (${items.length}):`,
        ...items.map((x) => {
          const dates = x.exportDate
            ? `Exportada: ${x.exportDate}${x.deadline ? ` · Fecha límite: ${x.deadline}` : ""}${(x.daysOverdue ?? 0) > 0 ? ` · ${x.daysOverdue} días hábiles vencida` : ""}`
            : `Fecha registrada: ${x.date || "sin fecha"}`;
          return `• Transferencia #${x.id} · ${nf.format(x.units)} unidades · ${dates}`;
        }),
        "",
        "Por favor, validen y envíen el reporte correspondiente.",
        "Gracias.",
      ];
      return lines.join("\n");
    }).join("\n\n────────────────────\n\n");
  }, [grouped]);
  const copy = async () => { await navigator.clipboard.writeText(report); toast.success(store === "all" ? "Mensajes copiados por tienda." : "Mensaje copiado para la tienda."); };
  const register = () => { const stamp = new Date().toISOString(); const updated = { ...contacts }; grouped.forEach(([name]) => { updated[name] = stamp; }); localStorage.setItem("mc-contactos-tiendas", JSON.stringify(updated)); setContacts(updated); toast.success("Seguimiento registrado en este dispositivo."); };
  const csv = [["Tienda", "Transferencia", "Fecha registrada", "Fecha de exportación", "Fecha límite", "Días hábiles vencida", "Unidades", "Estado"], ...rows.map((x) => [x.store, x.id, x.date, x.exportDate ?? "", x.deadline ?? "", String(x.daysOverdue ?? ""), String(x.units), "Exportada / no reportada"])].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Mensaje para tiendas</DialogTitle><DialogDescription className="sr-only">Transferencias pendientes por tienda.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-semibold">{rows.length} transferencias</p><p className="text-xs text-muted-foreground">{grouped.length} tiendas</p></div><Select value={store} onValueChange={setStore}><SelectTrigger className="w-full bg-background sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas las tiendas</SelectItem>{operationalStoreRows.filter((s) => s.pending > 0).map((s) => <SelectItem key={s.name} value={s.name}>{s.name} ({s.pending})</SelectItem>)}</SelectContent></Select></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-brand-deep p-5 text-sm leading-7 text-white shadow-inner">{report || "No hay transferencias pendientes."}</pre>{store !== "all" && contacts[store] && <p className="text-xs text-muted-foreground">Último envío: {new Date(contacts[store]).toLocaleString("es-VE")}</p>}</div><DialogFooter className="flex-wrap gap-2"><Button variant="outline" onClick={() => downloadText("reporte-pendientes.csv", "\ufeff" + csv, "text/csv;charset=utf-8")}><Download />Descargar CSV</Button><Button variant="outline" onClick={register}><ClipboardCheck />Registrar envío</Button><Button disabled={!report} onClick={copy}><ClipboardCopy />Copiar mensaje</Button></DialogFooter></DialogContent></Dialog>;
}

function Today({ go, report }: { go: (s: Section) => void; report: () => void }) {
  const summary=useNegativeSummary(),inconsistencySummary=useInconsistencySummary();
  const { data, operationalPending, operationalStoreRows } = useDashboardData();
  const tasks = [
    [`${operationalPending.length} transferencias pendientes de reporte`, `${operationalStoreRows.filter((s) => s.pending > 0).length} tiendas`, PackageCheck, "Mensaje para tiendas", report, "red"],
    [`${inconsistencySummary.data?.pendientes??0} inconsistencias sin resolver`, "Pendientes de revisión", TriangleAlert, "Ver incidencias", () => go("incidencias"), "amber"],
    [`${summary.data?.resumen.actuales??(summary.error?"Sin conexión":"…")} códigos negativos actuales`, summary.data?`${nf.format(Number(summary.data.resumen.unidades))} unidades en la última consulta válida.`:summary.error?"No se pudo leer la consulta actual. Abra Negativos para reintentar.":"Consultando el servidor…", Warehouse, "Revisar negativos", () => go("negativos"), "blue"],
  ] as const;
  return <div className="space-y-6"><section className="workspace-overview"><div><h2>Una visión clara.<br/>La siguiente acción, a mano.</h2><p>Conecta el seguimiento de las tiendas con las prioridades de tu operación.</p></div><div className="workspace-overview-action"><strong>{nf.format(operationalPending.length)}</strong><p>transferencias por reportar en las tiendas del control</p><Button className="bg-brand-mist text-brand-deep hover:bg-white" onClick={report}><FileSpreadsheet/>Preparar seguimiento<ChevronRight/></Button></div></section><div className="grid gap-4 md:grid-cols-3"><Metric label="Cumplimiento de reportes" value={pct(data.aggregates.reported / data.aggregates.exported * 100)} helper={`${nf.format(data.aggregates.reported)} de ${nf.format(data.aggregates.exported)} exportadas`} icon={CheckCircle2} /><Metric label="Pendientes operativos" value={operationalPending.length} helper={`${nf.format(operationalStoreRows.length)} tiendas del control`} icon={AlertCircle} tone="red" /><Metric label="Errores reales facturación" value={data.aggregates.realBillingCases} helper={`${nf.format(data.aggregates.realBillingUnits)} unidades`} icon={FileWarning} tone="amber" /></div><section className="pdmc-surface rounded-2xl border bg-card"><div className="border-b px-5 py-4"><h3 className="font-semibold">Pendientes</h3></div><div className="divide-y">{tasks.map(([title, text, Icon, action, click, tone]) => <div key={title} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className={`rounded-xl p-3 ${tone === "red" ? "bg-danger-50 text-danger-700 dark:bg-danger-950/40 dark:text-danger-200" : tone === "amber" ? "bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:text-warning-200" : "bg-info-50 text-info-700 dark:bg-info-950/40 dark:text-info-200"}`}><Icon className="h-5 w-5" /></div><div className="flex-1"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div><Button variant="outline" onClick={click}>{action}<ChevronRight /></Button></div>)}</div></section></div>;
}

function Transfers({ report }: { report: (s?: string) => void }) {
  const { data, operationalStoreRows } = useDashboardData();
  const can=usePermission();
  const [query,setQuery]=useState(""),[period,setPeriod]=useState(currentMonth()),[status,setStatus]=useState("all"),[type,setType]=useState<"all"|TransferType>("all"),[store,setStore]=useState("all"),[page,setPage]=useState(1);
  const [storeOrder,setStoreOrder]=useState<"pending"|"compliance"|"reported">("pending");
  const size=18;
  const sortedStores=useMemo(()=>[...operationalStoreRows].sort((a,b)=>storeOrder==="compliance"?a.compliance-b.compliance||b.pending-a.pending||a.name.localeCompare(b.name,"es"):storeOrder==="reported"?b.reported-a.reported||b.compliance-a.compliance||a.name.localeCompare(b.name,"es"):b.pending-a.pending||a.compliance-b.compliance||a.name.localeCompare(b.name,"es")),[operationalStoreRows,storeOrder]);
  const periodTransfers=useMemo(()=>data.transfers.filter(x=>monthKey(x.date,data.snapshot.generatedAt)===period),[data.transfers,data.snapshot.generatedAt,period]);
  const periodExported=periodTransfers.filter(x=>x.status.toLowerCase()==="exportada").length,periodReported=periodTransfers.filter(x=>x.reported).length,periodPending=periodTransfers.filter(x=>x.status.toLowerCase()==="exportada"&&!x.reported).length;
  const clean=periodTransfers.filter(x=>x.reportKind==="SIN_INCONSISTENCIAS").length,withIssues=periodTransfers.filter(x=>x.reportKind==="CON_INCONSISTENCIAS").length;
  const rows=useMemo(()=>periodTransfers.filter(x=>{const q=normalize(query);return(!q||normalize([x.id,x.store,x.biller,x.comment,transferTypeLabel[x.type]].join(" ")).includes(q))&&(status==="all"||(status==="pending"?x.status.toLowerCase()==="exportada"&&!x.reported:status==="reported-clean"?x.reportKind==="SIN_INCONSISTENCIAS":status==="reported-errors"?x.reportKind==="CON_INCONSISTENCIAS":x.status.toLowerCase()===status))&&(type==="all"||x.type===type)&&(store==="all"||x.store===store)}),[query,status,type,store,periodTransfers]);
  const pages=Math.ceil(rows.length/size),visible=rows.slice((page-1)*size,page*size);
  const chooseStatus=(value:string)=>{setStatus(value);setPage(1)};
  const reset=()=>{setQuery("");setStatus("all");setType("all");setStore("all");setPage(1)};
  return <div className="space-y-6">
    <section className="module-hero"><div className="relative z-10 flex w-full flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><Badge className="border-white/15 bg-white/10 text-white"><IconoTransferencias/>Operación de tiendas</Badge><h2 className="mt-4 font-bold">Control de transferencias</h2><p className="mt-2 max-w-2xl text-sm text-white/70">Prioriza las pendientes, consulta el detalle de productos y controla el cumplimiento de cada tienda.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="w-full sm:w-72"><MonthSelector variant="hero" value={period} onChange={value=>{setPeriod(value);setPage(1)}}/></div><Button className="bg-brand-glow text-brand-deep hover:brightness-110" onClick={()=>report(store==="all"?undefined:store)}><FileSpreadsheet/>Mensaje para tiendas</Button></div></div></section>
    {can("transferencias.importar")&&<TransferenciasFuente/>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Transferencias" value={nf.format(periodTransfers.length)} helper={monthLabel(period)} icon={Boxes}/><Metric label="Exportadas" value={nf.format(periodExported)} helper={`${nf.format(periodPending)} pendientes de reporte`} icon={PackageCheck} tone="blue"/><Metric label="Reportadas" value={nf.format(periodReported)} helper={pct(periodExported?periodReported/periodExported*100:0)} icon={CheckCircle2}/><Metric label="Pendientes" value={periodPending} helper="Requieren seguimiento de tienda" icon={AlertCircle} tone="red"/></div>
    <section className="pdmc-surface rounded-2xl border bg-card">
      <div className="border-b p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Bandeja operativa</p><h3 className="mt-1 font-semibold">Transferencias del periodo</h3><p className="mt-1 text-xs text-muted-foreground">{rows.length} resultados con los filtros actuales</p></div>{(query||status!=="all"||type!=="all"||store!=="all")&&<Button size="sm" variant="ghost" onClick={reset}>Limpiar filtros</Button>}</div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{([['all','Todas',periodTransfers.length],['pending','Pendientes',periodPending],['reported-clean','Sin inconsistencias',clean],['reported-errors','Con inconsistencias',withIssues]] as const).map(([id,label,count])=><button type="button" key={id} onClick={()=>chooseStatus(id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${status===id?"border-primary bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground"}`}>{label}<span className={`ml-2 ${status===id?"text-primary-foreground/70":"text-muted-foreground"}`}>{count}</span></button>)}</div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,1.5fr)_190px_220px_260px]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar número, tienda, facturadora o descripción…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><Select value={status} onValueChange={chooseStatus}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="pending">Pendientes de reporte</SelectItem><SelectItem value="reported-clean">Sin inconsistencias</SelectItem><SelectItem value="reported-errors">Con inconsistencias</SelectItem><SelectItem value="exportada">Exportadas</SelectItem><SelectItem value="aprobada">Aprobadas</SelectItem><SelectItem value="abierta">Abiertas</SelectItem></SelectContent></Select><Select value={type} onValueChange={value=>{setType(value as "all"|TransferType);setPage(1)}}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los tipos</SelectItem><SelectItem value="NORMAL">Normales</SelectItem><SelectItem value="CORRECCION">Correcciones</SelectItem><SelectItem value="ROTACION">Rotación de mercancía</SelectItem></SelectContent></Select><Select value={store} onValueChange={value=>{setStore(value);setPage(1)}}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los destinos</SelectItem>{data.stores.map(x=><SelectItem key={x.name} value={x.name}>{x.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Transferencia</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Tienda / destino</TableHead><TableHead>Facturadora</TableHead><TableHead>Estado</TableHead><TableHead>Reporte de tienda</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{visible.map((x,i)=><TableRow key={`${x.id}-${i}`}><TableCell className="font-mono font-semibold text-primary">#{x.id}</TableCell><TableCell><Badge variant="outline" className={x.type==="CORRECCION"?"border-violet-200 bg-violet-100 text-violet-800":x.type==="ROTACION"?"border-info-200 bg-info-100 text-info-800":"border-border bg-muted text-muted-foreground"}>{transferTypeLabel[x.type]}</Badge></TableCell><TableCell className="whitespace-nowrap">{formatDate(x.date)}</TableCell><TableCell className="min-w-56 max-w-72 font-medium">{x.store}</TableCell><TableCell>{x.biller}</TableCell><TableCell><Badge variant="outline">{x.status}</Badge></TableCell><TableCell>{x.reportKind==="SIN_INCONSISTENCIAS"?<Badge className="bg-success-100 text-success-800 dark:bg-success-950/40 dark:text-success-200">Sin inconsistencias</Badge>:x.reportKind==="CON_INCONSISTENCIAS"?<Badge className="bg-warning-100 text-warning-900 dark:bg-warning-950/40 dark:text-warning-200">Con inconsistencias</Badge>:x.status.toLowerCase()==="exportada"?<Badge variant="destructive">Pendiente</Badge>:<Badge variant="outline" title="La tienda podrá reportarla cuando la transferencia esté exportada">Por exportar</Badge>}</TableCell><TableCell className="text-right font-semibold">{nf.format(x.units)}</TableCell><TableCell><TransferActions transfer={x}/></TableCell></TableRow>)}</TableBody></Table></div>
      {!visible.length?<div className="p-5"><Empty title="Sin resultados" text="Cambia los filtros para consultar otras transferencias."/></div>:<Pager page={page} pages={pages} setPage={setPage}/>}
    </section>
    <section className="pdmc-surface rounded-2xl border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Seguimiento regional</p><h3 className="mt-1 font-semibold">Cumplimiento por tienda</h3></div><Select value={storeOrder} onValueChange={value=>setStoreOrder(value as typeof storeOrder)}><SelectTrigger aria-label="Ordenar cumplimiento por tienda" className="w-full sm:w-64"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">Más pendientes primero</SelectItem><SelectItem value="compliance">Menor porcentaje primero</SelectItem><SelectItem value="reported">Más reportadas primero</SelectItem></SelectContent></Select></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{sortedStores.map(x=><button key={x.name} onClick={()=>{setStore(x.name);setStatus("pending");setPage(1);window.scrollTo({top:0,behavior:"smooth"})}} className="group rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold group-hover:text-primary">{x.name}</p><Badge variant={x.pending?"destructive":"secondary"}>{x.pending} pend.</Badge></div><p className="mt-3 text-xs text-muted-foreground">{nf.format(x.reported)} reportadas de {nf.format(x.exported)} exportadas{x.porExportar>0&&<> · <span className="font-semibold text-foreground">{nf.format(x.porExportar)} por exportar</span></>}</p><div className="mt-3 flex items-center gap-3"><Progress value={x.compliance} className="h-2"/><span className="w-16 text-right text-sm font-semibold">{pct(x.compliance)}</span></div></button>)}</div></section>
  </div>;
}

function Projects() {
  const [projects, setProjects] = useStoredInitialState<Project[]>("mc-proyectos", []); const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [next, setNext] = useState("");

  const save = (rows: Project[]) => { setProjects(rows); localStorage.setItem("mc-proyectos", JSON.stringify(rows)); };
  const add = () => { if (!name.trim()) return; save([...projects, { id: crypto.randomUUID(), name: name.trim(), next: next.trim(), status: "Pendiente", progress: 0 }]); setName(""); setNext(""); setOpen(false); toast.success("Proyecto guardado."); };
  const update = (id: string, status: Project["status"]) => save(projects.map((p) => p.id === id ? { ...p, status, progress: status === "Completado" ? 100 : status === "En curso" ? Math.max(p.progress, 25) : 0 } : p));
  return <div className="space-y-6"><div className="pdmc-surface flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center"><div className="flex-1"><h3 className="font-semibold">Proyectos semanales</h3></div><Button onClick={() => setOpen(true)}><Plus />Nuevo proyecto</Button></div>{projects.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((p) => <article key={p.id} className="pdmc-surface rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><Badge variant="secondary">{p.status}</Badge><h3 className="mt-3 font-semibold">{p.name}</h3></div><Button aria-label="Eliminar" variant="ghost" size="icon" onClick={() => save(projects.filter((x) => x.id !== p.id))}><Trash2 className="text-destructive" /></Button></div><p className="mt-3 min-h-10 text-sm text-muted-foreground">{p.next || "Sin próxima acción."}</p><Progress value={p.progress} className="mt-4" /><Select value={p.status} onValueChange={(v) => update(p.id, v as Project["status"])}><SelectTrigger className="mt-4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pendiente">Pendiente</SelectItem><SelectItem value="En curso">En curso</SelectItem><SelectItem value="Completado">Completado</SelectItem></SelectContent></Select></article>)}</div> : <Empty title="Aún no hay proyectos" text="Agrega tu primer proyecto semanal. No se mostrará información inventada." />}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle><DialogDescription>Define una mejora y su próxima acción.</DialogDescription></DialogHeader><div className="grid gap-4"><div><label className="mb-1 block text-sm font-medium">Nombre</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">Próxima acción</label><Input value={next} onChange={(e) => setNext(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={add}>Guardar</Button></DialogFooter></DialogContent></Dialog></div>;
}

function ModuleNavigation({ section, change }: { section: Section; change: (section: Section) => void }) {
  const { data } = useDashboardData();
  const can = usePermission();
  const summary = useNegativeSummary();
  const inconsistencies = useInconsistencySummary();
  const counts: Partial<Record<Section, number | string>> = {
    transferencias: data.pendingReports.length,
    incidencias: inconsistencies.data?.pendientes ?? (inconsistencies.error ? "!" : "…"),
    negativos: summary.data?.resumen.actuales ?? (summary.error ? "!" : "…"),
    facturacion: data.aggregates.realBillingCases,
  };
  return <WorkspaceNavigation value={section} onChange={change} items={nav.filter(([id]) => visibleSection(id, can)).map(([id, label, icon]) => ({
    id, label, icon, description: sectionDetails[id].description, count: counts[id],
    testId: id === "negativos" ? "sidebar-negative-count" : undefined,
    countLabel: id === "negativos" ? "Códigos de la última fotografía; no suma el historial" : "Registros pendientes de seguimiento",
  }))} />;
}

function AuditModule(){return <section className="module-hero"><div className="relative z-10 max-w-2xl"><Badge className="border-white/15 bg-white/10 text-white"><IconoAuditoria/>Trazabilidad empresarial</Badge><h2 className="mt-4 text-3xl font-bold tracking-tight">Historial de cambios operativos</h2><p className="mt-2 text-sm leading-6 text-white/70">Revisa modificaciones de transferencias, tiendas, negativos, inconsistencias, usuarios y demás procesos registrados por PDMC.</p><Link to="/administracion" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand-glow px-5 text-sm font-semibold text-brand-deep shadow-lg transition hover:brightness-110">Abrir auditoría detallada</Link></div></section>}

function Dashboard() {
  const user = useCurrentUser(), can = usePermission();
  const { data, operationalStores, updateDate } = useDashboardData();
  const initialSection:Section = user.rol === "FACTURACION" ? "facturacion" : user.rol === "AUDITORIA" ? "auditoria" : (user.rol === "JEFE_BODEGA" || user.rol === "RECEPCION") ? "facturacion" : "hoy";
  const [section, selectSection] = useState<Section>(initialSection);
  // /api/qa-sso redirige a CYSN QA (otra aplicación), no a una página de Next.js.
  const setSection = (next:Section) => { if(next === "qa"){window.location.assign("/api/qa-sso");return;} selectSection(next); };
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStore, setReportStore] = useState("all");
  const detail = sectionDetails[section];
  const initials = user.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const report = (store?: string) => { setReportStore(store && operationalStores.has(store) ? store : "all"); setReportOpen(true); };

  return <div className="workspace min-h-screen bg-background text-foreground">
    <a className="workspace-skip" href="#workspace-content">Ir al contenido</a>
    <header className="workspace-chrome">
      <WorkspaceHeader subtitle="Centro operativo">
        <ConnectionStatus className="hidden md:flex" />
        <ThemeToggle compact />
        <button onClick={() => setSection("cuenta")} aria-label="Abrir ajustes de cuenta" title={user.nombre} className={`topbar-account ${section === "cuenta" ? "ring-2 ring-primary/40" : ""}`}>
          <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials || "MC"}</span>
          <span className="hidden max-w-40 truncate text-sm font-semibold md:block">{user.nombre}</span>
        </button>
      </WorkspaceHeader>
      <ModuleNavigation section={section} change={setSection} />
    </header>
    <main id="workspace-content" tabIndex={-1} className="workspace-content min-h-screen">
      <div className="workspace-page-heading">
        <div><p className="workspace-eyebrow">{detail.eyebrow}</p><h1>{titles[section]}</h1><p className="workspace-page-description">{detail.description}</p></div>
        <div className="workspace-update"><span className="workspace-live-dot"/><div><span>Última actualización</span><time>{updateDate}</time></div></div>
      </div>
      <div className="module-canvas mx-auto max-w-[1600px] p-3 sm:p-6 lg:p-8">
        {section === "cuenta" && <AccountSettings user={user}/>} {section === "hoy" && <Today go={setSection} report={() => report()} />}{section === "metricas" && can("metricas.leer") && <MetricsPanel/>}{section === "transferencias" && can("transferencias.leer") && <Transfers report={report} />}{section === "devoluciones" && can("devoluciones.leer") && <ReturnsPanel/>}{section === "incidencias" && can("inconsistencias.leer") && <InconsistencyPanel canEdit={can("inconsistencias.editar")} canCount={can("inconsistencias.conteo")} showProductProblems={can("productos.problemas.leer")}/>} {section === "negativos" && can("negativos.leer") && <NegativePanel/>}{section === "facturacion" && can("facturacion.leer") && <BillingPanel transfers={data.transfers} errorCases={data.errorCases} allowedBillers={data.allowedBillers ?? []} restricted={user.rol === "FACTURACION"} />}{section === "inventario" && can("inventario.administrar") && <InventoryPanel/>}{section === "proyectos" && can("metricas.leer") && <Projects />}{section === "auditoria"&&can("auditoria.leer")&&<AuditModule/>}
      </div>
    </main>
    {reportOpen && <ReportDialog key={reportStore} open={reportOpen} close={setReportOpen} initialStore={reportStore} />}
    <Toaster richColors position="top-right" />
  </div>;
}
export default function DashboardClient({data,user,capabilities}:{data:DashboardData|null;user:UsuarioSesion;capabilities:Capabilities}) {
  return <PermissionContext.Provider value={capabilities}><UserContext.Provider value={user}><NegativeSummaryProvider><InconsistencySummaryProvider><DataContext.Provider value={data}><SessionWatch/>{data?<Dashboard/>:<ScopedDashboard/>}</DataContext.Provider></InconsistencySummaryProvider></NegativeSummaryProvider></UserContext.Provider></PermissionContext.Provider>;
}

function ScopedDashboard() {
  const can=usePermission(),user=useCurrentUser(),negativeSummary=useNegativeSummary(),inconsistencySummary=useInconsistencySummary();
  const initial=can("inconsistencias.leer")?"incidencias":"negativos";
  const [view,setView]=useState<"negativos"|"incidencias"|"cuenta">(initial);
  const destinations = [
    ...(can("negativos.leer") ? [{ id: "negativos" as const, label: "Negativos", icon: IconoNegativos, count: negativeSummary.data?.resumen.actuales ?? (negativeSummary.error ? "!" : "…"), testId: "sidebar-negative-count", description: negativeSummary.data ? `${negativeSummary.data.resumen.sinConteo} sin conteo · ${negativeSummary.data.resumen.conConteo} con conteo` : "Conteo y seguimiento de existencias" }] : []),
    ...(can("inconsistencias.leer") ? [{ id: "incidencias" as const, label: "Inconsistencias", icon: IconoInconsistencias, count: inconsistencySummary.data?.pendientes ?? (inconsistencySummary.error ? "!" : "…"), description: inconsistencySummary.data ? `${inconsistencySummary.data.sinConteo} sin conteo · ${inconsistencySummary.data.conConteo} con conteo` : "Revisión de diferencias reportadas" }] : []),
    { id: "cuenta" as const, label: "Mi cuenta", icon: IconoCuenta, description: "Perfil, seguridad y sesión" },
  ];
  return <div className="workspace min-h-screen">
    <a className="workspace-skip" href="#workspace-content">Ir al contenido</a>
    <header className="workspace-chrome"><WorkspaceHeader subtitle="Control operativo"><span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">{user.nombre}</span><ThemeToggle compact /></WorkspaceHeader><WorkspaceNavigation items={destinations} value={view} onChange={setView} /></header>
    <main id="workspace-content" tabIndex={-1} className="workspace-content">
      <div className="workspace-page-heading"><div><p className="workspace-eyebrow">Tu jornada de trabajo</p><h1>{titles[view]}</h1><p className="workspace-page-description">{sectionDetails[view].description}</p></div></div>
      <div className="module-canvas mx-auto max-w-[1600px] space-y-6 p-3 sm:p-6 lg:p-8">{view === "cuenta" ? <AccountSettings user={user} /> : view === "incidencias" && can("inconsistencias.leer") ? <InconsistencyPanel canEdit={can("inconsistencias.editar")} canCount={can("inconsistencias.conteo")} showProductProblems={can("productos.problemas.leer")} /> : can("negativos.leer") ? <NegativePanel /> : <p role="status">Su cuenta no tiene permisos asignados.</p>}</div>
    </main>
  </div>;
}
