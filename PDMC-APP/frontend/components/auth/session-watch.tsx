"use client";
import { useEffect } from "react";
export function SessionWatch() {
  useEffect(()=>{
    let stopped=false;
    const check=async()=>{
      try {
        const response=await fetch("/api/auth/sesion",{cache:"no-store"});
        if(stopped)return;
        if(response.status===401){window.location.replace("/login");return;}
        if(response.ok&&(await response.json()).data.debeCambiarPassword)window.location.replace("/cambiar-contrasena");
      } catch { /* Network errors are handled by the operational UI. */ }
    };
    const channel=new BroadcastChannel("pdmc-auth");
    channel.onmessage=()=>void check();
    const timer=window.setInterval(check,60000);
    window.addEventListener("focus",check);
    window.addEventListener("pageshow",check);
    return ()=>{stopped=true;channel.close();window.clearInterval(timer);window.removeEventListener("focus",check);window.removeEventListener("pageshow",check);};
  },[]);
  return null;
}
