"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePermission } from "@/components/auth/permissions";
import { useApi } from "./client";
type Summary={resumen:{actuales:number;unidades:string;totalCasosActivos:number;totalUnidadesActivas:string;pendientesVerificar:number;sinConteo:number;conConteo:number;aprobados:number};ultimaConsulta:{fechaConsulta:string}|null};
const Context=createContext<{data?:Summary;error?:string;loading:boolean}>({loading:true});
export const useNegativeSummary=()=>useContext(Context);
export function NegativeSummaryProvider({children}:{children:React.ReactNode}) {
  const can=usePermission(),enabled=can("negativos.leer");
  const [revision,setRevision]=useState(0);
  const result=useApi<Summary>(enabled?`lista?vista=actual&filtro=all&flujo=trabajo&take=1#${revision}`:null);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")setRevision(v=>v+1)};
    window.addEventListener("pdmc:negativos-changed",refresh);window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    const timer=window.setInterval(refresh,60000);
    return()=>{clearInterval(timer);window.removeEventListener("pdmc:negativos-changed",refresh);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)};
  },[]);
  return <Context.Provider value={result}>{children}</Context.Provider>;
}
