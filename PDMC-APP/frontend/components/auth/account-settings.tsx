"use client";
import Link from "next/link";
import { useContext, useSyncExternalStore } from "react";
import { Check, LockKeyhole, LogOut, Monitor, Moon, Palette, Settings, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import type { UsuarioSesion } from "@shared/auth/model";
import type { Permission } from "@shared/auth/permissions";
import { PALETTES, applyPalette, readPalette, subscribePalette, type PaletteId } from "@frontend/lib/palette";
import { PdmcMark } from "@frontend/components/brand/pdmc-mark";
import { PermissionContext } from "./permissions";
import { LogoutButton } from "./forms";

const card="pdmc-surface flex flex-col rounded-2xl border bg-card p-6";
const badge="mb-4 grid size-11 place-items-center rounded-xl";
const noop=()=>()=>{};
const modes=[["light","Claro",Sun],["dark","Oscuro",Moon],["system","Según el sistema",Monitor]] as const;

export function AccountSettings({user}:{user:UsuarioSesion}) {
  const capabilities=useContext(PermissionContext);
  const can=(permission:Permission)=>capabilities.national.includes(permission)||Object.values(capabilities.warehouses).some(permissions=>permissions.includes(permission));
  const admin=can("usuarios.administrar");
  // Las tarjetas se reparten según cuántas hay, para no dejar huecos cuando falta Administración.
  return <section aria-label="Ajustes de cuenta" className="mx-auto max-w-5xl space-y-5">
    <div className="module-hero"><div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center"><span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/12 text-brand-mist ring-1 ring-white/15"><UserRound className="size-7"/></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">Cuenta</p><h2 className="mt-1 truncate text-2xl font-bold tracking-tight">{user.nombre}</h2><p className="mt-1 break-all text-sm text-white/60">{user.email}</p></div></div></div>
    <div className={`grid gap-4 sm:grid-cols-2 ${admin?"lg:grid-cols-3":""}`}>
      <article className={card}><span className={`${badge} bg-primary/10 text-primary`}><LockKeyhole className="size-5"/></span><h3 className="font-semibold">Seguridad</h3><p className="mb-5 mt-1 text-sm text-muted-foreground">Cambia tu contraseña cuando lo necesites.</p><Link className="mt-auto inline-flex h-10 w-fit items-center rounded-xl border px-4 text-sm font-semibold transition hover:border-primary/30 hover:bg-accent" href="/cambiar-contrasena">Cambiar contraseña</Link></article>
      {admin&&<article className={card}><span className={`${badge} bg-info-100 text-info-700 dark:bg-info-950/50 dark:text-info-300`}><ShieldCheck className="size-5"/></span><h3 className="font-semibold">Administración</h3><p className="mb-5 mt-1 text-sm text-muted-foreground">Usuarios, regiones y accesos.</p><Link className="mt-auto inline-flex h-10 w-fit items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90" href="/administracion">Abrir administración</Link></article>}
      <article className={`${card} ${admin?"sm:col-span-2 lg:col-span-1":""}`}><span className={`${badge} bg-muted text-muted-foreground`}><LogOut className="size-5"/></span><h3 className="font-semibold">Sesión actual</h3><p className="mb-5 mt-1 text-sm text-muted-foreground">Cierra la sesión en este dispositivo.</p><div className="mt-auto"><LogoutButton/></div></article>
    </div>
    <Personalization/>
  </section>;
}

function Personalization() {
  const {theme,setTheme}=useTheme();
  // El tema y la paleta solo se conocen en el navegador; antes de montar no se marca ninguna opción.
  const mounted=useSyncExternalStore(noop,()=>true,()=>false);
  const palette=useSyncExternalStore(subscribePalette,readPalette,()=>null);
  const option="rounded-xl border p-3 text-left text-sm font-semibold transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-primary aria-checked:bg-primary/5 aria-checked:ring-1 aria-checked:ring-primary";
  return <article aria-labelledby="titulo-personalizacion" className="pdmc-surface rounded-2xl border bg-card p-6">
    <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Palette className="size-5"/></span><div><h3 id="titulo-personalizacion" className="font-semibold">Personalización</h3><p className="mt-1 text-sm text-muted-foreground">Elige cómo se ve PDMC en este dispositivo. No cambia lo que ven los demás.</p></div></div>
    <div className="mt-6 grid gap-6">
      <div><p id="titulo-modo" className="mb-3 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Modo</p>
        <div role="radiogroup" aria-labelledby="titulo-modo" className="grid gap-2 sm:grid-cols-3">{modes.map(([value,label,Icon])=>{const active=mounted&&(theme??"system")===value;return <button key={value} type="button" role="radio" aria-checked={active} onClick={()=>setTheme(value)} className={`${option} flex items-center gap-3`}><Icon aria-hidden className="size-4 text-muted-foreground"/>{label}{active&&<Check aria-hidden className="ml-auto size-4 text-primary"/>}</button>;})}</div>
      </div>
      <div><p id="titulo-paleta" className="mb-3 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Paleta de colores</p>
        <div role="radiogroup" aria-labelledby="titulo-paleta" className="grid gap-3 sm:grid-cols-3">{PALETTES.map(item=>{const active=palette===item.id;return <button key={item.id} type="button" role="radio" aria-checked={active} onClick={()=>applyPalette(item.id)} className={`${option} flex flex-col gap-3`}>
          <PalettePreview id={item.id}/>
          <span className="flex items-start gap-2"><span className="min-w-0 flex-1"><span className="block">{item.nombre}</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">{item.descripcion}</span></span>{active&&<Check aria-hidden className="size-4 shrink-0 text-primary"/>}</span>
        </button>;})}</div>
        <p className="mt-3 text-xs text-muted-foreground">Las gráficas y los avisos de éxito, advertencia y error conservan sus colores en todas las paletas.</p>
      </div>
    </div>
  </article>;
}

// Vista previa con los colores reales de la paleta: encabezado, ícono de la app y acentos.
function PalettePreview({id}:{id:PaletteId}) {
  return <span aria-hidden data-palette={id} className="relative block h-20 overflow-hidden rounded-lg bg-[linear-gradient(135deg,var(--brand-deep),var(--brand-ocean))] ring-1 ring-black/5">
    <span className="absolute -right-6 -top-8 size-24 rounded-full bg-brand-glow/40 blur-xl"/>
    <PdmcMark className="absolute right-3 top-3 size-9 drop-shadow-md"/>
    <span className="absolute left-3 top-3 h-2 w-16 rounded-full bg-white/80"/>
    <span className="absolute left-3 top-7 h-1.5 w-10 rounded-full bg-white/45"/>
    <span className="absolute bottom-3 left-3 flex gap-1.5"><span className="size-4 rounded-full bg-brand-night ring-2 ring-white/70"/><span className="size-4 rounded-full bg-brand-ocean ring-2 ring-white/70"/><span className="size-4 rounded-full bg-brand-glow ring-2 ring-white/70"/><span className="size-4 rounded-full bg-brand-mist ring-2 ring-white/70"/></span>
  </span>;
}

export function AccountNavigation({user,onClick,active=false}:{user:UsuarioSesion;onClick:()=>void;active?:boolean}) {
  return <button aria-label="Ajustes de cuenta" aria-current={active?"page":undefined} onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${active?"bg-white/15":"hover:bg-white/10"}`}><span className="rounded-lg bg-white/10 p-2"><Settings className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">Ajustes de cuenta</span><span className="block truncate text-xs text-white/55">{user.nombre}</span></span></button>;
}
