"use client";
import { useState } from "react";
import { Button } from "@frontend/components/ui/button";
import { Input } from "@frontend/components/ui/input";
import { PasswordInput } from "@frontend/components/ui/password-input";
import {syncProjectStorage} from "@frontend/lib/project-storage";

async function submit(action:string,data:unknown) {
  const response=await fetch(`/api/auth/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data),cache:"no-store"});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error?.message??"No se pudo completar la operación.");
  if(action==="login")syncProjectStorage(result.data.reinicio??null);
  if(action==="logout"||action==="password") {const channel=new BroadcastChannel("pdmc-auth");channel.postMessage("session-changed");channel.close();}
  return result.data;
}
export function LoginForm() {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <form className="grid gap-5" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);setBusy(true);setError("");try{const result=await submit("login",{email:data.get("email"),password:data.get("password")});form.reset();window.location.replace(result.destino);}catch(e){setError(e instanceof Error?e.message:"No se pudo iniciar sesión.");}finally{setBusy(false);}}}>
    <label className="grid gap-2">Usuario<Input aria-label="Usuario" name="email" autoComplete="username" required minLength={3} maxLength={254} disabled={busy}/></label>
    <label className="grid gap-2">Contraseña<PasswordInput aria-label="Contraseña" name="password" autoComplete="current-password" required maxLength={128} disabled={busy}/></label>
    {error&&<p role="alert" className="text-sm text-danger-600 dark:text-danger-300">{error}</p>}
    <Button type="submit" disabled={busy}>{busy?"Iniciando…":"Iniciar sesión"}</Button>
  </form>;
}
export function LogoutButton() {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <div><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await submit("logout",{});window.location.replace("/login");}catch{setError("No se pudo cerrar la sesión. Reintente.");setBusy(false);}}}>{busy?"Cerrando…":"Cerrar sesión"}</Button>{error&&<p role="alert">{error}</p>}</div>;
}
export function PasswordForm({obligatorio}:{obligatorio:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <form className="grid gap-5" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);setError("");if(data.get("nueva")!==data.get("confirmacion")){setError("Las contraseñas nuevas no coinciden.");return;}setBusy(true);try{await submit("password",{actual:data.get("actual"),nueva:data.get("nueva")});form.reset();window.location.replace("/login?cambiada=1");}catch(e){setError(e instanceof Error?e.message:"No se pudo cambiar la contraseña.");}finally{setBusy(false);}}}>
    <p className="text-sm text-muted-foreground">{obligatorio?"Antes de acceder al panel, reemplace su contraseña temporal.":"El cambio cerrará las sesiones abiertas en todos los dispositivos."} Use entre 12 y 128 caracteres.</p>
    <label className="grid gap-2">Contraseña actual<PasswordInput aria-label="Contraseña actual" name="actual" autoComplete="current-password" required maxLength={128} disabled={busy}/></label>
    <label className="grid gap-2">Nueva contraseña<PasswordInput aria-label="Nueva contraseña" name="nueva" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy}/></label>
    <label className="grid gap-2">Confirmar contraseña<PasswordInput aria-label="Confirmar contraseña" name="confirmacion" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy}/></label>
    {error&&<p role="alert" className="text-sm text-danger-600 dark:text-danger-300">{error}</p>}
    <Button disabled={busy} type="submit">{busy?"Guardando…":"Cambiar contraseña"}</Button>
  </form>;
}
