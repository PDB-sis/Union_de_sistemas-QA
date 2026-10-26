"use client";

import {useEffect,useState} from "react";
import {CalendarDays,FileSpreadsheet,LoaderCircle,PackageOpen,RefreshCw,RotateCcw,Search,Wallet} from "lucide-react";
import {ActualizarDesdeSqlServer} from "@frontend/components/sync/actualizar";
import {toast} from "sonner";
import {Badge} from "@frontend/components/ui/badge";
import {Button} from "@frontend/components/ui/button";
import {Input} from "@frontend/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@frontend/components/ui/select";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@frontend/components/ui/table";
import {MonthSelector} from "@frontend/components/month-selector";
import {currentMonth,monthLabel} from "@shared/month";
import {usePermission} from "@frontend/components/auth/permissions";
import {ReturnActions,estadoClase,formatValor,type ReturnRow} from "./actions";

type Data={rows:ReturnRow[];lastImport:{nombreArchivo:string;importedAt:string;resumen:unknown}|null};
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const nf=new Intl.NumberFormat("es-VE");

export function ReturnsPanel(){
  const can=usePermission();
  const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true);
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[month,setMonth]=useState(currentMonth());
  const load=async()=>{setLoading(true);try{const response=await fetch("/api/devoluciones",{cache:"no-store"}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudieron consultar las devoluciones.");setData(body.data)}catch(error){toast.error(error instanceof Error?error.message:"No se pudieron consultar las devoluciones.")}finally{setLoading(false)}};
  useEffect(()=>{let active=true;fetch("/api/devoluciones",{cache:"no-store"}).then(async response=>{const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudieron consultar las devoluciones.");if(active)setData(body.data)}).catch(error=>{if(active)toast.error(error instanceof Error?error.message:"No se pudieron consultar las devoluciones.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  const period=data?.rows.filter(row=>row.fecha.slice(0,7)===month)??[];
  const rows=period.filter(row=>(status==="all"||row.estado.toLowerCase()===status)&&(!query||normalized([row.numero,row.tienda,row.responsable,row.observacion,row.documentoOrigen??""].join(" ")).includes(normalized(query))));
  const open=period.filter(row=>row.estado==="Abierta").length,approved=period.filter(row=>row.estado==="Aprobada").length,exported=period.filter(row=>row.estado==="Exportada").length,total=period.reduce((sum,row)=>sum+(row.totalValor??0),0);
  if(loading&&!data)return <div className="grid min-h-96 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary"/></div>;
  return <div className="space-y-6">
    <section className="module-hero"><div className="relative z-10 flex w-full flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><Badge className="border-white/15 bg-white/10 text-white"><RotateCcw/>Operación de tiendas</Badge><h2 className="mt-4 font-bold">Control de devoluciones</h2><p className="mt-2 max-w-2xl text-sm text-white/70">Consulta estado, valor, documento de origen y responsable de cada devolución con la misma trazabilidad del resto de PDMC.</p></div><div className="w-full sm:w-72"><MonthSelector variant="hero" value={month} onChange={setMonth}/></div></div></section>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><ReturnMetric label="Devoluciones" value={period.length} helper={monthLabel(month)} icon={RotateCcw}/><ReturnMetric label="Abiertas" value={open} helper="Requieren seguimiento" icon={PackageOpen} tone="amber"/><ReturnMetric label="Valor total" value={total} display={formatValor(total)} helper="Suma de las devoluciones del periodo" icon={Wallet}/><ReturnMetric label="Exportadas" value={exported} helper="Procesadas en el periodo" icon={RefreshCw} tone="blue"/></div>
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-4 sm:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-end"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Consulta operativa</p><h3 className="mt-1 font-semibold">Devoluciones del periodo</h3><p className="mt-1 text-xs text-muted-foreground">{rows.length} de {period.length} registros visibles</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"animate-spin":""}/>Recargar</Button>{can("devoluciones.importar")&&<ActualizarDesdeSqlServer modulo="DEVOLUCIONES" onDone={()=>void load()}/>}</div></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar devolución, tienda, responsable, documento u observación…" value={query} onChange={event=>setQuery(event.target.value)}/></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="abierta">Abiertas</SelectItem><SelectItem value="aprobada">Aprobadas</SelectItem><SelectItem value="exportada">Exportadas</SelectItem></SelectContent></Select></div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{([['all','Todas',period.length],['abierta','Abiertas',open],['aprobada','Aprobadas',approved],['exportada','Exportadas',exported]] as const).map(([id,label,count])=><button type="button" key={id} onClick={()=>setStatus(id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${status===id?"border-primary bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:border-primary/35 hover:text-foreground"}`}>{label}<span className={`ml-2 ${status===id?"text-primary-foreground/70":"text-muted-foreground"}`}>{count}</span></button>)}</div>
      </div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Devolución</TableHead><TableHead>Fecha</TableHead><TableHead>Tienda</TableHead><TableHead>Responsable</TableHead><TableHead>Estado</TableHead><TableHead>Documento origen</TableHead><TableHead>Observación</TableHead><TableHead className="text-right">Valor total</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.numero}><TableCell className="font-mono font-semibold text-primary">#{row.numero}</TableCell><TableCell><span className="flex items-center gap-2 whitespace-nowrap"><CalendarDays className="size-4 text-muted-foreground"/>{new Date(`${row.fecha}T12:00:00`).toLocaleDateString("es-VE")}</span></TableCell><TableCell className="min-w-48 font-medium">{row.tienda}</TableCell><TableCell>{row.responsable}</TableCell><TableCell><Badge variant="outline" className={estadoClase(row.estado)}>{row.estado}</Badge></TableCell><TableCell className="font-mono text-sm">{row.documentoOrigen??"—"}</TableCell><TableCell className="min-w-72 max-w-md text-sm text-muted-foreground">{row.observacion}</TableCell><TableCell className="whitespace-nowrap text-right text-base font-bold">{formatValor(row.totalValor)}</TableCell><TableCell><ReturnActions row={row}/></TableCell></TableRow>)}</TableBody></Table></div>
      {!rows.length&&<div className="grid min-h-44 place-items-center text-sm text-muted-foreground"><div className="text-center"><FileSpreadsheet className="mx-auto mb-2 size-7"/>No hay devoluciones para estos filtros.</div></div>}
      <div className="border-t bg-muted/10 px-4 py-3 text-xs text-muted-foreground">{data?.lastImport?`Última carga: ${new Date(data.lastImport.importedAt).toLocaleString("es-VE")}`:"Sin consultas importadas."}</div>
    </section>
  </div>
}

function ReturnMetric({label,value,display,helper,icon:Icon,tone="teal"}:{label:string;value:number;display?:string;helper:string;icon:typeof RotateCcw;tone?:"teal"|"amber"|"blue"}){const colors={teal:"bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",amber:"bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",blue:"bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"};return <div className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><p className="text-[.7rem] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="metric-number mt-2 text-3xl font-bold">{display??nf.format(value)}</p><p className="mt-1.5 text-xs text-muted-foreground">{helper}</p></div><span className={`rounded-2xl p-3 ${colors[tone]}`}><Icon className="size-5"/></span></div></div>}
