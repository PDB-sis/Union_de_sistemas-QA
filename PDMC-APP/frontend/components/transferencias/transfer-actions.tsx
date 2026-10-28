"use client";

import {useState} from "react";
import {CalendarDays,Download,Eye,ImageDown,LoaderCircle,PackageOpen,Store} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@frontend/components/ui/button";
import {Badge} from "@frontend/components/ui/badge";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@frontend/components/ui/dialog";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@frontend/components/ui/table";
import {downloadShareImage} from "@frontend/lib/share-image";

type TransferSummary={id:string;date:string;store:string;biller:string;status:string;units:number};
type Item={codigoBarra:string;cantidad:number;numeroCaja:string;referencia:string|null;descripcion:string|null;marca:string|null;talla:string|null};
type Detail={numero:string;fecha:string;estado:string;tienda:string;facturador:string;unidades:number;cantidadCodigos:number;cajas:number;items:Item[]};

function downloadConfirmation(transfer:TransferSummary,detail:Detail){
  const references=new Set(detail.items.map(item=>item.referencia?.trim()).filter(Boolean)).size||new Set(detail.items.map(item=>item.codigoBarra)).size;
  return downloadShareImage({kicker:"CONTROL DE TRANSFERENCIA",title:`Transferencia #${transfer.id}`,subtitle:detail.tienda,metrics:[["FECHA",new Date(`${detail.fecha}T12:00:00`).toLocaleDateString("es-VE")],["REFERENCIAS",references.toLocaleString("es-VE")],["UNIDADES",detail.unidades.toLocaleString("es-VE")]],items:detail.items,fileName:`confirmar-exportacion-${transfer.id}.png`});
}

export function TransferActions({transfer}:{transfer:TransferSummary}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[imageBusy,setImageBusy]=useState(false),[detail,setDetail]=useState<Detail|null>(null);
  const load=async()=>{if(detail)return detail;setLoading(true);try{const response=await fetch(`/api/transferencias/${encodeURIComponent(transfer.id)}`,{cache:"no-store"}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudo consultar el detalle.");setDetail(body.data);return body.data as Detail;}finally{setLoading(false)}};
  const show=async()=>{setOpen(true);try{await load();}catch(error){toast.error(error instanceof Error?error.message:"No se pudo consultar el detalle.");setOpen(false);}};
  const image=async()=>{setImageBusy(true);try{await downloadConfirmation(transfer,await load());toast.success("Imagen detallada lista para enviar.");}catch(error){toast.error(error instanceof Error?error.message:"No se pudo generar la imagen.");}finally{setImageBusy(false)}};
  return <>
    <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={()=>void show()}><Eye/>Detalle</Button>{transfer.status.toLowerCase()==="abierta"&&<Button size="sm" variant="outline" disabled={imageBusy} onClick={()=>void image()}>{imageBusy?<LoaderCircle className="animate-spin"/>:<ImageDown/>}Imagen</Button>}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex h-[92vh] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-3rem)] xl:max-w-[1500px]">
      <DialogHeader className="shrink-0 border-b bg-[linear-gradient(90deg,var(--brand-deep),var(--brand-ocean))] px-5 py-4 text-white sm:px-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl"><PackageOpen className="size-6 text-brand-glow"/>Transferencia #{transfer.id}</DialogTitle><DialogDescription className="sr-only">Detalle de productos de la transferencia.</DialogDescription></div>{detail&&<div className="flex flex-wrap items-center gap-2 text-xs"><Badge className="border-white/15 bg-white/10 text-white"><CalendarDays/>{new Date(`${detail.fecha}T12:00:00`).toLocaleDateString("es-VE")}</Badge><Badge className="border-brand-glow/30 bg-brand-glow/15 text-brand-mist">{detail.estado}</Badge></div>}</div></DialogHeader>
      {loading&&!detail?<div className="grid flex-1 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary"/></div>:detail&&<div className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 border-b bg-muted/20 sm:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(110px,180px))]"><div className="flex items-center gap-3 border-b px-5 py-4 sm:border-b-0 sm:border-r"><Store className="size-5 shrink-0 text-primary"/><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Destino</p><p className="truncate font-semibold">{detail.tienda}</p></div></div><div className="px-5 py-4"><p className="text-xs text-muted-foreground">Cajas</p><p className="text-xl font-bold">{detail.cajas}</p></div><div className="px-5 py-4"><p className="text-xs text-muted-foreground">Productos</p><p className="text-xl font-bold">{detail.cantidadCodigos}</p></div><div className="px-5 py-4"><p className="text-xs text-muted-foreground">Unidades</p><p className="text-xl font-bold text-primary">{detail.unidades.toLocaleString("es-VE")}</p></div></div>
        <div className="min-h-0 flex-1 overflow-auto"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead className="w-24">Caja</TableHead><TableHead className="w-52">Código de barra</TableHead><TableHead className="w-40">Referencia</TableHead><TableHead>Descripción</TableHead><TableHead className="w-44">Marca</TableHead><TableHead className="w-24">Talla</TableHead><TableHead className="w-24 text-right">Cantidad</TableHead></TableRow></TableHeader><TableBody>{detail.items.map((item,index)=><TableRow key={`${item.numeroCaja}-${item.codigoBarra}-${index}`} className="hover:bg-primary/[.04]"><TableCell><Badge variant="secondary" className="font-mono">{item.numeroCaja}</Badge></TableCell><TableCell className="font-mono text-xs font-semibold">{item.codigoBarra}</TableCell><TableCell className="font-medium">{item.referencia||"—"}</TableCell><TableCell className="min-w-72">{item.descripcion||"Sin descripción"}</TableCell><TableCell>{item.marca||"—"}</TableCell><TableCell>{item.talla||"—"}</TableCell><TableCell className="text-right text-base font-bold">{item.cantidad}</TableCell></TableRow>)}</TableBody></Table></div>
        {transfer.status.toLowerCase()==="abierta"&&<div className="flex shrink-0 justify-end border-t bg-background px-5 py-3"><Button disabled={imageBusy} onClick={()=>void image()}>{imageBusy?<LoaderCircle className="animate-spin"/>:<Download/>}Descargar imagen con productos</Button></div>}
      </div>}
    </DialogContent></Dialog>
  </>;
}
