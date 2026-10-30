import { Link } from "react-router";
import type { UsuarioSesion } from "@pdmc/contratos/auth/model";
import { useCargaInicial } from "@/lib/carga-inicial";
import { Cargando, ErrorDeCarga, useTitulo } from "./estado-carga";
import { PdmcLogo } from "@/components/brand/pdmc-mark";
import { PasswordForm, LogoutButton } from "@/components/auth/forms";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
// La sesión se consulta con GET /api/auth/sesion, que acepta la contraseña temporal.
export default function ChangePassword() {
  useTitulo("Cambiar contraseña");
  const carga=useCargaInicial<UsuarioSesion>("/api/auth/sesion");
  if(carga.estado==="error")return <ErrorDeCarga mensaje={carga.mensaje} reintentar={carga.reintentar}/>;
  if(carga.estado==="cargando")return <Cargando/>;
  const user=carga.datos;
  return <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-5 sm:p-8"><PdmcLogo subtitle="Panel de Mejora Continua"/><section className="pdmc-surface w-full max-w-lg overflow-hidden rounded-3xl border border-border/80 bg-card"><div className="bg-[linear-gradient(135deg,var(--brand-deep),var(--brand-ocean))] p-7 text-white"><span className="grid size-12 place-items-center rounded-2xl bg-white/12 text-brand-mist"><KeyRound/></span><h1 className="mt-5 text-2xl font-bold tracking-tight">Cambiar contraseña</h1><p className="mt-2 text-sm text-white/60">Protege tu cuenta con una clave nueva y exclusiva.</p></div><div className="space-y-6 p-7"><div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3"><ShieldCheck className="size-5 text-primary"/><div><p className="text-sm font-semibold">{user.nombre}</p><p className="text-xs text-muted-foreground">Sesión verificada</p></div></div><PasswordForm obligatorio={user.debeCambiarPassword}/><div className="flex flex-wrap items-center gap-3 border-t pt-5">{!user.debeCambiarPassword&&<Link to="/" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-muted"><ArrowLeft className="size-4"/>Volver al panel</Link>}<LogoutButton/></div></div></section></main>;
}
