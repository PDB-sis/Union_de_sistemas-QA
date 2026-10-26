"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { useStoredInitialState } from "@frontend/hooks/use-stored-initial-state";
import {
  AlertCircle, BarChart3, Boxes, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, ClipboardCopy, Download, FileSpreadsheet, FileWarning,
  FolderKanban, LayoutDashboard, Menu, PackageCheck, Plus, Search,
  RotateCcw, Trash2, TriangleAlert, UserRound, Warehouse, Wifi, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@frontend/components/ui/badge";
import { Button } from "@frontend/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@frontend/components/ui/dialog";
import { Input } from "@frontend/components/ui/input";
import { Progress } from "@frontend/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@frontend/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@frontend/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@frontend/components/ui/table";
import { Toaster } from "@frontend/components/ui/sonner";
import { ThemeToggle } from "@frontend/components/theme-toggle";
import { NegativePanel } from "@frontend/components/negativos/panel";
import { InventoryPanel } from "@frontend/components/inventario/panel";
import { InconsistencyPanel } from "@frontend/components/inconsistencias/panel";
import { InconsistencySummaryProvider, useInconsistencySummary } from "@frontend/components/inconsistencias/summary";
import { AccountSettings, AccountNavigation } from "@frontend/components/auth/account-settings";
import { NegativeSummaryProvider, useNegativeSummary } from "@frontend/components/negativos/summary";
import { SessionWatch } from "@frontend/components/auth/session-watch";
import { TransferenciasFuente } from "@frontend/components/transferencias/fuente";
import { PermissionContext, type Capabilities, usePermission } from "@frontend/components/auth/permissions";
import type { UsuarioSesion } from "@shared/auth/model";
import { transferTypeLabel, type TransferType } from "@shared/transferencias/classification";
import { currentMonth } from "@shared/month";
import { MonthSelector } from "@frontend/components/month-selector";
import { MetricsPanel } from "@frontend/components/metrics/panel";
import { BillingPanel } from "@frontend/components/facturacion/panel";
import { TransferActions } from "@frontend/components/transferencias/transfer-actions";
import { ReturnsPanel } from "@frontend/components/devoluciones/panel";

const UserContext = createContext<UsuarioSesion | null>(null);
function useCurrentUser() { const user=useContext(UserContext); if(!user)throw new Error("Missing session");return user; }
type Section = "cuenta" | "hoy" | "metricas" | "qa" | "transferencias" | "devoluciones" | "incidencias" | "negativos" | "facturacion" | "inventario" | "proyectos" | "auditoria";
type Project = { id: string; name: string; next: string; status: "Pendiente" | "En curso" | "Completado"; progress: number };
import type {DashboardData} from "@shared/dashboard-contract";
export type {DashboardData} from "@shared/dashboard-contract";
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
const pct = (n: number) => `${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%`;
const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nav = [
  ["hoy", "Mi día", LayoutDashboard], ["metricas", "Métricas", BarChart3], ["qa", "QA", ClipboardCheck], ["transferencias", "Transferencias", PackageCheck], ["devoluciones", "Devoluciones", RotateCcw],
  ["incidencias", "Inconsistencias", TriangleAlert], ["negativos", "Negativos", Warehouse],
  ["facturacion", "Facturación", FileWarning], ["inventario", "Carga de inventario", Boxes], ["proyectos", "Proyectos", FolderKanban],
  ["auditoria", "Auditoría", ClipboardCheck],
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

function formatDate(v: string) {
  const native = new Date(v);
  if (!Number.isNaN(native.getTime())) return native.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
  return v || "—";
}
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
  const tones = { teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300", red: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" };
  return <div className="group rounded-2xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><p className="text-[.7rem] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="metric-number mt-2 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{helper}</p></div><span className={`rounded-2xl p-3 transition-transform group-hover:scale-105 ${tones[tone]}`}><Icon className="h-5 w-5" /></span></div></div>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p></div>;
}
function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (n: number) => void }) {
  return <div className="flex items-center justify-between border-t px-4 py-3 text-sm"><span className="text-muted-foreground">Página {page} de {Math.max(1, pages)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft />Anterior</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente<ChevronRight /></Button></div></div>;
}
function Sidebar({ section, change, close }: { section: Section; change: (s: Section) => void; close?: () => void }) {
  const { data, updateDate } = useDashboardData();
  const user=useCurrentUser(), summary=useNegativeSummary(),inconsistencySummary=useInconsistencySummary(),can=usePermission();
  const counts: Partial<Record<Section, number>> = { transferencias: data.pendingReports.length, incidencias: inconsistencySummary.data?.pendientes, negativos: summary.data?.resumen.actuales, facturacion: data.aggregates.realBillingCases };
  return <aside className="liquid-sidebar relative flex h-full w-full flex-col overflow-hidden text-white lg:w-72"><div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#63cec7]/10 blur-2xl"/><div className="relative flex items-center gap-3 border-b border-white/10 px-5 py-6"><div className="grid size-11 place-items-center rounded-2xl bg-[#67d1ca] text-[#082c33] shadow-lg shadow-black/10"><BarChart3 className="h-5 w-5" /></div><div><p className="font-semibold leading-tight tracking-tight">Mejora Continua</p><p className="mt-1 text-[11px] font-medium uppercase tracking-[.12em] text-white/45">Centro operativo</p></div>{close && <Button aria-label="Cerrar menú" variant="ghost" size="icon" className="ml-auto text-white hover:bg-white/10" onClick={close}><X /></Button>}</div><nav aria-label="Secciones del panel" className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4">{nav.filter(([id])=>visibleSection(id,can)).map(([id, label, Icon],i) => <div key={id}>{[0,3,9].includes(i)&&<p className="px-3 pb-2 pt-5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">{i===0?"Resumen":i===3?"Operación":"Planificación"}</p>}<button aria-current={section===id?"page":undefined} onClick={() => { change(id); close?.(); }} className={`group mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${section === id ? "bg-white/12 font-semibold text-[#a9eee9] shadow-inner ring-1 ring-white/10" : "text-white/65 hover:bg-white/7 hover:text-white"}`}><span className={`grid size-8 place-items-center rounded-lg transition ${section===id?"bg-[#62cbc5]/18 text-[#8ce5df]":"bg-white/5 text-white/55 group-hover:bg-white/10 group-hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /></span><span className="flex-1">{label}</span>{(counts[id]!==undefined||id==="negativos")&&<span data-testid={id==="negativos"?"sidebar-negative-count":undefined} title={id==="negativos"?(summary.error?"No se pudo consultar el total":"Códigos en la última consulta válida; no suma el historial"):"Registros del control"} className="min-w-7 max-w-20 truncate rounded-full bg-white/10 px-2 py-1 text-center text-[10px] font-semibold tabular-nums">{counts[id]!==undefined?nf.format(counts[id]!):summary.error?"!":"…"}</span>}</button></div>)}</nav><div className="relative border-t border-white/10 bg-black/5 p-3"><AccountNavigation user={user} active={section==="cuenta"} onClick={()=>{change("cuenta");close?.()}}/><p className="px-3 pt-3 text-[9px] uppercase tracking-wide text-white/30">Actualizado · {updateDate}</p></div></aside>;
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
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Mensaje para tiendas</DialogTitle><DialogDescription className="sr-only">Transferencias pendientes por tienda.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-semibold">{rows.length} transferencias</p><p className="text-xs text-muted-foreground">{grouped.length} tiendas</p></div><Select value={store} onValueChange={setStore}><SelectTrigger className="w-full bg-background sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas las tiendas</SelectItem>{operationalStoreRows.filter((s) => s.pending > 0).map((s) => <SelectItem key={s.name} value={s.name}>{s.name} ({s.pending})</SelectItem>)}</SelectContent></Select></div><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#0d3038] p-5 text-sm leading-7 text-white shadow-inner">{report || "No hay transferencias pendientes."}</pre>{store !== "all" && contacts[store] && <p className="text-xs text-muted-foreground">Último envío: {new Date(contacts[store]).toLocaleString("es-VE")}</p>}</div><DialogFooter className="flex-wrap gap-2"><Button variant="outline" onClick={() => downloadText("reporte-pendientes.csv", "\ufeff" + csv, "text/csv;charset=utf-8")}><Download />Descargar CSV</Button><Button variant="outline" onClick={register}><ClipboardCheck />Registrar envío</Button><Button disabled={!report} onClick={copy}><ClipboardCopy />Copiar mensaje</Button></DialogFooter></DialogContent></Dialog>;
}

function Today({ go, report }: { go: (s: Section) => void; report: () => void }) {
  const summary=useNegativeSummary(),inconsistencySummary=useInconsistencySummary();
  const { data, updateDate, operationalPending, operationalStoreRows } = useDashboardData();
  const tasks = [
    [`${operationalPending.length} transferencias pendientes de reporte`, `${operationalStoreRows.filter((s) => s.pending > 0).length} tiendas`, PackageCheck, "Mensaje para tiendas", report, "red"],
    [`${inconsistencySummary.data?.pendientes??0} inconsistencias sin resolver`, "Pendientes de revisión", TriangleAlert, "Ver incidencias", () => go("incidencias"), "amber"],
    [`${summary.data?.resumen.actuales??(summary.error?"Sin conexión":"…")} códigos negativos actuales`, summary.data?`${nf.format(Number(summary.data.resumen.unidades))} unidades en la última consulta válida.`:summary.error?"No se pudo leer la consulta actual. Abra Negativos para reintentar.":"Consultando el servidor…", Warehouse, "Revisar negativos", () => go("negativos"), "blue"],
  ] as const;
  return <div className="space-y-6"><section className="module-hero"><div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><Badge className="mb-4 border-white/10 bg-white/10 text-white">Actualizado · {updateDate}</Badge><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Resumen operativo</h2></div><Button className="bg-[#62cbc5] text-[#0b3138] hover:bg-[#79d8d2]" onClick={report}><FileSpreadsheet />Mensaje para tiendas</Button></div></section><div className="grid gap-4 md:grid-cols-3"><Metric label="Cumplimiento de reportes" value={pct(data.aggregates.reported / data.aggregates.exported * 100)} helper={`${nf.format(data.aggregates.reported)} de ${nf.format(data.aggregates.exported)} exportadas`} icon={CheckCircle2} /><Metric label="Pendientes operativos" value={operationalPending.length} helper="21 tiendas del control" icon={AlertCircle} tone="red" /><Metric label="Errores reales facturación" value={data.aggregates.realBillingCases} helper={`${nf.format(data.aggregates.realBillingUnits)} unidades`} icon={FileWarning} tone="amber" /></div><section className="rounded-2xl border bg-card"><div className="border-b px-5 py-4"><h3 className="font-semibold">Pendientes</h3></div><div className="divide-y">{tasks.map(([title, text, Icon, action, click, tone]) => <div key={title} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className={`rounded-xl p-3 ${tone === "red" ? "bg-red-50 text-red-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}><Icon className="h-5 w-5" /></div><div className="flex-1"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div><Button variant="outline" onClick={click}>{action}<ChevronRight /></Button></div>)}</div></section></div>;
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
    <section className="module-hero"><div className="relative z-10 flex w-full flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><Badge className="border-white/15 bg-white/10 text-white"><PackageCheck/>Operación de tiendas</Badge><h2 className="mt-4 font-bold">Control de transferencias</h2><p className="mt-2 max-w-2xl text-sm text-white/70">Prioriza las pendientes, consulta el detalle de productos y controla el cumplimiento de cada tienda.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="w-full sm:w-72"><MonthSelector variant="hero" value={period} onChange={value=>{setPeriod(value);setPage(1)}}/></div><Button className="bg-[#62cbc5] text-[#0b3138] hover:bg-[#79d8d2]" onClick={()=>report(store==="all"?undefined:store)}><FileSpreadsheet/>Mensaje para tiendas</Button></div></div></section>
    {can("transferencias.importar")&&<TransferenciasFuente/>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Transferencias" value={nf.format(periodTransfers.length)} helper={monthLabel(period)} icon={Boxes}/><Metric label="Exportadas" value={nf.format(periodExported)} helper={`${nf.format(periodPending)} pendientes de reporte`} icon={PackageCheck} tone="blue"/><Metric label="Reportadas" value={nf.format(periodReported)} helper={pct(periodExported?periodReported/periodExported*100:0)} icon={CheckCircle2}/><Metric label="Pendientes" value={periodPending} helper="Requieren seguimiento de tienda" icon={AlertCircle} tone="red"/></div>
    <section className="rounded-2xl border bg-card">
      <div className="border-b p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Bandeja operativa</p><h3 className="mt-1 font-semibold">Transferencias del periodo</h3><p className="mt-1 text-xs text-muted-foreground">{rows.length} resultados con los filtros actuales</p></div>{(query||status!=="all"||type!=="all"||store!=="all")&&<Button size="sm" variant="ghost" onClick={reset}>Limpiar filtros</Button>}</div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{([['all','Todas',periodTransfers.length],['pending','Pendientes',periodPending],['reported-clean','Sin inconsistencias',clean],['reported-errors','Con inconsistencias',withIssues]] as const).map(([id,label,count])=><button type="button" key={id} onClick={()=>chooseStatus(id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${status===id?"border-primary bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground"}`}>{label}<span className={`ml-2 ${status===id?"text-primary-foreground/70":"text-muted-foreground"}`}>{count}</span></button>)}</div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(260px,1.5fr)_190px_220px_260px]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar número, tienda, facturadora o descripción…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><Select value={status} onValueChange={chooseStatus}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="pending">Pendientes de reporte</SelectItem><SelectItem value="reported-clean">Sin inconsistencias</SelectItem><SelectItem value="reported-errors">Con inconsistencias</SelectItem><SelectItem value="exportada">Exportadas</SelectItem><SelectItem value="aprobada">Aprobadas</SelectItem><SelectItem value="abierta">Abiertas</SelectItem></SelectContent></Select><Select value={type} onValueChange={value=>{setType(value as "all"|TransferType);setPage(1)}}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los tipos</SelectItem><SelectItem value="NORMAL">Normales</SelectItem><SelectItem value="CORRECCION">Correcciones</SelectItem><SelectItem value="ROTACION">Rotación de mercancía</SelectItem></SelectContent></Select><Select value={store} onValueChange={value=>{setStore(value);setPage(1)}}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los destinos</SelectItem>{data.stores.map(x=><SelectItem key={x.name} value={x.name}>{x.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Transferencia</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Tienda / destino</TableHead><TableHead>Facturadora</TableHead><TableHead>Estado</TableHead><TableHead>Reporte de tienda</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{visible.map((x,i)=><TableRow key={`${x.id}-${i}`}><TableCell className="font-mono font-semibold text-primary">#{x.id}</TableCell><TableCell><Badge variant="outline" className={x.type==="CORRECCION"?"border-violet-200 bg-violet-100 text-violet-800":x.type==="ROTACION"?"border-cyan-200 bg-cyan-100 text-cyan-800":"border-slate-200 bg-slate-100 text-slate-700"}>{transferTypeLabel[x.type]}</Badge></TableCell><TableCell className="whitespace-nowrap">{formatDate(x.date)}</TableCell><TableCell className="min-w-56 max-w-72 font-medium">{x.store}</TableCell><TableCell>{x.biller}</TableCell><TableCell><Badge variant="outline">{x.status}</Badge></TableCell><TableCell>{x.reportKind==="SIN_INCONSISTENCIAS"?<Badge className="bg-emerald-100 text-emerald-800">Sin inconsistencias</Badge>:x.reportKind==="CON_INCONSISTENCIAS"?<Badge className="bg-amber-100 text-amber-900">Con inconsistencias</Badge>:<Badge variant="destructive">Pendiente</Badge>}</TableCell><TableCell className="text-right font-semibold">{nf.format(x.units)}</TableCell><TableCell><TransferActions transfer={x}/></TableCell></TableRow>)}</TableBody></Table></div>
      {!visible.length?<div className="p-5"><Empty title="Sin resultados" text="Cambia los filtros para consultar otras transferencias."/></div>:<Pager page={page} pages={pages} setPage={setPage}/>}
    </section>
    <section className="rounded-2xl border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Seguimiento regional</p><h3 className="mt-1 font-semibold">Cumplimiento por tienda</h3></div><Select value={storeOrder} onValueChange={value=>setStoreOrder(value as typeof storeOrder)}><SelectTrigger aria-label="Ordenar cumplimiento por tienda" className="w-full sm:w-64"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">Más pendientes primero</SelectItem><SelectItem value="compliance">Menor porcentaje primero</SelectItem><SelectItem value="reported">Más reportadas primero</SelectItem></SelectContent></Select></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{sortedStores.map(x=><button key={x.name} onClick={()=>{setStore(x.name);setStatus("pending");setPage(1);window.scrollTo({top:0,behavior:"smooth"})}} className="group rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold group-hover:text-primary">{x.name}</p><Badge variant={x.pending?"destructive":"secondary"}>{x.pending} pend.</Badge></div><p className="mt-3 text-xs text-muted-foreground">{nf.format(x.reported)} reportadas de {nf.format(x.exported)} exportadas</p><div className="mt-3 flex items-center gap-3"><Progress value={x.compliance} className="h-2"/><span className="w-16 text-right text-sm font-semibold">{pct(x.compliance)}</span></div></button>)}</div></section>
  </div>;
}

function Projects() {
  const [projects, setProjects] = useStoredInitialState<Project[]>("mc-proyectos", []); const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [next, setNext] = useState("");

  const save = (rows: Project[]) => { setProjects(rows); localStorage.setItem("mc-proyectos", JSON.stringify(rows)); };
  const add = () => { if (!name.trim()) return; save([...projects, { id: crypto.randomUUID(), name: name.trim(), next: next.trim(), status: "Pendiente", progress: 0 }]); setName(""); setNext(""); setOpen(false); toast.success("Proyecto guardado."); };
  const update = (id: string, status: Project["status"]) => save(projects.map((p) => p.id === id ? { ...p, status, progress: status === "Completado" ? 100 : status === "En curso" ? Math.max(p.progress, 25) : 0 } : p));
  return <div className="space-y-6"><div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center"><div className="flex-1"><h3 className="font-semibold">Proyectos semanales</h3></div><Button onClick={() => setOpen(true)}><Plus />Nuevo proyecto</Button></div>{projects.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((p) => <article key={p.id} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><Badge variant="secondary">{p.status}</Badge><h3 className="mt-3 font-semibold">{p.name}</h3></div><Button aria-label="Eliminar" variant="ghost" size="icon" onClick={() => save(projects.filter((x) => x.id !== p.id))}><Trash2 className="text-destructive" /></Button></div><p className="mt-3 min-h-10 text-sm text-muted-foreground">{p.next || "Sin próxima acción."}</p><Progress value={p.progress} className="mt-4" /><Select value={p.status} onValueChange={(v) => update(p.id, v as Project["status"])}><SelectTrigger className="mt-4"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pendiente">Pendiente</SelectItem><SelectItem value="En curso">En curso</SelectItem><SelectItem value="Completado">Completado</SelectItem></SelectContent></Select></article>)}</div> : <Empty title="Aún no hay proyectos" text="Agrega tu primer proyecto semanal. No se mostrará información inventada." />}<Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle><DialogDescription>Define una mejora y su próxima acción.</DialogDescription></DialogHeader><div className="grid gap-4"><div><label className="mb-1 block text-sm font-medium">Nombre</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">Próxima acción</label><Input value={next} onChange={(e) => setNext(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={add}>Guardar</Button></DialogFooter></DialogContent></Dialog></div>;
}

function ModuleDock({ section, change }: { section: Section; change: (section: Section) => void }) {
  const { data } = useDashboardData();
  const can = usePermission();
  const summary = useNegativeSummary();
  const inconsistencySummary = useInconsistencySummary();
  const items = nav.filter(([id]) => visibleSection(id,can));
  const counts: Partial<Record<Section, number>> = {
    transferencias: data.pendingReports.length,
    incidencias: inconsistencySummary.data?.pendientes,
    negativos: summary.data?.resumen.actuales,
    facturacion: data.aggregates.realBillingCases,
  };

  return <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(.65rem,env(safe-area-inset-bottom))] sm:px-4">
    <nav aria-label="Navegación de módulos" className="module-liquid-dock pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto p-1.5 sm:gap-1.5 sm:p-2">
      {items.map(([id, label, Icon]) => {
        const active = section === id;
        return <button key={id} aria-current={active ? "page" : undefined} aria-label={label} title={label} onClick={() => change(id)} className={`module-dock-item group relative flex min-w-[4rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 text-[10px] font-semibold transition sm:min-w-[5.1rem] sm:px-3 ${active ? "is-active text-primary-foreground" : "text-muted-foreground hover:bg-background/55 hover:text-foreground"}`}>
          <span className="relative"><Icon className="size-[1.15rem] sm:size-5" />{counts[id] !== undefined && <span data-testid={id === "negativos" ? "sidebar-negative-count" : undefined} className={`absolute -right-3 -top-2 min-w-4 rounded-full px-1 text-center text-[8px] font-bold tabular-nums ${active ? "bg-white text-[#0b4b52]" : "bg-destructive text-destructive-foreground"}`}>{counts[id]! > 999 ? "999+" : counts[id]}</span>}</span>
          <span className="max-w-[4.5rem] truncate">{label}</span>
        </button>;
      })}
    </nav>
  </div>;
}

function AuditModule(){return <section className="module-hero"><div className="relative z-10 max-w-2xl"><Badge className="border-white/15 bg-white/10 text-white"><ClipboardCheck/>Trazabilidad empresarial</Badge><h2 className="mt-4 text-3xl font-bold tracking-tight">Historial de cambios operativos</h2><p className="mt-2 text-sm leading-6 text-white/70">Revisa modificaciones de transferencias, tiendas, negativos, inconsistencias, usuarios y demás procesos registrados por PDMC.</p><Link href="/administracion" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#62cbc5] px-5 text-sm font-semibold text-[#0b3138] shadow-lg transition hover:bg-[#79d8d2]">Abrir auditoría detallada</Link></div></section>}

function Dashboard() {
  const user = useCurrentUser(), can = usePermission();
  const { data, operationalStores, updateDate } = useDashboardData();
  const initialSection:Section = user.rol === "FACTURACION" ? "facturacion" : user.rol === "AUDITORIA" ? "auditoria" : (user.rol === "JEFE_BODEGA" || user.rol === "RECEPCION") ? "facturacion" : "hoy";
  const [section, selectSection] = useState<Section>(initialSection);
  // /api/qa-sso redirige a CYSN QA (otra aplicación), no a una página de Next.js.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  const setSection = (next:Section) => { if(next === "qa"){window.location.assign("/api/qa-sso");return;} selectSection(next); };
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStore, setReportStore] = useState("all");
  const [mobileOpen, setMobileOpen] = useState(false);
  const inModule = section !== "hoy";
  const detail = sectionDetails[section];
  const activeNav = nav.find(([id]) => id === section);
  const ActiveIcon = activeNav?.[2] ?? UserRound;
  const initials = user.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const report = (store?: string) => { setReportStore(store && operationalStores.has(store) ? store : "all"); setReportOpen(true); };

  return <div className="workspace min-h-screen bg-background text-foreground">
    {!inModule && <div className="fixed inset-y-4 left-4 z-40 hidden w-72 lg:block"><Sidebar section={section} change={setSection} /></div>}
    <main className={`min-h-screen transition-[padding] duration-300 ${inModule ? "pb-28 sm:pb-32" : "lg:pl-[19.5rem]"}`}>
      <header className="workspace-floating-header sticky top-0 z-30 bg-transparent px-2 pt-2 sm:px-4 sm:pt-3 lg:px-6">
        <div className="workspace-topbar mx-auto flex min-h-[4.75rem] max-w-[1600px] items-center gap-3 px-3 py-2.5 sm:px-4">
          {!inModule && <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger asChild><Button aria-label={"Abrir men\u00fa"} variant="ghost" size="icon" className="shrink-0 rounded-xl lg:hidden"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-72 border-0 p-0"><SheetHeader className="sr-only"><SheetTitle>{"Navegaci\u00f3n"}</SheetTitle><SheetDescription>Secciones del panel</SheetDescription></SheetHeader><Sidebar section={section} change={setSection} close={() => setMobileOpen(false)} /></SheetContent></Sheet>}
          {inModule && <button onClick={() => setSection("hoy")} className="topbar-module-icon group" aria-label={"Volver a Mi d\u00eda"} title={"Volver a Mi d\u00eda"}><ActiveIcon className="size-5 transition-transform group-hover:scale-105" /></button>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="truncate text-[10px] font-bold uppercase tracking-[.16em] text-primary sm:text-[11px]">{detail.eyebrow}</span><span className="hidden h-px w-6 bg-border sm:block"/><span className="hidden items-center gap-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 sm:flex"><Wifi className="size-3"/>Conectado</span></div>
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{titles[section]}</h1>
            <p className="hidden truncate text-xs text-muted-foreground md:block">{detail.description}</p>
          </div>
          <div className="hidden text-right xl:block"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-muted-foreground">{"\u00daltima actualizaci\u00f3n"}</p><p className="mt-0.5 text-[11px] font-medium tabular-nums">{updateDate}</p></div>
          <span className="hidden h-8 w-px bg-border/70 sm:block"/>
          <ThemeToggle compact />
          <button onClick={() => setSection("cuenta")} aria-label="Abrir ajustes de cuenta" title={user.nombre} className={`topbar-account ${section === "cuenta" ? "ring-2 ring-primary/40" : ""}`}><span className="grid size-8 place-items-center rounded-xl bg-primary text-[10px] font-bold text-primary-foreground">{initials || "MC"}</span><span className="hidden min-w-0 text-left lg:block"><span className="block max-w-32 truncate text-xs font-semibold">{user.nombre}</span><span className="block text-[9px] uppercase tracking-wider text-muted-foreground">Mi cuenta</span></span></button>
        </div>
      </header>
      <div className="module-canvas mx-auto max-w-[1600px] p-3 sm:p-6 lg:p-8">
        {section === "cuenta" && <AccountSettings user={user}/>} {section === "hoy" && <Today go={setSection} report={() => report()} />}{section === "metricas" && can("metricas.leer") && <MetricsPanel/>}{section === "transferencias" && can("transferencias.leer") && <Transfers report={report} />}{section === "devoluciones" && can("devoluciones.leer") && <ReturnsPanel/>}{section === "incidencias" && can("inconsistencias.leer") && <InconsistencyPanel canEdit={can("inconsistencias.editar")} canCount={can("inconsistencias.conteo")} showProductProblems={can("productos.problemas.leer")}/>} {section === "negativos" && can("negativos.leer") && <NegativePanel/>}{section === "facturacion" && can("facturacion.leer") && <BillingPanel transfers={data.transfers} errorCases={data.errorCases} allowedBillers={data.allowedBillers ?? []} restricted={user.rol === "FACTURACION"} />}{section === "inventario" && can("inventario.administrar") && <InventoryPanel/>}{section === "proyectos" && can("metricas.leer") && <Projects />}{section === "auditoria"&&can("auditoria.leer")&&<AuditModule/>}
      </div>
    </main>
    {inModule && <ModuleDock section={section} change={setSection}/>}
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
  return <div className="workspace min-h-screen lg:pl-[19.5rem]"><aside className="liquid-sidebar flex flex-col gap-2 p-4 text-white lg:fixed lg:inset-y-4 lg:left-4 lg:w-72"><div className="mb-2 flex items-center gap-3 border-b border-white/10 p-3 pb-5"><span className="grid size-10 place-items-center rounded-xl bg-[#67d1ca] text-[#082c33]"><BarChart3 className="size-5"/></span><div><p className="font-semibold">Mejora Continua</p><p className="text-[10px] uppercase tracking-widest text-white/45">Centro operativo</p></div></div>{can("negativos.leer")&&<button aria-current={view==="negativos"?"page":undefined} className={`flex items-center justify-between rounded-xl p-3 text-sm transition ${view==="negativos"?"bg-white/15 font-semibold text-[#a9eee9]":"text-white/70 hover:bg-white/10"}`} onClick={()=>setView("negativos")}><span>Negativos</span><span className="text-right text-[10px] font-normal leading-4 text-white/65" data-testid="sidebar-negative-count"><b className="block text-xs text-white">{negativeSummary.data?.resumen.actuales??(negativeSummary.error?"!":"?")} total</b>{negativeSummary.data&&<>{negativeSummary.data.resumen.sinConteo} sin conteo · {negativeSummary.data.resumen.conConteo} con conteo</>}</span></button>}{can("inconsistencias.leer")&&<button aria-current={view==="incidencias"?"page":undefined} className={`flex items-center justify-between rounded-xl p-3 text-sm transition ${view==="incidencias"?"bg-white/15 font-semibold text-[#a9eee9]":"text-white/70 hover:bg-white/10"}`} onClick={()=>setView("incidencias")}><span>Inconsistencias</span><span className="text-right text-[10px] font-normal leading-4 text-white/65"><b className="block text-xs text-white">{inconsistencySummary.data?.pendientes??"?"} total</b>{inconsistencySummary.data&&<>{inconsistencySummary.data.sinConteo} sin conteo · {inconsistencySummary.data.conConteo} con conteo</>}</span></button>}<div className="lg:mt-auto"><AccountNavigation user={user} active={view==="cuenta"} onClick={()=>setView("cuenta")}/></div></aside><main className="module-canvas mx-auto max-w-[1600px] space-y-6 p-4 sm:p-8"><header className="flex items-center justify-between rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">Espacio de trabajo</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{view==="cuenta"?"Ajustes de cuenta":view==="incidencias"?"Inconsistencias":"Control de negativos"}</h1></div><ThemeToggle compact/></header>{view==="cuenta"?<AccountSettings user={user}/>:view==="incidencias"&&can("inconsistencias.leer")?<InconsistencyPanel canEdit={can("inconsistencias.editar")} canCount={can("inconsistencias.conteo")} showProductProblems={can("productos.problemas.leer")}/>:can("negativos.leer")?<><NegativePanel/></>:<p role="status">Su cuenta no tiene permisos asignados.</p>}</main></div>;
}
