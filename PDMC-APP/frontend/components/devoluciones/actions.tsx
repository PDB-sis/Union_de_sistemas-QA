"use client";

import {useState,type ReactNode} from "react";
import {Eye,LoaderCircle,RotateCcw} from "lucide-react";
import {toast} from "sonner";
import {Badge} from "@frontend/components/ui/badge";
import {Button} from "@frontend/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@frontend/components/ui/dialog";

// Una fila por devolución: la consulta de SQL Server ya no trae detalle por producto y caja.
export type ReturnRow={numero:string;fecha:string;responsable:string;tienda:string;estado:string;observacion:string;totalValor:number|null;documentoOrigen:string|null};
type Detail=ReturnRow&{codigoResponsable:string;codigoTienda:string};

const valor=new Intl.NumberFormat("es-VE",{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatValor=(value:number|null)=>value===null?"—":valor.format(value);
export const estadoClase=(estado:string)=>estado==="Abierta"?"border-amber-200 bg-amber-50 text-amber-800":estado==="Aprobada"?"border-sky-200 bg-sky-50 text-sky-800":"border-emerald-200 bg-emerald-50 text-emerald-800";

export function ReturnActions({row}:{row:ReturnRow}){
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[detail,setDetail]=useState<Detail|null>(null);
  const show=async()=>{setOpen(true);if(detail)return;setLoading(true);try{const response=await fetch(`/api/devoluciones/${encodeURIComponent(row.numero)}`,{cache:"no-store"}),body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudo consultar el detalle.");setDetail(body.data)}catch(error){toast.error(error instanceof Error?error.message:"No se pudo consultar el detalle.");setOpen(false)}finally{setLoading(false)}};
  return <><div className="flex justify-end"><Button size="sm" variant="ghost" onClick={()=>void show()}><Eye/>Detalle</Button></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b bg-gradient-to-r from-[#082f36] via-[#0d555d] to-[#17767a] px-6 py-5 text-white"><DialogTitle className="flex items-center gap-3 text-2xl"><RotateCcw className="text-[#7ce4dd]"/>Devolución #{row.numero}</DialogTitle><DialogDescription className="sr-only">Datos de la devolución.</DialogDescription></DialogHeader>
      {loading&&!detail?<div className="grid min-h-60 place-items-center"><LoaderCircle className="size-8 animate-spin text-primary"/></div>:detail&&<div className="grid gap-px bg-border sm:grid-cols-2">
        <Field label="Fecha" value={new Date(`${detail.fecha}T12:00:00`).toLocaleDateString("es-VE")}/>
        <Field label="Estado" value={<Badge variant="outline" className={estadoClase(detail.estado)}>{detail.estado}</Badge>}/>
        <Field label="Tienda" value={detail.tienda} helper={`Código ${detail.codigoTienda}`}/>
        <Field label="Responsable" value={detail.responsable} helper={`Código ${detail.codigoResponsable}`}/>
        <Field label="Valor total" value={formatValor(detail.totalValor)}/>
        <Field label="Documento origen" value={detail.documentoOrigen??"—"}/>
        <div className="bg-background px-6 py-4 sm:col-span-2"><p className="text-xs text-muted-foreground">Observación</p><p className="mt-1 text-sm">{detail.observacion||"Sin observación"}</p></div>
      </div>}
    </DialogContent></Dialog></>;
}

function Field({label,value,helper}:{label:string;value:ReactNode;helper?:string}){return <div className="bg-background px-6 py-4"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 font-semibold">{value}</div>{helper&&<p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}</div>}
