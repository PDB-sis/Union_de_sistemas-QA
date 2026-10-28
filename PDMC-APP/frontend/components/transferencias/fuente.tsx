"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {Database} from "lucide-react";
import {ActualizarDesdeSqlServer,formatoFecha,useUltimaActualizacion} from "@frontend/components/sync/actualizar";

export function TransferenciasFuente(){
  const router=useRouter(),[epoch,setEpoch]=useState(0),estado=useUltimaActualizacion("TRANSFERENCIAS",epoch);
  return <section className="pdmc-surface flex flex-col gap-4 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Database className="size-5"/></span><div className="flex-1"><h2 className="font-semibold">Fuente de transferencias: SQL Server</h2><p className="mt-1 text-sm text-muted-foreground">Se actualizan automáticamente desde SQL Server. Última actualización: {formatoFecha(estado?.ultimoExitoEn)}.</p>{estado?.ultimoError&&<p className="mt-1 text-sm text-danger-700 dark:text-danger-200">Último intento fallido: {estado.ultimoError}</p>}</div><ActualizarDesdeSqlServer modulo="TRANSFERENCIAS" onDone={()=>{setEpoch(value=>value+1);router.refresh()}}/></section>;
}
