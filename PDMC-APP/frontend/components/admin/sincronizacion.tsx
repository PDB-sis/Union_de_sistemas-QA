"use client";
import {useState} from "react";
import {ActualizarDesdeSqlServer,formatoFecha,nombresModulo,useEstadosSincronizacion,type ModuloSync} from "@frontend/components/sync/actualizar";

const orden:ModuloSync[]=["SUCURSALES","FACTURADORES","TRANSFERENCIAS","DEVOLUCIONES","INVENTARIO"];

// Estado de las sincronizaciones automáticas (agentes de bodega y SQL Server). Al ser automáticas nadie
// ve sus errores en pantalla, así que se muestran aquí.
export function SincronizacionEstado(){
  const [epoch,setEpoch]=useState(0),data=useEstadosSincronizacion(epoch);
  if(!data)return null;
  const porModulo=new Map(data.estados.map(estado=>[estado.modulo,estado]));
  return <section className="mb-5 rounded-2xl border bg-card p-4" aria-labelledby="sync-title">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="sync-title" className="font-semibold">Sincronizaciones automáticas</h2><p className="text-xs text-muted-foreground">{data.activa?"Activas":"Desactivadas (PDMC_SQLSERVER_ENABLED=false)"}</p></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{orden.map(modulo=>{const estado=porModulo.get(modulo),fallo=Boolean(estado?.ultimoError);return <div key={modulo} className={"flex flex-col gap-2 rounded-xl border p-3 text-sm "+(fallo?"border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100":"")}>
      <p className="font-semibold">{nombresModulo[modulo]}</p>
      <p className="text-xs text-muted-foreground">Última carga correcta: {formatoFecha(estado?.ultimoExitoEn)}</p>
      {fallo&&<p className="break-words text-xs">Último intento ({formatoFecha(estado!.ultimoIntentoEn)}) falló: {estado!.ultimoError}</p>}
      {data.activa&&<ActualizarDesdeSqlServer modulo={modulo} variant="outline" className="mt-auto" onDone={()=>setEpoch(value=>value+1)}/>}
    </div>})}</div>
  </section>;
}
