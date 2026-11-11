"use client";

import {useState} from "react";
import {AlertTriangle,CalendarDays,Download,Eye,ImageDown,LoaderCircle,RotateCcw,Store} from "lucide-react";
import {toast} from "sonner";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {downloadShareImage} from "@/lib/share-image";

// Cabecera de la devolución (usuario, valor y documento de origen) y su detalle por producto y caja.
export type ReturnRow={numero:string;fecha:string;responsable:string;tienda:string;estado:string;observacion:string;totalValor:number|null;documentoOrigen:string|null;unidades:number;referencias:number};
type Item={codigoBarra:string;cantidad:number;numeroCaja:string;referencia:string|null;descripcion:string|null;marca:string|null;talla:string|null};
/** COMPLETO: llegaron todas las líneas. INCOMPLETO: llegaron menos. SIN_DETALLE: la bodega aún usa la consulta anterior. */
type EstadoDetalle="COMPLETO"|"INCOMPLETO"|"SIN_DETALLE";
type Detail=ReturnRow&{codigoResponsable:string;codigoTienda:string;detalle:EstadoDetalle;lineasEsperadas:number|null;cajas:number;items:Item[]};

const valor=new Intl.NumberFormat("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatValor=(value:number|null)=>value===null?"—":valor.format(value);
export const estadoClase=(estado:string)=>estado==="Abierta"?"border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-800 dark:bg-warning-950/40 dark:text-warning-200":estado==="Aprobada"?"border-info-200 bg-info-50 text-info-800 dark:border-info-800 dark:bg-info-950/40 dark:text-info-200":"border-success-200 bg-success-50 text-success-800 dark:border-success-800 dark:bg-success-950/40 dark:text-success-200";
const fecha=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString("es-VE");

function downloadReturn(detail:Detail){
  const references=new Set(detail.items.map(item=>item.referencia?.trim()).filter(Boolean)).size||new Set(detail.items.map(item=>item.codigoBarra)).size;
  return downloadShareImage({kicker:"CONTROL DE DEVOLUCIÓN",title:`Devolución #${detail.numero}`,subtitle:detail.tienda,metrics:[["FECHA",fecha(detail.fecha)],["REFERENCIAS",references.toLocaleString("es-VE")],["UNIDADES",detail.unidades.toLocaleString("es-VE")]],...(detail.observacion?{note:{label:"OBSERVACIÓN",text:detail.observacion}}:{}),items:detail.items,fileName:`devolucion-${detail.numero}.png`});
}

export function ReturnActions({row}:{row:ReturnRow}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[imageBusy,setImageBusy]=useState(false),[detail,setDetail]=useState<Detail|null>(null);
  const load=async()=>{if(detail)return detail;setLoading(true);try{const response=await fetch(`/api/devoluciones/${encodeURIComponent(row.numero)}`,{cache:"no-store"}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudo consultar el detalle.");setDetail(body.data);return body.data as Detail;}finally{setLoading(false)}};
  const show=async()=>{setOpen(true);try{await load();}catch(error){toast.error(error instanceof Error?error.message:"No se pudo consultar el detalle.");setOpen(false);}};
  // La imagen solo sale con el detalle completo: una imagen con productos de menos confundiría a la tienda.
  const image=async()=>{setImageBusy(true);try{const data=await load();if(data.detalle!=="COMPLETO"||!data.items.length)throw new Error(data.detalle==="SIN_DETALLE"?"Esta devolución todavía no tiene el detalle de productos.":"El detalle de esta devolución está incompleto; la imagen no se genera.");await downloadReturn(data);toast.success("Imagen detallada lista para enviar.");}catch(error){toast.error(error instanceof Error?error.message:"No se pudo generar la imagen.");}finally{setImageBusy(false)}};
  const abierta=row.estado==="Abierta";
  return <>
    <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={()=>void show()}><Eye/>Detalle</Button>{abierta&&<Button size="sm" variant="outline" disabled={imageBusy} onClick={()=>void image()}>{imageBusy?<LoaderCircle className="animate-spin"/>:<ImageDown/>}Imagen</Button>}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex h-[92vh] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-3rem)] xl:max-w-[1500px]">
      <DialogHeader className="shrink-0 border-b bg-[linear-gradient(90deg,var(--brand-deep),var(--brand-ocean))] px-5 py-4 text-white sm:px-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl"><RotateCcw className="size-6 text-brand-glow"/>Devolución #{row.numero}</DialogTitle><DialogDescription className="sr-only">Datos y productos de la devolución.</DialogDescription></div>{detail&&<div className="flex flex-wrap items-center gap-2 text-xs"><Badge className="border-white/15 bg-white/10 text-white"><CalendarDays/>{fecha(detail.fecha)}</Badge><Badge className="border-brand-glow/30 bg-brand-glow/15 text-brand-mist">{detail.estado}</Badge></div>}</div></DialogHeader>
      {loading&&!detail?<div className="grid flex-1 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary"/></div>:detail&&<div className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 grid-cols-3 border-b bg-muted/20 sm:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(110px,180px))]">
          <div className="col-span-3 flex min-w-0 items-center gap-3 border-b px-5 py-4 sm:col-span-1 sm:border-b-0 sm:border-r"><Store className="size-5 shrink-0 text-primary"/><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Tienda</p><p className="font-semibold leading-5 sm:truncate">{detail.tienda}</p><p className="text-xs text-muted-foreground">Código {detail.codigoTienda}</p></div></div>
          <Cifra label="Cajas" value={detail.cajas}/><Cifra label="Productos" value={detail.referencias}/><Cifra label="Unidades" value={detail.unidades} destacada/>
        </div>
        <dl className="grid shrink-0 gap-x-6 gap-y-2 border-b px-5 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Responsable" value={detail.responsable} helper={`Código ${detail.codigoResponsable}`}/>
          <Dato label="Valor total" value={formatValor(detail.totalValor)}/>
          <Dato label="Documento origen" value={detail.documentoOrigen??"—"}/>
          <Dato label="Observación" value={detail.observacion||"Sin observación"}/>
        </dl>
        {detail.detalle!=="COMPLETO"&&<div role="note" className="flex shrink-0 items-start gap-2 border-b border-warning-200 bg-warning-50 px-5 py-3 text-sm text-warning-900 dark:border-warning-900 dark:bg-warning-950/30 dark:text-warning-100"><AlertTriangle className="mt-0.5 size-4 shrink-0"/><p>{detail.detalle==="SIN_DETALLE"?"La bodega de esta devolución todavía no envía el detalle de productos. Aparecerá cuando su agente use la consulta nueva de devoluciones.":`El detalle está incompleto: hay ${detail.items.length.toLocaleString("es-VE")} de ${(detail.lineasEsperadas??0).toLocaleString("es-VE")} líneas. El agente de la bodega debe actualizarse para enviar cada producto y caja.`}</p></div>}
        <div className="min-h-0 flex-1 overflow-auto">
          <ul aria-label="Productos de la devolución" className="divide-y sm:hidden">{detail.items.map((item,index)=><li key={`${item.numeroCaja}-${item.codigoBarra}-${index}`} className="grid gap-1.5 px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-medium leading-5">{item.descripcion||"Sin descripción"}</p><p className="shrink-0 text-right"><span className="block text-lg font-bold leading-6">{item.cantidad}</span><span className="text-[11px] text-muted-foreground">unidades</span></p></div><p className="font-mono text-xs font-semibold">{item.codigoBarra}</p><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="secondary" className="font-mono">Caja {item.numeroCaja}</Badge>{item.referencia&&<span>Ref. {item.referencia}</span>}{item.marca&&<span>{item.marca}</span>}{item.talla&&<span>Talla {item.talla}</span>}</div></li>)}{!detail.items.length&&<li className="p-6 text-center text-sm text-muted-foreground">{detail.detalle==="COMPLETO"?"Esta devolución no tiene productos.":"Sin productos cargados todavía."}</li>}</ul>
          <Table className="hidden sm:table"><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead className="w-24">Caja</TableHead><TableHead className="w-52">Código de barra</TableHead><TableHead className="w-40">Referencia</TableHead><TableHead>Descripción</TableHead><TableHead className="w-44">Marca</TableHead><TableHead className="w-24">Talla</TableHead><TableHead className="w-24 text-right">Cantidad</TableHead></TableRow></TableHeader><TableBody>{detail.items.map((item,index)=><TableRow key={`${item.numeroCaja}-${item.codigoBarra}-${index}`} className="hover:bg-primary/[.04]"><TableCell><Badge variant="secondary" className="font-mono">{item.numeroCaja}</Badge></TableCell><TableCell className="font-mono text-xs font-semibold">{item.codigoBarra}</TableCell><TableCell className="font-medium">{item.referencia||"—"}</TableCell><TableCell className="min-w-72">{item.descripcion||"Sin descripción"}</TableCell><TableCell>{item.marca||"—"}</TableCell><TableCell>{item.talla||"—"}</TableCell><TableCell className="text-right text-base font-bold">{item.cantidad}</TableCell></TableRow>)}{!detail.items.length&&<TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">{detail.detalle==="COMPLETO"?"Esta devolución no tiene productos.":"Sin productos cargados todavía."}</TableCell></TableRow>}</TableBody></Table>
        </div>
        {abierta&&detail.detalle==="COMPLETO"&&detail.items.length>0&&<div className="flex shrink-0 justify-end border-t bg-background px-5 py-3"><Button disabled={imageBusy} onClick={()=>void image()}>{imageBusy?<LoaderCircle className="animate-spin"/>:<Download/>}Descargar imagen con productos</Button></div>}
      </div>}
    </DialogContent></Dialog>
  </>;
}

function Cifra({label,value,destacada=false}:{label:string;value:number;destacada?:boolean}){return <div className="min-w-0 px-4 py-3 sm:px-5 sm:py-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-xl font-bold tabular-nums ${destacada?"text-primary":""}`}>{value.toLocaleString("es-VE")}</p></div>}
function Dato({label,value,helper}:{label:string;value:string;helper?:string}){return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium break-words">{value}</dd>{helper&&<dd className="text-xs text-muted-foreground">{helper}</dd>}</div>}
