import { LoginForm } from "@frontend/components/auth/forms";
import { PdmcLogo, PdmcMark } from "@frontend/components/brand/pdmc-mark";
import { CircleCheck, LifeBuoy, ShieldCheck } from "lucide-react";
export const dynamic="force-dynamic";

// Una sola composición para celular y PC: la marca arriba y el formulario en una tarjeta.
// En el celular la tarjeta sube desde abajo y ocupa el resto de la pantalla.
export default async function Login({searchParams}:{searchParams:Promise<{cambiada?:string}>}) {
  const changed=(await searchParams).cambiada==="1";
  return <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[linear-gradient(160deg,var(--brand-night),var(--brand-deep)_45%,var(--brand-ocean))] text-white lg:items-center lg:justify-center lg:p-8">
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -right-32 -top-40 size-[28rem] rounded-full bg-brand-glow/25 blur-3xl"/>
      <div className="absolute -bottom-48 -left-40 size-[32rem] rounded-full bg-brand-mist/10 blur-3xl"/>
      <PdmcMark className="absolute -right-28 top-24 size-[22rem] opacity-[.07] lg:-left-32 lg:right-auto lg:top-auto lg:bottom-[-6rem] lg:size-[34rem]"/>
    </div>
    <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col lg:max-w-[28rem] lg:flex-none">
      <header className="px-6 pb-9 pt-[max(2.75rem,env(safe-area-inset-top))] lg:px-0 lg:pb-8 lg:pt-0 lg:text-center">
        <PdmcLogo onDark subtitle="Panel de Mejora Continua" className="lg:justify-center lg:text-left" markClassName="size-12"/>
        <h1 className="mt-9 text-[2rem] font-extrabold leading-tight tracking-[-.03em] text-balance sm:text-4xl">Te damos la bienvenida</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-white/75 lg:mx-auto">Tiendas, bodegas y equipos de apoyo trabajando con la misma información, cada uno en lo que le corresponde.</p>
      </header>
      <section aria-labelledby="titulo-acceso" className="flex-1 rounded-t-[2rem] bg-card px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 text-card-foreground shadow-[0_-24px_60px_-32px_rgba(0,0,0,.7)] sm:px-8 lg:flex-none lg:rounded-[2rem] lg:p-9 lg:shadow-[0_40px_90px_-40px_rgba(0,0,0,.75)]">
        <h2 id="titulo-acceso" className="text-xl font-bold tracking-tight">Acceso a tu cuenta</h2>
        <p className="mt-1 text-sm text-muted-foreground">Usa el usuario y la contraseña asignados a tu cargo.</p>
        {changed&&<p role="status" className="mt-5 flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-800 dark:border-success-900 dark:bg-success-950/40 dark:text-success-200"><CircleCheck aria-hidden className="size-4 shrink-0"/>Contraseña actualizada. Ingresa con la nueva.</p>}
        <div className="mt-6"><LoginForm/></div>
        <p className="mt-7 flex items-start gap-2.5 border-t pt-5 text-xs leading-relaxed text-muted-foreground"><LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0"/>¿No puedes entrar? Pide ayuda al administrador de tu región o al encargado de tu tienda.</p>
      </section>
      <p className="mt-6 hidden items-center justify-center gap-2 text-xs text-white/55 lg:flex"><ShieldCheck aria-hidden className="size-4"/>Conexión segura · Solo para personal autorizado</p>
    </div>
  </main>;
}
