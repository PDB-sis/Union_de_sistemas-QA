"use client";

import {Moon,Sun} from "lucide-react";
import {useTheme} from "next-themes";
import {Button} from "@frontend/components/ui/button";

export function ThemeToggle({compact=false}:{compact?:boolean}) {
  const {resolvedTheme,setTheme}=useTheme();
  return <Button type="button" variant="outline" size={compact?"icon":"default"}
    aria-label="Alternar entre modo claro y oscuro" title="Alternar entre modo claro y oscuro"
    onClick={()=>setTheme(resolvedTheme==="dark"?"light":"dark")}
    className={compact?"shrink-0":"shrink-0 gap-2"}>
    <Moon className="h-4 w-4 dark:hidden" aria-hidden="true"/>
    <Sun className="hidden h-4 w-4 dark:block" aria-hidden="true"/>
    {!compact&&<><span className="dark:hidden">Modo oscuro</span><span className="hidden dark:inline">Modo claro</span></>}
  </Button>;
}
