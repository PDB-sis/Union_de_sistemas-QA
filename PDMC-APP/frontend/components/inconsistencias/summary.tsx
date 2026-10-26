"use client";
import {createContext,useContext,useEffect,useState} from "react";
import {usePermission} from "@frontend/components/auth/permissions";
type Summary={total:number;pendientes:number;resueltos:number;ajustados:number;sinConteo:number;conConteo:number};
const Context=createContext<{data?:Summary;error?:string}>({});
export const useInconsistencySummary=()=>useContext(Context);
export function InconsistencySummaryProvider({children}:{children:React.ReactNode}){
  const can=usePermission(),enabled=can("inconsistencias.leer"),[revision,setRevision]=useState(0),[state,setState]=useState<{data?:Summary;error?:string}>({});
  useEffect(()=>{if(!enabled)return;const controller=new AbortController();fetch(`/api/inconsistencias?estado=todos&flujo=todos&take=1&r=${revision}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json();if(!body.ok)throw new Error(body.error?.message);setState({data:body.data.summary});}).catch(error=>{if(!controller.signal.aborted)setState({error:error instanceof Error?error.message:"Error"})});return()=>controller.abort()},[enabled,revision]);
  useEffect(()=>{const refresh=()=>setRevision(value=>value+1);window.addEventListener("pdmc:inconsistencias-changed",refresh);return()=>window.removeEventListener("pdmc:inconsistencias-changed",refresh)},[]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
