"use client";
import Link from "next/link";
import { useContext } from "react";
import { Settings, ShieldCheck, LockKeyhole, UserRound } from "lucide-react";
import type { UsuarioSesion } from "@shared/auth/model";
import type { Permission } from "@shared/auth/permissions";
import { PermissionContext } from "./permissions";
import { LogoutButton } from "./forms";
export function AccountSettings({user}:{user:UsuarioSesion}) {
  const capabilities=useContext(PermissionContext);
  const can=(permission:Permission)=>capabilities.national.includes(permission)||Object.values(capabilities.warehouses).some(permissions=>permissions.includes(permission));
  return <section aria-label="Ajustes de cuenta" className="mx-auto max-w-5xl space-y-5"><div className="module-hero"><div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center"><span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/12 text-brand-mist ring-1 ring-white/15"><UserRound className="size-7"/></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">Cuenta</p><h2 className="mt-1 truncate text-2xl font-bold tracking-tight">{user.nombre}</h2><p className="mt-1 break-all text-sm text-white/60">{user.email}</p></div></div></div><div className="grid gap-4 sm:grid-cols-2"><article className="pdmc-surface group rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"><span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="size-5"/></span><h3 className="mb-5 font-semibold">Seguridad</h3><Link className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition hover:border-primary/30 hover:bg-accent" href="/cambiar-contrasena">Cambiar contraseña</Link></article>{can("usuarios.administrar")&&<article className="pdmc-surface group rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"><span className="mb-4 grid size-11 place-items-center rounded-xl bg-info-100 text-info-700 dark:bg-info-950/50 dark:text-info-300"><ShieldCheck className="size-5"/></span><h3 className="mb-5 font-semibold">Administración</h3><Link className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90" href="/administracion">Abrir administración</Link></article>}</div><article className="pdmc-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6"><h3 className="font-semibold">Sesión actual</h3><LogoutButton/></article></section>;
}
export function AccountNavigation({user,onClick,active=false}:{user:UsuarioSesion;onClick:()=>void;active?:boolean}) {
  return <button aria-label="Ajustes de cuenta" aria-current={active?"page":undefined} onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${active?"bg-white/15":"hover:bg-white/10"}`}><span className="rounded-lg bg-white/10 p-2"><Settings className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Ajustes de cuenta</span><span className="block truncate text-xs text-white/55">{user.nombre}</span></span></button>;
}

