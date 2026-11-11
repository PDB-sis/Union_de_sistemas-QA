"use client";

// Proyectos compartidos ("mini Notion"): lista de proyectos y la página de cada uno, con bloques,
// tareas, comentarios y actividad. Los datos viven en el servidor (/api/proyectos), no en el navegador.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Archive, ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, CheckSquare, ChevronDown, Columns3, Copy, Heading1, Heading2, Info, List, ListChecks, ListOrdered, LoaderCircle, LogOut, MessageSquareText, Minus, Plus, Quote, RotateCcw, Search, Share2, Trash2, Type, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineaAuditoria } from "@/components/auditoria/registro";
import { formatoFecha } from "@/lib/fechas";
import { roles } from "@pdmc/contratos/auth/model";
import {
  BLOQUES, COLORES, ESTADOS_PROYECTO, PLANTILLAS, PRIORIDADES, bloqueEtiqueta, estadoProyectoEtiqueta, estadoTareaEtiqueta, plantillas, prioridadEtiqueta,
  type Bloque, type ColorProyecto, type EstadoProyecto, type EstadoTarea, type MiTarea, type PersonaDirectorio, type Plantilla, type Prioridad, type ProyectoDetalle, type ProyectoResumen, type TipoBloque,
} from "@pdmc/contratos/proyectos/modelo";

class ApiError extends Error { constructor(message: string, readonly code?: string) { super(message); } }
async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(`/api/proyectos${path}`, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new ApiError(result.error?.message ?? "No se pudo completar la operación.", result.error?.code);
  return result.data as T;
}

// Colores de portada con los tokens de la paleta (CLAUDE.md: nada de hexadecimales sueltos).
const portada: Record<ColorProyecto, { banda: string; punto: string; nombre: string }> = {
  azul: { banda: "bg-brand-600", punto: "bg-brand-500", nombre: "Azul" }, cielo: { banda: "bg-info-500", punto: "bg-info-400", nombre: "Cielo" },
  carmin: { banda: "bg-danger-600", punto: "bg-danger-500", nombre: "Carmín" }, verde: { banda: "bg-success-600", punto: "bg-success-500", nombre: "Verde" },
  ambar: { banda: "bg-warning-500", punto: "bg-warning-400", nombre: "Ámbar" }, gris: { banda: "bg-muted-foreground/60", punto: "bg-muted-foreground/60", nombre: "Gris" },
};
const tonoEstado: Record<EstadoProyecto, string> = {
  IDEA: "bg-muted text-muted-foreground", EN_CURSO: "bg-brand-100 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200",
  EN_PAUSA: "bg-warning-100 text-warning-900 dark:bg-warning-950/40 dark:text-warning-200", COMPLETADO: "bg-success-100 text-success-800 dark:bg-success-950/40 dark:text-success-200",
  ARCHIVADO: "bg-muted text-muted-foreground line-through",
};
const iconoBloque: Record<TipoBloque, typeof Type> = { titulo: Heading1, subtitulo: Heading2, parrafo: Type, lista: List, numerada: ListOrdered, casilla: CheckSquare, cita: Quote, aviso: Info, separador: Minus };
const select = "h-9 rounded-xl border border-input bg-card px-2.5 text-sm shadow-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:opacity-60";
const nuevoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const iniciales = (nombre: string) => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(parte => parte[0]).join("").toUpperCase() || "?";
const relativo = (valor: string) => { const minutos = Math.round((Date.now() - new Date(valor).getTime()) / 60000); return minutos < 1 ? "ahora" : minutos < 60 ? `hace ${minutos} min` : minutos < 1440 ? `hace ${Math.round(minutos / 60)} h` : formatoFecha(valor.slice(0, 10)); };
const LOCAL = "mc-proyectos";
const leerLocal = () => { try { const datos = JSON.parse(localStorage.getItem(LOCAL) ?? "[]"); return Array.isArray(datos) ? datos.filter(item => item && typeof item.name === "string" && item.name.trim()) : []; } catch { return []; } };

function Avatar({ nombre, className = "" }: { nombre: string; className?: string }) {
  return <span title={nombre} className={`grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-card ${className}`}>{iniciales(nombre)}</span>;
}
function Avance({ hechas, total }: { hechas: number; total: number }) {
  const valor = total ? Math.round(hechas / total * 100) : 0;
  return <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${valor}% de tareas hechas`}><span className="block h-full rounded-full" style={{ width: `${valor}%`, background: "var(--chart-1)" }} /></span><span className="tabular-nums">{total ? `${hechas}/${total}` : "Sin tareas"}</span></div>;
}

type Filtro = "todos" | "mios" | "compartidos" | "archivados";
type Vista = "lista" | "tablero" | "tareas";
type Orden = "recientes" | "objetivo" | "prioridad";
const hoyIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
const pesoPrioridad: Record<Prioridad, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
const vencido = (p: { fechaObjetivo: string | null; estado: EstadoProyecto }) => Boolean(p.fechaObjetivo && p.fechaObjetivo < hoyIso() && p.estado !== "COMPLETADO" && p.estado !== "ARCHIVADO");
const VISTA = "pdmc-proyectos-vista";
const leerVista = (): Vista => { try { const v = localStorage.getItem(VISTA); return v === "tablero" || v === "tareas" ? v : "lista"; } catch { return "lista"; } };

/** Módulo completo: lista, tablero por estado o mis tareas, y la página del proyecto elegido. */
export function ProyectosModulo() {
  const [lista, setLista] = useState<ProyectoResumen[] | null>(null), [error, setError] = useState(""), [seleccion, setSeleccion] = useState<string | null>(null);
  const [q, setQ] = useState(""), [filtro, setFiltro] = useState<Filtro>("todos"), [orden, setOrden] = useState<Orden>("recientes"), [locales, setLocales] = useState(() => leerLocal().length);
  const [vista, setVistaEstado] = useState<Vista>(leerVista), [nuevo, setNuevo] = useState(false);
  const setVista = (valor: Vista) => { setVistaEstado(valor); try { localStorage.setItem(VISTA, valor); } catch { /* sin almacenamiento */ } };
  const cargar = useCallback(async () => { try { setLista(await api<ProyectoResumen[]>("")); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar los proyectos."); } }, []);
  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);
  const visibles = useMemo(() => (lista ?? []).filter(p => (filtro === "archivados" ? p.estado === "ARCHIVADO" : p.estado !== "ARCHIVADO") && (filtro !== "mios" || p.acceso === "PROPIETARIO") && (filtro !== "compartidos" || p.acceso !== "PROPIETARIO") && (!q || `${p.titulo} ${p.resumen ?? ""} ${p.propietario.nombre}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => orden === "prioridad" ? pesoPrioridad[a.prioridad] - pesoPrioridad[b.prioridad] || b.updatedAt.localeCompare(a.updatedAt) : orden === "objetivo" ? (a.fechaObjetivo ?? "9999").localeCompare(b.fechaObjetivo ?? "9999") : b.updatedAt.localeCompare(a.updatedAt)), [lista, filtro, q, orden]);
  const abrir = (id: string) => { setVista("lista"); setSeleccion(id); };
  const creado = async (id: string) => { setNuevo(false); await cargar(); abrir(id); };
  const traer = async () => { try { const { importados } = await api<{ importados: number }>("/importar", { proyectos: leerLocal().slice(0, 200) }); try { localStorage.removeItem(LOCAL); } catch { /* sin almacenamiento */ } setLocales(0); toast.success(`${importados} proyecto(s) traídos a PDMC.`); await cargar(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No se pudieron traer los proyectos."); } };
  const cuenta = (f: Filtro) => (lista ?? []).filter(p => f === "archivados" ? p.estado === "ARCHIVADO" : p.estado !== "ARCHIVADO" && (f === "todos" || (f === "mios" ? p.acceso === "PROPIETARIO" : p.acceso !== "PROPIETARIO"))).length;
  const enPagina = vista === "lista" && seleccion;

  return <div className="grid gap-4">
    <div className={`flex flex-wrap items-center gap-2 ${enPagina ? "hidden lg:flex" : ""}`}>
      <div role="tablist" aria-label="Vista de proyectos" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:flex-none">{([["lista", "Lista", List], ["tablero", "Tablero", Columns3], ["tareas", "Mis tareas", ListChecks]] as const).map(([clave, etiqueta, Icono]) => <button key={clave} type="button" role="tab" aria-selected={vista === clave} onClick={() => setVista(clave)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${vista === clave ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icono className="hidden size-4 min-[400px]:block" />{etiqueta}</button>)}</div>
      <Button className="ml-auto" aria-label="Nuevo proyecto" onClick={() => setNuevo(true)}><Plus /><span className="hidden sm:inline">Nuevo proyecto</span></Button>
    </div>
    {locales > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info-200 bg-info-50/70 p-3 text-sm dark:border-info-900 dark:bg-info-950/25"><p className="min-w-0 flex-1"><b>{locales} proyecto(s) guardados solo en este navegador.</b> Tráelos a PDMC para no perderlos y poder compartirlos.</p><Button size="sm" variant="outline" onClick={() => void traer()}>Traer a PDMC</Button></div>}
    {error && <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">{error} <button className="underline" onClick={() => void cargar()}>Reintentar</button></p>}
    {vista === "tablero" && <Tablero lista={lista} abrir={abrir} cambio={cargar} />}
    {vista === "tareas" && <MisTareas abrir={abrir} />}
    {vista === "lista" && <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <aside aria-label="Lista de proyectos" className={`pdmc-surface min-w-0 rounded-2xl border bg-card p-3 sm:p-4 lg:sticky lg:top-40 ${seleccion ? "hidden lg:block" : ""}`}>
        <div className="flex gap-2"><label className="relative block min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Buscar proyecto" className="pl-9" placeholder="Buscar" value={q} onChange={event => setQ(event.target.value)} /></label>
          <select aria-label="Ordenar proyectos" className={`${select} shrink-0`} value={orden} onChange={event => setOrden(event.target.value as Orden)}><option value="recientes">Recientes</option><option value="objetivo">Fecha objetivo</option><option value="prioridad">Prioridad</option></select></div>
        <div role="group" aria-label="Filtrar proyectos" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{(["todos", "mios", "compartidos", "archivados"] as const).map(f => <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${filtro === f ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>{{ todos: "Todos", mios: "Míos", compartidos: "Compartidos conmigo", archivados: "Archivados" }[f]} {lista && <span className="opacity-70">{cuenta(f)}</span>}</button>)}</div>
        {!lista && !error && <p role="status" className="mt-4 text-sm text-muted-foreground">Cargando proyectos…</p>}
        {lista && !visibles.length && <div className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{lista.length ? "No hay proyectos con este filtro." : <>Todavía no tienes proyectos.<br />Crea uno desde una plantilla y compártelo con tu equipo.</>}</div>}
        <ul className="mt-3 grid gap-2">{visibles.map(p => <li key={p.id}><TarjetaProyecto p={p} activa={seleccion === p.id} abrir={() => setSeleccion(p.id)} /></li>)}</ul>
      </aside>
      <section aria-label="Proyecto" className={`min-w-0 ${seleccion ? "" : "hidden lg:block"}`}>
        {seleccion ? <ProyectoPagina key={seleccion} id={seleccion} volver={() => setSeleccion(null)} cambio={cargar} salir={() => { setSeleccion(null); void cargar(); }} abrir={id => { void cargar(); setSeleccion(id); }} />
          : <div className="pdmc-surface grid min-h-80 place-items-center rounded-2xl border border-dashed bg-card p-8 text-center"><div className="max-w-sm"><p className="text-lg font-bold">Elige un proyecto</p><p className="mt-1 text-sm text-muted-foreground">Cada proyecto tiene su página, sus tareas con responsables y fechas, comentarios y el historial de cambios. Compártelo con quien trabaje contigo.</p><Button className="mt-4" onClick={() => setNuevo(true)}><Plus />Nuevo proyecto</Button></div></div>}
      </section>
    </div>}
    <NuevoProyecto abierto={nuevo} cerrar={() => setNuevo(false)} creado={creado} />
  </div>;
}

function TarjetaProyecto({ p, activa = false, abrir, compacta = false }: { p: ProyectoResumen; activa?: boolean; abrir: () => void; compacta?: boolean }) {
  return <button type="button" aria-current={activa ? "true" : undefined} onClick={abrir} className={`w-full overflow-hidden rounded-xl border bg-background text-left transition hover:border-primary/40 ${activa ? "border-primary ring-1 ring-primary/30" : ""}`}>
    <span className={`block h-1.5 ${portada[p.color]?.banda ?? portada.azul.banda}`} />
    <span className="grid gap-2 p-3">
      <span className="flex items-start justify-between gap-2"><span className="min-w-0 font-semibold leading-5">{p.titulo}</span>{!compacta && <Badge className={`shrink-0 ${tonoEstado[p.estado]}`}>{estadoProyectoEtiqueta[p.estado]}</Badge>}</span>
      {p.resumen && <span className="line-clamp-2 text-xs text-muted-foreground">{p.resumen}</span>}
      <Avance hechas={p.tareas.hechas} total={p.tareas.total} />
      <span className="flex flex-wrap items-center gap-1.5 text-xs">{p.prioridad === "ALTA" && <Badge className="bg-danger-100 text-danger-800 dark:bg-danger-950/40 dark:text-danger-200">Prioridad alta</Badge>}{p.fechaObjetivo && <span className={`flex items-center gap-1 ${vencido(p) ? "font-semibold text-danger-700 dark:text-danger-200" : "text-muted-foreground"}`}><CalendarDays className="size-3.5" />{formatoFecha(p.fechaObjetivo)}{vencido(p) && " · vencido"}</span>}</span>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="flex -space-x-1.5">{[p.propietario, ...p.miembros].slice(0, 4).map(m => <Avatar key={m.id} nombre={m.nombre} className="size-6" />)}{p.miembros.length > 3 && <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] ring-2 ring-card">+{p.miembros.length - 3}</span>}</span><span className="truncate">{p.acceso === "PROPIETARIO" ? relativo(p.updatedAt) : `De ${p.propietario.nombre.split(" ")[0]}`}</span></span>
    </span>
  </button>;
}

/** Tablero por estado: una columna por estado; en el celular se desliza de lado. */
function Tablero({ lista, abrir, cambio }: { lista: ProyectoResumen[] | null; abrir: (id: string) => void; cambio: () => Promise<void> }) {
  const columnas: EstadoProyecto[] = ["IDEA", "EN_CURSO", "EN_PAUSA", "COMPLETADO"];
  const mover = async (p: ProyectoResumen, estado: EstadoProyecto) => { try { await api(`/${p.id}`, { version: p.version, estado }, "PATCH"); toast.success(`«${p.titulo}» pasó a ${estadoProyectoEtiqueta[estado]}.`); await cambio(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No se pudo mover el proyecto."); await cambio(); } };
  if (!lista) return <p role="status" className="text-sm text-muted-foreground">Cargando proyectos…</p>;
  return <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible" aria-label="Tablero de proyectos">
    {columnas.map(estado => { const filas = lista.filter(p => p.estado === estado);
      return <section key={estado} aria-label={estadoProyectoEtiqueta[estado]} className="pdmc-surface flex w-[82vw] max-w-80 shrink-0 snap-start flex-col gap-2 rounded-2xl border bg-card p-3 sm:w-72 lg:w-auto lg:max-w-none">
        <h3 className="flex items-center justify-between gap-2 px-1 text-sm font-bold"><span className="flex items-center gap-2"><Badge className={tonoEstado[estado]}>{estadoProyectoEtiqueta[estado]}</Badge></span><span className="rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">{filas.length}</span></h3>
        {!filas.length && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Sin proyectos</p>}
        {filas.map(p => <div key={p.id} className="grid gap-1.5"><TarjetaProyecto p={p} abrir={() => abrir(p.id)} compacta />
          {p.acceso !== "LECTOR" && <select aria-label={`Mover «${p.titulo}» a otro estado`} className={`${select} h-8 text-xs`} value={estado} onChange={event => void mover(p, event.target.value as EstadoProyecto)}>{columnas.map(destino => <option key={destino} value={destino}>{destino === estado ? `En ${estadoProyectoEtiqueta[destino].toLowerCase()}` : `Mover a ${estadoProyectoEtiqueta[destino].toLowerCase()}`}</option>)}</select>}
        </div>)}
      </section>; })}
  </div>;
}

/** Mis tareas: lo asignado a la persona en todos sus proyectos, de lo más urgente a lo más lejano. */
export function MisTareas({ abrir, limite }: { abrir: (id: string) => void; limite?: number }) {
  const [tareas, setTareas] = useState<MiTarea[] | null>(null), [error, setError] = useState("");
  const cargar = useCallback(async () => { try { setTareas(await api<MiTarea[]>("/mis-tareas")); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron cargar tus tareas."); } }, []);
  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);
  const hecha = async (t: MiTarea) => { try { await api(`/${t.proyecto.id}/tareas/${t.id}`, { estado: "HECHA" }, "PATCH"); toast.success(`«${t.titulo}» marcada como hecha.`); await cargar(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No se pudo marcar la tarea."); } };
  if (error) return <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">{error}</p>;
  if (!tareas) return <p role="status" className="text-sm text-muted-foreground">Cargando tus tareas…</p>;
  const hoy = hoyIso(), grupos: [string, MiTarea[]][] = [["Vencidas", tareas.filter(t => t.fechaLimite && t.fechaLimite < hoy)], ["Para hoy", tareas.filter(t => t.fechaLimite === hoy)], ["Próximas", tareas.filter(t => t.fechaLimite && t.fechaLimite > hoy)], ["Sin fecha", tareas.filter(t => !t.fechaLimite)]];
  const visibles = limite ? grupos.map(([nombre, filas]) => [nombre, filas] as [string, MiTarea[]]).reduce<[string, MiTarea[]][]>((acc, [nombre, filas]) => { const usadas = acc.reduce((n, [, f]) => n + f.length, 0); return usadas >= limite ? acc : [...acc, [nombre, filas.slice(0, limite - usadas)]]; }, []) : grupos;
  if (!tareas.length) return <div className="pdmc-surface rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">No tienes tareas pendientes en tus proyectos.</div>;
  return <div className="grid gap-4">{visibles.filter(([, filas]) => filas.length).map(([nombre, filas]) => <section key={nombre} className="grid gap-1.5">
    <h4 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${nombre === "Vencidas" ? "text-danger-700 dark:text-danger-200" : "text-muted-foreground"}`}>{nombre}<span className="rounded-full bg-muted px-1.5 font-semibold text-muted-foreground">{filas.length}</span></h4>
    <ul className="divide-y rounded-xl border bg-card">{filas.map(t => <li key={t.id} className="flex items-center gap-3 p-3">
      <input type="checkbox" aria-label={`Marcar «${t.titulo}» como hecha`} onChange={() => void hecha(t)} className="size-4 shrink-0 accent-primary" />
      <div className="min-w-0 flex-1"><p className="text-sm font-medium leading-5">{t.titulo}</p><button type="button" onClick={() => abrir(t.proyecto.id)} className="mt-0.5 flex max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><span className={`size-2 shrink-0 rounded-full ${portada[t.proyecto.color]?.punto ?? portada.azul.punto}`} /><span className="truncate">{t.proyecto.titulo}</span></button></div>
      <span className="flex shrink-0 flex-col items-end gap-1 text-xs">{t.estado === "EN_CURSO" && <Badge variant="outline">En curso</Badge>}{t.fechaLimite && <span className={t.fechaLimite < hoy ? "font-semibold text-danger-700 dark:text-danger-200" : "text-muted-foreground"}>{formatoFecha(t.fechaLimite)}</span>}</span>
    </li>)}</ul>
  </section>)}</div>;
}

/** Crear un proyecto desde una plantilla. */
function NuevoProyecto({ abierto, cerrar, creado }: { abierto: boolean; cerrar: () => void; creado: (id: string) => Promise<void> }) {
  const [plantilla, setPlantilla] = useState<Plantilla>("blanco"), [titulo, setTitulo] = useState(""), [creando, setCreando] = useState(false);
  const crear = async () => { setCreando(true); try { const { id } = await api<{ id: string }>("", { plantilla, ...(titulo.trim() ? { titulo: titulo.trim() } : {}) }); setTitulo(""); setPlantilla("blanco"); await creado(id); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No se pudo crear el proyecto."); } finally { setCreando(false); } };
  return <Dialog open={abierto} onOpenChange={value => !value && !creando && cerrar()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Nuevo proyecto</DialogTitle><DialogDescription>Empieza en blanco o con una plantilla; después puedes cambiar todo.</DialogDescription></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); void crear(); }} className="grid gap-4">
      <div role="radiogroup" aria-label="Plantilla" className="grid gap-2 sm:grid-cols-2">{PLANTILLAS.map(clave => <button key={clave} type="button" role="radio" aria-checked={plantilla === clave} onClick={() => setPlantilla(clave)} className={`overflow-hidden rounded-xl border text-left transition hover:border-primary/40 ${plantilla === clave ? "border-primary ring-1 ring-primary/40" : ""}`}><span className={`block h-1.5 ${portada[plantillas[clave].color].banda}`} /><span className="block p-3"><span className="flex items-center justify-between gap-2 text-sm font-semibold">{plantillas[clave].nombre}{plantilla === clave && <Check className="size-4 text-primary" />}</span><span className="mt-0.5 block text-xs text-muted-foreground">{plantillas[clave].descripcion}</span>{plantillas[clave].tareas.length > 0 && <span className="mt-1 block text-[11px] text-muted-foreground">{plantillas[clave].tareas.length} tareas sugeridas</span>}</span></button>)}</div>
      <label className="grid gap-1 text-sm font-medium">Título<Input value={titulo} maxLength={160} placeholder={plantillas[plantilla].titulo} onChange={event => setTitulo(event.target.value)} /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={creando} onClick={cerrar}>Cancelar</Button><Button type="submit" disabled={creando}>{creando ? <LoaderCircle className="animate-spin" /> : <Plus />}Crear proyecto</Button></div>
    </form>
  </DialogContent></Dialog>;
}

type Guardado = "guardado" | "pendiente" | "guardando" | "conflicto" | "error";
type Pestana = "pagina" | "tareas" | "comentarios" | "actividad";

function ProyectoPagina({ id, volver, cambio, salir, abrir }: { id: string; volver: () => void; cambio: () => Promise<void>; salir: () => void; abrir: (id: string) => void }) {
  const [p, setP] = useState<ProyectoDetalle | null>(null), [error, setError] = useState(""), [estado, setEstado] = useState<Guardado>("guardado"), [pestana, setPestana] = useState<Pestana>("pagina"), [compartir, setCompartir] = useState(false);
  const version = useRef(0), pendiente = useRef<Record<string, unknown>>({}), temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cargar = useCallback(async () => { try { const datos = await api<ProyectoDetalle>(`/${id}`); version.current = datos.version; setP(datos); setError(""); setEstado("guardado"); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo abrir el proyecto."); } }, [id]);
  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);
  const puedeEditar = p?.acceso !== "LECTOR";

  // Guardado automático: junta los cambios y los envía 1 s después de la última edición.
  const guardar = useCallback(async () => {
    const cambios = pendiente.current; pendiente.current = {};
    if (!Object.keys(cambios).length) return;
    setEstado("guardando");
    try { const r = await api<{ version: number }>(`/${id}`, { version: version.current, ...cambios }, "PATCH"); version.current = r.version; setEstado(Object.keys(pendiente.current).length ? "pendiente" : "guardado"); if ("titulo" in cambios || "estado" in cambios || "color" in cambios || "resumen" in cambios) void cambio(); }
    catch (reason) { setEstado(reason instanceof ApiError && reason.code === "CONFLICTO" ? "conflicto" : "error"); if (!(reason instanceof ApiError && reason.code === "CONFLICTO")) { pendiente.current = { ...cambios, ...pendiente.current }; toast.error(reason instanceof Error ? reason.message : "No se pudo guardar."); } }
  }, [id, cambio]);
  const cambiar = (campos: Partial<ProyectoDetalle>) => {
    if (!puedeEditar) return;
    setP(actual => actual ? { ...actual, ...campos } : actual);
    pendiente.current = { ...pendiente.current, ...campos }; setEstado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void guardar(), 1000);
  };
  useEffect(() => () => { if (temporizador.current) { clearTimeout(temporizador.current); void guardar(); } }, [guardar]);
  const accion = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast.success(ok); await cargar(); void cambio(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No se pudo completar la operación."); } };
  const duplicar = async () => { try { await guardar(); const { id: copia } = await api<{ id: string }>(`/${id}/duplicar`, {}); toast.success("Copia creada: es tuya y no tiene miembros."); abrir(copia); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No se pudo duplicar el proyecto."); } };

  if (error) return <div role="alert" className="pdmc-surface rounded-2xl border bg-card p-6"><p className="font-semibold">{error}</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={volver}><ArrowLeft />Volver</Button><Button onClick={() => void cargar()}>Reintentar</Button></div></div>;
  if (!p) return <div role="status" className="pdmc-surface grid min-h-80 place-items-center rounded-2xl border bg-card"><LoaderCircle className="size-7 animate-spin text-primary" /></div>;
  const tareasHechas = p.tareas.filter(t => t.estado === "HECHA").length, equipo = [{ ...p.propietario, permiso: "PROPIETARIO" as const }, ...p.miembros];
  const textoEstado: Record<Guardado, string> = { guardado: "Guardado", pendiente: "Cambios sin guardar…", guardando: "Guardando…", conflicto: "Otra persona guardó cambios", error: "No se guardó: se reintentará" };

  return <article className="pdmc-surface min-w-0 overflow-hidden rounded-2xl border bg-card">
    <div className={`h-12 sm:h-16 ${portada[p.color]?.banda ?? portada.azul.banda}`} />
    <div className="grid gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={volver}><ArrowLeft />Proyectos</Button>
        <p role="status" className={`text-xs font-medium ${estado === "conflicto" || estado === "error" ? "text-danger-700 dark:text-danger-200" : "text-muted-foreground"}`}>{estado === "guardando" && <LoaderCircle className="mr-1 inline size-3 animate-spin" />}{textoEstado[estado]}{estado === "conflicto" && <button className="ml-2 underline" onClick={() => void cargar()}>Ver la última versión</button>}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCompartir(true)} className="flex items-center -space-x-1.5 rounded-full p-0.5 hover:bg-muted" aria-label="Personas con acceso">{equipo.slice(0, 5).map(m => <Avatar key={m.id} nombre={m.nombre} />)}{equipo.length > 5 && <span className="grid size-7 place-items-center rounded-full bg-muted text-[10px] ring-2 ring-card">+{equipo.length - 5}</span>}</button>
          <Button size="sm" variant="outline" onClick={() => setCompartir(true)}><Share2 />Compartir</Button>
        </div>
      </div>
      {!puedeEditar && <p className="rounded-xl border border-info-200 bg-info-50/70 px-3 py-2 text-sm dark:border-info-900 dark:bg-info-950/25">Tienes acceso de <b>solo lectura</b>: puedes ver el proyecto y comentar.</p>}
      <div className="grid gap-2">
        <textarea aria-label="Título del proyecto" rows={1} value={p.titulo} readOnly={!puedeEditar} maxLength={160} onChange={event => cambiar({ titulo: event.target.value.replace(/\n/g, "") || "Proyecto sin título" })} className="page-field field-sizing-content w-full resize-none bg-transparent text-2xl font-bold leading-tight tracking-tight outline-none sm:text-3xl" />
        <textarea aria-label="Resumen del proyecto" rows={1} value={p.resumen ?? ""} readOnly={!puedeEditar} maxLength={500} placeholder={puedeEditar ? "Agrega un resumen: qué busca este proyecto…" : ""} onChange={event => cambiar({ resumen: event.target.value })} className="page-field field-sizing-content w-full resize-none bg-transparent text-sm text-muted-foreground outline-none" />
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-3 xl:grid-cols-5">
        <div className="grid min-w-0 gap-1"><dt className="text-xs font-semibold text-muted-foreground">Estado</dt><dd className="min-w-0"><select aria-label="Estado" className={`${select} w-full min-w-0`} disabled={!puedeEditar} value={p.estado} onChange={event => cambiar({ estado: event.target.value as EstadoProyecto })}>{ESTADOS_PROYECTO.map(v => <option key={v} value={v}>{estadoProyectoEtiqueta[v]}</option>)}</select></dd></div>
        <div className="grid min-w-0 gap-1"><dt className="text-xs font-semibold text-muted-foreground">Prioridad</dt><dd className="min-w-0"><select aria-label="Prioridad" className={`${select} w-full min-w-0`} disabled={!puedeEditar} value={p.prioridad} onChange={event => cambiar({ prioridad: event.target.value as Prioridad })}>{PRIORIDADES.map(v => <option key={v} value={v}>{prioridadEtiqueta[v]}</option>)}</select></dd></div>
        <div className="grid min-w-0 gap-1"><dt className="text-xs font-semibold text-muted-foreground">Inicio</dt><dd className="min-w-0"><Input aria-label="Fecha de inicio" type="date" disabled={!puedeEditar} value={p.fechaInicio ?? ""} onChange={event => cambiar({ fechaInicio: event.target.value || null })} className="h-9 w-full min-w-0 px-2" /></dd></div>
        <div className="grid min-w-0 gap-1"><dt className={`text-xs font-semibold ${vencido(p) ? "text-danger-700 dark:text-danger-200" : "text-muted-foreground"}`}>Fecha objetivo{vencido(p) && " · vencida"}</dt><dd className="min-w-0"><Input aria-label="Fecha objetivo" type="date" disabled={!puedeEditar} value={p.fechaObjetivo ?? ""} onChange={event => cambiar({ fechaObjetivo: event.target.value || null })} className="h-9 w-full min-w-0 px-2" /></dd></div>
        <div className="col-span-2 grid gap-1 sm:col-span-1"><dt className="text-xs font-semibold text-muted-foreground">Color</dt><dd className="flex flex-wrap gap-1.5 pt-1">{COLORES.map(c => <button key={c} type="button" disabled={!puedeEditar} aria-label={`Color ${portada[c].nombre}`} aria-pressed={p.color === c} onClick={() => cambiar({ color: c })} className={`size-6 rounded-full ${portada[c].punto} ring-offset-2 ring-offset-card transition disabled:cursor-not-allowed ${p.color === c ? "ring-2 ring-foreground" : ""}`} />)}</dd></div>
      </dl>
      <div role="tablist" aria-label="Secciones del proyecto" className="flex gap-1 overflow-x-auto border-b">{([["pagina", "Página"], ["tareas", `Tareas · ${tareasHechas}/${p.tareas.length}`], ["comentarios", `Comentarios · ${p.comentarios.length}`], ["actividad", "Actividad"]] as const).map(([clave, etiqueta]) => <button key={clave} type="button" role="tab" aria-selected={pestana === clave} onClick={() => setPestana(clave)} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition ${pestana === clave ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{etiqueta}</button>)}</div>
      {pestana === "pagina" && <Editor bloques={p.contenido} soloLectura={!puedeEditar} cambiar={contenido => cambiar({ contenido })} />}
      {pestana === "tareas" && <Tareas proyecto={p} equipo={equipo} puedeEditar={puedeEditar} accion={accion} />}
      {pestana === "comentarios" && <Comentarios proyecto={p} accion={accion} />}
      {pestana === "actividad" && (p.actividad.length ? <ol className="divide-y">{p.actividad.map(a => <LineaAuditoria key={a.id} registro={{ ...a, createdAt: String(a.createdAt) }} />)}</ol> : <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>)}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span>Creado por {p.propietario.nombre} · {formatoFecha(String(p.createdAt).slice(0, 10))}</span>
        <span className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void duplicar()}><Copy />Duplicar</Button>
          {puedeEditar && (p.estado === "ARCHIVADO" ? <Button size="sm" variant="outline" onClick={() => cambiar({ estado: "EN_CURSO" })}><RotateCcw />Restaurar</Button> : <Button size="sm" variant="outline" onClick={() => cambiar({ estado: "ARCHIVADO" })}><Archive />Archivar</Button>)}
          {p.acceso !== "PROPIETARIO" && <Button size="sm" variant="ghost" onClick={() => void api(`/${id}/miembros/${p.usuarioId}`, undefined, "DELETE").then(() => { toast.success("Saliste del proyecto."); salir(); }, reason => toast.error(reason instanceof Error ? reason.message : "No se pudo salir."))}><LogOut />Salir del proyecto</Button>}
        </span>
      </footer>
    </div>
    <Compartir abierto={compartir} cerrar={() => setCompartir(false)} proyecto={p} equipo={equipo} puedeEditar={puedeEditar} accion={accion} />
  </article>;
}

/** Editor por bloques: Enter crea un bloque nuevo, Retroceso en un bloque vacío lo borra. */
function Editor({ bloques, soloLectura, cambiar }: { bloques: Bloque[]; soloLectura: boolean; cambiar: (bloques: Bloque[]) => void }) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>()), [enfocar, setEnfocar] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null);
  const lista = bloques.length ? bloques : [{ id: "inicio", tipo: "parrafo" as const, texto: "" }];
  useEffect(() => { if (enfocar) { const el = refs.current.get(enfocar); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); } }, [enfocar, bloques]);
  const actualizar = (id: string, cambios: Partial<Bloque>) => cambiar(lista.map(b => b.id === id ? { ...b, ...cambios } : b));
  const insertar = (despuesDe: string, tipo: TipoBloque = "parrafo") => { const nuevo: Bloque = { id: nuevoId(), tipo, texto: "", ...(tipo === "casilla" ? { hecho: false } : {}) }; const i = lista.findIndex(b => b.id === despuesDe); cambiar([...lista.slice(0, i + 1), nuevo, ...lista.slice(i + 1)]); setEnfocar(nuevo.id); };
  const borrar = (id: string) => { const i = lista.findIndex(b => b.id === id); if (lista.length === 1) return actualizar(id, { tipo: "parrafo", texto: "" }); cambiar(lista.filter(b => b.id !== id)); setEnfocar(lista[Math.max(0, i - 1)].id); };
  const teclas = (event: KeyboardEvent<HTMLTextAreaElement>, b: Bloque) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); insertar(b.id, ["lista", "numerada", "casilla"].includes(b.tipo) && b.texto ? b.tipo : "parrafo"); }
    if (event.key === "Backspace" && !b.texto) { event.preventDefault(); borrar(b.id); }
    if (event.key === "/" && !b.texto) { event.preventDefault(); setMenu(b.id); }
    if (event.key === "Escape" && menu) { event.preventDefault(); setMenu(null); }
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); mover(b.id, event.key === "ArrowUp" ? -1 : 1); }
  };
  const mover = (id: string, paso: -1 | 1) => { const i = lista.findIndex(b => b.id === id), j = i + paso; if (j < 0 || j >= lista.length) return; const copia = [...lista]; [copia[i], copia[j]] = [copia[j], copia[i]]; cambiar(copia); setEnfocar(id); };
  // Número de cada elemento de una lista numerada (se reinicia al cortarse la lista).
  const numeros = lista.reduce<number[]>((acc, b, i) => [...acc, b.tipo === "numerada" ? (lista[i - 1]?.tipo === "numerada" ? acc[i - 1] + 1 : 1) : 0], []);
  const estilo: Record<TipoBloque, string> = { titulo: "text-xl font-bold sm:text-2xl", subtitulo: "text-lg font-semibold", parrafo: "text-sm leading-6", lista: "text-sm leading-6", numerada: "text-sm leading-6", casilla: "text-sm leading-6", cita: "border-l-4 border-primary/40 pl-3 text-sm italic leading-6 text-muted-foreground", aviso: "text-sm leading-6", separador: "" };
  return <div className="grid gap-0.5" aria-label="Página del proyecto">
    {lista.map((b, indice) => { const numero = numeros[indice], Icono = iconoBloque[b.tipo];
      return <div key={b.id} className={`group relative flex items-start gap-1.5 rounded-lg px-1 py-0.5 ${b.tipo === "aviso" ? "my-1 bg-info-50/80 px-3 py-2 dark:bg-info-950/30" : ""}`}>
        {!soloLectura && <div className={`relative mt-1 shrink-0 transition group-focus-within:flex group-focus-within:opacity-100 group-hover:opacity-100 sm:flex sm:opacity-0 ${menu === b.id ? "flex opacity-100" : "hidden"}`}>
          <button type="button" aria-label="Agregar bloque debajo" onClick={() => insertar(b.id)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"><Plus className="size-3.5" /></button>
          <button type="button" aria-label={`Tipo de bloque: ${bloqueEtiqueta[b.tipo]}`} aria-expanded={menu === b.id} onClick={() => setMenu(menu === b.id ? null : b.id)} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted"><Icono className="size-3.5" /></button>
          {menu === b.id && <div role="menu" className="absolute left-0 top-7 z-20 grid w-52 gap-0.5 rounded-xl border bg-popover p-1 shadow-lg">{BLOQUES.map(tipo => { const I = iconoBloque[tipo]; return <button key={tipo} type="button" role="menuitem" onClick={() => { actualizar(b.id, { tipo, ...(tipo === "casilla" ? { hecho: b.hecho ?? false } : {}) }); setMenu(null); setEnfocar(b.id); }} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted ${tipo === b.tipo ? "font-semibold text-primary" : ""}`}><I className="size-4" />{bloqueEtiqueta[tipo]}</button>; })}
            <span className="my-0.5 border-t" />
            <button type="button" role="menuitem" disabled={indice === 0} onClick={() => { setMenu(null); mover(b.id, -1); }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"><ArrowUp className="size-4" />Subir</button>
            <button type="button" role="menuitem" disabled={indice === lista.length - 1} onClick={() => { setMenu(null); mover(b.id, 1); }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"><ArrowDown className="size-4" />Bajar</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); borrar(b.id); }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-danger-700 hover:bg-danger-50 dark:text-danger-200 dark:hover:bg-danger-950/30"><Trash2 className="size-4" />Eliminar bloque</button></div>}
        </div>}
        {b.tipo === "separador" ? <hr className="my-3 flex-1 border-border" /> : <>
          {b.tipo === "lista" && <span aria-hidden className="mt-1 text-sm leading-6">•</span>}
          {b.tipo === "numerada" && <span aria-hidden className="mt-1 text-sm leading-6 tabular-nums text-muted-foreground">{numero}.</span>}
          {b.tipo === "casilla" && <input type="checkbox" aria-label={`Marcar «${b.texto || "casilla"}»`} disabled={soloLectura} checked={Boolean(b.hecho)} onChange={event => actualizar(b.id, { hecho: event.target.checked })} className="mt-2.5 size-4 shrink-0 accent-primary" />}
          {b.tipo === "aviso" && <Info aria-hidden className="mt-1.5 size-4 shrink-0 text-info-700 dark:text-info-300" />}
          <textarea ref={el => { if (el) refs.current.set(b.id, el); else refs.current.delete(b.id); }} aria-label={bloqueEtiqueta[b.tipo]} rows={1} value={b.texto} readOnly={soloLectura}
            placeholder={soloLectura ? "" : b.tipo === "titulo" ? "Título" : b.tipo === "subtitulo" ? "Subtítulo" : lista.length === 1 ? "Escribe aquí. Enter crea otro bloque; «/» cambia el tipo." : "Escribe o pulsa «/»…"}
            onChange={event => actualizar(b.id, { texto: event.target.value })} onKeyDown={event => teclas(event, b)}
            className={`page-field field-sizing-content mt-0.5 min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground/60 ${estilo[b.tipo]} ${b.tipo === "casilla" && b.hecho ? "text-muted-foreground line-through" : ""}`} />
        </>}
      </div>; })}
    {!soloLectura && <button type="button" onClick={() => insertar(lista[lista.length - 1].id)} className="mt-2 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted"><Plus className="size-4" />Agregar bloque</button>}
  </div>;
}

type Equipo = (ProyectoDetalle["propietario"] & { permiso: "PROPIETARIO" | "EDITOR" | "LECTOR" })[];
type Accion = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

function Tareas({ proyecto, equipo, puedeEditar, accion }: { proyecto: ProyectoDetalle; equipo: Equipo; puedeEditar: boolean; accion: Accion }) {
  const [titulo, setTitulo] = useState(""), [responsable, setResponsable] = useState(""), [fecha, setFecha] = useState("");
  const crear = async () => { if (!titulo.trim()) return; await accion(() => api(`/${proyecto.id}/tareas`, { titulo, responsableId: responsable || null, fechaLimite: fecha || null })); setTitulo(""); setFecha(""); };
  const cambiarTarea = (tareaId: string, cambios: Record<string, unknown>) => accion(() => api(`/${proyecto.id}/tareas/${tareaId}`, cambios, "PATCH"));
  const hoy = hoyIso(), grupos: EstadoTarea[] = ["PENDIENTE", "EN_CURSO", "HECHA"];
  return <div className="grid gap-4">
    <Avance hechas={proyecto.tareas.filter(t => t.estado === "HECHA").length} total={proyecto.tareas.length} />
    {puedeEditar && <form onSubmit={event => { event.preventDefault(); void crear(); }} className="grid gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[1fr_12rem_10rem_auto]">
      <Input aria-label="Nueva tarea" placeholder="Nueva tarea…" value={titulo} maxLength={300} onChange={event => setTitulo(event.target.value)} />
      <select aria-label="Responsable de la tarea" className={select} value={responsable} onChange={event => setResponsable(event.target.value)}><option value="">Sin responsable</option>{equipo.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
      <Input aria-label="Fecha límite" type="date" value={fecha} onChange={event => setFecha(event.target.value)} className="h-9" />
      <Button type="submit" disabled={!titulo.trim()}><Plus />Agregar</Button>
    </form>}
    {!proyecto.tareas.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{puedeEditar ? "Divide el proyecto en tareas, con responsable y fecha. Solo puedes asignar a personas con acceso al proyecto." : "Este proyecto todavía no tiene tareas."}</p>}
    {grupos.map(grupo => { const filas = proyecto.tareas.filter(t => t.estado === grupo); if (!filas.length) return null;
      return <section key={grupo} className="grid gap-1.5"><h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{estadoTareaEtiqueta[grupo]} <span className="rounded-full bg-muted px-1.5 font-semibold">{filas.length}</span></h4>
        <ul className="divide-y rounded-xl border">{filas.map(t => { const vencida = t.estado !== "HECHA" && t.fechaLimite && t.fechaLimite < hoy;
          return <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
            <input type="checkbox" aria-label={`Marcar «${t.titulo}» como hecha`} disabled={!puedeEditar} checked={t.estado === "HECHA"} onChange={event => void cambiarTarea(t.id, { estado: event.target.checked ? "HECHA" : "PENDIENTE" })} className="size-4 accent-primary" />
            <span className={`min-w-0 flex-1 text-sm font-medium ${t.estado === "HECHA" ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs">
              {puedeEditar ? <select aria-label={`Estado de «${t.titulo}»`} className={`${select} h-8 text-xs`} value={t.estado} onChange={event => void cambiarTarea(t.id, { estado: event.target.value })}>{grupos.map(e => <option key={e} value={e}>{estadoTareaEtiqueta[e]}</option>)}</select> : null}
              {puedeEditar ? <select aria-label={`Responsable de «${t.titulo}»`} className={`${select} h-8 max-w-40 text-xs`} value={t.responsableId ?? ""} onChange={event => void cambiarTarea(t.id, { responsableId: event.target.value || null })}><option value="">Sin responsable</option>{equipo.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select> : t.responsable && <span className="flex items-center gap-1"><Avatar nombre={t.responsable.nombre} className="size-5 text-[8px]" />{t.responsable.nombre}</span>}
              {t.fechaLimite && <span className={`flex items-center gap-1 ${vencida ? "font-semibold text-danger-700 dark:text-danger-200" : "text-muted-foreground"}`}><CalendarDays className="size-3.5" />{formatoFecha(t.fechaLimite)}{vencida && " · vencida"}</span>}
              {puedeEditar && <button type="button" aria-label={`Eliminar «${t.titulo}»`} onClick={() => void accion(() => api(`/${proyecto.id}/tareas/${t.id}`, undefined, "DELETE"))} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-danger-50 hover:text-danger-700 dark:hover:bg-danger-950/30"><Trash2 className="size-3.5" /></button>}
            </span>
          </li>; })}</ul></section>; })}
  </div>;
}

function Comentarios({ proyecto, accion }: { proyecto: ProyectoDetalle; accion: Accion }) {
  const [texto, setTexto] = useState("");
  const enviar = async () => { if (!texto.trim()) return; await accion(() => api(`/${proyecto.id}/comentarios`, { texto })); setTexto(""); };
  return <div className="grid gap-4">
    <form onSubmit={event => { event.preventDefault(); void enviar(); }} className="grid gap-2"><Textarea aria-label="Nuevo comentario" rows={3} maxLength={4000} placeholder="Escribe un comentario para el equipo…" value={texto} onChange={event => setTexto(event.target.value)} /><Button type="submit" className="w-fit" disabled={!texto.trim()}><MessageSquareText />Comentar</Button></form>
    {!proyecto.comentarios.length && <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>}
    <ol className="grid gap-3">{proyecto.comentarios.map(c => <li key={c.id} className="flex gap-3"><Avatar nombre={c.autor.nombre} /><div className="min-w-0 flex-1 rounded-xl bg-muted/40 px-3 py-2"><p className="text-xs"><b>{c.autor.nombre}</b> <span className="text-muted-foreground">· {relativo(String(c.createdAt))}</span></p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.texto}</p></div></li>)}</ol>
  </div>;
}

function Compartir({ abierto, cerrar, proyecto, equipo, puedeEditar, accion }: { abierto: boolean; cerrar: () => void; proyecto: ProyectoDetalle; equipo: Equipo; puedeEditar: boolean; accion: Accion }) {
  const [q, setQ] = useState(""), [personas, setPersonas] = useState<PersonaDirectorio[]>([]), [permiso, setPermiso] = useState<"EDITOR" | "LECTOR">("EDITOR"), [buscando, setBuscando] = useState(false);
  useEffect(() => { if (!abierto || !puedeEditar) return; let activo = true; const t = setTimeout(() => { setBuscando(true); api<PersonaDirectorio[]>(`/personas?${new URLSearchParams({ q })}`).then(r => { if (activo) setPersonas(r); }, () => { if (activo) setPersonas([]); }).finally(() => { if (activo) setBuscando(false); }); }, 250); return () => { activo = false; clearTimeout(t); }; }, [q, abierto, puedeEditar]);
  const ids = new Set(equipo.map(m => m.id)), rol = (codigo: string) => (roles as Record<string, string>)[codigo] ?? codigo;
  return <Dialog open={abierto} onOpenChange={value => !value && cerrar()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="size-5" />Personas con acceso</DialogTitle><DialogDescription>Solo estas personas ven «{proyecto.titulo}». Quien puede editar también puede compartir.</DialogDescription></DialogHeader>
    <ul className="divide-y rounded-xl border">{equipo.map(m => <li key={m.id} className="flex items-center gap-3 p-3"><Avatar nombre={m.nombre} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{m.nombre}{m.id === proyecto.usuarioId && " (tú)"}</p><p className="text-xs text-muted-foreground">{rol(m.rol)}</p></div>
      {m.permiso === "PROPIETARIO" ? <Badge variant="secondary">Propietario</Badge> : puedeEditar ? <><select aria-label={`Permiso de ${m.nombre}`} className={`${select} h-8 text-xs`} value={m.permiso} onChange={event => void accion(() => api(`/${proyecto.id}/miembros`, { usuarioId: m.id, permiso: event.target.value }))}><option value="EDITOR">Puede editar</option><option value="LECTOR">Solo lectura</option></select><button type="button" aria-label={`Quitar a ${m.nombre}`} onClick={() => void accion(() => api(`/${proyecto.id}/miembros/${m.id}`, undefined, "DELETE"), `${m.nombre} ya no tiene acceso.`)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-danger-50 hover:text-danger-700 dark:hover:bg-danger-950/30"><X className="size-4" /></button></> : <Badge variant="outline">{m.permiso === "EDITOR" ? "Puede editar" : "Solo lectura"}</Badge>}
    </li>)}</ul>
    {puedeEditar ? <section className="grid gap-2"><h4 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4" />Compartir con otra persona</h4>
      <div className="flex gap-2"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Buscar persona" className="pl-9" placeholder="Nombre o correo" value={q} onChange={event => setQ(event.target.value)} /></label><select aria-label="Permiso para la persona" className={select} value={permiso} onChange={event => setPermiso(event.target.value as "EDITOR" | "LECTOR")}><option value="EDITOR">Puede editar</option><option value="LECTOR">Solo lectura</option></select></div>
      {buscando && <p role="status" className="text-xs text-muted-foreground">Buscando…</p>}
      <ul className="grid max-h-64 gap-1 overflow-y-auto">{personas.filter(persona => !ids.has(persona.id)).map(persona => <li key={persona.id}><button type="button" onClick={() => void accion(() => api(`/${proyecto.id}/miembros`, { usuarioId: persona.id, permiso }), `Compartido con ${persona.nombre}.`)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted"><Avatar nombre={persona.nombre} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{persona.nombre}</span><span className="block truncate text-xs text-muted-foreground">{rol(persona.rol)}{persona.ubicacion ? ` · ${persona.ubicacion}` : ""}</span></span><Check className="size-4 text-muted-foreground" /></button></li>)}</ul>
      {!buscando && q && !personas.filter(persona => !ids.has(persona.id)).length && <p className="text-xs text-muted-foreground">No hay más personas con ese nombre.</p>}
    </section> : <p className="text-sm text-muted-foreground">Solo quien puede editar el proyecto puede compartirlo.</p>}
    <div className="flex justify-end"><Button variant="outline" onClick={cerrar}><ChevronDown className="rotate-90" />Listo</Button></div>
  </DialogContent></Dialog>;
}
