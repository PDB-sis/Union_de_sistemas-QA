"use client";

import { useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@shared/utils";

function subscribe(update:()=>void) {
  window.addEventListener("online",update);
  window.addEventListener("offline",update);
  return ()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};
}

/* Reflects the browser's network state; it does not claim the server is reachable. */
export function ConnectionStatus({className}:{className?:string}) {
  const online=useSyncExternalStore(subscribe,()=>navigator.onLine,()=>true);
  return <span role="status" className={cn("items-center gap-1.5 text-[10px] font-medium",online?"text-success-700 dark:text-success-300":"text-danger-700 dark:text-danger-300",className)}>
    {online?<Wifi className="size-3" aria-hidden="true"/>:<WifiOff className="size-3" aria-hidden="true"/>}{online?"En línea":"Sin conexión"}
  </span>;
}
