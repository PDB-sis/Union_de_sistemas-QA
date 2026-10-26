"use client";

import {useState} from "react";
import {CalendarDays,Download,Eye,ImageDown,LoaderCircle,PackageOpen,Store} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@frontend/components/ui/button";
import {Badge} from "@frontend/components/ui/badge";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@frontend/components/ui/dialog";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@frontend/components/ui/table";

type TransferSummary={id:string;date:string;store:string;biller:string;status:string;units:number};
type Item={codigoBarra:string;cantidad:number;numeroCaja:string;referencia:string|null;descripcion:string|null;marca:string|null;talla:string|null};
type Detail={numero:string;fecha:string;estado:string;tienda:string;facturador:string;unidades:number;cantidadCodigos:number;cajas:number;items:Item[]};

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function fit(ctx:CanvasRenderingContext2D,value:string,max:number){if(ctx.measureText(value).width<=max)return value;let text=value;while(text.length>1&&ctx.measureText(`${text}…`).width>max)text=text.slice(0,-1);return `${text}…`;}
function downloadConfirmation(transfer:TransferSummary,detail:Detail){
  const width=1440,rowHeight=58,tableTop=445,height=Math.max(900,tableTop+55+detail.items.length*rowHeight+55),references=new Set(detail.items.map(item=>item.referencia?.trim()).filter(Boolean)).size||new Set(detail.items.map(item=>item.codigoBarra)).size,canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");if(!ctx)return;
  const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,"#07363d");gradient.addColorStop(.5,"#0b5960");gradient.addColorStop(1,"#073f48");ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  ctx.globalAlpha=.08;ctx.fillStyle="#ffffff";ctx.beginPath();ctx.arc(1330,-20,330,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle="#7ce4dd";rounded(ctx,90,65,10,56,5);ctx.font="800 25px system-ui";ctx.fillText("CONTROL DE TRANSFERENCIA",125,101);
  ctx.fillStyle="#ffffff";ctx.font="800 61px system-ui";ctx.fillText(`Transferencia #${transfer.id}`,90,190);ctx.fillStyle="rgba(255,255,255,.78)";ctx.font="650 29px system-ui";ctx.fillText(fit(ctx,detail.tienda,1200),90,240);
  ctx.fillStyle="rgba(255,255,255,.095)";rounded(ctx,90,285,1260,115,24);ctx.fillStyle="rgba(124,228,221,.22)";rounded(ctx,500,310,2,65,1);rounded(ctx,920,310,2,65,1);
  const metrics=[["FECHA",new Date(`${detail.fecha}T12:00:00`).toLocaleDateString("es-VE")],["REFERENCIAS",String(references)],["UNIDADES",detail.unidades.toLocaleString("es-VE")]];
  metrics.forEach(([label,value],index)=>{const x=145+index*420;ctx.fillStyle="#9eece7";ctx.font="700 18px system-ui";ctx.fillText(label,x,325);ctx.fillStyle="#ffffff";ctx.font="800 33px system-ui";ctx.fillText(value,x,372);});
  ctx.fillStyle="#7ce4dd";ctx.font="700 19px system-ui";ctx.fillText("CÓDIGO DE BARRA",110,tableTop);ctx.fillText("REFERENCIA / PRODUCTO",470,tableTop);ctx.fillText("CANT.",1255,tableTop);
  detail.items.forEach((item,index)=>{const y=tableTop+34+index*rowHeight;if(index%2===0){ctx.fillStyle="rgba(255,255,255,.075)";rounded(ctx,88,y-32,1264,rowHeight-4,11);}ctx.fillStyle="#ffffff";ctx.font="650 21px ui-monospace, monospace";ctx.fillText(fit(ctx,item.codigoBarra,300),110,y);ctx.font="600 20px system-ui";const product=[item.referencia,item.descripcion].filter(Boolean).join(" · ")||"Producto sin descripción";ctx.fillText(fit(ctx,product,700),470,y);ctx.fillStyle="#c8fffb";ctx.font="800 24px system-ui";ctx.fillText(String(item.cantidad),1270,y);});
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=`confirmar-exportacion-${transfer.id}.png`;anchor.click();URL.revokeObjectURL(url);toast.success("Imagen detallada lista para enviar.");},"image/png");
}

export function TransferActions({transfer}:{transfer:TransferSummary}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[imageBusy,setImageBusy]=useState(false),[detail,setDetail]=useState<Detail|null>(null);
  const load=async()=>{if(detail)return detail;setLoading(true);try{const response=await fetch(`/api/transferencias/${encodeURIComponent(transfer.id)}`,{cache:"no-store"}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudo consultar el detalle.");setDetail(body.data);return body.data as Detail;}finally{setLoading(false)}};
  const show=async()=>{setOpen(true);try{await load();}catch(error){toast.error(error instanceof Error?error.message:"No se pudo consultar el detalle.");setOpen(false);}};
  const image=async()=>{setImageBusy(true);try{downloadConfirmation(transfer,await load());}catch(error){toast.error(error instanceof Error?error.message:"No se pudo generar la imagen.");}finally{setImageBusy(false)}};
  return <>
    <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={()=>void show()}><Eye/>Detalle</Button>{transfer.status.toLowerCase()==="abierta"&&<Button size="sm" variant="outline" disabled={imageBusy} onClick={()=>void image()}>{imageBusy?<LoaderCircle className="animate-spin"/>:<ImageDown/>}Imagen</Button>}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex h-[92vh] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-3rem)] xl:max-w-[1500px]">
      <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-[#082f36] via-[#0d555d] to-[#17767a] px-5 py-4 text-white sm:px-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl"><PackageOpen className="size-6 text-[#7ce4dd]"/>Transferencia #{transfer.id}</DialogTitle><DialogDescription className="sr-only">Detalle de productos de la transferencia.</DialogDescription></div>{detail&&<div className="flex flex-wrap items-center gap-2 text-xs"><Badge className="border-white/15 bg-white/10 text-white"><CalendarDays/>{new Date(`${detail.fecha}T12:00:00`).toLocaleDateString("es-VE")}</Badge><Badge className="border-[#7ce4dd]/30 bg-[#7ce4dd]/15 text-[#c8fffb]">{detail.estado}</Badge></div>}</div></DialogHeader>
      {loading&&!detail?<div className="grid flex-1 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary"/></div>:detail&&<div className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 border-b bg-muted/20 sm:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(110px,180px))]"><div className="flex items-center gap-3 border-b px-5 py-4 sm:border-b-0 sm:border-r"><Store className="size-5 shrink-0 text-primary"/><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">Destino</p><p className="truncate font-semibold">{detail.tienda}</p></div></div><div className="px-5 py-4"><p className="text-xs text-muted-foreground">Cajas</p><p className="text-xl font-bold">{detail.cajas}</p></div><div className="px-5 py-4"><p className="text-xs text-muted-foreground">Productos</p><p className="text-xl font-bold">{detail.cantidadCodigos}</p></div><div className="px-5 py-4"><p className="text-xs text-muted-foreground">Unidades</p><p className="text-xl font-bold text-primary">{detail.unidades.toLocaleString("es-VE")}</p></div></div>
        <div className="min-h-0 flex-1 overflow-auto"><Table><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead className="w-24">Caja</TableHead><TableHead className="w-52">Código de barra</TableHead><TableHead className="w-40">Referencia</TableHead><TableHead>Descripción</TableHead><TableHead className="w-44">Marca</TableHead><TableHead className="w-24">Talla</TableHead><TableHead className="w-24 text-right">Cantidad</TableHead></TableRow></TableHeader><TableBody>{detail.items.map((item,index)=><TableRow key={`${item.numeroCaja}-${item.codigoBarra}-${index}`} className="hover:bg-primary/[.04]"><TableCell><Badge variant="secondary" className="font-mono">{item.numeroCaja}</Badge></TableCell><TableCell className="font-mono text-xs font-semibold">{item.codigoBarra}</TableCell><TableCell className="font-medium">{item.referencia||"—"}</TableCell><TableCell className="min-w-72">{item.descripcion||"Sin descripción"}</TableCell><TableCell>{item.marca||"—"}</TableCell><TableCell>{item.talla||"—"}</TableCell><TableCell className="text-right text-base font-bold">{item.cantidad}</TableCell></TableRow>)}</TableBody></Table></div>
        {transfer.status.toLowerCase()==="abierta"&&<div className="flex shrink-0 justify-end border-t bg-background px-5 py-3"><Button disabled={imageBusy} onClick={()=>void image()}>{imageBusy?<LoaderCircle className="animate-spin"/>:<Download/>}Descargar imagen con productos</Button></div>}
      </div>}
    </DialogContent></Dialog>
  </>;
}
