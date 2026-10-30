"use client";

import {Monitor,Moon,Sun} from "lucide-react";
import {useTheme} from "next-themes";
import {Button} from "@/components/ui/button";
import {DropdownMenu,DropdownMenuContent,DropdownMenuLabel,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuSeparator,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";

const options=[["light","Claro",Sun],["dark","Oscuro",Moon],["system","Según el sistema",Monitor]] as const;

export function ThemeToggle({compact=false}:{compact?:boolean}) {
  const {theme,setTheme}=useTheme();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" size={compact?"icon":"default"} aria-label="Cambiar apariencia" title="Cambiar apariencia" className={compact?"shrink-0":"shrink-0 gap-2"}>
        <Sun className="h-4 w-4 dark:hidden" aria-hidden="true"/>
        <Moon className="hidden h-4 w-4 dark:block" aria-hidden="true"/>
        {!compact&&<span>Apariencia</span>}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
      <DropdownMenuSeparator/>
      <DropdownMenuRadioGroup value={theme??"system"} onValueChange={setTheme}>
        {options.map(([value,label,Icon])=><DropdownMenuRadioItem key={value} value={value} className="gap-2"><Icon className="size-4 text-muted-foreground" aria-hidden="true"/>{label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
