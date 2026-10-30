"use client";
import {useState, type ComponentProps} from "react";
import {Eye,EyeOff} from "lucide-react";
import {Input} from "@/components/ui/input";

export function PasswordInput(props:Omit<ComponentProps<typeof Input>,"type">) {
  const [visible,setVisible]=useState(false);
  return <div className="relative"><Input {...props} type={visible?"text":"password"} className={`${props.className??""} pr-11`}/><button type="button" className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={visible?"Ocultar contraseña":"Mostrar contraseña"} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button></div>;
}
