import { pageSession } from "@backend/auth/page";
import Link from "next/link";
import { PasswordForm, LogoutButton } from "@frontend/components/auth/forms";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
export const dynamic="force-dynamic";
export default async function ChangePassword() {
  const user=await pageSession(true);
  return <main className="flex min-h-screen items-center justify-center p-5 sm:p-8"><section className="w-full max-w-lg overflow-hidden rounded-3xl border border-border/80 bg-card shadow-[0_28px_80px_-48px_rgba(5,42,51,.8)]"><div className="bg-[linear-gradient(135deg,#0d333c,#16606a)] p-7 text-white"><span className="grid size-12 place-items-center rounded-2xl bg-white/12 text-[#9ce8e3]"><KeyRound/></span><h1 className="mt-5 text-2xl font-bold tracking-tight">Cambiar contraseña</h1><p className="mt-2 text-sm text-white/60">Protege tu cuenta con una clave nueva y exclusiva.</p></div><div className="space-y-6 p-7"><div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3"><ShieldCheck className="size-5 text-primary"/><div><p className="text-sm font-semibold">{user.nombre}</p><p className="text-xs text-muted-foreground">Sesión verificada</p></div></div><PasswordForm obligatorio={user.debeCambiarPassword}/><div className="flex flex-wrap items-center gap-3 border-t pt-5">{!user.debeCambiarPassword&&<Link href="/" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-muted"><ArrowLeft className="size-4"/>Volver al panel</Link>}<LogoutButton/></div></div></section></main>;
}
