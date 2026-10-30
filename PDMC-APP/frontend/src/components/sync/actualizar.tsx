"use client";

import {useEffect,useState} from "react";
import {Camera,RefreshCw} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";

export type ModuloSync="SUCURSALES"|"FACTURADORES"|"TRANSFERENCIAS"|"DEVOLUCIONES"|"INVENTARIO";
type Estado={modulo:string;ultimoExitoEn:string|null;ultimoIntentoEn:string|null;ultimoError:string|null};
export const nombresModulo:Record<ModuloSync,string>={SUCURSALES:"Tiendas",FACTURADORES:"Facturadores",TRANSFERENCIAS:"Transferencias",DEVOLUCIONES:"Devoluciones",INVENTARIO:"Inventario"};

/** Estado de las consultas automáticas, leído de /api/sincronizacion. */
export function useEstadosSincronizacion(epoch=0){
  const [data,setData]=useState<{activa:boolean;estados:Estado[]}|null>(null);
  useEffect(()=>{let active=true;fetch("/api/sincronizacion",{cache:"no-store"}).then(r=>r.json()).then(body=>{if(active&&body.ok)setData(body.data)}).catch(()=>undefined);return()=>{active=false}},[epoch]);
  return data;
}

export function useUltimaActualizacion(modulo:ModuloSync,epoch=0){
  return useEstadosSincronizacion(epoch)?.estados.find(item=>item.modulo===modulo)??null;
}

export function formatoFecha(value:string|null|undefined){return value?new Date(value).toLocaleString("es-VE"):"Nunca";}

/**
 * Actualiza ahora el módulo indicado desde su fuente: los agentes de las bodegas
 * (transferencias, devoluciones y facturadores) o SQL Server (sitios e inventario);
 * nunca abre ni acepta archivos. Con publicarNegativos, inventario publica además la
 * fotografía semanal de negativos.
 */
export function ActualizarDesdeSqlServer({modulo,onDone,className,variant="default",publicarNegativos=false,disabled=false}:{modulo:ModuloSync;onDone?:()=>void;className?:string;variant?:"default"|"outline";publicarNegativos?:boolean;disabled?:boolean}){
  const [busy,setBusy]=useState(false);
  const run=async()=>{setBusy(true);try{
    const response=await fetch(`/api/sincronizacion?modulo=${modulo}${publicarNegativos?"&publicar=1":""}`,{method:"POST",cache:"no-store"}),body=await response.json();
    if(!response.ok||!body.ok)throw new Error(body.error?.message??"No se pudo actualizar.");
    toast.success(publicarNegativos?"Fotografía de negativos publicada desde SQL Server.":body.data.estado==="SIN_CAMBIOS"?`${nombresModulo[modulo]}: sin cambios.`:`${nombresModulo[modulo]} actualizado (${body.data.totalFilas} filas).`);
    onDone?.();
  }catch(error){toast.error(error instanceof Error?error.message:"No se pudo actualizar.")}finally{setBusy(false)}};
  const Icon=publicarNegativos?Camera:RefreshCw,label=publicarNegativos?"Publicar fotografía de negativos":"Actualizar ahora";
  return <Button className={className} variant={variant} disabled={busy||disabled} onClick={()=>void run()}><Icon className={busy?"animate-spin":undefined}/>{busy?(modulo==="INVENTARIO"?"Consultando… (puede tardar 2 min)":"Actualizando…"):label}</Button>;
}
